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
| `leads` (= **contacts**) | id, name, phone, phone_valid, email, facebook, instagram, tiktok, link, location, notes, status (`active`/`dead`), verified, stage_id, created_at, dead_at, **lifecycle** (`lead/qualified/customer/churned`), owner_id, company_id, source (`manual/csv/gmaps/…`), custom (JSON), updated_at | `location` holds the Google Maps link. Served by both `/api/leads` and `/api/contacts` |
| `stages` | id, name, color, sort_order | Default 5 seeded per project; ids `s1_<suffix>` (PK is global!) |
| `tags` | id, name, color, created_at, show_in_dashboard | |
| `campaigns` | id, name, created_at | WhatsApp lead groups |
| `message_templates` | id, name, content | |
| `broadcast_jobs` | id (`job_…`), campaign_id, message (string **or JSON array** = multi-message sequence), status (`pending/running/paused/stopped/completed`), total, sent, failed, timestamps | |
| `clients` | id, lead_id, name, …contact fields, status, stage (text), source, assigned_to, created_at, updated_at | **Legacy** — merged into `leads` by migration 006 (`client_contact_map(client_id, contact_id)`); still used by the Clients page until T-023 |
| `email_campaigns` | id, name, subject, body, status (`draft`…), counters | No sender implemented |
| `import_logs` | id, filename, rows_total, added, skipped, updated, details | |
| `audit_log` | action, entity_type, entity_id, entity_name, details(JSON), created_at | via `logAudit()` |
| `settings` | PK (project_id, key), value | e.g. `country_code` |
| `custom_fields` | id (`cf_…`), entity (`contact/company/deal`), key, label, type, options (JSON), required, sort_order | Values live in each entity's `custom` JSON; validated by `lib/customFields.js` (migration 009) |
| `pipelines` | id (`pipe_…`), name, sort_order | Every workspace has ≥1 (default "Sales", `lib/pipelines.js`) |
| `pipeline_stages` | id (`pst_…`), pipeline_id, name, color, sort_order, probability 0–100, rot_days, kind (`open/won/lost`) | Deal stages (separate from contact outreach `stages`) |
| `deals` | id (`deal_…`), pipeline_id, stage_id, title, value, currency, contact_id, company_id, owner_id, expected_close, status (`open/won/lost`), lost_reason, won_at, lost_at, notes, source, custom, created_at, updated_at, stage_changed_at | Migration 008 also converted legacy clients into deals (`source='client-migration'`) |
| `deal_stage_history` | deal_id, stage_id, account_id, at | Written by `moveDeal()` |
| `companies` | id (`comp_…`), name, domain (normalised), industry, size, phone, email, website, address, city, country, notes, owner_id, source, custom (JSON), created_at, updated_at | Contacts link via `leads.company_id` (migration 007) |

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
| `/tokens` | routes/apiTokens.js | GET / (own tokens, no secret), POST {name} → `{token}` shown once (`ldk_…`, sha256 stored, migration 012), DELETE /:id — any logged-in user, own tokens only |
| `/auth` | routes/auth.js | POST login, POST logout, GET me, GET permissions |
| `/projects` | routes/projects.js | GET / (member workspaces + counts), POST / (`projects.manage`; optional `templateFrom: <projectId>` copies that workspace's setup via `lib/workspaceTemplate.js`), GET /:id/members (any member), PUT /:id, DELETE /:id (`projects.manage`; cascade delete + removes WA auth dir) |
| `/accounts` | routes/accounts.js | GET/PUT me, GET / (self + created accounts; includes `projectIds`), POST /, PUT /:id (`permissions`, `projectIds`), DELETE /:id, POST /:id/change-password |
| `/leads` = `/contacts` | routes/leads.js | GET / (optional `page`/`limit` → `{items,total,page,limit}`, else array; filters: search, stage, verified, phoneStatus, campaignUse, hasSocial, status, tag, tagNot, tagMode, lifecycle (comma list), owner (me/none/id), source, sortBy, sortOrder), GET /duplicates (groups by phone digits / email, minus dismissed), POST /duplicates/dismiss {reason, value} (migration 011), POST /merge {primaryId, duplicateIds} (`lib/merge.js`), GET/PUT/DELETE /:id (body also takes lifecycle, owner_id, source, custom), POST /, POST /bulk (verify/dead/stage/tag/untag/delete/convert/lifecycle/owner/company with `value`); list filter `company=<id>|none`; items include `company {id,name}`, POST /import/preview (multer CSV), POST /import/confirm |
| `/companies` | routes/companies.js | GET / (page/limit, search, owner, industry; items have `contact_count`), GET /:id (+ `contacts`), POST, PUT /:id, DELETE /:id (unlinks contacts), POST /:id/contacts {contactIds}, DELETE /:id/contacts/:contactId |
| `/pipelines` | routes/pipelines.js | GET / (all pipelines + stages with deal_count/deal_value; any member), POST / {name, stages?}, PUT /:id, DELETE /:id (not last, no deals), POST /:id/stages, PUT /stages/:stageId, DELETE /stages/:stageId?moveTo=, POST /:id/stages/reorder — writes need `settings.edit` |
| `/deals` | routes/deals.js | GET / (page/limit; pipeline, stage, status, owner, contact, company, search), GET /board?pipeline= (columns with deals + count/total_value/weighted_value), GET /:id (+history), POST, PUT /:id (stage_id change = move), POST /:id/move {stage_id, lost_reason}, DELETE /:id — `deals.*` perms. Moving to a `won` stage makes the contact a `customer`. Items include contact, company, stage, `rotting` |
| `/custom-fields` | routes/customFields.js | GET / (all entities) or ?entity= (any member), POST {entity,label,type,options,required,key?}, PUT /:id (label/options/required/sort_order), DELETE /:id (also strips stored values) — writes need `settings.edit`. Entity lists accept `?cf.<key>=value` (`__empty` = no value) |
| `/search` | routes/search.js | GET ?q= (≥2 chars) → `{contacts, companies, deals}` (per-permission; phone digits match) |
| `/views` | routes/search.js | GET ?entity=, POST {entity, name, filters, shared}, DELETE /:id (creator only) — saved list filters (migration 010; not in backups) |
| `/stages` | routes/stages.js | CRUD (GET includes `lead_count`) + POST /reorder |
| `/tags` | routes/tags.js | CRUD (GET includes lead_count) |
| `/templates` | routes/templates.js | CRUD |
| `/campaigns` | routes/campaigns.js | GET, POST, DELETE /:id, POST /:id/leads, DELETE /:id/leads/:leadId, GET /:id/eligible |
| `/jobs` | routes/jobs.js | POST / {leads, message, scheduledAt?} (422 + `problems` when content rules fail; returns eligible/skipped/estimate), POST /estimate (same checks, dry run), GET /, GET /daily-status, GET /health, GET/PUT /limits, PUT /health/warmup {days_ago}, POST /health/dismiss-alert, GET /:id, PUT /:id/schedule {scheduledAt}, POST /:id/pause|resume|stop (stop also cancels a scheduled job), DELETE /:id |
| `/settings` | routes/settings.js | GET (object), PUT {key,value} |
| `/clients` | routes/clients.js | GET (optional `page`/`limit`; filters search, status, stage, assigned, tag), GET /:id, POST, PUT /:id, DELETE /:id, POST /:id/activity |
| `/email-campaigns` | routes/emailCampaigns.js | CRUD + lead membership |
| `/gmaps` | routes/gmaps.js | POST /scrape, GET /jobs, GET/DELETE /jobs/:id, GET /jobs/:id/download, POST /jobs/:id/import |
| inline | index.js | GET /stats, GET /import-logs, GET /audit-log, GET /export (JSON backup v2 via `lib/backup.js`: contacts, companies, stages, tags, campaigns, pipelines, deals + history, custom fields, templates), POST /import/backup (one transaction: wipes the workspace's CRM data, restores with fresh ids — works across workspaces; v1 backups still accepted), GET /export/csv |

Auth: `authMiddleware` accepts the `lead_session` cookie **or** `Authorization: Bearer ldk_…` (personal access token,
acts as its account). Contacts have a `message` column (draft outreach text; list filter `hasMessage=yes|no`).

### MCP endpoint (`server/mcp.js`, mounted at `/mcp`, outside `/api`)
POST `/mcp/<token>` or POST `/mcp` with Bearer header — stateless Streamable HTTP (new McpServer per request).
Every tool calls this server's own `/api` over loopback with the same token, so permissions/scoping/audit are the
normal ones; `/api/auth` and `/api/tokens` are blocked from `api_request`. New API features are reachable through
`api_request` automatically — add a dedicated tool (and update `API_MAP`) only for common flows.
Dedicated tools: workspaces/overview, contacts (list/get/create/update/bulk, `save_messages`), search, Maps scrape
(start/list/get/import), deals, `whatsapp_status`, broadcasts (`preview_broadcast` dry run, `send_broadcast` — needs
`user_confirmed: true`, `send_at` ISO time = scheduled message, `message: "{{message}}"` sends each contact's saved
message — `list_broadcasts`, `manage_broadcast` details/pause/resume/stop/reschedule/start_now), `whatsapp_limits`.

### Socket.IO (index.js ↔ WhatsAppPage.jsx)
Client → server: `join_project(projectId)`, `leave_project`, `wa_init {projectId}`, `wa_disconnect {projectId}`,
`wa_logout {projectId}`. Server → room `project:<id>`: `wa_status {projectId, status, qr, ready, restricted, restrictionReason}`.
Sockets authenticate with the `lead_session` cookie (`io.use`), every event re-checks `canAccessProject()`,
and `wa_init / wa_disconnect / wa_logout` require `whatsapp.control` (or admin). Vite dev proxy forwards `/socket.io`.

## 4. Subsystems

### WhatsApp (`server/whatsapp.js`)
- `clients: Map<projectId, state>`; auth files in `server/baileys_auth/<projectId>/`. Lazy: nothing connects
  until `wa_init` is emitted.
- Connects with the current WA Web version (`fetchLatestWaWebVersion`, cached 6 h) — the version bundled with
  Baileys goes stale and WhatsApp then answers 405 "Connection Failure". Reconnects back off 5 s → 5 min; with no
  linked session it gives up after 3 failures (`lastError` in `wa_status`), and those failures add no health points.
- The number is an identity (migration 015): `wa_number` is the workspace's active state, `wa_numbers` remembers every number linked here. On open, `linkNumber()` keeps state for the same number, restores warm-up/health/limits for a known one, and starts a new warm-up for a new one. Rate limits count per number (`wa_sends.sender_phone`); contact history stays per workspace. Moving a number to another workspace starts fresh.
- On boot only workspaces with `wa_number.auto_connect = 1` reconnect (connected last time, not disconnected by the user). A saved session alone doesn't, so old queued broadcasts don't start by surprise. A 401 is treated as logged out (session cleared, QR needed, disconnect health points), not as restricted.
- Status values: `disconnected → connecting → qr_ready → connected`, or `restricted` (401 / "restricted" /
  "logged out" errors, or a WhatsApp *system* message about a restriction — `isRestrictionNotice()`, never a contact's reply).
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

### Broadcast jobs (`server/routes/jobs.js`) + anti-ban engine (`lib/waRules.js`, `lib/waGuard.js`)
- Per-project runner (`projectStates`), one job at a time per workspace = per WhatsApp number. Statuses:
  `scheduled` (migration 014, starts when `scheduled_at` is due) → `pending` → `running` → `completed`; `paused`
  only by the user or an account restriction; `stopped`. While a limit blocks sending the job stays `running` with
  `wait_reason` + `resume_at` and a timer re-runs it (one timer per workspace, earliest wake-up wins, max 6 h).
- Before every send: `contactCheck()` (do_not_contact, 1 touch/contact/day, follow-ups on day 3/7, stop after 3
  ignored) → `gate()` (48 h hard stop, recipient-local sending window 9–21 + no Friday mornings, per-minute/hour
  caps, daily new-chat cap = warm-up schedule × health multiplier) → `isOnWhatsApp()` → send with typing
  30–50 ms/char → `recordSent()` into `wa_sends`. Gaussian 45–180 s between contacts.
- At creation (`planJob`): dedupe numbers, skip DNC/ignored, content rules for first messages (no links/prices,
  must end with ? / ؟), mean similarity of rendered first messages ≤ 0.7, ETA via `estimateDuration()`. The
  opt-out line is appended to first messages; `{{message}}` = the contact's saved message.
- Health score 0–100 in `wa_number` (+15 disconnect, +10 failed send, +30 restricted, +20 low reply/delivery rate;
  −5/h). ≥30 half volume, ≥60 20 %, ≥85 stop 48 h then half volume for 7 days. Events in `wa_events`.
  `initWaGuard()` (index.js) subscribes to `onWaEvent` from whatsapp.js (open/close/logout/ack/incoming): delivery
  acks fill `delivered_at`, incoming messages fill `replied_at`, opt-out replies ("لا", "stop", …) set
  `leads.do_not_contact`. Logout resets warm-up. Limits are per workspace in `settings.wa_limits` (always
  normalised/clamped on read). Table is `wa_sends` — old installs have an unused legacy `wa_messages`.
- Variables: `{{name}} {{phone}} {{email}} {{notes}} {{location}} {{facebook}} {{instagram}} {{tiktok}} {{message}}`,
  spintax `{a|b}` expanded by the runner (not by whatsapp.js) so the identical-text cap sees the final text.

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

- Custom fields: entity routes call `validateCustom(projectId, entity, input, existing, { create })` — partial
  merge, unknown keys dropped, types coerced, required enforced on create. Filters via `customFilterSql()`.
- Lists: use `lib/paginate.js` (`pageParams`, `runPaged`, `groupBy` for batched enrichment, `sendList`). Never
  run a query per row. New list endpoints should always paginate.

- IDs: `crypto.randomBytes(n).toString('hex')`, `crypto.randomUUID()`, or `prefix_` + base36 — follow the
  neighbouring code in the file you touch.
- Timestamps: `Date.now()` integers (ms).
- Booleans: INTEGER 0/1.
- Errors: `res.status(4xx).json({ error: 'Message' })`; client `request()` throws `Error(err.error)`.
- Server logs: `console.log('[area:projectId] …')` style tags (`[wa:…]`, `[gmaps]`).

### Campaigns and broadcasts
A **campaign** is a named contact list (`campaigns`, `campaign_leads`). A **broadcast** (`broadcast_jobs`) is one send, with a
`name` and an optional real `campaign_id` (migration 015 fixed it holding names). Pages: `/campaigns/:id` (contacts with their
latest outreach, broadcasts), `/broadcast/:id` (message, per-contact result and text). `GET /jobs`, `GET /jobs/:id`, `GET /campaigns`
and `GET /campaigns/:id` all carry delivered/replied counts from `wa_sends`; `GET /contacts/:id` returns `whatsapp: {sends, upcoming}`.
`GET /campaigns` is summaries only, without contacts.

### Maps scraper jobs
One job runs at a time (`enqueue` in `gmaps/jobs.js`). Results are saved after each keyword. A job where every keyword failed is
`failed`; partial failures are in `queryErrors`. `options.autoImport` calls `importJobResults` (`gmaps/import.js`) when it finishes.

### Web security
CORS allows same host, `CORS_ORIGINS`, and localhost outside production. Login: 10 failures per client per 15 min, then 429
(`lib/loginLimit.js`; forwarded IP is trusted only from loopback). Session cookie is `Secure` when the request came over https.

### Tags vs category
`leads.category` (migration 016) holds the business type; the scraper no longer creates a tag per Google category. Tags are for the user's own labels.
`POST /tags` with an existing name (any case) returns that tag. `GET/POST /tags/cleanup` preview and remove tags that only repeat `category`, plus unused ones; `POST /tags/:id/merge {into}`.
Campaigns start empty unless given `count` or `leadIds`. MCP: `get_guide` explains the concepts; tags change only through `manage_tags` with `user_confirmed`.

## WhatsApp inbox (T-040)

`wa_inbox_chats` (one per person: phone and/or LID, lead link, assignee, open/done, unread) and `wa_inbox_messages` (direction, source contact|inbox|phone|broadcast, sender account, ack status, media). Same WhatsApp id = same row, so a send seen on the socket first is upgraded by `recordOutbound`. Files live in `MEDIA_ROOT` (`WA_MEDIA_DIR`, default next to the auth dir), max 25 MB, served as sandboxed downloads. `GET/POST/PATCH /api/inbox/...`, see routes/inbox.js. MCP: list_chats, get_chat, send_chat_message.
