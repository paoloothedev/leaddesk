import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { getDB } from './db.js';
import leadsRouter from './routes/leads.js';
import stagesRouter from './routes/stages.js';
import campaignsRouter from './routes/campaigns.js';
import tagsRouter from './routes/tags.js';
import templatesRouter from './routes/templates.js';
import jobsRouter from './routes/jobs.js';
import settingsRouter from './routes/settings.js';
import { initClient, getStatus, onStatusChange, destroyClient, logoutClient } from './whatsapp.js';

import os from 'os';

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err?.message || err);
});

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
const PORT = parseInt(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/leads', leadsRouter);
app.use('/api/stages', stagesRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/settings', settingsRouter);
app.get('/api/stats', (req, res) => {
  const db = getDB();

  // Pipeline counts
  const total = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'active'").get().c;
  const verified = db.prepare('SELECT COUNT(*) as c FROM leads WHERE status = ? AND verified = ?').get('active', 1).c;
  const unverified = total - verified;
  const dead = db.prepare('SELECT COUNT(*) as c FROM leads WHERE status = ?').get('dead').c;
  const invalidPhone = db.prepare('SELECT COUNT(*) as c FROM leads WHERE status = ? AND phone_valid = ?').get('active', 0).c;
  const inCampaign = db.prepare(`
    SELECT COUNT(DISTINCT l.id) as c FROM leads l
    INNER JOIN campaign_leads cl ON cl.lead_id = l.id
    WHERE l.status = ?
  `).get('active').c;

  // Has menu tag count
  const hasMenuTag = db.prepare("SELECT id FROM tags WHERE name = ?").get('Has Menu');
  let hasMenu = 0;
  if (hasMenuTag) {
    hasMenu = db.prepare('SELECT COUNT(*) as c FROM lead_tags WHERE tag_id = ?').get(hasMenuTag.id).c;
  }

  // Ready for outreach: verified + has phone + no tags at all
  const readyForOutreach = db.prepare(`
    SELECT COUNT(*) as c FROM leads
    WHERE status = 'active' AND verified = 1 AND phone_valid = 1
    AND id NOT IN (SELECT lead_id FROM lead_tags)
  `).get().c;

  // Verified leads with no tags
  const verifiedNoTags = db.prepare(`
    SELECT COUNT(*) as c FROM leads
    WHERE status = 'active' AND verified = 1
    AND id NOT IN (SELECT lead_id FROM lead_tags)
  `).get().c;

  // Verified leads with no tags and no campaign
  const verifiedNoTagsNoCampaign = db.prepare(`
    SELECT COUNT(*) as c FROM leads
    WHERE status = 'active' AND verified = 1
    AND id NOT IN (SELECT lead_id FROM lead_tags)
    AND id NOT IN (SELECT lead_id FROM campaign_leads)
  `).get().c;

  // Stage breakdown with verified/unverified
  const stageBreakdown = db.prepare(`
    SELECT s.id, s.name, s.color,
      COUNT(l.id) as count,
      SUM(CASE WHEN l.verified = 1 THEN 1 ELSE 0 END) as verified_count,
      SUM(CASE WHEN l.verified = 0 THEN 1 ELSE 0 END) as unverified_count
    FROM stages s
    LEFT JOIN leads l ON l.stage_id = s.id AND l.status = 'active'
    GROUP BY s.id ORDER BY s.sort_order
  `).all();

  // Tag breakdown (only dashboard-enabled)
  const tagBreakdown = db.prepare(`
    SELECT t.id, t.name, t.color,
      COUNT(lt.lead_id) as total,
      SUM(CASE WHEN l.verified = 1 THEN 1 ELSE 0 END) as verified_count,
      SUM(CASE WHEN l.verified = 0 OR l.verified IS NULL THEN 1 ELSE 0 END) as unverified_count
    FROM tags t
    LEFT JOIN lead_tags lt ON lt.tag_id = t.id
    LEFT JOIN leads l ON l.id = lt.lead_id AND l.status = 'active'
    WHERE t.show_in_dashboard = 1
    GROUP BY t.id ORDER BY t.name
  `).all();

  // Recent imports
  const recentImports = db.prepare(`
    SELECT * FROM import_logs ORDER BY created_at DESC LIMIT 10
  `).all();

  // Recent audit activity
  const recentActivity = db.prepare(`
    SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20
  `).all();

  res.json({
    total, verified, unverified, dead, invalidPhone, inCampaign,
    hasMenu, readyForOutreach, verifiedNoTags, verifiedNoTagsNoCampaign,
    verifiedPercent: total > 0 ? Math.round((verified / total) * 100) : 0,
    stageBreakdown,
    tagBreakdown,
    recentImports,
    recentActivity,
  });
});

app.get('/api/import-logs', (req, res) => {
  const db = getDB();
  const logs = db.prepare('SELECT * FROM import_logs ORDER BY created_at DESC LIMIT 50').all();
  res.json(logs);
});

app.get('/api/audit-log', (req, res) => {
  const db = getDB();
  const { limit } = req.query;
  const logs = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(parseInt(limit) || 100);
  res.json(logs);
});

app.get('/api/export', (req, res) => {
  const db = getDB();
  const leads = db.prepare('SELECT * FROM leads').all();
  const campaigns = db.prepare('SELECT * FROM campaigns').all();
  const stages = db.prepare('SELECT * FROM stages ORDER BY sort_order').all();
  const campaign_leads = db.prepare('SELECT * FROM campaign_leads').all();
  const stage_history = db.prepare('SELECT * FROM stage_history').all();
  const tags = db.prepare('SELECT * FROM tags').all();
  const lead_tags = db.prepare('SELECT * FROM lead_tags').all();
  res.json({ leads, campaigns, stages, campaign_leads, stage_history, tags, lead_tags });
});

app.post('/api/import/backup', (req, res) => {
  const db = getDB();
  const data = req.body;
  if (!data.leads) return res.status(400).json({ error: 'Invalid backup file' });
  db.exec('DELETE FROM lead_tags; DELETE FROM stage_history; DELETE FROM campaign_leads; DELETE FROM leads; DELETE FROM campaigns; DELETE FROM stages; DELETE FROM tags;');
  const insertStage = db.prepare('INSERT INTO stages (id, name, color, sort_order) VALUES (?, ?, ?, ?)');
  for (const s of data.stages || []) insertStage.run(s.id, s.name, s.color, s.sort_order || 0);
  const insertLead = db.prepare(`INSERT INTO leads (id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status, verified, stage_id, created_at, dead_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const l of data.leads) insertLead.run(l.id, l.name, l.phone || '', l.phone_valid ? 1 : 0, l.email || '', l.facebook || '', l.instagram || '', l.tiktok || '', l.link || '', l.location || '', l.notes || '', l.status || 'active', l.verified ? 1 : 0, l.stage_id, l.created_at, l.dead_at || null);
  const insertCamp = db.prepare('INSERT INTO campaigns (id, name, created_at) VALUES (?, ?, ?)');
  for (const c of data.campaigns || []) insertCamp.run(c.id, c.name, c.created_at);
  const insertCL = db.prepare('INSERT OR IGNORE INTO campaign_leads (lead_id, campaign_id) VALUES (?, ?)');
  for (const cl of data.campaign_leads || []) insertCL.run(cl.lead_id, cl.campaign_id);
  const insertSH = db.prepare('INSERT INTO stage_history (lead_id, stage_id, at) VALUES (?, ?, ?)');
  for (const sh of data.stage_history || []) insertSH.run(sh.lead_id, sh.stage_id, sh.at);
  const insertTag = db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)');
  for (const t of data.tags || []) insertTag.run(t.id, t.name, t.color, t.created_at);
  const insertLT = db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)');
  for (const lt of data.lead_tags || []) insertLT.run(lt.lead_id, lt.tag_id);
  res.json({ ok: true });
});

// CSV export
app.get('/api/export/csv', (req, res) => {
  const db = getDB();
  const leads = db.prepare("SELECT * FROM leads WHERE status = 'active' ORDER BY created_at ASC").all();
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
  // ="..." forces spreadsheet apps to treat it as text, preserving leading zeros and spaces
  return '="' + String(v).replace(/"/g, '""') + '"';
}

// Socket.IO — WhatsApp events
const waStatusUnsubscribe = onStatusChange(() => {
  io.emit('wa_status', getStatus());
});

io.on('connection', (socket) => {
  // Send current status on connect
  socket.emit('wa_status', getStatus());

  // Init/re-init WhatsApp client
  socket.on('wa_init', async () => {
    await initClient();
  });

  // Disconnect WhatsApp client
  socket.on('wa_disconnect', async () => {
    await destroyClient();
    io.emit('wa_status', getStatus());
  });

  // Logout WhatsApp (clear session data)
  socket.on('wa_logout', async () => {
    await logoutClient();
    io.emit('wa_status', getStatus());
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
  // Start WhatsApp client in background after server is up
  initClient().catch(() => console.log('  WhatsApp: init failed (Chromium not available?)'));
});
