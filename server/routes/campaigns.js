import { Router } from 'express';
import { getDB, logAudit } from '../db.js';
import { ownedIds, isOwned } from '../lib/scope.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDB();
  const projectId = req.project.id;
  const getLeadTags = db.prepare('SELECT t.id, t.name, t.color FROM tags t INNER JOIN lead_tags lt ON lt.tag_id = t.id WHERE lt.lead_id = ?');
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
  const enriched = campaigns.map(c => {
    const leads = db.prepare(`
      SELECT l.* FROM leads l
      INNER JOIN campaign_leads cl ON cl.lead_id = l.id
      WHERE cl.campaign_id = ?
    `).all(c.id);
    return { ...c, leads: leads.map(l => ({ ...l, verified: !!l.verified, phone_valid: !!l.phone_valid, tags: getLeadTags.all(l.id) })) };
  });
  res.json(enriched);
});

router.post('/', (req, res) => {
  const db = getDB();
  const projectId = req.project.id;
  const { name, count } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const eligible = db.prepare(`
    SELECT id FROM leads
    WHERE project_id = ? AND status = 'active' AND verified = 1
    AND id NOT IN (SELECT lead_id FROM campaign_leads)
    AND id NOT IN (SELECT lead_id FROM lead_tags)
    ORDER BY created_at ASC
    LIMIT ?
  `).all(projectId, count || 100);

  const id = 'camp_' + Math.random().toString(36).slice(2, 10);
  const now = Date.now();

  const getLeadTags = db.prepare('SELECT t.id, t.name, t.color FROM tags t INNER JOIN lead_tags lt ON lt.tag_id = t.id WHERE lt.lead_id = ?');
  db.prepare('INSERT INTO campaigns (id, name, created_at, project_id) VALUES (?, ?, ?, ?)').run(id, name, now, projectId);
  const insertCL = db.prepare('INSERT OR IGNORE INTO campaign_leads (lead_id, campaign_id) VALUES (?, ?)');
  for (const l of eligible) insertCL.run(l.id, id);

  logAudit('create', 'campaign', id, name, { leads: eligible.length, count }, projectId);

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  campaign.leads = db.prepare(`
    SELECT l.* FROM leads l INNER JOIN campaign_leads cl ON cl.lead_id = l.id WHERE cl.campaign_id = ?
  `).all(id).map(l => ({ ...l, verified: !!l.verified, phone_valid: !!l.phone_valid, tags: getLeadTags.all(l.id) }));

  res.status(201).json(campaign);
});

router.delete('/:id', (req, res) => {
  const db = getDB();
  const camp = db.prepare('SELECT name FROM campaigns WHERE id = ? AND project_id = ?').get(req.params.id, req.project.id);
  db.prepare('DELETE FROM campaign_leads WHERE campaign_id = ?').run(req.params.id);
  db.prepare('DELETE FROM campaigns WHERE id = ? AND project_id = ?').run(req.params.id, req.project.id);
  logAudit('delete', 'campaign', req.params.id, camp?.name || 'unknown', {}, req.project.id);
  res.json({ ok: true });
});

// Add leads to existing campaign
router.post('/:id/leads', (req, res) => {
  const db = getDB();
  const projectId = req.project.id;
  const { leadIds, count, force } = req.body;
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  let ids = leadIds ? ownedIds('leads', projectId, leadIds) : null;

  if (!ids && count) {
    if (force) {
      ids = db.prepare(`
        SELECT l.id FROM leads l
        WHERE l.project_id = ? AND l.status = 'active' AND l.verified = 1
        AND l.id NOT IN (SELECT lead_id FROM campaign_leads WHERE campaign_id = ?)
        AND l.id NOT IN (SELECT lead_id FROM lead_tags)
        LIMIT ?
      `).all(projectId, req.params.id, count).map(r => r.id);
    } else {
      ids = db.prepare(`
        SELECT l.id FROM leads l
        WHERE l.project_id = ? AND l.status = 'active' AND l.verified = 1
        AND l.id NOT IN (SELECT lead_id FROM campaign_leads)
        AND l.id NOT IN (SELECT lead_id FROM lead_tags)
        LIMIT ?
      `).all(projectId, count).map(r => r.id);
    }
    if (!ids.length) return res.status(400).json({ error: 'No eligible leads available.' });
  }

  if (!ids || !ids.length) return res.status(400).json({ error: 'No leadIds' });

  const insert = db.prepare('INSERT OR IGNORE INTO campaign_leads (lead_id, campaign_id) VALUES (?, ?)');
  for (const lid of ids) insert.run(lid, req.params.id);

  logAudit('add_leads', 'campaign', req.params.id, campaign.name, { count: ids.length, leadIds: ids }, projectId);

  const getLeadTags = db.prepare('SELECT t.id, t.name, t.color FROM tags t INNER JOIN lead_tags lt ON lt.tag_id = t.id WHERE lt.lead_id = ?');
  const updated = db.prepare(`
    SELECT l.* FROM leads l INNER JOIN campaign_leads cl ON cl.lead_id = l.id WHERE cl.campaign_id = ?
  `).all(req.params.id).map(l => ({ ...l, verified: !!l.verified, phone_valid: !!l.phone_valid, tags: getLeadTags.all(l.id) }));

  res.json({ ...campaign, leads: updated, added: ids.length });
});

// Remove a specific lead from a campaign
router.delete('/:id/leads/:leadId', (req, res) => {
  const db = getDB();
  const { id, leadId } = req.params;
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND project_id = ?').get(id, req.project.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const lead = db.prepare('SELECT name FROM leads WHERE id = ?').get(leadId);
  db.prepare('DELETE FROM campaign_leads WHERE campaign_id = ? AND lead_id = ?').run(id, leadId);
  logAudit('remove_lead', 'campaign', id, campaign.name, { leadId, leadName: lead?.name }, req.project.id);
  res.json({ ok: true });
});

// Get eligible leads for adding to a campaign
router.get('/:id/eligible', (req, res) => {
  const db = getDB();
  const projectId = req.project.id;
  const { force } = req.query;
  if (!isOwned('campaigns', projectId, req.params.id)) return res.status(404).json({ error: 'Campaign not found' });

  const normal = db.prepare(`
    SELECT id, name, phone FROM leads
    WHERE project_id = ? AND status = 'active' AND verified = 1
    AND id NOT IN (SELECT lead_id FROM campaign_leads)
    AND id NOT IN (SELECT lead_id FROM lead_tags)
    ORDER BY created_at ASC
  `).all(projectId);

  const usedElsewhere = force ? db.prepare(`
    SELECT DISTINCT l.id, l.name, l.phone FROM leads l
    INNER JOIN campaign_leads cl ON cl.lead_id = l.id
    WHERE l.project_id = ? AND l.status = 'active' AND l.verified = 1
    AND l.id NOT IN (SELECT lead_id FROM campaign_leads WHERE campaign_id = ?)
    AND l.id NOT IN (SELECT lead_id FROM lead_tags)
    ORDER BY l.created_at ASC
  `).all(projectId, req.params.id) : [];

  res.json({ normal, usedElsewhere });
});

export default router;
