import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { getDB, logAudit } from './db.js';
import leadsRouter from './routes/leads.js';
import stagesRouter from './routes/stages.js';
import campaignsRouter from './routes/campaigns.js';
import tagsRouter from './routes/tags.js';
import templatesRouter from './routes/templates.js';
import jobsRouter, { resumeAllProjectJobs } from './routes/jobs.js';
import settingsRouter from './routes/settings.js';
import authRouter, { authMiddleware } from './routes/auth.js';
import accountsRouter from './routes/accounts.js';
import clientsRouter from './routes/clients.js';
import emailCampaignsRouter from './routes/emailCampaigns.js';
import gmapsRouter from './routes/gmaps.js';
import projectsRouter from './routes/projects.js';
import { resolveProject } from './middleware/project.js';
import { adoptLegacyJobs } from './gmaps/jobs.js';
import { initClient, getStatus, onStatusChange, destroyClient, destroyAllClients, logoutClient, migrateLegacyAuth } from './whatsapp.js';

import os from 'os';

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err?.message || err);
});

const shutdown = async () => {
  console.log('Shutting down, cleaning up WhatsApp...');
  try { await destroyAllClients(); } catch {}
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
const PORT = parseInt(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) req.cookies[k] = v.join('=');
  }
  next();
});

// ── Auth routes (no project scope) ──────────────────────────────
app.use('/api/auth', authRouter);

// ── Project management (auth only, no project scope) ────────────
app.use('/api/projects', authMiddleware, projectsRouter);

// ── Accounts (global, auth only) ────────────────────────────────
app.use('/api/accounts', authMiddleware, accountsRouter);

// ── Global auth for everything else ─────────────────────────────
app.use('/api', authMiddleware);

// ── Project-scoped routers ──────────────────────────────────────
app.use('/api/leads', resolveProject, leadsRouter);
app.use('/api/stages', resolveProject, stagesRouter);
app.use('/api/campaigns', resolveProject, campaignsRouter);
app.use('/api/tags', resolveProject, tagsRouter);
app.use('/api/templates', resolveProject, templatesRouter);
app.use('/api/jobs', resolveProject, jobsRouter);
app.use('/api/settings', resolveProject, settingsRouter);
app.use('/api/clients', resolveProject, clientsRouter);
app.use('/api/email-campaigns', resolveProject, emailCampaignsRouter);
app.use('/api/gmaps', resolveProject, gmapsRouter);

