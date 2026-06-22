import { Router } from 'express';
import { getDB } from '../db.js';
import { sendHumanMessage, getStatus } from '../whatsapp.js';

const router = Router();

let processorTimer = null;
let processingJobId = null;
let consecutiveFails = 0;
let messagesSentToday = 0;
let dayResetTimer = null;
const MAX_CONSECUTIVE_FAILS = 3;
const DAILY_LIMIT = 100;

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function getMessageDelay(index) {
  return randomBetween(30, 75) * 1000;
}

function shouldTakeBreak(index) {
  return index > 0 && index % 10 === 0;
}

function getBreakDuration() {
  return randomBetween(60, 180) * 1000;
}

function resetDailyCount() {
  messagesSentToday = 0;
  dayResetTimer = setTimeout(resetDailyCount, 24 * 60 * 60 * 1000);
}
dayResetTimer = setTimeout(resetDailyCount, 24 * 60 * 60 * 1000);

router.post('/', (req, res) => {
  const db = getDB();
  const { campaignId, message, leads, delayMin, delayMax } = req.body;
  if (!message || !leads || !leads.length) {
    return res.status(400).json({ error: 'Message and leads required' });
  }

  const id = 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const now = Date.now();

  db.prepare(`INSERT INTO broadcast_jobs (id, campaign_id, message, delay_min, delay_max, status, total, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`).run(id, campaignId || null, message, delayMin || 1, delayMax || 5, leads.length, now);

  const insertLead = db.prepare('INSERT INTO job_leads (job_id, lead_id, phone, status) VALUES (?, ?, ?, ?)');
  for (const l of leads) {
    insertLead.run(id, l.id, l.phone || '', 'pending');
  }

  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(id);
  res.status(201).json(job);

  if (!processingJobId) processNextJob();
});

router.get('/', (req, res) => {
  const db = getDB();
  const jobs = db.prepare('SELECT * FROM broadcast_jobs ORDER BY created_at DESC').all();
  res.json(jobs);
});

router.get('/daily-status', (req, res) => {
  res.json({ sent: messagesSentToday, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - messagesSentToday });
});

router.get('/:id', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const leads = db.prepare('SELECT * FROM job_leads WHERE job_id = ? ORDER BY id ASC').all(job.id);
  res.json({ ...job, leads });
});

router.post('/:id/pause', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'running') return res.status(400).json({ error: 'Job is not running' });
  db.prepare('UPDATE broadcast_jobs SET status = ? WHERE id = ?').run('paused', job.id);
  res.json({ ok: true });
});

router.post('/:id/resume', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'paused') return res.status(400).json({ error: 'Job is not paused' });
  consecutiveFails = 0;
  db.prepare('UPDATE broadcast_jobs SET status = ? WHERE id = ?').run('pending', job.id);
  res.json({ ok: true });
  if (!processingJobId) processNextJob();
});

router.post('/:id/stop', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'running' && job.status !== 'paused') return res.status(400).json({ error: 'Job is not active' });
  db.prepare('UPDATE broadcast_jobs SET status = ?, completed_at = ? WHERE id = ?').run('stopped', Date.now(), job.id);
  if (processingJobId === job.id) processingJobId = null;
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status === 'running' || job.status === 'pending') {
    return res.status(400).json({ error: 'Cannot delete an active job' });
  }
  db.prepare('DELETE FROM job_leads WHERE job_id = ?').run(job.id);
  db.prepare('DELETE FROM broadcast_jobs WHERE id = ?').run(job.id);
  res.json({ ok: true });
});

function processNextJob() {
  const db = getDB();
  const job = db.prepare("SELECT * FROM broadcast_jobs WHERE status = 'pending' OR status = 'running' ORDER BY created_at ASC LIMIT 1").get();
  if (!job) {
    processingJobId = null;
    return;
  }

  processingJobId = job.id;

  const waStatus = getStatus();
  if (!waStatus.ready) {
    processingJobId = null;
    scheduleProcessor(10000);
    return;
  }

  db.prepare("UPDATE broadcast_jobs SET status = 'running', started_at = ? WHERE id = ?").run(Date.now(), job.id);
  runJob(job.id);
}

