import { Router } from 'express';
import { sendMessage, getWAChats, getWAChatMessages, getMedia, getStatus } from '../whatsapp.js';

function cleanPhone(p) {
  return (p || '').replace(/\D/g, '');
}

function matchLeadByPhone(db, phone) {
  const clean = cleanPhone(phone);
  if (!clean || clean.length < 3 || clean.length > 20) return null;
  let lead = db.prepare("SELECT id, name FROM leads WHERE REPLACE(REPLACE(phone, '+', ''), ' ', '') = ?").get(clean);
  if (lead) return lead;
  const suffix = clean.slice(-10);
  if (suffix.length >= 7) {
    lead = db.prepare("SELECT id, name FROM leads WHERE REPLACE(REPLACE(phone, '+', ''), ' ', '') LIKE ?").get(`%${suffix}`);
    if (lead) return lead;
  }
  return null;
}

function enrichLead(db, phone, name) {
  const lead = matchLeadByPhone(db, phone);
  return { leadId: lead?.id || null, leadName: lead?.name || name || phone };
}

export default function chatRoutes(getDB) {
  const router = Router();

  // List conversations — WA only
  router.get('/', async (req, res) => {
    const db = getDB();
    if (!getStatus().ready) {
      return res.json({ connected: false, conversations: [] });
    }
    try {
      const waChats = await getWAChats();
      const enriched = waChats.map(c => enrichLead(db, c.phone, c.name));
      const conversations = waChats.map((c, i) => ({
        jid: c.jid,
        phone: c.phone,
        archived: c.archived,
        last_at: c.lastMessage?.timestamp || null,
        last_message: c.lastMessage?.content || null,
        last_direction: c.lastMessage?.fromMe ? 'out' : 'in',
        last_type: c.lastMessage?.type || null,
        unread: c.unread,
        ...enriched[i],
      }));
      res.json({ connected: true, conversations });
    } catch (err) {
      console.error('getWAChats error:', err?.message || err);
      res.json({ connected: false, conversations: [] });
    }
  });

  // Get messages for a JID (URL-encoded)
  router.get('/:jid', async (req, res) => {
    const db = getDB();
    const jid = decodeURIComponent(req.params.jid);
    const lead = matchLeadByPhone(db, jid);

    if (getStatus().ready) {
      try {
        const waMsgs = await getWAChatMessages(jid);
        const messages = waMsgs.map(m => ({
          id: m.waMsgId,
          jid,
          direction: m.fromMe ? 'out' : 'in',
          content: m.content,
          type: m.type || 'chat',
          status: 'received',
          created_at: m.timestamp,
          read_at: m.fromMe ? null : Date.now(),
          lead_id: lead?.id || null,
          hasMedia: m.hasMedia,
          mediaType: m.mediaType,
        }));
        messages.sort((a, b) => a.created_at - b.created_at);
        return res.json({ connected: true, messages, lead: lead || null });
      } catch (err) {
        console.error('getWAChatMessages error:', err?.message || err);
        return res.json({ connected: false, messages: [], lead: null });
      }
    }

    res.json({ connected: false, messages: [], lead: null });
  });

  // Get media for a specific message
  router.get('/:jid/media/:msgId', async (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const msgId = req.params.msgId;
    try {
      const media = await getMedia(jid, msgId);
      const buf = Buffer.from(media.data, 'base64');
      res.set('Content-Type', media.mimetype);
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (err) {
      res.status(404).json({ error: 'Media not found' });
    }
  });

  // Send a message
  router.post('/:jid/send', async (req, res) => {
    const db = getDB();
    const jid = decodeURIComponent(req.params.jid);
    const { content, leadId } = req.body;
    if (!content) return res.status(400).json({ error: 'Message content required' });
    try {
      const phone = jid.split('@')[0].replace(/\D/g, '');
      await sendMessage(jid, content);
      db.prepare('INSERT INTO chat_messages (lead_id, phone, direction, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(leadId || null, phone, 'out', content, 'sent', Date.now());
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mark messages as read
  router.post('/:jid/read', (req, res) => {
    const db = getDB();
    const jid = decodeURIComponent(req.params.jid);
    const phone = jid.split('@')[0].replace(/\D/g, '');
    db.prepare('UPDATE chat_messages SET read_at = ? WHERE phone LIKE ? AND direction = ? AND read_at IS NULL').run(Date.now(), `%${phone}%`, 'in');
    res.json({ ok: true });
  });

  return router;
}
