import { Router } from 'express';
import { getDB } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDB();
  const stages = db.prepare('SELECT * FROM stages ORDER BY sort_order').all();
  res.json(stages);
});

router.post('/', (req, res) => {
  const db = getDB();
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = 'stage_' + Math.random().toString(36).slice(2, 10);
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM stages').get().m || 0;
  db.prepare('INSERT INTO stages (id, name, color, sort_order) VALUES (?, ?, ?, ?)').run(id, name, color || '#3d5a45', maxOrder + 1);
  const stage = db.prepare('SELECT * FROM stages WHERE id = ?').get(id);
  res.status(201).json(stage);
});

router.put('/:id', (req, res) => {
  const db = getDB();
  const { name, color } = req.body;
  const existing = db.prepare('SELECT * FROM stages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE stages SET name = ?, color = ? WHERE id = ?').run(name || existing.name, color || existing.color, req.params.id);
  const stage = db.prepare('SELECT * FROM stages WHERE id = ?').get(req.params.id);
  res.json(stage);
});

router.delete('/:id', (req, res) => {
  const db = getDB();
  const count = db.prepare('SELECT COUNT(*) as c FROM stages').get().c;
  if (count <= 1) return res.status(400).json({ error: 'Cannot delete last stage' });
  const fallback = db.prepare('SELECT id FROM stages WHERE id != ? ORDER BY sort_order LIMIT 1').get(req.params.id);
  if (fallback) {
    db.prepare('UPDATE leads SET stage_id = ? WHERE stage_id = ?').run(fallback.id, req.params.id);
  }
  db.prepare('DELETE FROM stages WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/reorder', (req, res) => {
  const db = getDB();
  const { orderedIds } = req.body;
  if (!orderedIds || !orderedIds.length) return res.status(400).json({ error: 'orderedIds required' });
  const update = db.prepare('UPDATE stages SET sort_order = ? WHERE id = ?');
  const txn = db.transaction(() => {
    orderedIds.forEach((id, idx) => update.run(idx, id));
  });
  txn();
  const stages = db.prepare('SELECT * FROM stages ORDER BY sort_order').all();
  res.json(stages);
});

export default router;
