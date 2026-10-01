# Task board

Format and rules: `.agents/PROTOCOL.md` §3. Next free ID: check with
`grep -o 'T-[0-9]*' .agents/BOARD.md | sort -V | tail -1`.

Big picture: `.agents/ROADMAP.md` (phases & epics). Seeded 2026-10-01 from a full read of the codebase. Items marked (verify) are suspected, not yet confirmed
by running the code.

---

## IN PROGRESS

_(none)_

## BLOCKED

_(none)_

## REVIEW

_(none)_

## TODO

### T-001 · Commit the in-progress multi-project refactor
- Status: TODO
- Owner: —
- Role: lead
- Priority: P0
- Files: (whole working tree — 28 modified files + ProjectPicker.jsx, middleware/, routes/projects.js)
- Updated: 2026-10-01
- Notes: Needs @human approval. Everything since "Initial commit" is uncommitted. Do NOT add `server/*.db*`,
  `server/growengine.db*`, `server/baileys_auth/`, `test.csv`. Smoke test (login → picker → project → leads) first.

### T-004 · Enforce project ownership on ids passed in bodies
- Status: TODO
- Owner: —
- Role: backend
- Priority: P1
- Files: server/routes/leads.js, server/routes/campaigns.js, server/routes/jobs.js, server/routes/clients.js
- Updated: 2026-10-01
- Notes: e.g. `/leads/bulk` action `stage`/`tag` doesn't check `stageId`/`tagId` belong to `req.project`;
  `/jobs` POST trusts `leads[]` ids/phones; audit all routes for `WHERE id = ?` without `AND project_id = ?` (verify).

### T-005 · Apply requirePermission to all project routers
- Status: TODO
- Owner: —
- Role: backend
- Priority: P1
- Files: server/routes/{leads,campaigns,jobs,tags,stages,templates,settings}.js, server/index.js (inline routes)
- Updated: 2026-10-01
- Notes: Permissions exist in `ALL_PERMISSIONS` but most routers ignore them. Coordinate with frontend
  (T-006) so UI hides actions the user can't do.

### T-006 · Hide UI actions the user lacks permission for
- Status: TODO
- Owner: —
- Role: frontend
- Priority: P2
- Files: client/src/components/Sidebar.jsx, LeadsTable.jsx, Campaigns.jsx, Settings.jsx
- Depends on: T-005
- Updated: 2026-10-01

### T-007 · Authenticate Socket.IO connections
- Status: TODO
- Owner: —
- Role: integrations
- Priority: P1
- Files: server/index.js, client/src/components/WhatsAppPage.jsx
- Updated: 2026-10-01
- Notes: anyone reaching the port can emit `wa_logout {projectId}` / read QR codes. Validate
  `lead_session` cookie in `io.use()` and verify the project exists.

### T-008 · Parameterise SQL in /api/import/backup
- Status: TODO
- Owner: —
- Role: backend
- Priority: P1
- Files: server/index.js
- Updated: 2026-10-01
- Notes: uses `'${pid}'` string building inside `db.exec`. Rewrite with prepared statements inside a
  `db.transaction`. Also: backup restore doesn't include clients/templates/settings (document or extend).

### T-009 · Persist broadcast daily counter; honour delay_min/max
- Status: TODO
- Owner: —
- Role: integrations
- Priority: P2
- Files: server/routes/jobs.js
- Updated: 2026-10-01
- Notes: `messagesSentToday` is in memory → restart = new 100 quota. Compute from `job_leads.sent_at`
  since midnight instead. `delay_min/delay_max` stored but unused (decide with @human).

### T-010 · Re-run gmaps jobs left pending after a restart
- Status: TODO
- Owner: —
- Role: integrations
- Priority: P2
- Files: server/gmaps/jobs.js
- Updated: 2026-10-01
- Notes: `loadJobs()` flips running→pending but nothing calls `runJob()` again.

### T-011 · Ignore stray local data files in git
- Status: TODO
- Owner: —
- Role: lead
- Priority: P1
- Files: .gitignore, server/data.db (tracked, empty)
- Updated: 2026-10-01
- Notes: add `server/*.db`, `server/*.db-*`, `server/*.db.*backup*`, `test.csv`; `git rm --cached server/data.db`
  and the committed `.wwebjs_cache` files. Ask @human before removing tracked files.

### T-012 · Add a minimal test harness
- Status: TODO
- Owner: —
- Role: backend
- Priority: P2
- Files: server/package.json, server/test/** (new)
- Updated: 2026-10-01
- Notes: `node --test` + supertest against a temp DB (add a `DB_PATH` env override in db.js as part of this task). Start with
  auth, project scoping, leads CRUD.

### T-013 · Versioned migrations system (E0.3)
- Status: TODO
- Owner: —
- Role: backend
- Priority: P0
- Files: server/db.js, server/migrations/** (new)
- Updated: 2026-10-01
- Notes: `schema_migrations(id, applied_at)`; run pending `server/migrations/NNN-*.js` in order inside a
  transaction on startup. Current initSchema/runMigration become migration 001 (must be a no-op on existing DBs).

### T-014 · Paginate & batch the leads and clients lists (E0.5)
- Status: TODO
- Owner: —
- Role: backend
- Priority: P1
- Files: server/routes/leads.js, server/routes/clients.js
- Updated: 2026-10-01
- Notes: `?page&limit` (default 50), return `{ items, total }`; replace per-lead campaign/tag/history queries
  with batched `IN (...)` lookups. Post a CONTRACT — frontend follow-up is T-015.

### T-015 · Frontend pagination for leads & clients (E0.5)
- Status: TODO
- Owner: —
- Role: frontend
- Priority: P1
- Files: client/src/api.js, client/src/components/LeadsTable.jsx, ClientsList.jsx, DeadList.jsx
- Depends on: T-014
- Updated: 2026-10-01

### T-016 · DB-backed background worker (E0.6)
- Status: TODO
- Owner: —
- Role: backend
- Priority: P0
- Files: server/worker/** (new), server/index.js (start worker), migration via T-013
- Depends on: T-013
- Updated: 2026-10-01
- Notes: `queue(id, type, payload, run_at, attempts, status, last_error, project_id)`; `enqueue(type, payload,
  {runAt})`, handler registry, retries with backoff, survives restart. Don't migrate broadcasts onto it yet.

### T-017 · Project membership & access control (E0.7)
- Status: TODO
- Owner: —
- Role: backend
- Priority: P1
- Files: server/middleware/project.js, server/routes/projects.js, migration via T-013
- Depends on: T-013
- Updated: 2026-10-01
- Notes: `project_members(project_id, account_id, role)`; creator auto-added; admins see all; GET /projects
  lists only member projects. Frontend members UI = separate task.

### T-018 · Get @human answers on roadmap decisions D1–D6
- Status: TODO
- Owner: —
- Role: lead
- Priority: P0
- Files: .agents/ROADMAP.md
- Updated: 2026-10-01
- Notes: blocks Phase 1 breakdown. Record answers in ROADMAP.md "Open decisions".

## DONE

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
