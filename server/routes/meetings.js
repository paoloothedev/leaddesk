import { Router } from 'express';
import { requirePermission } from './auth.js';
import { getDB, logAudit } from '../db.js';
import { wrap } from '../lib/async.js';

const router = Router();

function mkId() {
  return 'mtg_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function mkSegId() {
  return 'seg_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getMeeting(db, pid, id) {
  return db.prepare('SELECT * FROM meetings WHERE id = ? AND project_id = ?').get(id, pid);
}

// GET /meetings — list (optionally filter by contact_id)
router.get('/', requirePermission('leads.view'), wrap(async (req, res) => {
  const pid = req.project.id;
  const db = getDB();
  const { contact_id, limit = 50 } = req.query;
  const lim = Math.min(Math.max(1, Number(limit) || 50), 200);
  let rows;
  if (contact_id) {
    rows = db.prepare(
      'SELECT m.*, l.name AS contact_name FROM meetings m LEFT JOIN leads l ON l.id = m.contact_id WHERE m.project_id = ? AND m.contact_id = ? ORDER BY m.started_at DESC LIMIT ?'
    ).all(pid, contact_id, lim);
  } else {
    rows = db.prepare(
      'SELECT m.*, l.name AS contact_name FROM meetings m LEFT JOIN leads l ON l.id = m.contact_id WHERE m.project_id = ? ORDER BY m.started_at DESC LIMIT ?'
    ).all(pid, lim);
  }
  res.json(rows);
}));

// POST /meetings — start a meeting
router.post('/', requirePermission('leads.edit'), wrap(async (req, res) => {
  const pid = req.project.id;
  const db = getDB();
  const { contact_id, title = '' } = req.body;
  if (contact_id) {
    const c = db.prepare('SELECT id FROM leads WHERE id = ? AND project_id = ?').get(contact_id, pid);
    if (!c) return res.status(400).json({ error: 'Contact not found' });
  }
  const id = mkId();
  const now = Date.now();
  db.prepare(
    'INSERT INTO meetings (id, project_id, contact_id, account_id, title, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, pid, contact_id || null, req.account?.id || null, String(title).trim().slice(0, 300), 'recording', now);
  logAudit('meeting.start', 'meeting', id, title || 'Meeting', {}, pid);
  res.status(201).json(getMeeting(db, pid, id));
}));

// GET /meetings/:id — single meeting with segments
router.get('/:id', requirePermission('leads.view'), wrap(async (req, res) => {
  const db = getDB();
  const m = getMeeting(db, req.project.id, req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  const segments = db.prepare('SELECT * FROM meeting_segments WHERE meeting_id = ? ORDER BY ts').all(m.id);
  res.json({ ...m, segments });
}));

// PUT /meetings/:id — update (end, notes, title)
router.put('/:id', requirePermission('leads.edit'), wrap(async (req, res) => {
  const pid = req.project.id;
  const db = getDB();
  const m = getMeeting(db, pid, req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  const sets = {};
  if (req.body.status !== undefined) {
    const s = String(req.body.status);
    if (!['recording', 'ended', 'summarized'].includes(s)) return res.status(400).json({ error: 'Invalid status' });
    sets.status = s;
    if (s === 'ended' && !m.ended_at) sets.ended_at = Date.now();
  }
  if (req.body.notes !== undefined) sets.notes = String(req.body.notes).slice(0, 100000);
  if (req.body.title !== undefined) sets.title = String(req.body.title).trim().slice(0, 300);
  if (!Object.keys(sets).length) return res.json(getMeeting(db, pid, m.id));
  const cols = Object.keys(sets).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE meetings SET ${cols} WHERE id = ? AND project_id = ?`).run(...Object.values(sets), m.id, pid);
  logAudit('meeting.update', 'meeting', m.id, m.title, sets, pid);
  res.json(getMeeting(db, pid, m.id));
}));

// DELETE /meetings/:id
router.delete('/:id', requirePermission('leads.edit'), wrap(async (req, res) => {
  const pid = req.project.id;
  const db = getDB();
  const m = getMeeting(db, pid, req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM meetings WHERE id = ? AND project_id = ?').run(m.id, pid);
  logAudit('meeting.delete', 'meeting', m.id, m.title, {}, pid);
  res.json({ ok: true });
}));

// POST /meetings/:id/segments — add transcript segments
router.post('/:id/segments', requirePermission('leads.edit'), wrap(async (req, res) => {
  const pid = req.project.id;
  const db = getDB();
  const m = getMeeting(db, pid, req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const insert = db.prepare('INSERT INTO meeting_segments (id, meeting_id, speaker, text, ts) VALUES (?, ?, ?, ?, ?)');
  const added = db.transaction(() => {
    return items.map(seg => {
      const id = mkSegId();
      insert.run(id, m.id, String(seg.speaker || 'Me').slice(0, 100), String(seg.text || '').slice(0, 10000), Number(seg.ts) || Date.now());
      return id;
    });
  })();
  res.json({ added: added.length });
}));

export default router;
