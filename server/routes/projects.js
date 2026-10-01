import { Router } from 'express';
import { getDB, logAudit, createProject, seedStagesForProject } from '../db.js';
import { authMiddleware, requirePermission } from './auth.js';
import { removeProjectAuth } from '../whatsapp.js';

const router = Router();
router.use(authMiddleware);

// List all projects with quick stats
router.get('/', (req, res) => {
  const db = getDB();
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  const leadCount = db.prepare("SELECT COUNT(*) as c FROM leads WHERE project_id = ? AND status = 'active'");
  const clientCount = db.prepare('SELECT COUNT(*) as c FROM clients WHERE project_id = ?');
  const campaignCount = db.prepare('SELECT COUNT(*) as c FROM campaigns WHERE project_id = ?');
  const tagCount = db.prepare('SELECT COUNT(*) as c FROM tags WHERE project_id = ?');
  const waAuthDir = db.prepare('SELECT 1'); // placeholder

  const enriched = projects.map(p => ({
    ...p,
    leadCount: leadCount.get(p.id).c,
    clientCount: clientCount.get(p.id).c,
    campaignCount: campaignCount.get(p.id).c,
    tagCount: tagCount.get(p.id).c,
  }));
  res.json(enriched);
});

// Create project
router.post('/', requirePermission('settings.edit'), (req, res) => {
  const { name, color, icon } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const project = createProject(name.trim(), color, icon, req.user.id);
  logAudit('create', 'project', project.id, project.name, { by: req.user.id }, project.id);
  res.status(201).json(project);
});

// Update project
router.put('/:id', requirePermission('settings.edit'), (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name, color, icon } = req.body;
  db.prepare('UPDATE projects SET name = ?, color = ?, icon = ? WHERE id = ?').run(
    name ?? existing.name,
    color ?? existing.color,
    icon ?? existing.icon,
    req.params.id
  );
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  logAudit('edit', 'project', project.id, project.name, { changes: req.body }, project.id);
  res.json(project);
});

// Delete project + all its data
router.delete('/:id', requirePermission('settings.edit'), (req, res) => {
  const db = getDB();
  const id = req.params.id;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const txn = db.transaction(() => {
    // Child tables first (respect FK order)
    db.prepare('DELETE FROM lead_tags WHERE lead_id IN (SELECT id FROM leads WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM stage_history WHERE lead_id IN (SELECT id FROM leads WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM campaign_leads WHERE campaign_id IN (SELECT id FROM campaigns WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM job_leads WHERE job_id IN (SELECT id FROM broadcast_jobs WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM client_tags WHERE client_id IN (SELECT id FROM clients WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM client_activities WHERE client_id IN (SELECT id FROM clients WHERE project_id = ?)').run(id);
    db.prepare('DELETE FROM email_campaign_leads WHERE campaign_id IN (SELECT id FROM email_campaigns WHERE project_id = ?)').run(id);
    // Top-level scoped tables
    db.prepare('DELETE FROM leads WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM campaigns WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM stages WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM tags WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM message_templates WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM broadcast_jobs WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM clients WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM email_campaigns WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM settings WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM import_logs WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM audit_log WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  });

  try {
    txn();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete project: ' + err.message });
  }

  removeProjectAuth(id).catch(() => {});

  logAudit('delete', 'project', id, project.name, { by: req.user.id }, null);
  res.json({ ok: true });
});

export default router;
