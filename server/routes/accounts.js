import { Router } from 'express';
import { getDB, logAudit } from '../db.js';
import { authMiddleware, requirePermission } from './auth.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const router = Router();

router.use(authMiddleware);

router.get('/me', (req, res) => {
  const db = getDB();
  const account = db.prepare('SELECT id, username, display_name, email, role, permissions FROM accounts WHERE id = ?').get(req.user.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  account.permissions = JSON.parse(account.permissions || '[]');
  res.json(account);
});

router.put('/me', (req, res) => {
  const { display_name, email, username } = req.body;
  const db = getDB();
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.user.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  if (username && username !== account.username) {
    const exists = db.prepare('SELECT id FROM accounts WHERE username = ? AND id != ?').get(username, req.user.id);
    if (exists) return res.status(400).json({ error: 'Username already taken' });
    db.prepare('UPDATE accounts SET username = ? WHERE id = ?').run(username, req.user.id);
  }

  if (display_name !== undefined) {
    db.prepare('UPDATE accounts SET display_name = ? WHERE id = ?').run(display_name, req.user.id);
  }

  if (email !== undefined) {
    db.prepare('UPDATE accounts SET email = ? WHERE id = ?').run(email, req.user.id);
  }

  logAudit('profile_updated', 'account', req.user.id, req.user.username, { by: req.user.id });
  res.json({ ok: true });
});

router.get('/', requirePermission('accounts.view'), (req, res) => {
  const db = getDB();
  let accounts;
  if (req.user.role === 'admin') {
    accounts = db.prepare('SELECT id, username, display_name, role, parent_id, permissions, created_at FROM accounts WHERE id != ? ORDER BY created_at DESC').all(req.user.id);
  } else {
    accounts = db.prepare('SELECT id, username, display_name, role, parent_id, permissions, created_at FROM accounts WHERE id = ?').all(req.user.id);
  }
  res.json(accounts.map(a => ({ ...a, permissions: JSON.parse(a.permissions || '[]') })));
});

router.post('/', requirePermission('accounts.manage'), (req, res) => {
  const { username, password, display_name, permissions } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const db = getDB();
  const exists = db.prepare('SELECT id FROM accounts WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: 'Username already taken' });

  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 10);
  const perms = JSON.stringify(permissions || []);

  db.prepare('INSERT INTO accounts (id, username, password_hash, display_name, role, parent_id, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, username, hash, display_name || username, 'user', req.user.id, perms, Date.now());

  logAudit('account_created', 'account', id, username, { admin: req.user.id });
  res.json({ id, username, display_name: display_name || username, role: 'user', permissions: JSON.parse(perms) });
});

router.put('/:id', requirePermission('accounts.manage'), (req, res) => {
  const { id } = req.params;
  const { display_name, permissions, password } = req.body;
  const db = getDB();

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  if (account.role === 'admin' && account.id !== req.user.id) {
    return res.status(403).json({ error: 'Cannot edit other admins' });
  }

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hash, id);
  }

  if (display_name !== undefined) {
    db.prepare('UPDATE accounts SET display_name = ? WHERE id = ?').run(display_name, id);
  }

  if (permissions !== undefined && req.user.role === 'admin') {
    db.prepare('UPDATE accounts SET permissions = ? WHERE id = ?').run(JSON.stringify(permissions), id);
  }

  logAudit('account_updated', 'account', id, account.username, { by: req.user.id });
  res.json({ ok: true });
});

router.delete('/:id', requirePermission('accounts.manage'), (req, res) => {
  const { id } = req.params;
  const db = getDB();

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (account.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin accounts' });
  if (account.id === req.user.id) return res.status(403).json({ error: 'Cannot delete yourself' });

  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  logAudit('account_deleted', 'account', id, account.username, { by: req.user.id });
  res.json({ ok: true });
});

router.post('/:id/change-password', (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const db = getDB();
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hash, id);
  res.json({ ok: true });
});

export default router;
