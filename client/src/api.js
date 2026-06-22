const API = '/api';

async function request(path, options = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export function getStats() {
  return request('/stats');
}

export function getLeads(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request('/leads' + (qs ? '?' + qs : ''));
}

export function getLead(id) {
  return request('/leads/' + id);
}

export function createLead(data) {
  return request('/leads', { method: 'POST', body: JSON.stringify(data) });
}

export function updateLead(id, data) {
  return request('/leads/' + id, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteLead(id) {
  return request('/leads/' + id, { method: 'DELETE' });
}

export function bulkAction(ids, action, stageId, tagId) {
  return request('/leads/bulk', { method: 'POST', body: JSON.stringify({ ids, action, stageId, tagId }) });
}

export function importPreview(file) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(API + '/leads/import/preview', { method: 'POST', body: formData, credentials: 'include' }).then(r => r.json());
}

export function importConfirm(rows, skipDupes, updateMode, checkWhatsApp, filename) {
  return request('/leads/import/confirm', { method: 'POST', body: JSON.stringify({ rows, skipDupes, updateMode, checkWhatsApp, filename }) });
}

export function getStages() {
  return request('/stages');
}

export function createStage(data) {
  return request('/stages', { method: 'POST', body: JSON.stringify(data) });
}

export function updateStage(id, data) {
  return request('/stages/' + id, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteStage(id) {
  return request('/stages/' + id, { method: 'DELETE' });
}

export function reorderStages(orderedIds) {
  return request('/stages/reorder', { method: 'POST', body: JSON.stringify({ orderedIds }) });
}

export function getCampaigns() {
  return request('/campaigns');
}

export function createCampaign(data) {
  return request('/campaigns', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteCampaign(id) {
  return request('/campaigns/' + id, { method: 'DELETE' });
}

export function removeLeadFromCampaign(id, leadId) {
  return request('/campaigns/' + id + '/leads/' + leadId, { method: 'DELETE' });
}

export function addLeadsToCampaign(id, leadIds, count, force) {
  const body = leadIds ? { leadIds, force } : { count, force };
  return request('/campaigns/' + id + '/leads', { method: 'POST', body: JSON.stringify(body) });
}

export function exportBackup() {
  return request('/export');
}

export function exportCSV() {
  window.open('/api/export/csv', '_blank');
}

export function importBackup(data) {
  return request('/import/backup', { method: 'POST', body: JSON.stringify(data) });
}

export function getTags() {
  return request('/tags');
}

export function createTag(data) {
  return request('/tags', { method: 'POST', body: JSON.stringify(data) });
}

export function updateTag(id, data) {
  return request('/tags/' + id, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteTag(id) {
  return request('/tags/' + id, { method: 'DELETE' });
}

// Broadcast jobs
export function createJob(data) {
  return request('/jobs', { method: 'POST', body: JSON.stringify(data) });
}

export function getJobs() {
  return request('/jobs');
}

export function getDailyStatus() {
  return request('/jobs/daily-status');
}

export function getJob(id) {
  return request('/jobs/' + id);
}

export function pauseJob(id) {
  return request('/jobs/' + id + '/pause', { method: 'POST' });
}

export function resumeJob(id) {
  return request('/jobs/' + id + '/resume', { method: 'POST' });
}

export function stopJob(id) {
  return request('/jobs/' + id + '/stop', { method: 'POST' });
}

export function deleteJob(id) {
  return request('/jobs/' + id, { method: 'DELETE' });
}

// Message templates
export function getTemplates() {
  return request('/templates');
}

export function createTemplate(data) {
  return request('/templates', { method: 'POST', body: JSON.stringify(data) });
}

export function updateTemplate(id, data) {
  return request('/templates/' + id, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteTemplate(id) {
  return request('/templates/' + id, { method: 'DELETE' });
}

export function getImportLogs() {
  return request('/import-logs');
}

export function getAuditLog(limit) {
  return request('/audit-log' + (limit ? '?limit=' + limit : ''));
}

// Settings
export function getSettings() {
  return request('/settings');
}

export function saveSetting(key, value) {
  return request('/settings', { method: 'PUT', body: JSON.stringify({ key, value }) });
}

// Clients
export function getClients(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request('/clients' + (qs ? '?' + qs : ''));
}

export function getClient(id) {
  return request('/clients/' + id);
}

export function createClient(data) {
  return request('/clients', { method: 'POST', body: JSON.stringify(data) });
}

export function updateClient(id, data) {
  return request('/clients/' + id, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteClient(id) {
  return request('/clients/' + id, { method: 'DELETE' });
}

export function addClientActivity(id, action, details) {
  return request('/clients/' + id + '/activity', { method: 'POST', body: JSON.stringify({ action, details }) });
}

// Email Campaigns
export function getEmailCampaigns() {
  return request('/email-campaigns');
}

export function createEmailCampaign(data) {
  return request('/email-campaigns', { method: 'POST', body: JSON.stringify(data) });
}

export function updateEmailCampaign(id, data) {
  return request('/email-campaigns/' + id, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteEmailCampaign(id) {
  return request('/email-campaigns/' + id, { method: 'DELETE' });
}

export function addLeadsToEmailCampaign(id, leadIds, count, force) {
  const body = leadIds ? { leadIds, force } : { count, force };
  return request('/email-campaigns/' + id + '/leads', { method: 'POST', body: JSON.stringify(body) });
}

// Google Maps Scraper
export function scrapeGmaps(data) {
  return request('/gmaps/scrape', { method: 'POST', body: JSON.stringify(data) });
}

export function getGmapsJobs() {
  return request('/gmaps/jobs');
}

export function getGmapsJob(id) {
  return request('/gmaps/jobs/' + id);
}

export function deleteGmapsJob(id) {
  return request('/gmaps/jobs/' + id, { method: 'DELETE' });
}

export function importGmapsJob(id, options = {}) {
  return request('/gmaps/jobs/' + id + '/import', { method: 'POST', body: JSON.stringify(options) });
}

export async function downloadGmapsCSV(id) {
  const res = await fetch(`/api/gmaps/jobs/${id}/download`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Download failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'gmaps-results.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