// ── Project-scoped inline routes ────────────────────────────────
app.get('/api/stats', resolveProject, (req, res) => {
  const db = getDB();
  const pid = req.project.id;

  const total = db.prepare("SELECT COUNT(*) as c FROM leads WHERE project_id = ? AND status = 'active'").get(pid).c;
  const verified = db.prepare('SELECT COUNT(*) as c FROM leads WHERE project_id = ? AND status = ? AND verified = ?').get(pid, 'active', 1).c;
  const unverified = total - verified;
  const dead = db.prepare('SELECT COUNT(*) as c FROM leads WHERE project_id = ? AND status = ?').get(pid, 'dead').c;
  const invalidPhone = db.prepare('SELECT COUNT(*) as c FROM leads WHERE project_id = ? AND status = ? AND phone_valid = ?').get(pid, 'active', 0).c;
  const inCampaign = db.prepare(`
    SELECT COUNT(DISTINCT l.id) as c FROM leads l
    INNER JOIN campaign_leads cl ON cl.lead_id = l.id
    WHERE l.project_id = ? AND l.status = ?
  `).get(pid, 'active').c;

  const totalClients = db.prepare('SELECT COUNT(*) as c FROM clients WHERE project_id = ?').get(pid).c;
  const activeClients = db.prepare("SELECT COUNT(*) as c FROM clients WHERE project_id = ? AND status = 'active'").get(pid).c;

  const readyForOutreach = db.prepare(`
    SELECT COUNT(*) as c FROM leads
    WHERE project_id = ? AND status = 'active' AND verified = 1 AND phone_valid = 1
  `).get(pid).c;

  const verifiedNoTags = db.prepare(`
    SELECT COUNT(*) as c FROM leads
    WHERE project_id = ? AND status = 'active' AND verified = 1
    AND id NOT IN (SELECT lead_id FROM lead_tags)
  `).get(pid).c;

  const verifiedNoTagsNoCampaign = db.prepare(`
    SELECT COUNT(*) as c FROM leads
    WHERE project_id = ? AND status = 'active' AND verified = 1
    AND id NOT IN (SELECT lead_id FROM lead_tags)
    AND id NOT IN (SELECT lead_id FROM campaign_leads)
  `).get(pid).c;

  const totalCampaigns = db.prepare('SELECT COUNT(*) as c FROM campaigns WHERE project_id = ?').get(pid).c;
  const activeJobs = db.prepare("SELECT COUNT(*) as c FROM broadcast_jobs WHERE project_id = ? AND status IN ('pending', 'running')").get(pid).c;

  const stageBreakdown = db.prepare(`
    SELECT s.id, s.name, s.color,
      COUNT(l.id) as count,
      SUM(CASE WHEN l.verified = 1 THEN 1 ELSE 0 END) as verified_count,
      SUM(CASE WHEN l.verified = 0 THEN 1 ELSE 0 END) as unverified_count
    FROM stages s
    LEFT JOIN leads l ON l.stage_id = s.id AND l.status = 'active' AND l.project_id = s.project_id
    WHERE s.project_id = ?
    GROUP BY s.id ORDER BY s.sort_order
  `).all(pid);

  const tagBreakdown = db.prepare(`
    SELECT t.id, t.name, t.color,
      COUNT(lt.lead_id) as total,
      SUM(CASE WHEN l.verified = 1 THEN 1 ELSE 0 END) as verified_count,
      SUM(CASE WHEN l.verified = 0 OR l.verified IS NULL THEN 1 ELSE 0 END) as unverified_count
    FROM tags t
    LEFT JOIN lead_tags lt ON lt.tag_id = t.id
    LEFT JOIN leads l ON l.id = lt.lead_id AND l.status = 'active'
    WHERE t.project_id = ? AND t.show_in_dashboard = 1
    GROUP BY t.id ORDER BY t.name
  `).all(pid);

  const recentImports = db.prepare(`
    SELECT * FROM import_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 10
  `).all(pid);

  const recentActivity = db.prepare(`
    SELECT * FROM audit_log WHERE project_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(pid);

  res.json({
    total, verified, unverified, dead, invalidPhone, inCampaign,
    readyForOutreach, verifiedNoTags, verifiedNoTagsNoCampaign,
    totalClients, activeClients, totalCampaigns, activeJobs,
    verifiedPercent: total > 0 ? Math.round((verified / total) * 100) : 0,
    stageBreakdown,
    tagBreakdown,
    recentImports,
    recentActivity,
    metrics: [
      { key: 'total', label: 'Total Leads', type: 'stat' },
      { key: 'verified', label: 'Verified Leads', type: 'stat' },
      { key: 'unverified', label: 'Unverified Leads', type: 'stat' },
      { key: 'dead', label: 'Dead Leads', type: 'stat' },
      { key: 'invalidPhone', label: 'Invalid Phone', type: 'stat' },
      { key: 'inCampaign', label: 'In Campaign', type: 'stat' },
      { key: 'readyForOutreach', label: 'Ready for Outreach', type: 'stat' },
      { key: 'verifiedNoTags', label: 'Verified, No Tags', type: 'stat' },
      { key: 'verifiedNoTagsNoCampaign', label: 'Verified, No Tags & Campaign', type: 'stat' },
      { key: 'totalClients', label: 'Total Clients', type: 'stat' },
      { key: 'activeClients', label: 'Active Clients', type: 'stat' },
      { key: 'totalCampaigns', label: 'Total Campaigns', type: 'stat' },
      { key: 'activeJobs', label: 'Active Broadcast Jobs', type: 'stat' },
      ...stageBreakdown.map(s => ({ key: `stage:${s.id}`, label: `Stage: ${s.name}`, type: 'stage', stageId: s.id, color: s.color })),
      ...tagBreakdown.map(t => ({ key: `tag:${t.id}`, label: `Tag: ${t.name}`, type: 'tag', tagId: t.id, color: t.color })),
    ],
  });
});

app.get('/api/import-logs', resolveProject, (req, res) => {
  const db = getDB();
  const logs = db.prepare('SELECT * FROM import_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50').all(req.project.id);
  res.json(logs);
});

app.get('/api/audit-log', resolveProject, (req, res) => {
  const db = getDB();
  const { limit } = req.query;
  const logs = db.prepare('SELECT * FROM audit_log WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(req.project.id, parseInt(limit) || 100);
  res.json(logs);
});

app.get('/api/export', resolveProject, (req, res) => {
  const db = getDB();
  const pid = req.project.id;
  const leads = db.prepare('SELECT * FROM leads WHERE project_id = ?').all(pid);
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE project_id = ?').all(pid);
  const stages = db.prepare('SELECT * FROM stages WHERE project_id = ? ORDER BY sort_order').all(pid);
  const campaign_leads = db.prepare(`
    SELECT cl.* FROM campaign_leads cl
    INNER JOIN campaigns c ON c.id = cl.campaign_id
    WHERE c.project_id = ?
  `).all(pid);
  const stage_history = db.prepare(`
    SELECT sh.* FROM stage_history sh
    INNER JOIN leads l ON l.id = sh.lead_id
    WHERE l.project_id = ?
  `).all(pid);
  const tags = db.prepare('SELECT * FROM tags WHERE project_id = ?').all(pid);
  const lead_tags = db.prepare(`
    SELECT lt.* FROM lead_tags lt
    INNER JOIN leads l ON l.id = lt.lead_id
    WHERE l.project_id = ?
  `).all(pid);
  res.json({ leads, campaigns, stages, campaign_leads, stage_history, tags, lead_tags });
});

app.post('/api/import/backup', resolveProject, (req, res) => {
  const db = getDB();
  const pid = req.project.id;
  const data = req.body;
  if (!data.leads) return res.status(400).json({ error: 'Invalid backup file' });
  // Wipe only this project's data
  db.exec(`
    DELETE FROM lead_tags WHERE lead_id IN (SELECT id FROM leads WHERE project_id = '${pid.replace(/'/g, "''")}');
    DELETE FROM stage_history WHERE lead_id IN (SELECT id FROM leads WHERE project_id = '${pid.replace(/'/g, "''")}');
    DELETE FROM campaign_leads WHERE campaign_id IN (SELECT id FROM campaigns WHERE project_id = '${pid.replace(/'/g, "''")}');
    DELETE FROM leads WHERE project_id = '${pid.replace(/'/g, "''")}';
    DELETE FROM campaigns WHERE project_id = '${pid.replace(/'/g, "''")}';
    DELETE FROM stages WHERE project_id = '${pid.replace(/'/g, "''")}';
    DELETE FROM tags WHERE project_id = '${pid.replace(/'/g, "''")}';
  `);
  const insertStage = db.prepare('INSERT INTO stages (id, name, color, sort_order, project_id) VALUES (?, ?, ?, ?, ?)');
  for (const s of data.stages || []) insertStage.run(s.id, s.name, s.color, s.sort_order || 0, pid);
  const insertLead = db.prepare(`INSERT INTO leads (id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status, verified, stage_id, created_at, dead_at, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const l of data.leads) insertLead.run(l.id, l.name, l.phone || '', l.phone_valid ? 1 : 0, l.email || '', l.facebook || '', l.instagram || '', l.tiktok || '', l.link || '', l.location || '', l.notes || '', l.status || 'active', l.verified ? 1 : 0, l.stage_id, l.created_at, l.dead_at || null, pid);
  const insertCamp = db.prepare('INSERT INTO campaigns (id, name, created_at, project_id) VALUES (?, ?, ?, ?)');
  for (const c of data.campaigns || []) insertCamp.run(c.id, c.name, c.created_at, pid);
  const insertCL = db.prepare('INSERT OR IGNORE INTO campaign_leads (lead_id, campaign_id) VALUES (?, ?)');
  for (const cl of data.campaign_leads || []) insertCL.run(cl.lead_id, cl.campaign_id);
  const insertSH = db.prepare('INSERT INTO stage_history (lead_id, stage_id, at) VALUES (?, ?, ?)');
  for (const sh of data.stage_history || []) insertSH.run(sh.lead_id, sh.stage_id, sh.at);
  const insertTag = db.prepare('INSERT INTO tags (id, name, color, created_at, project_id) VALUES (?, ?, ?, ?, ?)');
  for (const t of data.tags || []) insertTag.run(t.id, t.name, t.color, t.created_at, pid);
  const insertLT = db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)');
  for (const lt of data.lead_tags || []) insertLT.run(lt.lead_id, lt.tag_id);
  res.json({ ok: true });
});

