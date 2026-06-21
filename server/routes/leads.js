import { Router } from 'express';
import { getDB, logAudit } from '../db.js';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'leaddesk.db');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Lazily loaded WhatsApp functions (may not be available)
let waCheckPhones = null, waGetStatus = null;
try {
  const wa = await import('../whatsapp.js');
  waCheckPhones = wa.checkPhones;
  waGetStatus = wa.getStatus;
} catch {}

// List leads
router.get('/', (req, res) => {
  const db = getDB();
  const { search, stage, verified, phoneStatus, campaignUse, hasSocial, status, tag, tagNot, tagMode, sortBy, sortOrder } = req.query;

  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?'; params.push(status);
  } else {
    sql += " AND status = 'active'";
  }

  if (search) {
    sql += ' AND (name LIKE ? OR phone LIKE ? OR notes LIKE ? OR email LIKE ?)';
    const p = `%${search}%`;
    params.push(p, p, p, p);
  }

  if (stage) {
    sql += ' AND stage_id = ?'; params.push(stage);
  }

  if (verified === 'yes') { sql += ' AND verified = 1'; }
  else if (verified === 'no') { sql += ' AND verified = 0'; }

  if (phoneStatus === 'valid') { sql += ' AND phone_valid = 1'; }
  else if (phoneStatus === 'invalid') { sql += ' AND phone_valid = 0'; }

  if (campaignUse === 'used') {
    sql += ' AND id IN (SELECT lead_id FROM campaign_leads)';
  } else if (campaignUse === 'unused') {
    sql += ' AND id NOT IN (SELECT lead_id FROM campaign_leads)';
  }

  if (hasSocial === 'true') {
    sql += " AND (facebook != '' OR instagram != '' OR tiktok != '' OR link != '')";
  }

  if (tag) {
    const ids = tag.split(',').filter(Boolean);
    if (ids.length) {
      if (tagMode === 'all') {
        sql += ` AND id IN (SELECT lead_id FROM lead_tags WHERE tag_id IN (${ids.map(() => '?').join(',')}) GROUP BY lead_id HAVING COUNT(DISTINCT tag_id) = ?)`;
        params.push(...ids, ids.length);
      } else {
        sql += ` AND id IN (SELECT lead_id FROM lead_tags WHERE tag_id IN (${ids.map(() => '?').join(',')}))`;
        params.push(...ids);
      }
    }
  } else if (tagNot) {
    const ids = tagNot.split(',').filter(Boolean);
    if (ids.length) {
      sql += ` AND id NOT IN (SELECT lead_id FROM lead_tags WHERE tag_id IN (${ids.map(() => '?').join(',')}))`;
      params.push(...ids);
    }
  }

  const sortCols = ['name', 'phone', 'created_at', 'dead_at', 'verified', 'phone_valid'];
  const col = sortCols.includes(sortBy) ? sortBy : 'created_at';
  const dir = sortOrder === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${col} ${dir}`;

  const leads = db.prepare(sql).all(...params);

  const getCampaigns = db.prepare(`
    SELECT c.id, c.name FROM campaigns c
    INNER JOIN campaign_leads cl ON cl.campaign_id = c.id
    WHERE cl.lead_id = ?
  `);
  const getStageHistory = db.prepare('SELECT * FROM stage_history WHERE lead_id = ? ORDER BY at DESC');
  const getLeadTags = db.prepare(`
    SELECT t.id, t.name, t.color FROM tags t
    INNER JOIN lead_tags lt ON lt.tag_id = t.id
    WHERE lt.lead_id = ?
  `);

  const enriched = leads.map(l => ({
    ...l,
    verified: !!l.verified,
    phone_valid: !!l.phone_valid,
    campaigns: getCampaigns.all(l.id),
    stageHistory: getStageHistory.all(l.id),
    tags: getLeadTags.all(l.id),
  }));

  res.json(enriched);
});

// Get single lead
router.get('/:id', (req, res) => {
  const db = getDB();
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  lead.verified = !!lead.verified;
  lead.phone_valid = !!lead.phone_valid;
  lead.campaigns = db.prepare(`
    SELECT c.id, c.name FROM campaigns c
    INNER JOIN campaign_leads cl ON cl.campaign_id = c.id WHERE cl.lead_id = ?
  `).all(lead.id);
  lead.stageHistory = db.prepare('SELECT * FROM stage_history WHERE lead_id = ? ORDER BY at DESC').all(lead.id);
  lead.tags = db.prepare(`
    SELECT t.id, t.name, t.color FROM tags t
    INNER JOIN lead_tags lt ON lt.tag_id = t.id WHERE lt.lead_id = ?
  `).all(lead.id);
  res.json(lead);
});

// Create lead
router.post('/', (req, res) => {
  const db = getDB();
  const { id, name, phone, email, facebook, instagram, tiktok, link, location, notes, status, verified, stage_id, tag_ids } = req.body;

  const leadId = id || 'lead_' + Math.random().toString(36).slice(2, 10);
  const now = Date.now();
  const phoneValid = isValidPhone(phone) ? 1 : 0;
  const isDead = !phoneValid || !phone;

  db.prepare(`INSERT INTO leads (id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status, verified, stage_id, created_at, dead_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    leadId, name || '(unnamed)', phone || '', phoneValid, email || '', facebook || '', instagram || '', tiktok || '', link || '', location || '', notes || '', isDead ? 'dead' : (status || 'active'), verified ? 1 : 0, stage_id, now, isDead ? now : (status === 'dead' ? now : null)
  );

  db.prepare('INSERT INTO stage_history (lead_id, stage_id, at) VALUES (?, ?, ?)').run(leadId, stage_id, now);

  if (tag_ids && tag_ids.length) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)');
    for (const tid of tag_ids) insertTag.run(leadId, tid);
  }

  logAudit('create', 'lead', leadId, name || '(unnamed)', { phone, phoneValid, stage_id });

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  lead.verified = !!lead.verified;
  lead.phone_valid = !!lead.phone_valid;
  lead.campaigns = [];
  lead.stageHistory = db.prepare('SELECT * FROM stage_history WHERE lead_id = ? ORDER BY at DESC').all(leadId);
  lead.tags = db.prepare('SELECT t.id, t.name, t.color FROM tags t INNER JOIN lead_tags lt ON lt.tag_id = t.id WHERE lt.lead_id = ?').all(leadId);
  res.status(201).json(lead);
});

