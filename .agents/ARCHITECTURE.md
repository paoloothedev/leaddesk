# LeadDesk — Architecture reference

Keep this file **true**. If you change something described here, update it in the same task.
Last full review: 2026-10-01 (multi-project refactor, uncommitted at the time).

---

## 1. Request lifecycle

```
Browser (React)                                   Express (server/index.js)
───────────────                                   ────────────────────────
api.js request()                                  cookie parser (inline, sets req.cookies)
  • credentials: 'include' (cookie lead_session)  /api/auth/*        → authRouter (no auth)
  • header X-Project-Id = currentProjectId  ───►  /api/projects/*    → authMiddleware → projectsRouter
                                                  /api/accounts/*    → authMiddleware → accountsRouter
                                                  /api/*             → authMiddleware (global)
                                                  /api/<scoped>/*    → resolveProject → router
                                                                        (req.user, req.project set)
```

- **authMiddleware** (`routes/auth.js`): reads cookie `lead_session` → `sessions` → `accounts`, sets
  `req.user = { id, username, display_name, email, role, parent_id, permissions[] }`. Sessions last 30 days.
- **requirePermission(...perms)**: admin role bypasses; otherwise user needs *any* of the listed perms.
  `hasPermission(user, perm)` for checks inside handlers (e.g. bulk actions). Permission list: `ALL_PERMISSIONS`
  in `routes/auth.js` (includes `projects.manage` for creating/deleting workspaces). **Every** project route is
  gated: reads of reference data (stages, tags, templates, settings) are open to any member; primary data and
  all writes need the matching permission.
- **Agency mode / membership** (migration 002): `project_members(project_id, account_id)`. Admins
  (`role = 'admin'`, the agency owner) see every workspace; everyone else only workspaces they are members of.
  Accounts are assigned to workspaces via `projectIds` on `POST/PUT /api/accounts`. Non-admins can only manage
  accounts they created (`parent_id`), grant permissions they hold, and assign workspaces they can access.
- **Ownership helpers** (`lib/scope.js`): `ownedIds(table, projectId, ids)` filters foreign ids out,
  `isOwned(table, projectId, id)` for single ids. Covered by `test/isolation.test.js`.
- **canAccessProject(user, projectId)** (`middleware/project.js`): the single place for workspace access rules,
  used by HTTP and sockets.
- **resolveProject** (`middleware/project.js`): project id from `X-Project-Id` header or `?project=` →
  `req.project` (full row) via `canAccessProject`. 400 if missing, 404 if unknown **or not a member**.

### Frontend project context

- `App.jsx`: `/` → `ProjectPicker`, `/p/:projectId/<view>` → `ProjectShell`.
  Views: `dashboard, leads, clients, scraper, campaigns, dead, settings, import` (`VIEWS` const).
- `ProjectShell` calls `setCurrentProjectId(projectId)` **synchronously during render** (so child effects
  already send the header). `ProjectPicker` sets it to `null`.
- Global data (stats, stages, tags, campaigns, settings) is loaded in `ProjectShell` and passed down as props;
  `refresh()` bumps `refreshId` to reload everything. No Redux/Context store.
- Toasts: `showToast(msg, warn)` passed down from `ProjectShell`.

## 2. Data model (SQLite, `server/leaddesk.db`, WAL mode, FKs ON)

Scoped by `project_id` (see `SCOPED_TABLES` in `db.js`):

| Table | Key columns | Notes |
|---|---|---|
| `projects` | id (`proj_<12hex>`), name, color, icon, created_at, created_by | Not scoped (it *is* the scope) |
| `leads` | id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status (`active`/`dead`), verified, stage_id, created_at, dead_at | `location` holds the Google Maps link |
| `stages` | id, name, color, sort_order | Default 5 seeded per project; ids `s1_<suffix>` (PK is global!) |
| `tags` | id, name, color, created_at, show_in_dashboard | |
| `campaigns` | id, name, created_at | WhatsApp lead groups |
| `message_templates` | id, name, content | |
| `broadcast_jobs` | id (`job_…`), campaign_id, message (string **or JSON array** = multi-message sequence), status (`pending/running/paused/stopped/completed`), total, sent, failed, timestamps | |
| `clients` | id, lead_id, name, …contact fields, status, stage (text), source, assigned_to, created_at, updated_at | |
| `email_campaigns` | id, name, subject, body, status (`draft`…), counters | No sender implemented |
| `import_logs` | id, filename, rows_total, added, skipped, updated, details | |
| `audit_log` | action, entity_type, entity_id, entity_name, details(JSON), created_at | via `logAudit()` |
| `settings` | PK (project_id, key), value | e.g. `country_code` |

