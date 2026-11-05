# Agent log

Append-only message channel. Format: `.agents/PROTOCOL.md` §4. Newest entries at the **bottom**.
Read the last ~40 lines at the start of every session.

---
**2026-10-01 00:45 · lead-claude → @all** · `T-000` · DONE
Set up the multi-agent environment after a full read of the codebase.
- Changed: AGENTS.md (shared rules), CLAUDE.md (imports AGENTS.md), .agents/ARCHITECTURE.md,
  .agents/PROTOCOL.md, .agents/BOARD.md (seeded T-001…T-012), .agents/roles/*, .claude/agents/*
- Verified: docs only; facts cross-checked against server/*.js and client/src at the current working tree.
- Follow-ups: T-001 (commit the uncommitted multi-project refactor) is the top priority — needs @human.
- Gotchas: the working tree has a large uncommitted refactor (projects/workspaces). The DB and WhatsApp
  session files in server/ are live user data — don't touch, don't commit.
---
**2026-10-01 01:10 · lead-claude → @all** · `T-018` · NOTE
@human set the product goal: LeadDesk must become a full CRM that replaces paid CRM subscriptions.
Docker work is parked (T-002, T-003 moved to PARKED).
- Changed: new .agents/ROADMAP.md (Phases 0–7, epics E0.1–E7.7, MVP milestone, open decisions D1–D6);
  BOARD: added Phase 0 tasks T-013…T-017 and T-018 (decisions); AGENTS.md now states the goal.
- Rule: no Phase 1+ feature work until Phase 0 is done and D1–D6 are answered.
---
**2026-10-01 01:40 · lead-claude → @all** · `T-004, T-012` · DONE
- Changed: new server/lib/scope.js (ownedIds/isOwned); ownership checks in routes/leads, campaigns, clients,
  emailCampaigns, jobs (phones now read from DB, not request), gmaps/jobs (strict projectId + adoptLegacyJobs);
  project delete uses whatsapp.removeProjectAuth(); env overrides GMAPS_JOBS_FILE, WA_AUTH_DIR (+ DB_PATH);
  new server/test/ harness + 12 tests; AGENTS.md/ARCHITECTURE.md updated.
- Verified: `npm test --prefix server` → 12/12 pass; with the route fixes stashed, 4 isolation tests fail.
- Follow-ups: none new. CONTRACT: POST /leads now defaults stage_id to the first stage if omitted, 409 on
  duplicate client-supplied id; POST /jobs total = number of *owned* leads.
- Gotchas: dev box is Alpine — better-sqlite3 prebuilt was re-downloaded for musl; node_modules/.bin symlinks
  are broken (copied tree), call tools via node_modules/<pkg>/bin paths. Port 3001 = unrelated app.
---
**2026-10-01 02:00 · lead-claude → @all** · `T-007, T-008` · DONE
- Changed: routes/auth.js (getUserFromToken, parseCookies), middleware/project.js (canAccessProject),
  index.js (socket auth + per-event checks, backup restore rewrite), client vite.config.js (/socket.io proxy),
  WhatsAppPage.jsx (withCredentials); tests socket.test.js + backup.test.js.
- Verified: npm test --prefix server → 15/15; client build OK.
- CONTRACT: sockets without a session get connect_error "Not authenticated"; WA control events are silently
  ignored for users without whatsapp.control. POST /import/backup response now { ok, leads }.
---
**2026-10-01 02:15 · lead-claude → @all** · `T-013` · DONE / CONTRACT
Schema changes now go through `server/migrations/NNN-name.js` (see AGENTS.md rule 3). Don't add
`CREATE TABLE`/`ALTER` to db.js anymore.
- Verified: npm test 15/15; migration applied once on live-DB snapshot (320 leads, 3 projects intact) and on the
  legacy pre-multiproject DB (319 leads backfilled into Default); rerun = no-op.
---
**2026-10-01 02:45 · lead-claude → @all** · `T-005, T-017` · DONE / CONTRACT
Agency-mode access control is in.
- Changed: migrations/002-project-members.js; middleware/project.js (membership); routes/auth.js (hasPermission,
  projects.manage); requirePermission on every project route; routes/projects.js + accounts.js (membership,
  anti-escalation); client Accounts.jsx (workspace picker, Workspaces column), ProjectPicker.jsx (gated actions).
- Verified: npm test → 20/20 (new test/access.test.js); migration 002 on live-DB snapshot adds testuser to all 3
  workspaces; client build OK. UI NOT visually checked (no browser on this box) — @frontend please eyeball
  Settings → Accounts and the project picker as a non-admin.
- CONTRACT: 403 now returned for missing permissions on leads/campaigns/jobs/gmaps/stats/export/etc.
  Creating/deleting workspaces needs `projects.manage` (was settings.edit). GET /accounts items have `projectIds`.
---
**2026-10-01 03:10 · lead-claude → @all** · `T-014, T-015` · DONE / CONTRACT
- Changed: server/lib/paginate.js, routes/leads.js, clients.js, stages.js, migrations/003-list-indexes.js,
  test/lists.test.js; client Pagination.jsx, LeadsTable.jsx, DeadList.jsx, Stages.jsx, ClientsList.jsx.
- Verified: npm test 25/25; client build OK. Not visually checked (no browser on box).
- CONTRACT: GET /leads and /clients return `{items,total,page,limit}` when `page` is passed, plain array otherwise.
  "Select all" in LeadsTable now selects the current page only.
---
**2026-10-01 03:30 · lead-claude → @all** · `T-016` · DONE
Background queue available: `import { registerHandler, enqueue } from '../worker/index.js'`. Handlers must be
idempotent. See ARCHITECTURE §4 "Background worker".
- Verified: npm test 30/30 (worker.test.js covers run, schedule, retry/backoff, permanent failure, dedupe, cancel).
---
**2026-10-01 03:45 · lead-claude → @all** · `T-009, T-010` · DONE
- Changed: migrations/005-wa-daily-counts.js, routes/jobs.js (sentToday/countSent), gmaps/jobs.js
  (resumePendingJobs, called from index.js), routes/projects.js cascade, test/helpers.js exposes dbPath.
- Verified: npm test 31/31.
---
**2026-10-01 04:00 · lead-claude → @all** · `-` · NOTE
Phase 0 is complete (all on branch `phase-0-foundation`, not merged to main, not pushed). Phase 1 is broken down
into T-020…T-032 with a shared spec in `.agents/handoffs/PHASE-1-DESIGN.md`. Critical path:
T-020 (contacts) → T-021 (companies) + T-022 (deals) in parallel → T-023/T-024 UI → T-025…T-028.
Backend agents: start with T-020. Frontend agents: T-019 is free now; T-023 once T-020 is in REVIEW.
---
**2026-10-01 04:30 · lead-claude → @all** · `T-020` · DONE / CONTRACT
- `/api/contacts` is live (same router & records as `/api/leads`). New fields: lifecycle, owner_id, company_id
  (no validation until T-021), source, custom (object), updated_at. Filters: lifecycle, owner=me|none|id, source.
  Bulk actions: lifecycle, owner (`value`). Creator is default owner on POST.
- Clients: migration 006 merged them into contacts; `/api/clients` still reads the legacy table until T-023.
  Design note updated (client stage → deal in T-022).
- Verified: npm test 35/35; migration on live snapshot + legacy DB.
---
**2026-10-01 04:50 · lead-claude → @all** · `T-021` · DONE / CONTRACT
`/api/companies` live (see ARCHITECTURE §3). Contacts: `company_id` validated, `?company=` filter, bulk
`company` action, list items include `company {id,name}`. @integrations T-032 (gmaps → companies) is unblocked.
- Verified: npm test 38/38.
---
**2026-10-01 05:20 · lead-claude → @all** · `T-022` · DONE / CONTRACT
`/api/pipelines` and `/api/deals` are live — see ARCHITECTURE §2/§3. New perms `deals.view|edit|delete`
(migration grants them to users with the matching leads.* perm). @frontend T-024 (deals board) is unblocked.
Contact/company detail responses now include `deals`. New task T-033 (backup must include new tables).
- Verified: npm test 46/46; migration on live snapshot converts the 40 legacy clients correctly.
---
**2026-10-01 06:00 · lead-claude → @reviewer @frontend** · `T-024` · REQUEST
Deals UI is built but not visually verified (no browser on the box). Please check in a browser: Deals page
drag & drop between stages, dropping on Lost asks for a reason, New deal modal (contact/company search,
owner, date), Settings → Pipelines (add/reorder/delete stage, win %, idle days), light + dark + ~400px width.
New backend: GET /api/projects/:id/members (any member) for owner pickers.
---
**2026-10-01 06:40 · lead-claude → @reviewer @frontend** · `T-023` · REQUEST
Contacts UI done, needs a browser pass together with T-024. Also: /api/stats `totalClients` now = customers,
`activeClients` = qualified contacts (keys kept for saved dashboards) + new `openDeals`, `openDealValue`,
`wonDealsThisMonth`, `wonValueThisMonth`. Clients page removed from nav/routes → cleanup in T-034.
---
**2026-10-01 07:10 · lead-claude → @all** · `T-032` · DONE — plus bug fixes
- Google Maps import now creates/reuses companies and links contacts (source=gmaps).
- BUG (pre-existing): gmaps import used `phone != ""`, which this SQLite build treats as a column → the import
  threw inside an async handler and the request hung forever. Fixed the SQL, added `lib/async.js` `wrap()` for
  async routes + a JSON error handler for /api, and a 60 s per-test timeout. New rule 5b in AGENTS.md.
- CSV import backups now use SQLite online backup and keep only the last 5.
- Verified: npm test 50/50 (new gmaps-import + csv-import tests).
---
**2026-10-01 07:40 · lead-claude → @all** · `T-025` · DONE / CONTRACT
`/api/custom-fields` live. `custom` on contacts/companies/deals is now validated against the workspace's
definitions: **unknown keys are dropped**, PUT merges (null clears), required fields enforced on create.
Filters: `?cf.<key>=value`. @frontend T-027 (settings UI + form inputs + columns) is unblocked.
- Verified: npm test 55/55.
---
**2026-10-01 08:00 · lead-claude → @all** · `T-033` · DONE
Backups now cover the whole CRM (lib/backup.js, version 2). Rule update in AGENTS.md #2: new scoped tables
must also be added to export/restore in lib/backup.js.
- Verified: npm test 56/56; real-data round trip on a live snapshot.
---
**2026-10-01 08:15 · lead-claude → @frontend** · `T-029` · NOTE
Backend done: `POST /api/projects { name, templateFrom }` copies stages, tags, templates, pipelines, custom
fields and settings (no contacts/deals). Remaining for T-029: UI — "Workspace" wording in ProjectPicker/Sidebar
and a "Copy setup from…" select in the create-workspace modal.
---
**2026-10-01 08:35 · lead-claude → @frontend** · `T-031` · NOTE
Backend done: GET /api/contacts/duplicates, POST /api/contacts/merge (moves tags, campaigns, deals, history).
Live data has 5 groups — one is two KFC branches sharing a hotline, so the UI must be a **manual review**
(pick primary, tick which to merge), never auto-merge. Remaining for T-031: MergeContacts UI.
---
**2026-10-01 08:55 · lead-claude → @frontend** · `T-030` · NOTE
Backend done: GET /api/search?q= and /api/views (saved filters, per user, optional shared). Remaining for
T-030: GlobalSearch box in the header (Cmd/Ctrl+K) + "Save view" on Contacts/Deals.
---
**2026-10-01 09:30 · lead-claude → @all** · `T-023, T-024` · DONE — visual review
Headless Chromium is installed; new `scripts/ui-screenshots.mjs` + AGENTS.md §6 — use it for every UI change.
Review of the Contacts/Deals UI on a live-data snapshot found and fixed: main area missing `min-w-0` (wide
content stretched the whole page — Deals toolbar & Won/Lost off-screen), tag chips overlapping (pre-existing),
"Qualifieds/Churneds" tab labels, clock widget covering the mobile menu button (now hidden < md), Settings nav
squeezing content on mobile (now horizontal tabs). Drag & drop, lost-reason prompt and deal history verified by
a Playwright flow. No console errors; no horizontal overflow at 400px on any view.
---
**2026-10-01 10:10 · lead-claude → @all** · `T-027, T-028` · DONE
Custom fields UI (Settings → Custom fields, form inputs, table columns) and record pages (Companies list,
contact page, company page) are in, visually verified. Routes: `/p/:pid/companies`, `/p/:pid/contact/:id`,
`/p/:pid/company/:id` (App.jsx VIEWS + NAV_PARENT). Deals keep the modal (no separate page).
Contact page "History" panel is the slot for the Phase 2 activity timeline (E2.1).
---
**2026-10-01 10:50 · lead-claude → @all** · `T-019, T-029, T-030, T-031` · DONE — **Phase 1 complete**
All Phase 1 tasks are done and visually verified in headless Chromium on a live-data snapshot.
New UI: global search (Ctrl+K), saved views + custom-field filters, duplicates review (persistent "not
duplicates", migration 011), Workspace wording + "copy setup from", permission-gated buttons (`canI()`).
Remaining Phase-1-adjacent: T-034 (retire legacy clients — waits for Phase 2 timeline). Next: Phase 2.
- Verified: npm test 63/63; client build OK; UI flows scripted with Playwright.
---
**2026-10-24 · lead-claude → @leaddesk-integrations** · DONE — scraper browser fix
Google Maps scraper failed on every job: Playwright's bundled headless shell isn't installed (and is glibc-only on
this Alpine box). `server/gmaps/scraper.js` now launches with `executablePath` = `$CHROMIUM` or `/usr/bin/chromium`
if present, else Playwright's default (Docker unaffected). Verified: real scrape "restaurants" @ Al Khobar → 16
results with phone/address; npm test 63/63.
---
**2026-10-27 · lead-claude → @all** · `T-035` · DONE — contact message field + MCP server for Claude
User wants Claude connected to everything (incl. Maps scraping) and a per-contact message Claude writes and they copy.
- Migration 012: `leads.message` + `api_tokens` (hashed personal access tokens). `authMiddleware` now also takes
  `Authorization: Bearer ldk_…`. Routes: `/api/tokens` (own tokens only), `/mcp` (server/mcp.js, see ARCHITECTURE).
- MCP tools: list_workspaces, workspace_overview, list/get/create/update_contact, save_messages, bulk_update_contacts,
  search, start_maps_scrape, list/get_maps_job, import_maps_job, list_deals, whatsapp_status, api_request (everything else).
- UI: Settings → "Claude (MCP)" (create/revoke connection link), Message panel on contact page (Copy, Open in WhatsApp
  with prefilled text, inline edit), Message field in contact modal, copy button in contacts table.
- New deps: @modelcontextprotocol/sdk, zod (server). Live DB backed up to server/leaddesk.db.pre-mcp-backup before migrating.
- Verified: npm test 69/69 (new test/mcp.test.js + MCP isolation test); migration on live copy + pre-multiproject DB;
  client build; headless screenshots desktop/dark/400px, no overflow; MCP round trip through the public tunnel.
---
**2026-10-28 · lead-claude → @all** · `T-036` · HANDOFF — WhatsApp anti-ban engine: backend done, UI partly done
Done (backend, tested — npm test 91/91, migration 013 verified on live copy + pre-multiproject DB):
- lib/waRules.js (pure: limits + clamps, warm-up, health score/decay/multiplier, gaussian delay, recipient-timezone
  window + Friday mornings, content rules, opt-out detection, similarity, cadence, ETA), lib/waGuard.js (DB + WA
  events), migration 013 (wa_number, wa_sends — NOT wa_messages: legacy table name clash —, wa_events,
  leads.do_not_contact, broadcast_jobs.skipped/wait_reason/resume_at). routes/jobs.js rewritten: gate before every
  send, jobs wait + auto-resume instead of pausing, POST /jobs/estimate, GET /jobs/health, GET/PUT /jobs/limits,
  PUT /jobs/health/warmup, 422 on content problems. Also fixes old bug: jobs paused after 3 fails never resumed.
- BroadcastJobs.jsx: daily bar shows new chats vs limit + health; job rows show wait reason.
Left (UI): WaSafety settings panel (limits form + health dashboard + warm-up "number is N days old"),
WhatsAppSend.jsx pre-send estimate (problems/skipped/ETA) + {{message}} variable button, do_not_contact toggle in
LeadModal/ContactPage, api.js functions, visual check, ARCHITECTURE.md update. Live server NOT restarted (still old code).
Known: whatsapp.js treats any incoming message containing "limit"/"restricted" as an account restriction — will
misfire on customer replies; should be limited to WhatsApp system messages.
---
**2026-10-29 · lead-claude → @all** · `T-036, T-037` · DONE — anti-ban UI + scheduled WhatsApp messages
- Scheduled broadcasts (migration 014 `broadcast_jobs.scheduled_at`, status `scheduled`): POST /jobs `scheduledAt`,
  PUT /jobs/:id/schedule, stop = cancel. Runner timer: earliest wake-up wins so a far-off schedule can't cancel a
  short limit wait. Send dialog: compose → Review (content problems, skipped, new chats/follow-ups, ETA) → Send
  now / Schedule. Contact page: Schedule button sends `{{message}}` at a chosen time. Broadcasts list: Start now /
  Cancel for scheduled jobs.
- T-036 leftovers: Settings → WhatsApp "Number health / Number age / Sending limits" (WaSafety.jsx), do-not-contact
  badge + toggle, `{{message}}` variable chip.
- Verified: npm test 94/94 (scheduling + cross-workspace reschedule tests), migrations 013+014 on live copy and
  pre-multiproject DB, client build, headless screenshots desktop/dark/400px (no console errors, no overflow).
- Still open: whatsapp.js flags ANY incoming message containing "limit"/"restricted"/"suspended" as an account
  restriction — misfires on customer replies; should only look at WhatsApp system messages.
---
**2026-10-29 · lead-claude → @leaddesk-integrations** · DONE — false "account restricted" from customer replies
whatsapp.js marked the account restricted (stopping all sends until reconnect) whenever ANY incoming message
contained "restricted"/"limit"/"suspended". Now `isRestrictionNotice(jid, text)` (lib/waRules.js) only accepts
messages from WhatsApp's system sender (not 1:1 chats, LIDs, groups, status, channels) with explicit restriction
wording (EN + AR). Connection-close 401/"restricted" detection unchanged. Verified: npm test 95/95 (new unit test).

**2026-10-29 · lead-claude → @leaddesk-integrations** · DONE — scheduled messages & anti-ban over MCP
mcp.js: new tools `preview_broadcast` (dry run), `send_broadcast` (requires `user_confirmed: true`; `send_at` ISO →
scheduled job; `{{message}}` = per-contact saved message), `list_broadcasts`, `manage_broadcast`
(details/pause/resume/stop/reschedule/start_now), `whatsapp_limits` (read/merge limits, number age, dismiss alert).
All go through /api, so permissions, scoping and the anti-ban checks are the same as the UI. Server instructions
updated. Verified: npm test 96/96 (new MCP test: preview, schedule, reschedule, cancel, limits, cross-workspace).

**2026-10-29 · lead-claude → @leaddesk-integrations** · DONE — WhatsApp 405 reconnect loop
Workspace "me" (no linked number) retried every 5 s forever with 405 "Connection Failure"; each attempt added a
"disconnect" health event → score 100, 48 h hard stop + 7 days half volume. Cause: Baileys 7.0.0-rc13 bundles an
outdated WA Web version. Fix (whatsapp.js): pass `fetchLatestWaWebVersion()` (cached 6 h); exponential backoff
5 s → 5 min; give up after 3 failures when no session is linked and expose `lastError` (shown on WhatsApp page);
close events carry `linked`, and waGuard ignores unlinked failures (`_onEvent` exported for tests). Live: logged out
"me" over the socket, reset its wa_number penalties/events (backup: server/leaddesk.db.pre-wareset-backup).
Verified: npm test 97/97; throwaway server on a DB copy reaches qr_ready instead of 405.

**2026-11-01 · lead-claude** · NOTE — live hosting
Box now has Node 24 as default; better-sqlite3 11.10 has no musl prebuild for it and there is no compiler, so the live
server runs on `/usr/bin/node` (20.15.1, prebuild installed). Tests: `/usr/bin/node --test test/` (98/98).
Permanent URL on the user's own domain — user-level named tunnel `leaddesk` (~/.cloudflared/leaddesk.yml).
Kept alive by user crontab → ~/leaddesk-run/start.sh (@reboot + every 5 min). Don't run a second server on :3101.

**2026-11-05 · lead-claude** · DONE — T-038: the app hangs together
User reviewed the audit and asked to make it "linked and usable", plus direct import from the scraper.
Number identity (migration 015, wa_numbers, linkNumber, per-number limits, Numbers table in Settings → WhatsApp). Auto-reconnect on
boot only for workspaces that were connected. 401 = logged out instead of restricted. Campaign and broadcast pages replace CampaignModal;
contact page shows WhatsApp history; broadcasts link to campaigns by id. Campaign creation no longer excludes every tagged contact.
Security: cross-workspace campaign delete fixed (old test asserted the bug), CORS locked, Secure cookie, login rate limit, default-password
banner. Scraper: auto-import, one job at a time, real failed status, saved per keyword. MCP: list/get/create_campaign, auto_import, campaign_id.
test.csv untracked (still in public git history; history NOT rewritten). Live: backup server/leaddesk.db.pre-t038-backup, migrated, 6 scheduled broadcasts intact.
Verified: /usr/bin/node --test test/ 109/109, migration on a copy of the real DB, Playwright walk of new pages (no console errors, no mobile overflow),
live restart reconnected "me" alone. Correction to the audit: scraper jobs did already resume after restart.
Not done: better-sqlite3 upgrade for Node 24 (engines now says <24), inbox, README screenshots, CI.

**2026-11-05 · lead-claude** · DONE — empty campaigns, tag cleanup, teach Claude the tool (part of T-038)
User: campaigns must not need leads first; Claude should learn the concepts (verified etc.); too many tags to filter.
Finding: 127 tags in "me", 115 came from the scraper's per-category tags, not the AI. Migration 016 adds leads.category (backfilled from notes), scraper stops tagging categories, Business type filter on Contacts, top-10 tag buttons, tag merge/cleanup. Live cleanup ran on "me" only (backup: server/leaddesk.db.pre-tag-cleanup-backup). MCP: get_guide, instructions, manage_tags, add_to_campaign, category/verified filters. Verified: 114/114, rehearsal on a DB copy.
Open question to user: 1204 of 1205 contacts in "me" have a company with the same name; hide Companies?

**2026-11-05 · lead-claude** · DONE — Companies hidden from the menu (setting show_companies, default off; Settings → General). Pages and data stay. Verified in headless Chromium on a DB copy.

**2026-11-05 · lead-claude** · DONE — Egyptian local numbers in "me" converted to +20 at the user's request
Numbers like 01xxxxxxxxx had no country code, so WhatsApp lookups would fail. Converted contacts, companies and pending rows of active broadcasts (01[0125] + 8 digits only); country_code=20 for the workspace; landlines (02x) left. Backup: server/leaddesk.db.pre-phone-fix-backup. Known limit: normalizePhone applies the workspace code to any scraped number without "+".

**2026-11-05 · lead-claude** · DONE — T-039: roles, Docker, setup wizard, tour
Roles: presets in client/src/roles.js (permission shortcuts, server unchanged), single-workspace users skip the picker. Leaks fixed: wa_status/QR went to any member, socket permissions were stale until reconnect, MCP whatsapp_status ignored permissions. Passwords min 8.
Setup: no default admin on new installs (SEED_ADMIN=1 for tests); /api/setup open only while accounts is empty. Tour: Tour.jsx, data-tour on menu items, once per browser.
Docker rewritten: old compose mounted a volume on a file, the UI was copied where the server doesn't read it, and .dockerignore would have shipped jobs_data.json. CI + ghcr publish workflows added.
Verified: 121 tests; fresh install with the image env walked in Chromium; prebuilt better-sqlite3 exists for node22 x64/arm64. NOT verified: real docker build (no daemon access).
Before going public: real phone numbers replaced in Settings example and tests; test.csv and the older Settings example remain in git history.

## 2026-11-05 · lead-claude · DONE T-040
WhatsApp inbox (sidebar: Inbox). whatsapp.js now emits a `message` event for every 1:1 message (notify, append, history); lib/waInbox.js records it, jobs.js records broadcasts through recordOutbound. Sending: replies skip hours/new-chat caps but honour hard stop + per-minute limit; a first message uses the broadcast rules. Read = whatsapp.view, send/manage = campaigns.send. Socket event `wa_inbox` carries only ids.
Found on a copy of the live DB: legacy `wa_chats` existed, so `CREATE TABLE IF NOT EXISTS` skipped ours and the index creation failed, and the boot code swallowed the migration error. Tables renamed `wa_inbox_*`; index.js now calls getDB() before listen so a failed migration stops the server.
Verified: full server test suite, UI on a DB copy (desktop, dark, mobile), migration on the copy. Not verified by an agent: a real incoming message end to end.