// CSV export
app.get('/api/export/csv', resolveProject, (req, res) => {
  const db = getDB();
  const pid = req.project.id;
  const leads = db.prepare("SELECT * FROM leads WHERE project_id = ? AND status = 'active' ORDER BY created_at ASC").all(pid);
  const header = 'Name,Phone,Phone Valid,Email,Facebook,Instagram,TikTok,Link,Location,Notes,Verified,Stage,Campaigns';
  const rows = leads.map(l => {
    const campNames = db.prepare('SELECT c.name FROM campaigns c INNER JOIN campaign_leads cl ON cl.campaign_id = c.id WHERE cl.lead_id = ?').all(l.id).map(c => c.name).join('; ');
    const stage = db.prepare('SELECT name FROM stages WHERE id = ?').get(l.stage_id);
    return [
      csvEscape(l.name),
      phoneCsv(l.phone),
      l.phone_valid ? 'Yes' : 'No',
      csvEscape(l.email),
      csvEscape(l.facebook),
      csvEscape(l.instagram),
      csvEscape(l.tiktok),
      csvEscape(l.link),
      csvEscape(l.location),
      csvEscape(l.notes),
      l.verified ? 'Verified' : 'Unverified',
      csvEscape(stage?.name || ''),
      csvEscape(campNames),
    ].join(',');
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leaddesk-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('\uFEFF' + header + '\n' + rows.join('\n'));
});

function csvEscape(v) {
  if (!v) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function phoneCsv(v) {
  if (!v) return '';
  return '="' + String(v).replace(/"/g, '""') + '"';
}

// ── Socket.IO — WhatsApp events (per-project rooms) ─────────────
const waStatusUnsubscribe = onStatusChange((projectId, status, qr) => {
  io.to('project:' + projectId).emit('wa_status', { projectId, ...getStatus(projectId) });
});

io.on('connection', (socket) => {
  // Client joins a project room to receive its WA status
  socket.on('join_project', (projectId) => {
    if (!projectId) return;
    socket.join('project:' + projectId);
    socket.emit('wa_status', { projectId, ...getStatus(projectId) });
  });

  socket.on('leave_project', (projectId) => {
    if (!projectId) return;
    socket.leave('project:' + projectId);
  });

  socket.on('wa_init', async ({ projectId } = {}) => {
    if (!projectId) return;
    await initClient(projectId).catch(err => console.error('[wa] init failed:', err.message));
    io.to('project:' + projectId).emit('wa_status', { projectId, ...getStatus(projectId) });
  });

  socket.on('wa_disconnect', async ({ projectId } = {}) => {
    if (!projectId) return;
    await destroyClient(projectId);
    io.to('project:' + projectId).emit('wa_status', { projectId, ...getStatus(projectId) });
  });

  socket.on('wa_logout', async ({ projectId } = {}) => {
    if (!projectId) return;
    await logoutClient(projectId);
    io.to('project:' + projectId).emit('wa_status', { projectId, ...getStatus(projectId) });
  });
});

// Serve static in production
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicPath = join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(publicPath, 'index.html'));
    }
  });
}

