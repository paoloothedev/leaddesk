import { Router } from 'express';
import { getDB, logAudit } from '../db.js';

const router = Router();

function genId() {
  return 'tag_' + Math.random().toString(36).slice(2, 10);
}

// List all tags
router.get('/', (req, res) => {
  const db = getDB();
  const tags = db.prepare(`
    SELECT t.*, COUNT(lt.lead_id) as lead_count
    FROM tags t
    LEFT JOIN lead_tags lt ON lt.tag_id = t.id
    WHERE t.project_id = ?
    GROUP BY t.id ORDER BY t.name
  `).all(req.project.id);
  res.json(tags);
});

// Create tag
router.post('/', (req, res) => {
  const db = getDB();
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const id = genId();
  db.prepare('INSERT INTO tags (id, name, color, created_at, project_id) VALUES (?, ?, ?, ?, ?)').run(id, name.trim(), color || '#3d5a45', Date.now(), req.project.id);
  logAudit('create', 'tag', id, name.trim(), {}, req.project.id);
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  tag.lead_count = 0;
  res.status(201).json(tag);
});

// Update tag
router.put('/:id', (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM tags WHERE id = ? AND project_id = ?').get(req.params.id, req.project.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name, color, show_in_dashboard } = req.body;
  db.prepare('UPDATE tags SET name=?, color=?, show_in_dashboard=? WHERE id=?').run(
    name ?? existing.name,
    color ?? existing.color,
    show_in_dashboard !== undefined ? (show_in_dashboard ? 1 : 0) : existing.show_in_dashboard,
    req.params.id
  );
  logAudit('edit', 'tag', req.params.id, existing.name, { changes: req.body }, req.project.id);
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
  res.json(tag);
});

// Delete tag
router.delete('/:id', (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT name FROM tags WHERE id = ? AND project_id = ?').get(req.params.id, req.project.id);
  db.prepare('DELETE FROM tags WHERE id = ? AND project_id = ?').run(req.params.id, req.project.id);
  logAudit('delete', 'tag', req.params.id, existing?.name || 'unknown', {}, req.project.id);
  res.json({ ok: true });
});

export default router;
