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
