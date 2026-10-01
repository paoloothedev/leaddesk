import { Router } from 'express';
import { createJob, getJob, listJobs, deleteJob } from '../gmaps/jobs.js';
import { getDB, logAudit } from '../db.js';
import crypto from 'crypto';

let waCheckPhones = null, waGetStatus = null;
try {
  const wa = await import('../whatsapp.js');
  waCheckPhones = wa.checkPhones;
  waGetStatus = wa.getStatus;
} catch {}

const router = Router();

router.post('/scrape', (req, res) => {
  const { name, query, queries, depth, lang, geo, zoom } = req.body;

  let queryList = [];
  if (queries && Array.isArray(queries) && queries.length > 0) {
    queryList = queries.map(q => q.trim()).filter(Boolean);
  } else if (query && query.trim()) {
    queryList = [query.trim()];
  }

  if (!queryList.length) return res.status(400).json({ error: 'At least one query is required' });

  const job = createJob(name || queryList[0], queryList, {
    depth: Math.min(Math.max(parseInt(depth) || 10, 1), 20),
    lang: lang || 'en',
    geo: geo || '',
    zoom: Math.min(Math.max(parseInt(zoom) || 0, 0), 21),
  }, req.project.id);

  logAudit('gmaps_scrape', 'gmaps_job', job.id, job.name, { by: req.user?.id, queries: queryList, geo, zoom }, req.project.id);
  res.json({ job_id: job.id, status: job.status });
});

router.get('/jobs', (req, res) => {
  const allJobs = listJobs(req.project.id).map(j => ({
    id: j.id,
    name: j.name,
    queries: j.queries,
    options: j.options,
    status: j.status,
    result_count: j.results?.length || 0,
    total_found: j.totalFound || 0,
    error: j.error,
    progress: j.progress,
    current_query: j.currentQuery,
    created_at: j.createdAt,
    started_at: j.startedAt,
    completed_at: j.completedAt,
  }));
  res.json(allJobs);
});

router.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id, req.project.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.json({
    id: job.id,
    name: job.name,
    queries: job.queries,
    options: job.options,
    status: job.status,
    results: job.results,
    result_count: job.results?.length || 0,
    total_found: job.totalFound || 0,
    error: job.error,
    progress: job.progress,
    current_query: job.currentQuery,
    created_at: job.createdAt,
    started_at: job.startedAt,
    completed_at: job.completedAt,
  });
});

router.delete('/jobs/:id', (req, res) => {
  const ok = deleteJob(req.params.id, req.project.id);
  if (!ok) return res.status(404).json({ error: 'Job not found or still running' });
  res.json({ ok: true });
});

