# Task board

Format and rules: `.agents/PROTOCOL.md` §3. Next free ID: check with
`grep -o 'T-[0-9]*' .agents/BOARD.md | sort -V | tail -1`.

Big picture: `.agents/ROADMAP.md` (phases & epics). Seeded 2026-10-01 from a full read of the codebase. Items marked (verify) are suspected, not yet confirmed
by running the code.

---

## IN PROGRESS

## BLOCKED

_(none)_

## REVIEW

_(none)_

## TODO

### T-006 · Hide UI actions the user lacks permission for
- Status: TODO
- Owner: -
- Role: frontend
- Priority: P2
- Files: client/src/components/Sidebar.jsx, LeadsTable.jsx, Campaigns.jsx, Settings.jsx
- Depends on: T-005
- Updated: 2026-10-01 01:08

- Notes: Partly done: ProjectPicker hides create/edit/delete, Accounts has workspace picker. Remaining: Sidebar/LeadsTable/Campaigns/Settings should hide actions the user lacks (API already returns 403).

## DONE

### T-010 · Re-run gmaps jobs left pending after a restart
- Status: DONE
- Owner: lead-claude
- Role: integrations
- Priority: P2
- Files: server/gmaps/jobs.js
- Updated: 2026-10-01 01:13
- Notes: `loadJobs()` flips running→pending but nothing calls `runJob()` again.
  → resumePendingJobs() runs interrupted scrapes sequentially at startup.

### T-009 · Persist broadcast daily counter; honour delay_min/max
- Status: DONE
- Owner: lead-claude
- Role: integrations
- Priority: P2
- Files: server/routes/jobs.js
- Updated: 2026-10-01 01:13
- Notes: `messagesSentToday` is in memory → restart = new 100 quota. Compute from `job_leads.sent_at`
  since midnight instead. `delay_min/delay_max` stored but unused (decide with @human).
  → Daily count persisted in wa_daily_counts (migration 005). delay_min/delay_max still unused — left as-is (pacing is deliberately fixed for anti-ban). test/broadcast-limit.test.js.

