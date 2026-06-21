import crypto from 'crypto';
import { scrapeGmaps } from './scraper.js';

const jobs = new Map();

function createJob(query, options = {}) {
  const id = crypto.randomBytes(8).toString('hex');
  const job = {
    id,
    query,
    options,
    status: 'pending',
    results: [],
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    progress: null,
  };
  jobs.set(id, job);
  runJob(id);
  return job;
}

async function runJob(id) {
  const job = jobs.get(id);
  if (!job) return;

  job.status = 'running';
  job.startedAt = Date.now();

  try {
    const results = await scrapeGmaps(job.query, {
      depth: job.options.depth || 5,
      lang: job.options.lang || 'en',
      geo: job.options.geo || '',
      zoom: job.options.zoom || 0,
      onProgress: (p) => { job.progress = p; },
    });

    job.results = results;
    job.status = 'completed';
  } catch (err) {
    console.error(`[gmaps] Job ${id} failed:`, err.message);
    job.status = 'failed';
    job.error = err.message;
  } finally {
    job.completedAt = Date.now();
    job.progress = null;
  }
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
  return true;
}

export { createJob, getJob, listJobs, deleteJob };