// Update lead
router.put('/:id', (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, phone, email, facebook, instagram, tiktok, link, location, notes, status, verified, stage_id, tag_ids } = req.body;
  const phoneValid = phone !== undefined ? (isValidPhone(phone) ? 1 : 0) : existing.phone_valid;
  const stageChanged = stage_id && stage_id !== existing.stage_id;
  const wasDead = existing.status === 'dead';
  const now = Date.now();

  db.prepare(`UPDATE leads SET name=?, phone=?, phone_valid=?, email=?, facebook=?, instagram=?, tiktok=?, link=?, location=?, notes=?, status=?, verified=?, stage_id=?, dead_at=? WHERE id=?`).run(
    name ?? existing.name, phone ?? existing.phone, phoneValid, email ?? existing.email,
    facebook ?? existing.facebook, instagram ?? existing.instagram, tiktok ?? existing.tiktok,
    link ?? existing.link, location ?? existing.location, notes ?? existing.notes,
    status ?? existing.status, verified !== undefined ? (verified ? 1 : 0) : existing.verified,
    stage_id ?? existing.stage_id,
    status === 'dead' && !wasDead ? now : (status === 'active' && wasDead ? null : existing.dead_at),
    req.params.id
  );

  if (stageChanged) {
    db.prepare('INSERT INTO stage_history (lead_id, stage_id, at) VALUES (?, ?, ?)').run(req.params.id, stage_id, now);
  }

  if (tag_ids !== undefined) {
    db.prepare('DELETE FROM lead_tags WHERE lead_id = ?').run(req.params.id);
    const insertTag = db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)');
    for (const tid of tag_ids) insertTag.run(req.params.id, tid);
  }

  logAudit('edit', 'lead', req.params.id, existing.name, { changes: req.body });

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  lead.verified = !!lead.verified;
  lead.phone_valid = !!lead.phone_valid;
  lead.campaigns = db.prepare('SELECT c.id, c.name FROM campaigns c INNER JOIN campaign_leads cl ON cl.campaign_id = c.id WHERE cl.lead_id = ?').all(lead.id);
  lead.stageHistory = db.prepare('SELECT * FROM stage_history WHERE lead_id = ? ORDER BY at DESC').all(lead.id);
  lead.tags = db.prepare('SELECT t.id, t.name, t.color FROM tags t INNER JOIN lead_tags lt ON lt.tag_id = t.id WHERE lt.lead_id = ?').all(lead.id);
  res.json(lead);
});

