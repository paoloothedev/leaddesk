// Agency mode access control: workspace membership, permissions, account management.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client } from './helpers.js';

let srv, admin, A, B;

async function makeUser(creator, username, permissions, projectIds) {
  const r = await creator.post('/accounts', { username, password: 'pw123456', permissions, projectIds });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = client(srv.base);
  await c.login(username, 'pw123456');
  return { id: r.body.id, body: r.body, c };
}

before(async () => {
  srv = await startServer();
  admin = client(srv.base);
  await admin.login();
  A = (await admin.post('/projects', { name: 'Client A' })).body.id;
  B = (await admin.post('/projects', { name: 'Client B' })).body.id;
});
after(async () => { await srv?.stop(); });

test('members only see and enter their own workspaces', async () => {
  const u = await makeUser(admin, 'staff1', ['leads.view'], [A]);
  const names = (await u.c.get('/projects')).body.map(p => p.name);
  assert.deepEqual(names, ['Client A']);
  assert.equal((await u.c.as(A).get('/leads')).status, 200);
  assert.equal((await u.c.as(B).get('/leads')).status, 404);
  assert.equal((await u.c.put(`/projects/${B}`, { name: 'x' })).status, 403);
});

test('permissions are enforced per action', async () => {
  const u = await makeUser(admin, 'viewer', ['leads.view'], [A]);
  const c = u.c.as(A);
  assert.equal((await c.get('/stages')).status, 200, 'reference data readable by members');
  assert.equal((await c.post('/leads', { name: 'x', phone: '201000000021' })).status, 403);
  assert.equal((await c.put('/settings', { key: 'k', value: 'v' })).status, 403);
  assert.equal((await c.get('/campaigns')).status, 403);
  assert.equal((await c.get('/export')).status, 403);
  assert.equal((await c.post('/tags', { name: 't' })).status, 403);

  const editor = (await makeUser(admin, 'editor', ['leads.view', 'leads.edit'], [A])).c.as(A);
  const lead = (await editor.post('/leads', { name: 'y', phone: '201000000022' })).body.id;
  assert.ok(lead);
  assert.equal((await editor.post('/leads/bulk', { ids: [lead], action: 'verify' })).status, 403);
  assert.equal((await editor.post('/leads/bulk', { ids: [lead], action: 'delete' })).status, 403);
});

test('non-admins cannot escalate when managing accounts', async () => {
  const mgr = await makeUser(admin, 'clientmgr', ['accounts.view', 'accounts.manage', 'leads.view'], [A]);
  const sub = await mgr.c.post('/accounts', {
    username: 'sub1', password: 'pw123456', permissions: ['leads.view', 'leads.delete', 'projects.manage'], projectIds: [A, B],
  });
  assert.equal(sub.status, 200);
  assert.deepEqual(sub.body.permissions, ['leads.view']);
  assert.deepEqual(sub.body.projectIds, [A]);

  const other = await makeUser(admin, 'agencystaff', ['leads.view'], [A, B]);
  assert.equal((await mgr.c.put(`/accounts/${other.id}`, { password: 'hijack123' })).status, 403);
  assert.equal((await mgr.c.post(`/accounts/admin/change-password`, { password: 'hijack123' })).status, 403);
  assert.equal((await mgr.c.del(`/accounts/${other.id}`)).status, 403);
  const listed = (await mgr.c.get('/accounts')).body.map(a => a.username).sort();
  assert.deepEqual(listed, ['clientmgr', 'sub1']);
});

test('creating workspaces needs projects.manage; creator becomes a member', async () => {
  const plain = await makeUser(admin, 'plain', ['settings.edit'], [A]);
  assert.equal((await plain.c.post('/projects', { name: 'Nope' })).status, 403);
  assert.equal((await plain.c.del(`/projects/${A}`)).status, 403);

  const lead = await makeUser(admin, 'agencylead', ['projects.manage'], []);
  const p = (await lead.c.post('/projects', { name: 'New client' })).body;
  assert.ok((await lead.c.get('/projects')).body.some(x => x.id === p.id));
  assert.equal((await lead.c.del(`/projects/${B}`)).status, 404, 'cannot delete a workspace it is not in');
});

test('admin can move a user between workspaces', async () => {
  const u = await makeUser(admin, 'mover', ['leads.view'], [A]);
  await admin.put(`/accounts/${u.id}`, { projectIds: [B] });
  assert.equal((await u.c.as(A).get('/leads')).status, 404);
  assert.equal((await u.c.as(B).get('/leads')).status, 200);
});

test('workspace members list is visible to members only', async () => {
  const u = await makeUser(admin, 'memberlist', ['leads.view'], [A]);
  const names = (await u.c.get(`/projects/${A}/members`)).body.map(m => m.username);
  assert.ok(names.includes('admin') && names.includes('memberlist'));
  assert.equal((await u.c.get(`/projects/${B}/members`)).status, 404);
});
