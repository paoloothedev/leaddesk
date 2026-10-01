import { makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_ROOT = process.env.WA_AUTH_DIR || path.join(__dirname, 'baileys_auth');

// projectId -> client state
const clients = new Map();
let statusListeners = [];
let messageListeners = [];

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function getClientState(projectId) {
  if (!clients.has(projectId)) {
    const authDir = path.join(AUTH_ROOT, projectId);
    ensureDir(authDir);
    clients.set(projectId, {
      projectId,
      sock: null,
      sockReady: false,
      qrData: null,
      status: 'disconnected',
      restrictionReason: null,
      intentionalDisconnect: false,
      reconnectTimer: null,
      authDir,
    });
  }
  return clients.get(projectId);
}

function notifyStatus(projectId) {
  const s = clients.get(projectId);
  if (!s) return;
  for (const fn of statusListeners) fn(projectId, s.status, s.qrData);
}

export function onStatusChange(fn) {
  statusListeners.push(fn);
  return () => { statusListeners = statusListeners.filter(f => f !== fn); };
}

export function getStatus(projectId) {
  const s = clients.get(projectId);
  if (!s) return { status: 'disconnected', qr: null, ready: false, restricted: false, restrictionReason: null };
  return {
    status: s.status,
    qr: s.qrData,
    ready: s.sockReady,
    restricted: s.status === 'restricted',
    restrictionReason: s.restrictionReason,
  };
}

export function onMessage(fn) {
  messageListeners.push(fn);
  return () => { messageListeners = messageListeners.filter(f => f !== fn); };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseSpintax(text) {
  return text.replace(/\{([^{}]*)\}/g, (match, group) => {
    const options = group.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}

// Migrate legacy flat baileys_auth/ layout into baileys_auth/<projectId>/
export function migrateLegacyAuth(defaultProjectId) {
  if (!defaultProjectId) return;
  try {
    const legacyCreds = path.join(AUTH_ROOT, 'creds.json');
    if (!fs.existsSync(legacyCreds)) return;
    const dest = path.join(AUTH_ROOT, defaultProjectId);
    ensureDir(dest);
    const entries = fs.readdirSync(AUTH_ROOT);
    for (const name of entries) {
      const src = path.join(AUTH_ROOT, name);
      if (src === dest) continue;
      const stat = fs.statSync(src);
      if (stat.isFile()) {
        fs.renameSync(src, path.join(dest, name));
      }
    }
    console.log(`[wa] Migrated legacy auth into ${defaultProjectId}/`);
  } catch (err) {
    console.error('[wa] Legacy auth migration failed:', err.message);
  }
}

export async function initClient(projectId) {
  const s = getClientState(projectId);
  s.intentionalDisconnect = false;
  if (s.sock) {
    try { s.sock.end(null); } catch {}
    s.sock = null;
  }
  s.sockReady = false;
  s.qrData = null;
  s.status = 'connecting';
  notifyStatus(projectId);

  const { state, saveCreds } = await useMultiFileAuthState(s.authDir);

  s.sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, undefined),
    },
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: undefined,
    retryRequestDelayMs: 250,
    maxRetries: 4,
    logger: pino({ level: 'silent' }),
  });

  s.sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        s.qrData = await qrcode.toDataURL(qr);
      } catch {
        s.qrData = 'data:image/png;base64,';
      }
      s.status = 'qr_ready';
      s.restrictionReason = null;
      notifyStatus(projectId);
      console.log(`[wa:${projectId}] QR code received — scan with your phone`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMsg = lastDisconnect?.error?.message || '';
      console.log(`[wa:${projectId}] Connection closed. Status: ${statusCode}. Error: ${errorMsg}`);

      s.sockReady = false;

      if (statusCode === 401 || errorMsg.includes('restricted') || errorMsg.includes('logged out')) {
        s.status = 'restricted';
        s.restrictionReason = 'Your account on linked devices is restricted. This usually lasts 24-72 hours for new or flagged Business accounts. Wait for the restriction to lift, or use a regular WhatsApp account.';
        notifyStatus(projectId);
        console.log(`[wa:${projectId}] Account restricted — pausing all activity`);
        return;
      }

      s.status = 'disconnected';
      s.restrictionReason = null;
      notifyStatus(projectId);

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect && !s.intentionalDisconnect) {
        if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
        s.reconnectTimer = setTimeout(() => initClient(projectId), 5000);
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log(`[wa:${projectId}] Logged out — clearing auth state`);
        try { fs.rmSync(s.authDir, { recursive: true, force: true }); } catch {}
        ensureDir(s.authDir);
        s.status = 'disconnected';
        notifyStatus(projectId);
      }
    }

    if (connection === 'open') {
      s.sockReady = true;
      s.qrData = null;
      s.restrictionReason = null;
      s.status = 'connected';
      notifyStatus(projectId);
      console.log(`[wa:${projectId}] Connected to WhatsApp`);
    }
  });

  s.sock.ev.on('creds.update', saveCreds);

  s.sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const from = msg.key.remoteJid;

      const lowerBody = body.toLowerCase();
      if (lowerBody.includes('restricted') || lowerBody.includes('limit') || lowerBody.includes('suspended')) {
        console.log(`[wa:${projectId}] RESTRICTION detected in message: ${body}`);
        s.status = 'restricted';
        s.restrictionReason = body;
        notifyStatus(projectId);
      }

      for (const fn of messageListeners) fn({ projectId, from, body, msg });
    }
  });

  s.sock.ev.on('messages.update', (messages) => {
    for (const msg of messages) {
      if (msg.update.status) {
        const ack = msg.update.status;
        const id = msg.key?.id || 'unknown';
        console.log(`[wa:${projectId}] message_ack: ${msg.key?.remoteJid || 'unknown'} msgId: ${id} ack: ${ack}`);
      }
    }
  });

  console.log(`[wa:${projectId}] Initializing Baileys client...`);
}