// Delete lead
router.delete('/:id', (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT id, name FROM leads WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  logAudit('delete', 'lead', req.params.id, existing?.name || 'unknown');
  res.json({ ok: true });
});

// Bulk actions
router.post('/bulk', (req, res) => {
  const db = getDB();
  const { ids, action, stageId, tagId } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'No IDs' });
  const now = Date.now();

  if (action === 'verify') {
    db.prepare(`UPDATE leads SET verified = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  } else if (action === 'dead') {
    db.prepare(`UPDATE leads SET status = 'dead', dead_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(now, ...ids);
  } else if (action === 'stage' && stageId) {
    db.prepare(`UPDATE leads SET stage_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(stageId, ...ids);
    const insert = db.prepare('INSERT INTO stage_history (lead_id, stage_id, at) VALUES (?, ?, ?)');
    for (const id of ids) insert.run(id, stageId, now);
  } else if (action === 'tag' && tagId) {
    const insert = db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)');
    for (const id of ids) insert.run(id, tagId);
  } else if (action === 'untag' && tagId) {
    const del = db.prepare('DELETE FROM lead_tags WHERE lead_id = ? AND tag_id = ?');
    for (const id of ids) del.run(id, tagId);
  } else if (action === 'delete') {
    db.prepare(`DELETE FROM leads WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  } else if (action === 'convert') {
    const insertClient = db.prepare(`INSERT OR IGNORE INTO clients (id, lead_id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const getLead = db.prepare('SELECT * FROM leads WHERE id = ?');
    for (const id of ids) {
      const l = getLead.get(id);
      if (l) {
        insertClient.run(crypto.randomUUID(), l.id, l.name, l.phone, l.phone_valid, l.email, l.facebook, l.instagram, l.tiktok, l.link, l.location, l.notes, 'active', 'lead', Date.now());
      }
    }
  }

  logAudit('bulk', 'lead', ids.join(','), `${action} (${ids.length} leads)`, { action, stageId, tagId });
  res.json({ ok: true });
});

// Import preview (CSV upload) — uses csv-parse/sync for robust parsing
router.post('/import/preview', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const text = req.file.buffer.toString('utf-8');
  const records = parseCSV(text);
  res.json({ rows: records });
});

// Import confirm — with update mode
router.post('/import/confirm', async (req, res) => {
  const db = getDB();
  const { rows, skipDupes, updateMode, checkWhatsApp, filename } = req.body;
  let added = 0, skipped = 0, updated = 0;
  const now = Date.now();
  const firstStage = db.prepare('SELECT id FROM stages ORDER BY sort_order LIMIT 1').get();

  // Read country code setting for phone normalization
  const ccSetting = db.prepare("SELECT value FROM settings WHERE key = 'country_code'").get();
  const countryCode = ccSetting ? ccSetting.value : '';

  // Normalize phone numbers (strip spaces, apply country code)
  for (const row of rows) {
    if (row.phone) row.phone = normalizePhone(row.phone, countryCode);
  }

  // Auto-backup DB before import
  try {
    const backupPath = DB_PATH + '.backup.' + now;
    fs.copyFileSync(DB_PATH, backupPath);
  } catch {} // Non-critical, proceed anyway

  const insertActive = db.prepare(`INSERT INTO leads (id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status, verified, stage_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'active', 0, ?, ?)`);
  const insertDead = db.prepare(`INSERT INTO leads (id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status, verified, stage_id, created_at, dead_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'dead', 0, ?, ?, ?)`);
  const insertHistory = db.prepare('INSERT INTO stage_history (lead_id, stage_id, at) VALUES (?, ?, ?)');
  const updateByPhone = db.prepare(`UPDATE leads SET name=?, phone_valid=?, email=?, facebook=?, instagram=?, tiktok=?, link=?, location=? WHERE id=?`);
  const findDupe = db.prepare('SELECT id FROM leads WHERE LOWER(name) = ? AND phone != \'\' AND phone = ?');
  const findDupeNoPhone = db.prepare('SELECT id FROM leads WHERE LOWER(name) = ? AND (phone = \'\' OR phone IS NULL)');
  const findPhone = db.prepare('SELECT id FROM leads WHERE phone != \'\' AND phone = ?');

  const txn = db.transaction(() => {
    const maybeClosedIds = [];
    for (const row of rows) {
      // Update mode: find by phone and update existing record
      if (updateMode && row.phone) {
        const existing = findPhone.get(row.phone);
        if (existing) {
          updateByPhone.run(row.name, row.phoneValid ? 1 : 0, row.email || '', row.facebook || '', row.instagram || '', row.tiktok || '', row.link || '', row.location || '', existing.id);
          if (row.maybeClosed) maybeClosedIds.push(existing.id);
          updated++;
          continue;
        }
      }

      // Skip dupes mode: skip if same name+phone exists (handles empty-phone leads too)
      if (skipDupes) {
        let dupe;
        if (row.phone) {
          dupe = findDupe.get(row.name.toLowerCase(), row.phone);
        } else {
          dupe = findDupeNoPhone.get(row.name.toLowerCase());
        }
        if (dupe) { skipped++; continue; }
      }

      const id = 'lead_' + Math.random().toString(36).slice(2, 10);
      const isDead = !row.phoneValid || !row.phone;
      if (isDead) {
        insertDead.run(id, row.name, row.phone, row.phoneValid ? 1 : 0, row.email || '', row.facebook || '', row.instagram || '', row.tiktok || '', row.link || '', row.location || '', firstStage?.id || 's1', now, now);
      } else {
        insertActive.run(id, row.name, row.phone, row.phoneValid ? 1 : 0, row.email || '', row.facebook || '', row.instagram || '', row.tiktok || '', row.link || '', row.location || '', firstStage?.id || 's1', now);
      }
      insertHistory.run(id, firstStage?.id || 's1', now);
      if (row.maybeClosed) maybeClosedIds.push(id);
      added++;
    }
    return maybeClosedIds;
  });
  const maybeClosedIds = txn();

  // Tag MaybeClosed leads
  if (maybeClosedIds.length > 0) {
    let maybeClosedTag = db.prepare('SELECT id FROM tags WHERE name = ?').get('MaybeClosed');
    if (!maybeClosedTag) {
      const tagId = 'tag_' + Math.random().toString(36).slice(2, 10);
      db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(tagId, 'MaybeClosed', '#8B4513', Date.now());
      maybeClosedTag = { id: tagId };
    }
    const assignTag = db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)');
    for (const id of maybeClosedIds) assignTag.run(id, maybeClosedTag.id);
  }

  // After import, optionally check WhatsApp
  let waResults = null;
  if (checkWhatsApp && added > 0) {
    try {
      // Get phones of newly added leads that have valid phones
      const toCheck = rows.filter(r => r.phone && r.phoneValid).map(r => r.phone);
      if (toCheck.length > 0) {
        if (waCheckPhones && waGetStatus && waGetStatus().ready) {
          waResults = await waCheckPhones(toCheck);
          // Find or create "Not WhatsApp" tag
          let notWATag = db.prepare('SELECT id FROM tags WHERE name = ?').get('Not WhatsApp');
          if (!notWATag) {
            const tagId = 'tag_' + Math.random().toString(36).slice(2, 10);
            db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(tagId, 'Not WhatsApp', '#a13a3a', Date.now());
            notWATag = { id: tagId };
          }
          // Find leads by phone (strip formatting from DB phone to match) and assign tag
          const activeLeads = db.prepare("SELECT id, phone FROM leads WHERE status = 'active'").all();
          for (const r of waResults) {
            if (!r.exists) {
              const match = activeLeads.find(l => l.phone.replace(/\D/g, '') === r.phone);
              if (match) {
                db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)').run(match.id, notWATag.id);
              }
            }
          }
        }
      }
    } catch {} // Non-critical
  }

  // Log import
  const importId = 'imp_' + Math.random().toString(36).slice(2, 10);
  db.prepare('INSERT INTO import_logs (id, filename, rows_total, added, skipped, updated, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(importId, filename || '', rows.length, added, skipped, updated, JSON.stringify({ waResults }), now);
  logAudit('import', 'import', importId, filename || 'unknown.csv', { added, skipped, updated, rows: rows.length });

  res.json({ added, skipped, updated, waResults });
});

function parseCSV(text) {
  // Pre-process: remove lines with unclosed quotes (some rows in Google Maps CSVs are truncated)
  const lines = text.split('\n');
  const cleanLines = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    let inQ = false;
    for (const c of lines[i]) {
      if (c === '"') inQ = !inQ;
    }
    if (!inQ) cleanLines.push(lines[i]);
  }
  const cleanText = cleanLines.join('\n');

  let raw;
  try {
    raw = parse(cleanText, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    });
  } catch {
    raw = [];
  }
  if (!raw.length) return [];

    const data = [];
  for (const row of raw) {
    const name = row.title || row.name || row.Name || '(unnamed)';
    const phone = row.phone || row.Phone || '';
    const website = row.website || row.Website || '';
    const mapsLink = row.link || row.Link || row.google_maps_link || '';
    const emailRaw = row.emails || row.email || row.Email || '';
    let email = '';
    if (emailRaw && emailRaw !== '[]') {
      const cleaned = emailRaw.replace(/[\[\]"]/g, '').trim();
      if (cleaned) email = cleaned.split(',')[0].trim();
    }
    const linkType = classifyLink(website);
    const userReviewsRaw = row.user_reviews || '';
    const openHoursRaw = row.open_hours || '';
    const popularTimesRaw = row.popular_times || '';
    const statusRaw = row.status || '';
    const maybeClosed = getMaybeClosed(userReviewsRaw, openHoursRaw, popularTimesRaw, statusRaw);
    data.push({
      name: name.trim(),
      phone: phone.trim(),
      email,
      facebook: linkType === 'facebook' ? website : '',
      instagram: linkType === 'instagram' ? website : '',
      tiktok: linkType === 'tiktok' ? website : '',
      link: linkType === 'link' ? website : '',
      location: mapsLink || '',
      phoneValid: isValidPhone(phone),
      maybeClosed,
    });
  }
  return data;
}

function getMaybeClosed(userReviewsRaw, openHoursRaw, popularTimesRaw, statusRaw) {
  // 1. Newest review older than 9 months
  if (userReviewsRaw && userReviewsRaw !== 'null' && userReviewsRaw !== '[]') {
    try {
      const reviews = JSON.parse(userReviewsRaw);
      if (Array.isArray(reviews) && reviews.length > 0) {
        const newest = reviews.reduce((max, r) => {
          const ts = r.posted_at_unix_micros ? Math.floor(r.posted_at_unix_micros / 1000) : 0;
          return ts > max ? ts : max;
        }, 0);
        if (newest) {
          const nineMonthsAgo = Date.now() - 9 * 30 * 24 * 60 * 60 * 1000;
          if (newest < nineMonthsAgo) return true;
        }
      }
    } catch {}
  }

  // 2. Both open_hours and popular_times empty
  if ((!openHoursRaw || openHoursRaw === '{}') && (!popularTimesRaw || popularTimesRaw === '{}')) return true;

  // 3. All days in open_hours explicitly say "Closed"
  if (openHoursRaw && openHoursRaw !== '{}') {
    try {
      const oh = JSON.parse(openHoursRaw);
      if (Object.values(oh).every(v => String(v).toLowerCase().includes('closed'))) return true;
    } catch {}
  }

  // 4. status column contains "closed"
  if (statusRaw && (String(statusRaw).toLowerCase().includes('closed') || String(statusRaw).toLowerCase().includes('permanently'))) return true;

  return false;
}

function isValidPhone(raw) {
  if (!raw) return false;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return false;
  if (/^0{6,}$/.test(digits)) return false;
  if (/^(\d)\1{6,}$/.test(digits)) return false;
  return true;
}

function classifyLink(url) {
  if (!url) return null;
  const u = String(url).toLowerCase();
  if (u.includes('facebook.com') || u.includes('fb.com')) return 'facebook';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('tiktok.com')) return 'tiktok';
  return 'link';
}

function normalizePhone(raw, countryCode) {
  if (!raw) return raw;
  let cleaned = String(raw).replace(/\s+/g, '');
  if (cleaned.includes('+')) {
    return cleaned.replace(/\D/g, '');
  }
  const digits = cleaned.replace(/\D/g, '');
  if (!digits || !countryCode) return digits;
  const withoutLeadingZero = digits.replace(/^0+/, '');
  if (!withoutLeadingZero.startsWith(countryCode)) {
    return countryCode + withoutLeadingZero;
  }
  return withoutLeadingZero;
}

export default router;
