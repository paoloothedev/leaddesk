import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');

let client = null;
let clientReady = false;
let qrData = null;
let currentStatus = 'disconnected'; // disconnected | qr_ready | connecting | connected | error
let statusListeners = [];
let messageListeners = [];

function notifyStatus() {
  for (const fn of statusListeners) fn(currentStatus, qrData);
}

export function onStatusChange(fn) {
  statusListeners.push(fn);
  return () => { statusListeners = statusListeners.filter(f => f !== fn); };
}

export function getStatus() {
  return { status: currentStatus, qr: qrData, ready: clientReady };
}

export function onMessage(fn) {
  messageListeners.push(fn);
  return () => { messageListeners = messageListeners.filter(f => f !== fn); };
}

function cleanChromeLocks() {
  try {
    const files = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    const sessionDirs = fs.readdirSync(AUTH_DIR).filter(d => d.startsWith('session'));
    for (const dir of sessionDirs) {
      for (const f of files) {
        const p = path.join(AUTH_DIR, dir, f);
        try { fs.unlinkSync(p); } catch {}
      }
    }
  } catch {}
}

export async function initClient() {
  if (client) {
    try { await client.destroy(); } catch {}
    client = null;
  }
  clientReady = false;
  qrData = null;
  currentStatus = 'connecting';
  notifyStatus();

  cleanChromeLocks();

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    puppeteer: {
      headless: true,
      protocolTimeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  client.on('qr', async (qr) => {
    try {
      qrData = await qrcode.toDataURL(qr);
    } catch {
      qrData = 'data:image/png;base64,';
    }
    currentStatus = 'qr_ready';
    notifyStatus();
  });

  client.on('authenticated', () => {
    currentStatus = 'connecting';
    notifyStatus();
  });

  client.on('ready', () => {
    clientReady = true;
    qrData = null;
    currentStatus = 'connected';
    notifyStatus();
  });

  client.on('disconnected', (reason) => {
    clientReady = false;
    currentStatus = 'disconnected';
    notifyStatus();
    // Auto-reconnect
    setTimeout(() => initClient(), 5000);
  });

  client.on('auth_failure', () => {
    clientReady = false;
    currentStatus = 'error';
    notifyStatus();
    // Clean up stale session and retry
    try {
      const dirs = fs.readdirSync(AUTH_DIR).filter(d => d.startsWith('session'));
      for (const d of dirs) fs.rmSync(path.join(AUTH_DIR, d), { recursive: true, force: true });
    } catch {}
  });

  client.on('error', (err) => {
    console.error('WhatsApp client error:', err?.message || err);
    clientReady = false;
    currentStatus = 'error';
    notifyStatus();
    setTimeout(() => initClient(), 5000);
  });

  client.on('message', (msg) => {
    for (const fn of messageListeners) fn(msg);
  });

  try {
    await client.initialize();
  } catch (err) {
    console.error('WhatsApp init failed:', err?.message || err);
    currentStatus = 'error';
    notifyStatus();
    setTimeout(() => initClient(), 10000);
  }
}

export async function sendMessage(phone, text) {
  if (!client || !clientReady) throw new Error('WhatsApp not connected');
  const jid = phone.includes('@') ? phone : phone.replace(/\D/g, '') + '@c.us';
  await client.sendMessage(jid, text);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function addMessageVariation(text) {
  const zwsp = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
  let result = '';
  for (const char of text) {
    result += char;
    if (Math.random() < 0.12) {
      result += zwsp[Math.floor(Math.random() * zwsp.length)];
    }
  }
  return result;
}

export async function sendHumanMessage(phone, text) {
  if (!client || !clientReady) throw new Error('WhatsApp not connected');
  const jid = phone.replace(/\D/g, '') + '@c.us';

  try { await client.sendPresenceAvailable(); } catch {}
  await sleep(1000 + Math.random() * 2000);

  try { await client.sendSeen(jid); } catch {}
  await sleep(2000 + Math.random() * 3000);

  await sleep(2000 + Math.random() * 4000);

  const varied = addMessageVariation(text);
  await client.sendMessage(jid, varied);

  await sleep(1500 + Math.random() * 2500);
  try { await client.sendPresenceUnavailable(); } catch {}

  return true;
}

export async function checkPhones(phones) {
  if (!client || !clientReady) throw new Error('WhatsApp not connected');
  const results = [];
  for (const phone of phones) {
    const cleaned = phone.replace(/\D/g, '');
    if (!cleaned || cleaned.length < 7) {
      results.push({ phone: cleaned, exists: false, error: 'Invalid number' });
      continue;
    }
    try {
      const jid = cleaned + '@c.us';
      const exists = await client.isRegisteredUser(jid);
      results.push({ phone: cleaned, exists, error: null });
    } catch (err) {
      results.push({ phone: cleaned, exists: false, error: err.message });
    }
  }
  return results;
}

export async function destroyClient() {
  if (client) {
    try { await client.destroy(); } catch {}
    client = null;
    clientReady = false;
    currentStatus = 'disconnected';
    notifyStatus();
  }
}

export async function logoutClient() {
  if (client) {
    try { await client.destroy(); } catch {}
    client = null;
    clientReady = false;
  }
  qrData = null;
  currentStatus = 'disconnected';
  notifyStatus();
  try {
    const sessionDir = path.join(AUTH_DIR, 'session');
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch {}
  cleanChromeLocks();
}

export function formatPhoneForWA(phone) {
  return phone.replace(/\D/g, '');
}


