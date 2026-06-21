import { Router } from 'express';
import { createJob, getJob, listJobs, deleteJob } from '../gmaps/jobs.js';
import { getDB, logAudit } from '../db.js';
import crypto from 'crypto';

const router = Router();

router.post('/scrape', (req, res) => {
  const { query, depth, lang, geo, zoom } = req.body;
  if (!query || !query.trim()) return res.status(400).json({ error: 'Query is required' });

  const job = createJob(query.trim(), {
    depth: Math.min(Math.max(parseInt(depth) || 5, 1), 10),
    lang: lang || 'en',
    geo: geo || '',
    zoom: Math.min(Math.max(parseInt(zoom) || 0, 0), 21),
  });

  logAudit('gmaps_scrape', 'gmaps_job', job.id, query.trim(), { by: req.user?.id });
  res.json({ job_id: job.id, status: job.status });
});

router.get('/jobs', (req, res) => {
  const allJobs = listJobs().map(j => ({
    id: j.id,
    query: j.query,
    options: j.options,
    status: j.status,
    result_count: j.results?.length || 0,
    error: j.error,
    progress: j.progress,
    created_at: j.createdAt,
    started_at: j.startedAt,
    completed_at: j.completedAt,
  }));
  res.json(allJobs);
});

router.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.json({
    id: job.id,
    query: job.query,
    options: job.options,
    status: job.status,
    results: job.results,
    result_count: job.results?.length || 0,
    error: job.error,
    progress: job.progress,
    created_at: job.createdAt,
    started_at: job.startedAt,
    completed_at: job.completedAt,
  });
});

router.delete('/jobs/:id', (req, res) => {
  const ok = deleteJob(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Job not found or still running' });
  res.json({ ok: true });
});

router.get('/jobs/:id/download', (req, res) => {
  const job = getJob(req.params.id);
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

router.post('/jobs/:id/import', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') return res.status(400).json({ error: 'Job not completed' });
  if (!job.results?.length) return res.status(400).json({ error: 'No results to import' });

  const { skipDupes = true, selectedIndices } = req.body;
  const db = getDB();

  let results = job.results;
  if (Array.isArray(selectedIndices) && selectedIndices.length > 0) {
    results = selectedIndices.map(i => job.results[i]).filter(Boolean);
  }

  const settings = {};
  const rows = db.prepare('SELECT key, value FROM settings').all();
  for (const r of rows) settings[r.key] = r.value;
  const countryCode = settings.country_code || '';

  const stage = db.prepare('SELECT id FROM stages ORDER BY sort_order LIMIT 1').get();
  const defaultStage = stage?.id || 'new';

  let added = 0, skipped = 0;
  const now = Date.now();

  const insertLead = db.prepare(`INSERT INTO leads (id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status, verified, stage_id, created_at, dead_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertStageHistory = db.prepare('INSERT INTO stage_history (lead_id, stage_id, at) VALUES (?, ?, ?)');

  const insertTag = db.prepare('INSERT OR IGNORE INTO lead_tags (lead_id, tag_id) VALUES (?, ?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const createTag = db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)');

  const findLeadByPhone = db.prepare('SELECT id FROM leads WHERE phone = ? AND phone != ""');
  const findLeadByName = db.prepare('SELECT id FROM leads WHERE name = ?');

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
        if (phone && findLeadByPhone.get(phone)) { skipped++; continue; }
        if (findLeadByName.get(name)) { skipped++; continue; }
      }

      const leadId = 'lead_' + crypto.randomBytes(8).toString('hex');
      const notes = buildNotes(r);

      insertLead.run(
        leadId, name, phone, phoneValid ? 1 : 0, email || '',
        facebook, instagram, tiktok, otherLink,
        location, notes, leadStatus, 0, defaultStage, now,
        leadStatus === 'dead' ? now : null
      );
      insertStageHistory.run(leadId, defaultStage, now);

      if (r.category) {
        let tag = findTag.get(r.category);
        if (!tag) {
          const tagId = 'tag_' + crypto.randomBytes(4).toString('hex');
          const colors = ['#3d5a45', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#059669'];
          createTag.run(tagId, r.category, colors[Math.floor(Math.random() * colors.length)], now);
          tag = { id: tagId };
        }
        insertTag.run(leadId, tag.id);
      }

      added++;
    }
  });

  importTx();
  logAudit('gmaps_import', 'gmaps_job', job.id, `${added} leads`, { by: req.user?.id, skipped });
  res.json({ added, skipped, total: results.length });
});

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