export async function sendMessage(projectId, phone, text) {
  const s = getClientState(projectId);
  if (!s.sock || !s.sockReady) throw new Error('WhatsApp not connected');
  if (s.status === 'restricted') throw new Error('Account restricted: ' + (s.restrictionReason || 'Linked device restricted by WhatsApp'));
  const cleaned = phone.replace(/\D/g, '');
  const jid = cleaned + '@s.whatsapp.net';

  try { await s.sock.sendPresenceUpdate('available'); } catch {}
  await sleep(1000 + Math.random() * 2000);

  try { await s.sock.sendPresenceUpdate('composing', jid); } catch {}
  const typingDuration = Math.max(3000, text.length * 25);
  await sleep(typingDuration);

  const varied = parseSpintax(text);
  await s.sock.sendMessage(jid, { text: varied });

  try { await s.sock.sendPresenceUpdate('paused', jid); } catch {}
  await sleep(2000 + Math.random() * 2000);

  try { await s.sock.sendPresenceUpdate('unavailable'); } catch {}
}

export async function sendHumanMessage(projectId, phone, text) {
  const s = getClientState(projectId);
  if (!s.sock || !s.sockReady) throw new Error('WhatsApp not connected');
  if (s.status === 'restricted') throw new Error('Account restricted: ' + (s.restrictionReason || 'Linked device restricted by WhatsApp'));
  const cleaned = phone.replace(/\D/g, '');
  const jid = cleaned + '@s.whatsapp.net';

  await sleep(2000 + Math.random() * 3000);

  try { await s.sock.sendPresenceUpdate('available'); } catch {}
  await sleep(1000 + Math.random() * 2000);

  try { await s.sock.sendPresenceUpdate('composing', jid); } catch {}
  const typingDuration = Math.max(3000, text.length * 25);
  await sleep(typingDuration);

  const varied = parseSpintax(text);
  const sentMsg = await s.sock.sendMessage(jid, { text: varied });
  const msgId = sentMsg?.key?.id || 'unknown';
  console.log(`[wa:${projectId}] Sent to ${jid}, msgId: ${msgId}`);

  try { await s.sock.sendPresenceUpdate('paused', jid); } catch {}
  await sleep(2000 + Math.random() * 3000);

  try { await s.sock.sendPresenceUpdate('unavailable'); } catch {}
  await sleep(1000 + Math.random() * 1500);

  return sentMsg;
}

export async function checkPhones(projectId, phones) {
  const s = getClientState(projectId);
  if (!s.sock || !s.sockReady) throw new Error('WhatsApp not connected');
  const results = [];
  for (const phone of phones) {
    const cleaned = phone.replace(/\D/g, '');
    if (!cleaned || cleaned.length < 7) {
      results.push({ phone: cleaned, exists: false, error: 'Invalid number' });
      continue;
    }
    try {
      const [exists] = await s.sock.onWhatsApp(cleaned + '@s.whatsapp.net');
      results.push({ phone: cleaned, exists: exists || false, error: null });
    } catch (err) {
      results.push({ phone: cleaned, exists: false, error: err.message });
    }
  }
  return results;
}

export async function destroyClient(projectId) {
  const s = clients.get(projectId);
  if (!s) return;
  s.intentionalDisconnect = true;
  if (s.reconnectTimer) { clearTimeout(s.reconnectTimer); s.reconnectTimer = null; }
  if (s.sock) {
    try { s.sock.end(null); } catch {}
    s.sock = null;
    s.sockReady = false;
    s.status = 'disconnected';
    notifyStatus(projectId);
  }
}

export async function logoutClient(projectId) {
  const s = getClientState(projectId);
  s.intentionalDisconnect = true;
  if (s.reconnectTimer) { clearTimeout(s.reconnectTimer); s.reconnectTimer = null; }
  if (s.sock) {
    try { s.sock.logout(); } catch {}
    try { s.sock.end(null); } catch {}
    s.sock = null;
    s.sockReady = false;
  }
  s.qrData = null;
  s.status = 'disconnected';
  notifyStatus(projectId);
  try { fs.rmSync(s.authDir, { recursive: true, force: true }); } catch {}
  ensureDir(s.authDir);
}

export async function destroyAllClients() {
  for (const projectId of Array.from(clients.keys())) {
    try { await destroyClient(projectId); } catch {}
  }
}

// Called when a project is deleted: close its socket and remove its session files.
export async function removeProjectAuth(projectId) {
  await destroyClient(projectId);
  clients.delete(projectId);
  try { fs.rmSync(path.join(AUTH_ROOT, projectId), { recursive: true, force: true }); } catch {}
}

export function formatPhoneForWA(phone) {
  return phone.replace(/\D/g, '');
}
