import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
// socket.io-client is a client dependency; reuse it rather than duplicating it in server/package.json
import { io } from '../../client/node_modules/socket.io-client/build/esm-debug/index.js';
import { startServer, client } from './helpers.js';

let srv, origin;
before(async () => { srv = await startServer(); origin = srv.base.replace(/\/api$/, ''); });
after(async () => { await srv?.stop(); });

function connect(extraHeaders = {}) {
  return new Promise((resolve) => {
    const s = io(origin, { transports: ['websocket'], extraHeaders, reconnection: false, timeout: 3000 });
    s.on('connect', () => resolve({ ok: true, s }));
    s.on('connect_error', (err) => { s.close(); resolve({ ok: false, err: err.message }); });
  });
}

test('socket connection without a session is refused', async () => {
  const r = await connect();
  assert.equal(r.ok, false);
  assert.match(r.err, /Not authenticated/);
});

test('logged-in socket gets status only for a real project', async () => {
  const c = client(srv.base);
  await c.login();
  const pid = (await c.get('/projects')).body[0].id;
  const cookie = await (async () => { const r = await fetch(srv.base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin' }) }); return r.headers.get('set-cookie').split(';')[0]; })();
  const { ok, s } = await connect({ Cookie: cookie });
  assert.equal(ok, true);
  const status = await new Promise((resolve) => {
    s.on('wa_status', resolve);
    s.emit('join_project', 'proj_does_not_exist');
    setTimeout(() => s.emit('join_project', pid), 200);
  });
  assert.equal(status.projectId, pid);
  assert.equal(status.status, 'disconnected');
  s.close();
});