### T-016 · DB-backed background worker (E0.6)
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P0
- Files: server/worker/** (new), server/index.js (start worker), migration via T-013
- Depends on: T-013
- Updated: 2026-10-01 01:12
- Notes: `queue(id, type, payload, run_at, attempts, status, last_error, project_id)`; `enqueue(type, payload,
  {runAt})`, handler registry, retries with backoff, survives restart. Don't migrate broadcasts onto it yet.
  → worker/index.js + migration 004; started in index.js (WORKER=off to disable); test/worker.test.js (in-process).

### T-015 · Frontend pagination for leads & clients (E0.5)
- Status: DONE
- Owner: lead-claude
- Role: frontend
- Priority: P1
- Files: client/src/api.js, client/src/components/LeadsTable.jsx, ClientsList.jsx, DeadList.jsx
- Depends on: T-014
- Updated: 2026-10-01 01:11

- Notes: Pagination.jsx; LeadsTable + DeadList page through results (page size remembered); Stages uses lead_count; ClientsList lead search capped at 50. Not visually checked (no browser).

### T-014 · Paginate & batch the leads and clients lists (E0.5)
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P1
- Files: server/routes/leads.js, server/routes/clients.js
- Updated: 2026-10-01 01:11
- Notes: `?page&limit` (default 50), return `{ items, total }`; replace per-lead campaign/tag/history queries
  with batched `IN (...)` lookups. Post a CONTRACT — frontend follow-up is T-015.
  → lib/paginate.js; leads + clients paginate on ?page, batched enrichment (3 queries instead of 3/row); stages GET has lead_count; clients stage filter fixed; migration 003 indexes. test/lists.test.js.

### T-017 · Project membership & access control (E0.7)
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P1
- Files: server/middleware/project.js, server/routes/projects.js, migration via T-013
- Depends on: T-013
- Updated: 2026-10-01 01:08
- Notes: `project_members(project_id, account_id, role)`; creator auto-added; admins see all; GET /projects
  lists only member projects. Frontend members UI = separate task.
  → Migration 002 project_members (backfills existing users into all workspaces); canAccessProject enforces membership for HTTP + sockets; accounts get projectIds; non-admin account mgmt can't escalate. Accounts UI has workspace picker.

### T-005 · Apply requirePermission to all project routers
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P1
- Files: server/routes/{leads,campaigns,jobs,tags,stages,templates,settings}.js, server/index.js (inline routes)
- Updated: 2026-10-01 01:08
- Notes: Permissions exist in `ALL_PERMISSIONS` but most routers ignore them. Coordinate with frontend
  (T-006) so UI hides actions the user can't do.
  → All project routes + inline index.js routes gated; bulk actions check per-action perm. test/access.test.js.

### T-013 · Versioned migrations system (E0.3)
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P0
- Files: server/db.js, server/migrations/** (new)
- Updated: 2026-10-01 01:05
- Notes: `schema_migrations(id, applied_at)`; run pending `server/migrations/NNN-*.js` in order inside a
  transaction on startup. Current initSchema/runMigration become migration 001 (must be a no-op on existing DBs).
  → server/migrations/ (runner + 001-baseline). Verified on fresh DB, live-DB snapshot and pre-multiproject legacy DB; second run is a no-op.

### T-008 · Parameterise SQL in /api/import/backup
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P1
- Files: server/index.js
- Updated: 2026-10-01 01:04
- Notes: uses `'${pid}'` string building inside `db.exec`. Rewrite with prepared statements inside a
  `db.transaction`. Also: backup restore doesn't include clients/templates/settings (document or extend).
  → Rewritten as one transaction with fresh ids + id remapping (backup from another workspace now works). test/backup.test.js.

### T-007 · Authenticate Socket.IO connections
- Status: DONE
- Owner: lead-claude
- Role: integrations
- Priority: P1
- Files: server/index.js, client/src/components/WhatsAppPage.jsx
- Updated: 2026-10-01 01:04
- Notes: anyone reaching the port can emit `wa_logout {projectId}` / read QR codes. Validate
  `lead_session` cookie in `io.use()` and verify the project exists.
  → io.use() checks lead_session; every event checks canAccessProject(); wa_init/disconnect/logout need whatsapp.control. Vite dev proxy now forwards /socket.io. test/socket.test.js.

### T-012 · Add a minimal test harness
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P2
- Files: server/package.json, server/test/** (new)
- Updated: 2026-10-01 01:02
- Notes: `node --test` + supertest against a temp DB (add a `DB_PATH` env override in db.js as part of this task). Start with
  auth, project scoping, leads CRUD.

_(none)_
  → server/test/ with helpers.js (spawns server on temp DB/jobs/WA dir), auth + isolation tests; npm test --prefix server.

### T-004 · Enforce project ownership on ids passed in bodies
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P1
- Files: server/routes/leads.js, server/routes/campaigns.js, server/routes/jobs.js, server/routes/clients.js
- Updated: 2026-10-01 01:02
- Notes: e.g. `/leads/bulk` action `stage`/`tag` doesn't check `stageId`/`tagId` belong to `req.project`;
  `/jobs` POST trusts `leads[]` ids/phones; audit all routes for `WHERE id = ?` without `AND project_id = ?` (verify).
  → Confirmed leaks: campaigns/:id/leads accepts+returns foreign leads; bulk tag/stage accept foreign tag/stage; GET campaigns/:id/eligible works cross-workspace.
  → Fixed via server/lib/scope.js in leads, campaigns, clients, emailCampaigns, jobs, gmaps jobs. Covered by test/isolation.test.js (4 tests fail without fix).

### T-018 · Get @human answers on roadmap decisions D1–D6
- Status: DONE
- Owner: lead-claude
- Role: lead
- Priority: P0
- Files: .agents/ROADMAP.md
- Updated: 2026-10-01 00:59
- Notes: blocks Phase 1 breakdown. Record answers in ROADMAP.md "Open decisions".
  → All recommendations accepted; D3 = agency mode. See ROADMAP Decisions.

### T-011 · Ignore stray local data files in git
- Status: DONE
- Owner: lead-claude
- Role: lead
- Priority: P1
- Files: .gitignore, server/data.db (tracked, empty)
- Updated: 2026-10-01 00:59
- Notes: add `server/*.db`, `server/*.db-*`, `server/*.db.*backup*`, `test.csv`; `git rm --cached server/data.db`
  and the committed `.wwebjs_cache` files. Ask @human before removing tracked files.
  → Done in bc73b88 (gitignore + untracked data.db, .wwebjs_cache, dist).

### T-001 · Commit the in-progress multi-project refactor
- Status: DONE
- Owner: lead-claude
- Role: lead
- Priority: P0
- Files: (whole working tree — 28 modified files + ProjectPicker.jsx, middleware/, routes/projects.js)
- Updated: 2026-10-01 00:59
- Notes: Needs @human approval. Everything since "Initial commit" is uncommitted. Do NOT add `server/*.db*`,
  `server/growengine.db*`, `server/baileys_auth/`, `test.csv`. Smoke test (login → picker → project → leads) first.
  → Committed bc73b88 on branch phase-0-foundation after API smoke test + client build.

### T-000 · Set up multi-agent environment
- Status: DONE
- Owner: lead-claude
- Role: lead
- Files: AGENTS.md, CLAUDE.md, .agents/**, .claude/agents/**
- Updated: 2026-10-01
- Notes: see LOG entry of 2026-10-01.

## PARKED (by @human — do not work on)

### T-002 · Fix Docker image serving no UI
- Status: PARKED
- Owner: —
- Role: backend
- Priority: P0
- Files: server/index.js, Dockerfile, package.json
- Updated: 2026-10-01
- Notes: Dockerfile copies build to `server/public/`, index.js only serves `../client/dist`. Serve
  `server/public` first, fall back to `client/dist`.

### T-003 · Make DB path configurable + fix docker-compose volume
- Status: PARKED
- Owner: —
- Role: backend
- Priority: P1
- Files: server/db.js, server/routes/leads.js (unused DB_PATH), docker-compose.yml, Dockerfile, README.md
- Updated: 2026-10-01
- Notes: compose mounts a named volume on the *file* `/app/server/leaddesk.db`. Add `DATA_DIR` env
  (default `server/`), mount `/app/data`. Keep existing installs working.

## Archive
