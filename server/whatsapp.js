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

export function formatPhoneForWA(phone) {
  return phone.replace(/\D/g, '');
}

const typeLabels = {
  image: '[Image]',
  video: '[Video]',
  audio: '[Audio]',
  ptt: '[Voice]',
  sticker: '[Sticker]',
  document: '[Document]',
  location: '[Location]',
  vcard: '[Contact]',
  revoked: '[Message removed]',
  call_log: '[Call]',
  gif: '[GIF]',
  interactive: '',
  notification_template: '',
};

function messagePreview(msg) {
  if (!msg) return '';
  const body = msg.body || '';
  const caption = msg.caption || '';
  const type = msg.type || 'chat';

  if (type === 'chat') return body;

  const label = typeLabels[type] || `[${type}]`;

  if (type === 'image' || type === 'video' || type === 'document' || type === 'gif') {
    if (caption) return `${label} ${caption}`;
  }

  // If body looks like raw binary/base64, don't show it
  if (body.length > 50 && /^[A-Za-z0-9+/=]+$/.test(body.slice(0, 100))) {
    return label;
  }

  return body || label;
}

function extractPhone(c) {
  const user = c.id.user;
  if (user && user !== '0') return user;
  const contactNumber = c.contact?.number;
  if (contactNumber) {
    const cleaned = contactNumber.replace(/[^0-9]/g, '');
    if (cleaned) return cleaned;
  }
  return user || '0';
}

export async function getWAChats() {
  if (!client || !clientReady) throw new Error('WhatsApp not connected');
  const chats = await client.getChats();
  const results = [];
  for (const c of chats) {
    if (c.id.server === 'c.us' && c.id.user === '0') continue;
    const phone = extractPhone(c);
    const preview = messagePreview(c.lastMessage);
    results.push({
      jid: c.id._serialized,
      phone,
      name: c.name || c.contact?.name || c.id.user,
      archived: !!c.archived,
      lastMessage: c.lastMessage ? {
        content: preview,
        fromMe: c.lastMessage.fromMe,
        timestamp: c.lastMessage.timestamp * 1000,
        type: c.lastMessage.type || 'chat',
      } : null,
      unread: c.unreadCount || 0,
    });
  }
  results.sort((a, b) => {
    const aTime = a.lastMessage?.timestamp || 0;
    const bTime = b.lastMessage?.timestamp || 0;
    return bTime - aTime;
  });
  return results;
}

export async function getWAChatMessages(jid) {
  if (!client || !clientReady) throw new Error('WhatsApp not connected');
  const chat = await client.getChatById(jid);
  const msgs = await chat.fetchMessages({ limit: 100 });
  return msgs.map(m => ({
    waMsgId: m.id.id,
    content: messagePreview(m),
    type: m.type || 'chat',
    fromMe: m.fromMe,
    timestamp: m.timestamp * 1000,
    hasMedia: !!m.hasMedia,
    mediaType: m.hasMedia ? m.type : null,
  }));
}

export async function getMedia(jid, msgId) {
  if (!client || !clientReady) throw new Error('WhatsApp not connected');
  const chat = await client.getChatById(jid);
  const msgs = await chat.fetchMessages({ limit: 200 });
  const msg = msgs.find(m => m.id.id === msgId);
  if (!msg || !msg.hasMedia) throw new Error('Media not found');
  const media = await msg.downloadMedia();
  return media;
}
