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