router.get('/jobs/:id/download', (req, res) => {
  const job = getJob(req.params.id, req.project.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed' || !job.results?.length) return res.status(400).json({ error: 'No results' });

  const headers = [
    'input_id', 'link', 'title', 'category', 'address', 'open_hours',
    'popular_times', 'website', 'phone', 'plus_code', 'review_count',
    'review_rating', 'reviews_per_rating', 'latitude', 'longitude', 'cid',
    'status', 'descriptions', 'reviews_link', 'thumbnail', 'timezone',
    'price_range', 'data_id', 'street_view_url', 'place_id', 'images',
    'reservations', 'order_online', 'menu', 'owner', 'complete_address',
    'about', 'user_reviews', 'user_reviews_extended', 'emails',
  ];

  const escapeCSV = (val) => {
    const s = val == null ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  let csv = headers.join(',') + '\n';
  for (const r of job.results) {
    const email = Array.isArray(r.emails) ? r.emails.join(', ') : (r.email || '');
    const row = [
      r.id || r.input_id || '',
      r.link || '',
      r.title || r.name || '',
      r.category || (Array.isArray(r.categories) ? r.categories[0] : ''),
      r.address || '',
      r.open_hours ? JSON.stringify(r.open_hours) : '',
      r.popular_times ? JSON.stringify(r.popular_times) : '',
      r.website || r.web_site || '',
      r.phone || '',
      r.plus_code || '',
      r.review_count || 0,
      r.review_rating || 0,
      r.reviews_per_rating ? JSON.stringify(r.reviews_per_rating) : '',
      r.latitude || 0,
      r.longitude || r.longtitude || 0,
      r.cid || '',
      r.status || '',
      r.description || '',
      r.reviews_link || '',
      r.thumbnail || '',
      r.timezone || '',
      r.price_range || '',
      r.data_id || '',
      r.street_view_url || '',
      r.place_id || '',
      r.images ? JSON.stringify(r.images) : '',
      r.reservations ? JSON.stringify(r.reservations) : '',
      r.order_online ? JSON.stringify(r.order_online) : '',
      r.menu ? JSON.stringify(r.menu) : '',
      r.owner ? JSON.stringify(r.owner) : '',
      r.complete_address ? JSON.stringify(r.complete_address) : '',
      r.about ? JSON.stringify(r.about) : '',
      r.user_reviews ? JSON.stringify(r.user_reviews) : '',
      r.user_reviews_extended ? JSON.stringify(r.user_reviews_extended) : '',
      email,
    ];
    csv += row.map(escapeCSV).join(',') + '\n';
  }

  const safeName = (job.query || 'gmaps-results').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
  res.send(csv);
});

router.post('/jobs/:id/import', async (req, res) => {
  const job = getJob(req.params.id, req.project.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') return res.status(400).json({ error: 'Job not completed' });
  if (!job.results?.length) return res.status(400).json({ error: 'No results to import' });

  const { skipDupes = true, selectedIndices, checkWhatsApp = false } = req.body;
  const db = getDB();
  const projectId = req.project.id;

  let results = job.results;
  if (Array.isArray(selectedIndices) && selectedIndices.length > 0) {
    results = selectedIndices.map(i => job.results[i]).filter(Boolean);
  }

  const settings = {};
  const rows = db.prepare('SELECT key, value FROM settings WHERE project_id = ?').all(projectId);
  for (const r of rows) settings[r.key] = r.value;
  const countryCode = settings.country_code || '';

  const stage = db.prepare('SELECT id FROM stages WHERE project_id = ? ORDER BY sort_order LIMIT 1').get(projectId);
  const defaultStage = stage?.id || 'new';

  let added = 0, skipped = 0;
  const now = Date.now();

  const insertLead = db.prepare(`INSERT INTO leads (id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status, verified, stage_id, created_at, dead_at, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertStageHistory = db.prepare('INSERT INTO stage_history (lead_id, stage_id, at) VALUES (?, ?, ?)');

  const insertTag = db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ? AND project_id = ?');
  const createTag = db.prepare('INSERT INTO tags (id, name, color, created_at, project_id) VALUES (?, ?, ?, ?, ?)');

  const findLeadByPhone = db.prepare('SELECT id FROM leads WHERE phone = ? AND phone != "" AND project_id = ?');
  const findLeadByName = db.prepare('SELECT id FROM leads WHERE name = ? AND project_id = ?');

  const importTx = db.transaction(() => {
    for (const r of results) {
      const name = r.title || r.name || '(unnamed)';
      let phone = normalizePhone(r.phone || '', countryCode);
      const email = Array.isArray(r.emails) ? r.emails[0] : (r.email || '');
      const location = r.link || r.google_maps_link || '';

      let facebook = '', instagram = '', tiktok = '', otherLink = '';
      const website = r.website || r.web_site || '';
      if (website) {
        if (/facebook/i.test(website)) facebook = website;
        else if (/instagram/i.test(website)) instagram = website;
        else if (/tiktok/i.test(website)) tiktok = website;
        else otherLink = website;
      }

      const phoneValid = isValidPhone(phone);
      const leadStatus = phoneValid ? 'active' : 'dead';

      if (skipDupes) {
        if (phone && findLeadByPhone.get(phone, projectId)) { skipped++; continue; }
        if (findLeadByName.get(name, projectId)) { skipped++; continue; }
      }

      const leadId = 'lead_' + crypto.randomBytes(8).toString('hex');
      const notes = buildNotes(r);

      insertLead.run(
        leadId, name, phone, phoneValid ? 1 : 0, email || '',
        facebook, instagram, tiktok, otherLink,
        location, notes, leadStatus, 0, defaultStage, now,
        leadStatus === 'dead' ? now : null, projectId
      );
      insertStageHistory.run(leadId, defaultStage, now);

      if (r.category) {
        let tag = findTag.get(r.category, projectId);
        if (!tag) {
          const tagId = 'tag_' + crypto.randomBytes(4).toString('hex');
          const colors = ['#3d5a45', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#059669'];
          createTag.run(tagId, r.category, colors[Math.floor(Math.random() * colors.length)], now, projectId);
          tag = { id: tagId };
        }
        insertTag.run(leadId, tag.id);
      }

      if (isMaybeClosed(r)) {
        let closedTag = findTag.get('MaybeClosed', projectId);
        if (!closedTag) {
          const tagId = 'tag_' + crypto.randomBytes(4).toString('hex');
          createTag.run(tagId, 'MaybeClosed', '#a13a3a', now, projectId);
          closedTag = { id: tagId };
        }
        insertTag.run(leadId, closedTag.id);
      }

      added++;
    }
  });

  importTx();
  logAudit('gmaps_import', 'gmaps_job', job.id, `${added} leads`, { by: req.user?.id, skipped }, projectId);

  let waResults = null;
  if (checkWhatsApp && added > 0) {
    try {
      const toCheck = results.filter(r => r.phone).map(r => normalizePhone(r.phone || '', countryCode)).filter(Boolean);
      if (toCheck.length > 0 && waCheckPhones && waGetStatus && waGetStatus(projectId).ready) {
        waResults = await waCheckPhones(projectId, toCheck);
        let notWATag = db.prepare('SELECT id FROM tags WHERE name = ? AND project_id = ?').get('Not WhatsApp', projectId);
        if (!notWATag) {
          const tagId = 'tag_' + Math.random().toString(36).slice(2, 10);
          db.prepare('INSERT INTO tags (id, name, color, created_at, project_id) VALUES (?, ?, ?, ?, ?)').run(tagId, 'Not WhatsApp', '#a13a3a', Date.now(), projectId);
          notWATag = { id: tagId };
        }
        const activeLeads = db.prepare("SELECT id, phone FROM leads WHERE status = 'active' AND project_id = ?").all(projectId);
        for (const r of waResults) {
          if (!r.exists) {
            const match = activeLeads.find(l => l.phone.replace(/\D/g, '') === r.phone);
            if (match) {
              db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)').run(match.id, notWATag.id);
            }
          }
        }
      }
    } catch (err) {
      console.error('[gmaps] WhatsApp check failed:', err.message);
    }
  }

  res.json({ added, skipped, total: results.length, waResults });
});

function isMaybeClosed(r) {
  if (r.status && (String(r.status).toLowerCase().includes('closed') || String(r.status).toLowerCase().includes('permanently'))) return true;
  if (r.open_hours && typeof r.open_hours === 'object' && Object.keys(r.open_hours).length > 0) {
    if (Object.values(r.open_hours).every(v => String(v).toLowerCase().includes('closed'))) return true;
  }
  if (r.open_hours && typeof r.open_hours === 'object' && Object.keys(r.open_hours).length === 0 &&
      r.popular_times && typeof r.popular_times === 'object' && Object.keys(r.popular_times).length === 0) return true;
  if (r.user_reviews && Array.isArray(r.user_reviews) && r.user_reviews.length > 0) {
    const newest = r.user_reviews.reduce((max, rev) => {
      const ts = rev.posted_at_unix_micros ? Math.floor(rev.posted_at_unix_micros / 1000) : 0;
      return ts > max ? ts : max;
    }, 0);
    if (newest && newest < Date.now() - 9 * 30 * 24 * 60 * 60 * 1000) return true;
  }
  return false;
}

function normalizePhone(raw, countryCode) {
  if (!raw) return '';
  let phone = raw.replace(/[^\d+]/g, '');
  if (!phone.startsWith('+') && countryCode) {
    phone = '+' + countryCode + phone.replace(/^0+/, '');
  }
  return phone;
}

function isValidPhone(raw) {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return false;
  if (/^0{10,}$/.test(digits)) return false;
  if (/^(\d)\1{9,}$/.test(digits)) return false;
  return true;
}

function buildNotes(r) {
  const parts = [];
  if (r.address) parts.push(`Address: ${r.address}`);
  if (r.category) parts.push(`Category: ${r.category}`);
  if (r.review_rating) parts.push(`Rating: ${r.review_rating}/5 (${r.review_count || 0} reviews)`);
  if (r.price_range) parts.push(`Price: ${r.price_range}`);
  if (r.description) parts.push(r.description);
  if (r.status && /closed/i.test(r.status)) parts.push(`Status: ${r.status}`);
  return parts.join('\n');
}

export default router;
