import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, client } from './helpers.js';

const Database = createRequire(import.meta.url)('better-sqlite3');
let srv, P, pid;
before(async () => {
  srv = await startServer();
  const root = client(srv.base);
  await root.login();
  pid = (await root.post('/projects', { name: 'WA' })).body.id;
  P = root.as(pid);
});
after(async () => { await srv?.stop(); });

test('daily WhatsApp count comes from the database (survives restarts)', async () => {
  assert.deepEqual((await P.get('/jobs/daily-status')).body, { sent: 0, limit: 100, remaining: 100 });
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const db = new Database(srv.dbPath);
  db.prepare('INSERT INTO wa_daily_counts (project_id, day, sent) VALUES (?, ?, ?)').run(pid, day, 97);
  db.close();
  assert.deepEqual((await P.get('/jobs/daily-status')).body, { sent: 97, limit: 100, remaining: 3 });
});
