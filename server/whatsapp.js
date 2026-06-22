import { makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, 'baileys_auth');

let sock = null;
let sockReady = false;
let qrData = null;
let currentStatus = 'disconnected';
let restrictionReason = null;
let statusListeners = [];
let messageListeners = [];
let intentionalDisconnect = false;
let reconnectTimer = null;

function notifyStatus() {
  for (const fn of statusListeners) fn(currentStatus, qrData);
}

export function onStatusChange(fn) {
  statusListeners.push(fn);
  return () => { statusListeners = statusListeners.filter(f => f !== fn); };
}

export function getStatus() {
  return { status: currentStatus, qr: qrData, ready: sockReady, restricted: currentStatus === 'restricted', restrictionReason };
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

export async function initClient() {
  intentionalDisconnect = false;
  if (sock) {
    try { sock.end(null); } catch {}
    sock = null;
  }
  sockReady = false;
  qrData = null;
  currentStatus = 'connecting';
  notifyStatus();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, undefined),
    },
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    printQRInTerminal: true,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: undefined,
    retryRequestDelayMs: 250,
    maxRetries: 4,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        qrData = await qrcode.toDataURL(qr);
      } catch {
        qrData = 'data:image/png;base64,';
      }
      currentStatus = 'qr_ready';
      restrictionReason = null;
      notifyStatus();
      console.log('[wa] QR code received — scan with your phone');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMsg = lastDisconnect?.error?.message || '';
      console.log(`[wa] Connection closed. Status: ${statusCode}. Error: ${errorMsg}`);

      sockReady = false;

      if (statusCode === 401 || errorMsg.includes('restricted') || errorMsg.includes('logged out')) {
        currentStatus = 'restricted';
        restrictionReason = 'Your account on linked devices is restricted. This usually lasts 24-72 hours for new or flagged Business accounts. Wait for the restriction to lift, or use a regular WhatsApp account.';
        notifyStatus();
        console.log('[wa] Account restricted — pausing all activity');
        return;
      }

      currentStatus = 'disconnected';
      restrictionReason = null;
      notifyStatus();

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect && !intentionalDisconnect) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => initClient(), 5000);
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log('[wa] Logged out — clearing auth state');
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
        currentStatus = 'disconnected';
        notifyStatus();
      }
    }

    if (connection === 'open') {
      sockReady = true;
      qrData = null;
      restrictionReason = null;
      currentStatus = 'connected';
      notifyStatus();
      console.log('[wa] Connected to WhatsApp');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const from = msg.key.remoteJid;

      const lowerBody = body.toLowerCase();
      if (lowerBody.includes('restricted') || lowerBody.includes('limit') || lowerBody.includes('suspended')) {
        console.log(`[wa] RESTRICTION detected in message: ${body}`);
        currentStatus = 'restricted';
        restrictionReason = body;
        notifyStatus();
      }

      for (const fn of messageListeners) fn({ from, body, msg });
    }
  });

  sock.ev.on('messages.update', (messages) => {
    for (const msg of messages) {
      if (msg.update.status) {
        const ack = msg.update.status;
        const id = msg.key?.id || 'unknown';
        console.log(`[wa] message_ack: ${msg.key?.remoteJid || 'unknown'} msgId: ${id} ack: ${ack}`);
      }
    }
  });

  console.log('[wa] Initializing Baileys client...');
}

export async function sendMessage(phone, text) {
  if (!sock || !sockReady) throw new Error('WhatsApp not connected');
  if (currentStatus === 'restricted') throw new Error('Account restricted: ' + (restrictionReason || 'Linked device restricted by WhatsApp'));
  const cleaned = phone.replace(/\D/g, '');
  const jid = cleaned + '@s.whatsapp.net';

  try { await sock.sendPresenceUpdate('available'); } catch {}
  await sleep(1000 + Math.random() * 2000);

  try { await sock.sendPresenceUpdate('composing', jid); } catch {}
  const typingDuration = Math.max(3000, text.length * 25);
  await sleep(typingDuration);

  const varied = parseSpintax(text);
  await sock.sendMessage(jid, { text: varied });

  try { await sock.sendPresenceUpdate('paused', jid); } catch {}
  await sleep(2000 + Math.random() * 2000);

  try { await sock.sendPresenceUpdate('unavailable'); } catch {}
}

export async function sendHumanMessage(phone, text) {
  if (!sock || !sockReady) throw new Error('WhatsApp not connected');
  if (currentStatus === 'restricted') throw new Error('Account restricted: ' + (restrictionReason || 'Linked device restricted by WhatsApp'));
  const cleaned = phone.replace(/\D/g, '');
  const jid = cleaned + '@s.whatsapp.net';

  await sleep(2000 + Math.random() * 3000);

  try { await sock.sendPresenceUpdate('available'); } catch {}
  await sleep(1000 + Math.random() * 2000);

  try { await sock.sendPresenceUpdate('composing', jid); } catch {}
  const typingDuration = Math.max(3000, text.length * 25);
  await sleep(typingDuration);

  const varied = parseSpintax(text);
  const sentMsg = await sock.sendMessage(jid, { text: varied });
  const msgId = sentMsg?.key?.id || 'unknown';
  console.log(`[wa] Sent to ${jid}, msgId: ${msgId}`);

  try { await sock.sendPresenceUpdate('paused', jid); } catch {}
  await sleep(2000 + Math.random() * 3000);

  try { await sock.sendPresenceUpdate('unavailable'); } catch {}
  await sleep(1000 + Math.random() * 1500);

  return sentMsg;
}

export async function checkPhones(phones) {
  if (!sock || !sockReady) throw new Error('WhatsApp not connected');
  const results = [];
  for (const phone of phones) {
    const cleaned = phone.replace(/\D/g, '');
    if (!cleaned || cleaned.length < 7) {
      results.push({ phone: cleaned, exists: false, error: 'Invalid number' });
      continue;
    }
    try {
      const [exists] = await sock.onWhatsApp(cleaned + '@s.whatsapp.net');
      results.push({ phone: cleaned, exists: exists || false, error: null });
    } catch (err) {
      results.push({ phone: cleaned, exists: false, error: err.message });
    }
  }
  return results;
}

export async function destroyClient() {
  intentionalDisconnect = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) {
    try { sock.end(null); } catch {}
    sock = null;
    sockReady = false;
    currentStatus = 'disconnected';
    notifyStatus();
  }
}

export async function logoutClient() {
  intentionalDisconnect = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) {
    try { sock.logout(); } catch {}
    try { sock.end(null); } catch {}
    sock = null;
    sockReady = false;
  }
  qrData = null;
  currentStatus = 'disconnected';
  notifyStatus();
  try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
}

export function formatPhoneForWA(phone) {
  return phone.replace(/\D/g, '');
}
