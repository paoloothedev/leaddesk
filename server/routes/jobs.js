import { Router } from 'express';
import { getDB } from '../db.js';
import { ownedIds } from '../lib/scope.js';
import { sendHumanMessage, getStatus } from '../whatsapp.js';

const router = Router();

const MAX_CONSECUTIVE_FAILS = 3;
const DAILY_LIMIT = 100;

// projectId -> job queue state
const projectStates = new Map();

function getState(projectId) {
  if (!projectStates.has(projectId)) {
    const state = {
      projectId,
      processorTimer: null,
      processingJobId: null,
      consecutiveFails: 0,
      messagesSentToday: 0,
      dayResetTimer: null,
    };
    state.dayResetTimer = setTimeout(() => {
      state.messagesSentToday = 0;
      scheduleDayReset(state);
    }, msUntilMidnight());
    projectStates.set(projectId, state);
  }
  return projectStates.get(projectId);
}

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function scheduleDayReset(state) {
  if (state.dayResetTimer) clearTimeout(state.dayResetTimer);
  state.dayResetTimer = setTimeout(() => {
    state.messagesSentToday = 0;
    scheduleDayReset(state);
  }, msUntilMidnight());
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function getMessageDelay() {
  return randomBetween(30, 75) * 1000;
}

function shouldTakeBreak(index) {
  return index > 0 && index % 10 === 0;
}

function getBreakDuration() {
  return randomBetween(60, 180) * 1000;
}

router.post('/', (req, res) => {
  const db = getDB();
  const projectId = req.project.id;
  const { campaignId, message, leads, delayMin, delayMax } = req.body;
  if (!message || !leads || !leads.length) {
    return res.status(400).json({ error: 'Message and leads required' });
  }
  // Only this project's leads; phone always comes from the DB, never from the request
  const ids = ownedIds('leads', projectId, leads.map(l => l?.id));
  if (!ids.length) return res.status(400).json({ error: 'No valid leads' });
  const getPhone = db.prepare('SELECT phone FROM leads WHERE id = ?');

  const id = 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const now = Date.now();

  db.prepare(`INSERT INTO broadcast_jobs (id, campaign_id, message, delay_min, delay_max, status, total, created_at, project_id)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(id, campaignId || null, message, delayMin || 1, delayMax || 5, ids.length, now, projectId);

  const insertLead = db.prepare('INSERT INTO job_leads (job_id, lead_id, phone, status) VALUES (?, ?, ?, ?)');
  for (const leadId of ids) {
    insertLead.run(id, leadId, getPhone.get(leadId)?.phone || '', 'pending');
  }

  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(id);
  res.status(201).json(job);

  const state = getState(projectId);
  if (!state.processingJobId) processNextJob(projectId);
});

router.get('/', (req, res) => {
  const db = getDB();
  const jobs = db.prepare('SELECT * FROM broadcast_jobs WHERE project_id = ? ORDER BY created_at DESC').all(req.project.id);
  res.json(jobs);
});

router.get('/daily-status', (req, res) => {
  const state = getState(req.project.id);
  res.json({ sent: state.messagesSentToday, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - state.messagesSentToday });
});

router.get('/:id', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ? AND project_id = ?').get(req.params.id, req.project.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const leads = db.prepare('SELECT * FROM job_leads WHERE job_id = ? ORDER BY id ASC').all(job.id);
  res.json({ ...job, leads });
});

router.post('/:id/pause', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ? AND project_id = ?').get(req.params.id, req.project.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'running') return res.status(400).json({ error: 'Job is not running' });
  db.prepare('UPDATE broadcast_jobs SET status = ? WHERE id = ?').run('paused', job.id);
  res.json({ ok: true });
});

router.post('/:id/resume', (req, res) => {
  const db = getDB();
  const projectId = req.project.id;
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'paused') return res.status(400).json({ error: 'Job is not paused' });
  const state = getState(projectId);
  state.consecutiveFails = 0;
  db.prepare('UPDATE broadcast_jobs SET status = ? WHERE id = ?').run('pending', job.id);
  res.json({ ok: true });
  if (!state.processingJobId) processNextJob(projectId);
});

router.post('/:id/stop', (req, res) => {
  const db = getDB();
  const projectId = req.project.id;
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'running' && job.status !== 'paused') return res.status(400).json({ error: 'Job is not active' });
  db.prepare('UPDATE broadcast_jobs SET status = ?, completed_at = ? WHERE id = ?').run('stopped', Date.now(), job.id);
  const state = getState(projectId);
  if (state.processingJobId === job.id) state.processingJobId = null;
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ? AND project_id = ?').get(req.params.id, req.project.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status === 'running' || job.status === 'pending') {
    return res.status(400).json({ error: 'Cannot delete an active job' });
  }
  db.prepare('DELETE FROM job_leads WHERE job_id = ?').run(job.id);
  db.prepare('DELETE FROM broadcast_jobs WHERE id = ?').run(job.id);
  res.json({ ok: true });
});

function processNextJob(projectId) {
  const db = getDB();
  const state = getState(projectId);
  const job = db.prepare("SELECT * FROM broadcast_jobs WHERE project_id = ? AND (status = 'pending' OR status = 'running') ORDER BY created_at ASC LIMIT 1").get(projectId);
  if (!job) {
    state.processingJobId = null;
    return;
  }

  state.processingJobId = job.id;

  const waStatus = getStatus(projectId);
  if (!waStatus.ready) {
    state.processingJobId = null;
    scheduleProcessor(projectId, 10000);
    return;
  }

  db.prepare("UPDATE broadcast_jobs SET status = 'running', started_at = ? WHERE id = ?").run(Date.now(), job.id);
  runJob(projectId, job.id);
}

function parseMessages(messageStr) {
  try {
    const parsed = JSON.parse(messageStr);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return [messageStr];
}

function replaceVariables(text, lead) {
  if (!text || !lead) return text;
  return text
    .replace(/\{\{name\}\}/gi, lead.name || '')
    .replace(/\{\{phone\}\}/gi, lead.phone || '')
    .replace(/\{\{email\}\}/gi, lead.email || '')
    .replace(/\{\{notes\}\}/gi, lead.notes || '')
    .replace(/\{\{location\}\}/gi, lead.location || '')
    .replace(/\{\{facebook\}\}/gi, lead.facebook || '')
    .replace(/\{\{instagram\}\}/gi, lead.instagram || '')
    .replace(/\{\{tiktok\}\}/gi, lead.tiktok || '');
}

async function runJob(projectId, jobId) {
  const db = getDB();
  const state = getState(projectId);
  const leads = db.prepare("SELECT * FROM job_leads WHERE job_id = ? AND status = 'pending' ORDER BY id ASC").all(jobId);
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(jobId);

  if (!job || (job.status !== 'running' && job.status !== 'pending')) {
    state.processingJobId = null;
    return;
  }

  const messages = parseMessages(job.message);
  let messageIndex = job.sent || 0;

  for (const lead of leads) {
    const current = db.prepare('SELECT status FROM broadcast_jobs WHERE id = ?').get(jobId);
    if (!current || current.status === 'stopped' || current.status === 'paused') {
      if (current?.status === 'stopped') {
        db.prepare("UPDATE broadcast_jobs SET completed_at = ? WHERE id = ?").run(Date.now(), jobId);
      }
      state.processingJobId = null;
      return;
    }

    if (state.messagesSentToday >= DAILY_LIMIT) {
      console.log(`[wa:${projectId}] Daily limit reached (${DAILY_LIMIT}). Pausing job.`);
      db.prepare("UPDATE broadcast_jobs SET status = 'paused' WHERE id = ?").run(jobId);
      state.processingJobId = null;
      return;
    }

    const phone = (lead.phone || '').replace(/\D/g, '');
    if (!phone) {
      db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run('No phone', lead.id);
      db.prepare("UPDATE broadcast_jobs SET failed = failed + 1 WHERE id = ?").run(jobId);
      continue;
    }

    let leadFailed = false;
    for (let mi = 0; mi < messages.length; mi++) {
      const current2 = db.prepare('SELECT status FROM broadcast_jobs WHERE id = ?').get(jobId);
      if (!current2 || current2.status === 'stopped' || current2.status === 'paused') {
        state.processingJobId = null;
        return;
      }

      if (state.messagesSentToday >= DAILY_LIMIT) {
        console.log(`[wa:${projectId}] Daily limit reached (${DAILY_LIMIT}). Pausing job.`);
        db.prepare("UPDATE broadcast_jobs SET status = 'paused' WHERE id = ?").run(jobId);
        state.processingJobId = null;
        return;
      }

      try {
        const leadData = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.lead_id);
        const personalMessage = replaceVariables(messages[mi], leadData);
        await sendHumanMessage(projectId, phone, personalMessage);
        state.consecutiveFails = 0;
        state.messagesSentToday++;
        messageIndex++;
        console.log(`[wa:${projectId}] Sent msg ${mi + 1}/${messages.length} (${messageIndex}/${job.total}) to ${phone}`);
      } catch (err) {
        const isRestricted = err.message.startsWith('Account restricted');
        const isNotOnWhatsApp = err.message === 'Number not on WhatsApp';
        if (isRestricted) {
          db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run('Account restricted', lead.id);
          db.prepare("UPDATE broadcast_jobs SET status = 'paused' WHERE id = ?").run(jobId);
          state.processingJobId = null;
          console.log(`[wa:${projectId}] Account restricted — pausing job. ${err.message}`);
          return;
        } else if (isNotOnWhatsApp) {
          db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run('Not on WhatsApp', lead.id);
          db.prepare("UPDATE broadcast_jobs SET failed = failed + 1 WHERE id = ?").run(jobId);
          messageIndex++;
          console.log(`[wa:${projectId}] ${phone}: not on WhatsApp, skipping`);
          leadFailed = true;
          break;
        } else {
          state.consecutiveFails++;
          db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run(err.message || 'Send failed', lead.id);
          db.prepare("UPDATE broadcast_jobs SET failed = failed + 1 WHERE id = ?").run(jobId);
          console.log(`[wa:${projectId}] Failed to ${phone}: ${err.message} (consecutive: ${state.consecutiveFails})`);
          leadFailed = true;

          if (state.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
            console.log(`[wa:${projectId}] ${MAX_CONSECUTIVE_FAILS} consecutive failures. Pausing job for 30 minutes.`);
            db.prepare("UPDATE broadcast_jobs SET status = 'paused' WHERE id = ?").run(jobId);
            state.processingJobId = null;
            scheduleProcessor(projectId, 30 * 60 * 1000);
            return;
          }
          break;
        }
      }

      if (mi < messages.length - 1) {
        const seqDelay = randomBetween(10, 30) * 1000;
        console.log(`[wa:${projectId}] Sequence delay ${(seqDelay / 1000).toFixed(0)}s before next message to ${phone}`);
        await new Promise(r => setTimeout(r, seqDelay));
      }
    }

    if (!leadFailed) {
      db.prepare("UPDATE job_leads SET status = 'sent', sent_at = ? WHERE id = ?").run(Date.now(), lead.id);
      db.prepare("UPDATE broadcast_jobs SET sent = sent + 1 WHERE id = ?").run(jobId);
    }

    const afterSend = db.prepare('SELECT status FROM broadcast_jobs WHERE id = ?').get(jobId);
    if (!afterSend || afterSend.status === 'stopped' || afterSend.status === 'paused') {
      state.processingJobId = null;
      return;
    }

    if (shouldTakeBreak(messageIndex)) {
      const breakMs = getBreakDuration();
      console.log(`[wa:${projectId}] Taking a ${(breakMs / 1000).toFixed(0)}s rest after ${messageIndex} messages`);
      await new Promise(r => setTimeout(r, breakMs));
    } else {
      const delayMs = getMessageDelay();
      console.log(`[wa:${projectId}] Waiting ${(delayMs / 1000).toFixed(0)}s before next lead`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  const updated = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(jobId);
  if (updated && (updated.sent + updated.failed) >= updated.total) {
    db.prepare("UPDATE broadcast_jobs SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), jobId);
  } else if (updated && updated.status === 'running') {
    setImmediate(() => runJob(projectId, jobId));
    return;
  }

  state.processingJobId = null;
  setImmediate(() => processNextJob(projectId));
}

function scheduleProcessor(projectId, delayMs) {
  const state = getState(projectId);
  if (state.processorTimer) clearTimeout(state.processorTimer);
  state.processorTimer = setTimeout(() => {
    state.processorTimer = null;
    if (!state.processingJobId) processNextJob(projectId);
  }, delayMs);
}

// On boot, resume pending jobs for any project that has them
export function resumeAllProjectJobs() {
  try {
    const db = getDB();
    const rows = db.prepare("SELECT DISTINCT project_id FROM broadcast_jobs WHERE status IN ('pending', 'running') AND project_id IS NOT NULL").all();
    for (const r of rows) {
      if (r.project_id) {
        setTimeout(() => processNextJob(r.project_id), 2000);
      }
    }
  } catch {}
}

export default router;
