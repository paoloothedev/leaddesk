import { Router } from 'express';
import { getDB } from '../db.js';
import { sendMessage, getStatus } from '../whatsapp.js';

const router = Router();

let processorTimer = null;
let processingJobId = null;

// Create a broadcast job
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

  // Kick processor if idle
  if (!processingJobId) processNextJob();
});

// List all jobs
router.get('/', (req, res) => {
  const db = getDB();
  const jobs = db.prepare('SELECT * FROM broadcast_jobs ORDER BY created_at DESC').all();
  res.json(jobs);
});

// Get job detail with leads
router.get('/:id', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const leads = db.prepare('SELECT * FROM job_leads WHERE job_id = ? ORDER BY id ASC').all(job.id);
  res.json({ ...job, leads });
});

// Pause a running job
router.post('/:id/pause', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'running') return res.status(400).json({ error: 'Job is not running' });
  db.prepare('UPDATE broadcast_jobs SET status = ? WHERE id = ?').run('paused', job.id);
  res.json({ ok: true });
});

// Resume a paused job
router.post('/:id/resume', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'paused') return res.status(400).json({ error: 'Job is not paused' });
  db.prepare('UPDATE broadcast_jobs SET status = ? WHERE id = ?').run('pending', job.id);
  res.json({ ok: true });
  if (!processingJobId) processNextJob();
});

// Stop a running job
router.post('/:id/stop', (req, res) => {
  const db = getDB();
  const job = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'running' && job.status !== 'paused') return res.status(400).json({ error: 'Job is not active' });
  db.prepare('UPDATE broadcast_jobs SET status = ?, completed_at = ? WHERE id = ?').run('stopped', Date.now(), job.id);
  if (processingJobId === job.id) processingJobId = null;
  res.json({ ok: true });
});

// Delete a completed/stopped/failed job
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

// --- BACKGROUND PROCESSOR ---

function processNextJob() {
  const db = getDB();
  const job = db.prepare("SELECT * FROM broadcast_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1").get();
  if (!job) {
    processingJobId = null;
    return;
  }

  processingJobId = job.id;

  const waStatus = getStatus();
  if (!waStatus.ready) {
    // WhatsApp not ready — check again later
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

  for (const lead of leads) {
    // Check if job was paused or stopped
    const current = db.prepare('SELECT status FROM broadcast_jobs WHERE id = ?').get(jobId);
    if (!current || current.status === 'stopped' || current.status === 'paused') {
      if (current?.status === 'stopped') {
        db.prepare("UPDATE broadcast_jobs SET completed_at = ? WHERE id = ?").run(Date.now(), jobId);
      }
      processingJobId = null;
      if (current?.status === 'paused') processingJobId = null;
      return;
    }

    // Send message
    const phone = (lead.phone || '').replace(/\D/g, '');
    if (!phone) {
      db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run('No phone', lead.id);
      db.prepare("UPDATE broadcast_jobs SET failed = failed + 1 WHERE id = ?").run(jobId);
      continue;
    }

    try {
      await sendMessage(phone, job.message);
      db.prepare("UPDATE job_leads SET status = 'sent', sent_at = ? WHERE id = ?").run(Date.now(), lead.id);
      db.prepare("UPDATE broadcast_jobs SET sent = sent + 1 WHERE id = ?").run(jobId);
    } catch (err) {
      db.prepare("UPDATE job_leads SET status = 'failed', error = ? WHERE id = ?").run(err.message || 'Send failed', lead.id);
      db.prepare("UPDATE broadcast_jobs SET failed = failed + 1 WHERE id = ?").run(jobId);
    }

    // Re-check status after send
    const afterSend = db.prepare('SELECT status FROM broadcast_jobs WHERE id = ?').get(jobId);
    if (!afterSend || afterSend.status === 'stopped' || afterSend.status === 'paused') {
      processingJobId = null;
      return;
    }

    // Delay between messages
    const minD = job.delay_min || 1;
    const maxD = job.delay_max || 5;
    const waitMs = Math.floor(Math.random() * (maxD - minD + 1) + minD) * 1000;
    await new Promise(r => setTimeout(r, waitMs));
  }

  // Check if all done
  const updated = db.prepare('SELECT * FROM broadcast_jobs WHERE id = ?').get(jobId);
  if (updated && (updated.sent + updated.failed) >= updated.total) {
    db.prepare("UPDATE broadcast_jobs SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), jobId);
  } else if (updated && updated.status === 'running') {
    // More leads may have been added — keep running
    setImmediate(() => runJob(jobId));
    return;
  }

  processingJobId = null;

  // Try next job
  setImmediate(processNextJob);
}

function scheduleProcessor(delayMs) {
  if (processorTimer) clearTimeout(processorTimer);
  processorTimer = setTimeout(() => {
    processorTimer = null;
    if (!processingJobId) processNextJob();
  }, delayMs);
}

// Start the background processor on import
setImmediate(processNextJob);

export default router;
