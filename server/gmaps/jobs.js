import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeGmaps } from './scraper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOBS_FILE = path.join(__dirname, 'jobs_data.json');

const jobs = new Map();

function loadJobs() {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
      for (const [id, job] of Object.entries(data)) {
        if (job.status === 'running') job.status = 'pending';
        jobs.set(id, job);
      }
      console.log(`[gmaps] Loaded ${jobs.size} jobs from disk`);
    }
  } catch (err) {
    console.error('[gmaps] Failed to load jobs:', err.message);
  }
}

function saveJobs() {
  try {
    const obj = {};
    for (const [id, job] of jobs) {
      obj[id] = { ...job, progress: null };
    }
    fs.writeFileSync(JOBS_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('[gmaps] Failed to save jobs:', err.message);
  }
}

function createJob(name, queries, options = {}) {
  const id = crypto.randomBytes(8).toString('hex');
  const job = {
    id,
    name: name || 'Untitled Scrape',
    queries: Array.isArray(queries) ? queries : [queries],
    options,
    status: 'pending',
    results: [],
    totalFound: 0,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    progress: null,
    currentQuery: null,
  };
  jobs.set(id, job);
  saveJobs();
  runJob(id);
  return job;
}

async function runJob(id) {
  const job = jobs.get(id);
  if (!job) return;

  job.status = 'running';
  job.startedAt = Date.now();

  const allResults = [];
  const seen = new Set();

  for (let qi = 0; qi < job.queries.length; qi++) {
    const query = job.queries[qi].trim();
    if (!query) continue;

    job.currentQuery = query;
    job.progress = { phase: 'searching', message: `Query ${qi + 1}/${job.queries.length}: ${query}` };

    console.log(`[gmaps] Job ${id}: scraping "${query}" (${qi + 1}/${job.queries.length})`);

    try {
      const results = await scrapeGmaps(query, {
        depth: job.options.depth || 10,
        lang: job.options.lang || 'en',
        geo: job.options.geo || '',
        zoom: job.options.zoom || 0,
        onProgress: (p) => {
          p.queryIndex = qi;
          p.totalQueries = job.queries.length;
          job.progress = p;
        },
      });

      for (const r of results) {
        const key = (r.title || '') + (r.phone || '') + (r.address || '');
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(r);
        }
      }

      console.log(`[gmaps] Job ${id}: "${query}" returned ${results.length} results (${allResults.length} total unique)`);
    } catch (err) {
      console.error(`[gmaps] Job ${id}: query "${query}" failed: ${err.message}`);
    }

    if (qi < job.queries.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  job.results = allResults;
  job.totalFound = allResults.length;
  job.status = 'completed';
  job.currentQuery = null;
  job.progress = null;
  job.completedAt = Date.now();
  saveJobs();

  console.log(`[gmaps] Job ${id}: completed with ${allResults.length} total unique results`);
}

function getJob(id) {
  return jobs.get(id) || null;
}

function listJobs() {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function deleteJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'running') return false;
  jobs.delete(id);
  saveJobs();
  return true;
}

export { createJob, getJob, listJobs, deleteJob };

loadJobs();
