import { Router } from 'express';
import { getDB, logAudit } from '../db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const router = Router();

const ALL_PERMISSIONS = [
  'dashboard.view',
  'leads.view', 'leads.edit', 'leads.delete', 'leads.verify', 'leads.import',
  'campaigns.view', 'campaigns.edit', 'campaigns.delete', 'campaigns.send',
  'templates.view', 'templates.edit',
  'stages.view', 'stages.edit',
  'tags.view', 'tags.edit',
  'settings.view', 'settings.edit',
  'whatsapp.view', 'whatsapp.control',
  'accounts.view', 'accounts.manage',
  'broadcast.view', 'broadcast.manage',
];

const SESSION_DAYS = 30;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Resolve a session token to a user object, or null if missing/expired.
export function getUserFromToken(token) {
  if (!token) return null;
  const db = getDB();
  const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now());
  if (!session) return null;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(session.account_id);
  if (!account) return null;
  return {
    id: account.id,
    username: account.username,
    display_name: account.display_name,
    email: account.email || '',
    role: account.role,
    parent_id: account.parent_id,
    permissions: JSON.parse(account.permissions || '[]'),
  };
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k] = v.join('=');
  }
  return cookies;
}

export function authMiddleware(req, res, next) {
  const token = req.cookies?.lead_session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const user = getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Session expired' });
  req.user = user;
  next();
}

export function requirePermission(...perms) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'admin') return next();
    const has = req.user.permissions;
    if (perms.some(p => has.includes(p))) return next();
    res.status(403).json({ error: 'Permission denied' });
  };
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const db = getDB();
  const account = db.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
  if (!account) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, account.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = generateToken();
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, account.id, Date.now(), expiresAt);

  logAudit('login', 'account', account.id, account.username);

  res.cookie('lead_session', token, { httpOnly: true, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.json({
    id: account.id,
    username: account.username,
    display_name: account.display_name,
    role: account.role,
    permissions: JSON.parse(account.permissions || '[]'),
  });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.lead_session;
  if (token) {
    const db = getDB();
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.clearCookie('lead_session');
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

router.get('/permissions', (req, res) => {
  res.json(ALL_PERMISSIONS);
});

export default router;