Join / child tables (scoped through their parent — always verify the parent's project):
`campaign_leads(lead_id, campaign_id)`, `stage_history(lead_id, stage_id, at)`, `lead_tags(lead_id, tag_id)`,
`job_leads(job_id, lead_id, phone, status, error, sent_at)`, `client_tags`, `client_activities`,
`email_campaign_leads`.

Global: `accounts(id, username, password_hash, display_name, email, role, parent_id, permissions JSON)`,
`sessions(token, account_id, created_at, expires_at)`.

### Startup sequence (`getDB()` first call)
`runMigrations(db)` (`server/migrations/`; `001-baseline` = original `initSchema()` + `runMigration()`: adds `project_id` columns, rebuilds `settings` PK, creates **Default**
project if none, backfills NULL `project_id` into oldest project, creates indexes) → `seedAdminAccount()` →
`ensureStagesForAllProjects()`.

Then in `server.listen`: `migrateLegacyAuth(oldestProject)` (moves flat `baileys_auth/*` files into
`baileys_auth/<projectId>/`) and `resumeAllProjectJobs()` after 3 s.

## 3. API map

All below are under `/api`, need the session cookie, and (except auth/projects/accounts) need `X-Project-Id`.

| Mount | File | Endpoints |
|---|---|---|
| `/auth` | routes/auth.js | POST login, POST logout, GET me, GET permissions |
| `/projects` | routes/projects.js | GET / (member workspaces + counts), POST / (`projects.manage`), PUT /:id, DELETE /:id (`projects.manage`; cascade delete + removes WA auth dir) |
| `/accounts` | routes/accounts.js | GET/PUT me, GET / (self + created accounts; includes `projectIds`), POST /, PUT /:id (`permissions`, `projectIds`), DELETE /:id, POST /:id/change-password |
| `/leads` | routes/leads.js | GET / (optional `page`/`limit` → `{items,total,page,limit}`, else array; filters: search, stage, verified, phoneStatus, campaignUse, hasSocial, status, tag, tagNot, tagMode, sortBy, sortOrder), GET/PUT/DELETE /:id, POST /, POST /bulk (verify/dead/stage/tag/untag/delete/convert), POST /import/preview (multer CSV), POST /import/confirm |
| `/stages` | routes/stages.js | CRUD (GET includes `lead_count`) + POST /reorder |
| `/tags` | routes/tags.js | CRUD (GET includes lead_count) |
| `/templates` | routes/templates.js | CRUD |
| `/campaigns` | routes/campaigns.js | GET, POST, DELETE /:id, POST /:id/leads, DELETE /:id/leads/:leadId, GET /:id/eligible |
| `/jobs` | routes/jobs.js | POST / (create broadcast), GET /, GET /daily-status, GET /:id, POST /:id/pause|resume|stop, DELETE /:id |
| `/settings` | routes/settings.js | GET (object), PUT {key,value} |
| `/clients` | routes/clients.js | GET (optional `page`/`limit`; filters search, status, stage, assigned, tag), GET /:id, POST, PUT /:id, DELETE /:id, POST /:id/activity |
| `/email-campaigns` | routes/emailCampaigns.js | CRUD + lead membership |
| `/gmaps` | routes/gmaps.js | POST /scrape, GET /jobs, GET/DELETE /jobs/:id, GET /jobs/:id/download, POST /jobs/:id/import |
| inline | index.js | GET /stats, GET /import-logs, GET /audit-log, GET /export (JSON backup), POST /import/backup (one transaction: wipes project, restores with fresh ids — works across workspaces), GET /export/csv |

### Socket.IO (index.js ↔ WhatsAppPage.jsx)
Client → server: `join_project(projectId)`, `leave_project`, `wa_init {projectId}`, `wa_disconnect {projectId}`,
`wa_logout {projectId}`. Server → room `project:<id>`: `wa_status {projectId, status, qr, ready, restricted, restrictionReason}`.
Sockets authenticate with the `lead_session` cookie (`io.use`), every event re-checks `canAccessProject()`,
and `wa_init / wa_disconnect / wa_logout` require `whatsapp.control` (or admin). Vite dev proxy forwards `/socket.io`.

## 4. Subsystems

### WhatsApp (`server/whatsapp.js`)
- `clients: Map<projectId, state>`; auth files in `server/baileys_auth/<projectId>/`. Lazy: nothing connects
  until `wa_init` is emitted.
- Status values: `disconnected → connecting → qr_ready → connected`, or `restricted` (401 / "restricted" /
  "logged out" errors, or incoming message containing restricted/limit/suspended).
- Auto-reconnect after 5 s unless intentional disconnect or logged out.
- `sendHumanMessage()` simulates presence + typing (≥3 s, 25 ms/char) and random sleeps; `parseSpintax()`
  expands `{a|b|c}`. `checkPhones()` uses `onWhatsApp`.

### Background worker (`server/worker/index.js`, migration 004)
- Durable queue in the `queue` table, polled every 1 s inside the server process (concurrency 2). Disable with
  `WORKER=off`. `registerHandler(type, fn)` at module load; `enqueue(type, payload, { projectId, runAt,
  maxAttempts, dedupeKey })`; `cancelJobs({ type, projectId, dedupeKey })`.
- Failures retry with backoff 30 s × 2^(attempt-1) until `max_attempts`, then `failed` (kept, with
  `last_error`). Jobs left `running` at startup are re-queued → **handlers must be idempotent**.
- `done`/`cancelled` rows are pruned after 7 days. Use it for reminders, email sending, sequences, automations.
  (Broadcasts and Google Maps scrapes still use their own runners — migrate them later.)

### Broadcast jobs (`server/routes/jobs.js`)
- Per-project in-memory state (`projectStates`): `processingJobId`, `consecutiveFails`. The daily send count is
  persisted in `wa_daily_counts(project_id, day)` (migration 005, local-date key) via `sentToday()`/`countSent()`.
- Limits: `DAILY_LIMIT = 100`/project/day, `MAX_CONSECUTIVE_FAILS = 3` → pause 30 min.
- Pacing: 30–75 s between leads, 60–180 s break every 10 messages, 10–30 s between messages of a sequence.
  `delay_min/delay_max` from the request are stored but **not used**.
- Variables in messages: `{{name}} {{phone}} {{email}} {{notes}} {{location}} {{facebook}} {{instagram}} {{tiktok}}`.
- Waits (polls every 10 s) until the project's WA client is ready.

### Google Maps scraper (`server/gmaps/`)
- `jobs.js`: jobs live in memory + `jobs_data.json` (not in SQLite; path overridable with `GMAPS_JOBS_FILE`).
  Each job has `projectId` and is only visible to that project; legacy jobs without one are assigned to the
  oldest project at startup (`adoptLegacyJobs`). A job interrupted by a restart becomes `pending` and is
  re-run (sequentially, from scratch) by `resumePendingJobs()` at startup.
- `scraper.js`: Playwright Chromium, rejects cookie consent, extracts `APP_INITIALIZATION_STATE`, scrolls
  `depth` times. Options: depth, lang, geo, zoom.
- Import (`POST /gmaps/jobs/:id/import`): normalises phone with project `country_code`, dedupes by phone/name
  within project, splits website into facebook/instagram/tiktok/link, creates tags from categories, optional
  WhatsApp check.

### Build / deploy
- `npm run build` → `client/dist` (+ copy to `server/public`). Server serves `client/dist` only.
- ⚠ Docker: final image copies the built client to `server/public/` but `index.js` serves `../client/dist`,
  so the Docker image serves the API but **no UI** (see BOARD).
- ⚠ docker-compose mounts a named volume at `/app/server/leaddesk.db` (a file path) — Docker will create a
  directory there. Should mount a directory and make the DB path configurable.

## 5. Conventions cheat-sheet

- Lists: use `lib/paginate.js` (`pageParams`, `runPaged`, `groupBy` for batched enrichment, `sendList`). Never
  run a query per row. New list endpoints should always paginate.

- IDs: `crypto.randomBytes(n).toString('hex')`, `crypto.randomUUID()`, or `prefix_` + base36 — follow the
  neighbouring code in the file you touch.
- Timestamps: `Date.now()` integers (ms).
- Booleans: INTEGER 0/1.
- Errors: `res.status(4xx).json({ error: 'Message' })`; client `request()` throws `Error(err.error)`.
- Server logs: `console.log('[area:projectId] …')` style tags (`[wa:…]`, `[gmaps]`).