async function runJob(jobId) {
  const db = getDB();
  const leads = db.prepare("SELECT * FROM job_leads WHERE job_id = ? AND status = 'pending' ORDER BY id ASC").all(jobId);
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(jobId);

  if (!job || (job.status !== 'running' && job.status !== 'pending')) {
    processingJobId = null;
    return;
  }

  let messageIndex = job.sent || 0;

  for (const lead of leads) {
    const current = db.prepare('SELECT status FROM broadcast_jobs WHERE id = ?').get(jobId);
    if (!current || current.status === 'stopped' || current.status === 'paused') {
      if (current?.status === 'stopped') {
        db.prepare("UPDATE broadcast_jobs SET completed_at = ? WHERE id = ?").run(Date.now(), jobId);
      }
      processingJobId = null;
      return;
    }

    if (messagesSentToday >= DAILY_LIMIT) {
      console.log(`[wa] Daily limit reached (${DAILY_LIMIT}). Pausing job.`);
      db.prepare("UPDATE broadcast_jobs SET status = 'paused' WHERE id = ?").run(jobId);
      processingJobId = null;
      return;
    }

    const phone = (lead.phone || '').replace(/\D/g, '');
    if (!phone) {
      db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run('No phone', lead.id);
      db.prepare("UPDATE broadcast_jobs SET failed = failed + 1 WHERE id = ?").run(jobId);
      continue;
    }

    try {
      await sendHumanMessage(phone, job.message);
      db.prepare("UPDATE job_leads SET status = 'sent', sent_at = ? WHERE id = ?").run(Date.now(), lead.id);
      db.prepare("UPDATE broadcast_jobs SET sent = sent + 1 WHERE id = ?").run(jobId);
      consecutiveFails = 0;
      messagesSentToday++;
      messageIndex++;
      console.log(`[wa] Sent ${messageIndex}/${job.total} to ${phone}`);
    } catch (err) {
      const isRestricted = err.message.startsWith('Account restricted');
      const isNotOnWhatsApp = err.message === 'Number not on WhatsApp';
      if (isRestricted) {
        db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run('Account restricted', lead.id);
        db.prepare("UPDATE broadcast_jobs SET status = 'paused' WHERE id = ?").run(jobId);
        processingJobId = null;
        console.log(`[wa] Account restricted — pausing job. ${err.message}`);
        return;
      } else if (isNotOnWhatsApp) {
        db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run('Not on WhatsApp', lead.id);
        db.prepare("UPDATE broadcast_jobs SET failed = failed + 1 WHERE id = ?").run(jobId);
        messageIndex++;
        console.log(`[wa] ${phone}: not on WhatsApp, skipping`);
      } else {
        consecutiveFails++;
        db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run(err.message || 'Send failed', lead.id);
        db.prepare("UPDATE broadcast_jobs SET failed = failed + 1 WHERE id = ?").run(jobId);
        console.log(`[wa] Failed to ${phone}: ${err.message} (consecutive: ${consecutiveFails})`);

        if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
          console.log(`[wa] ${MAX_CONSECUTIVE_FAILS} consecutive failures. Pausing job for 30 minutes.`);
          db.prepare("UPDATE broadcast_jobs SET status = 'paused' WHERE id = ?").run(jobId);
          processingJobId = null;
          scheduleProcessor(30 * 60 * 1000);
          return;
        }
      }
    }

    const afterSend = db.prepare('SELECT status FROM broadcast_jobs WHERE id = ?').get(jobId);
    if (!afterSend || afterSend.status === 'stopped' || afterSend.status === 'paused') {
      processingJobId = null;
      return;
    }

    if (shouldTakeBreak(messageIndex)) {
      const breakMs = getBreakDuration();
      console.log(`[wa] Taking a ${(breakMs / 1000).toFixed(0)}s rest after ${messageIndex} messages`);
      await new Promise(r => setTimeout(r, breakMs));
    } else {
      const delayMs = getMessageDelay(messageIndex);
      console.log(`[wa] Waiting ${(delayMs / 1000).toFixed(0)}s before next message`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  const updated = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(jobId);
  if (updated && (updated.sent + updated.failed) >= updated.total) {
    db.prepare("UPDATE broadcast_jobs SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), jobId);
  } else if (updated && updated.status === 'running') {
    setImmediate(() => runJob(jobId));
    return;
  }

  processingJobId = null;
  setImmediate(processNextJob);
}

function scheduleProcessor(delayMs) {
  if (processorTimer) clearTimeout(processorTimer);
  processorTimer = setTimeout(() => {
    processorTimer = null;
    if (!processingJobId) processNextJob();
  }, delayMs);
}

setImmediate(processNextJob);

export default router;