server.listen(PORT, HOST, () => {
  const ifaces = os.networkInterfaces();
  const addrs = [];
  Object.values(ifaces).forEach(ifs => {
    if (!ifs) return;
    ifs.forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) addrs.push(iface.address);
    });
  });
  console.log(`\n  LeadDesk server running on:\n`);
  console.log(`    Local:   http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    addrs.forEach(ip => console.log(`    Network: http://${ip}:${PORT}`));
  } else {
    console.log(`    Host:    http://${HOST}:${PORT}`);
  }
  if (!addrs.length && HOST === '0.0.0.0') {
    console.log(`    Network: (use your machine's LAN IP)`);
  }
  console.log('');

  // Migrate legacy flat baileys_auth into Default project's dir
  try {
    const db = getDB();
    const def = db.prepare('SELECT id FROM projects ORDER BY created_at ASC LIMIT 1').get();
    if (def) {
      migrateLegacyAuth(def.id);
      adoptLegacyJobs(def.id);
    }
  } catch {}

  // Resume any pending broadcast jobs (per project, lazily)
  setTimeout(() => {
    try { resumeAllProjectJobs(); } catch {}
  }, 3000);

  // WhatsApp clients are now lazy-initialized per project (no global boot init)
  console.log('  WhatsApp: clients initialize per-project on demand.\n');
});
