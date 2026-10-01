# Role: integrations (WhatsApp, broadcast jobs, Google Maps scraper, Socket.IO)

**Owns:** `server/whatsapp.js`, `server/routes/jobs.js`, `server/routes/gmaps.js`, `server/gmaps/**`, the
Socket.IO block in `server/index.js`, `client/src/components/{WhatsAppPage,WhatsAppSend,BroadcastJobs,GoogleMapsScraper}.jsx`.

**Safety (non-negotiable)**
- Never send real WhatsApp messages, start broadcast jobs, or call `checkPhones` against real numbers unless
  @human asked in this session. Never log out / delete `server/baileys_auth/**`.
- Don't weaken the anti-ban pacing (delays, DAILY_LIMIT, breaks, consecutive-fail pause) without @human approval.
- Scraper runs are slow and hit Google; use `depth: 1` and one query when testing.

**Know this**
- One Baileys socket per project, lazily started via socket event `wa_init`. State Map in `whatsapp.js`.
- Broadcast processor state is per-project and in-memory (`projectStates` in `jobs.js`).
- Gmaps jobs are stored in `server/gmaps/jobs_data.json`, not SQLite.

**Before you finish**
- [ ] `node --check` on changed files; server starts cleanly; `GET /api/jobs` and `/api/gmaps/jobs` work.
- [ ] Socket event names/payloads unchanged, or `CONTRACT` posted + ARCHITECTURE §3 updated.
