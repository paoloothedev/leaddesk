# Task board

Format and rules: `.agents/PROTOCOL.md` §3. Next free ID: check with
`grep -o 'T-[0-9]*' .agents/BOARD.md | sort -V | tail -1`.

Big picture: `.agents/ROADMAP.md` (phases & epics). Seeded 2026-10-01 from a full read of the codebase. Items marked (verify) are suspected, not yet confirmed
by running the code.

---

## IN PROGRESS

### T-031 · Duplicate detection & merge for contacts
- Status: IN PROGRESS
- Owner: lead-claude
- Role: backend
- Priority: P2
- Files: server/routes/contacts.js (merge endpoint), server/lib/merge.js, client/src/components/MergeContacts.jsx
- Depends on: T-020
- Updated: 2026-10-01 01:44
- Notes: Match by phone/email; merge keeps history, tags, campaigns, deals.
  → Backend first (duplicates + merge endpoints); UI later.

### T-029 · Workspace UX: rename Project→Workspace in UI; workspace templates (clone setup)
- Status: IN PROGRESS
- Owner: lead-claude
- Role: frontend
- Priority: P1
- Files: client/src/components/ProjectPicker.jsx, Sidebar.jsx, server/routes/projects.js (POST /projects/:id/clone-setup)
- Depends on: T-022, T-025
- Updated: 2026-10-01 01:43
- Notes: Clone = stages, tags, templates, pipelines, custom fields, settings (no contacts). Agency onboarding feature (ROADMAP D3).
  → Backend (POST /projects templateFrom) first; UI rename + template picker later.

## BLOCKED

_(none)_

## REVIEW

## TODO

<!-- Phase 1 — core CRM. Spec: .agents/handoffs/PHASE-1-DESIGN.md. Phase 0 is complete. -->

### T-019 · Hide row-level actions the user lacks permission for
- Status: TODO
- Owner: —
- Role: frontend
- Priority: P2
- Files: client/src/components/LeadsTable.jsx, DeadList.jsx, Campaigns.jsx, ClientsList.jsx, BroadcastJobs.jsx
- Updated: 2026-10-01 01:15
- Notes: Use can() from client/src/permissions.js for delete/verify/bulk/send buttons. API already 403s.

### T-034 · Retire legacy clients (table, /api/clients, ClientsList/ClientModal)
- Status: TODO
- Owner: —
- Role: backend
- Priority: P2
- Files: server/routes/clients.js, server/index.js, client/src/components/ClientsList.jsx, ClientModal.jsx, client/src/api.js, a migration that drops clients/client_tags after copying client_activities
- Depends on: Phase 2 E2.1 (timeline) — client_activities must move to the activity timeline first
- Updated: 2026-10-01 01:31
- Notes: Since T-023 the Clients page is unreachable (merged into Contacts + Deals). Data lives on via client_contact_map.

## DONE

### T-030 · Global search (FTS5) + saved views
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P2
- Files: server/migrations/0xx-search.js, server/routes/search.js, client/src/components/GlobalSearch.jsx
- Depends on: T-020, T-021, T-022
- Updated: 2026-10-01 02:24
- Notes: Search contacts, companies, deals in one box; saved filter sets per user.
  → Backend first: GET /api/search + /api/views; UI later.
  → UI: GlobalSearch (Ctrl+K), saved views + custom-field filters on Contacts.
  → GlobalSearch (Ctrl/Cmd+K + sidebar button, keyboard nav; deals open via /deals?deal=id), saved views bar + custom-field filters on Contacts. Verified in headless Chromium: search→contact page, search→deal modal, filter Cuisine=Seafood → save view → clear → apply view (1 row).

### T-028 · Record pages: full-page contact / company / deal views
- Status: DONE
- Owner: lead-claude
- Role: frontend
- Priority: P1
- Files: client/src/components/ContactPage.jsx, CompanyPage.jsx, DealPage.jsx (new), App.jsx routes
- Depends on: T-023, T-024, T-021
- Updated: 2026-10-01 02:21
- Notes: Details panel + related records; leave a slot for the Phase 2 timeline.
  → Includes a Companies list page (missing so far). Deals keep the modal (no separate page).
  → Companies list page + CompanyModal; ContactPage (/p/:pid/contact/:id) and CompanyPage (/company/:id) with details, custom fields, tags, deals (+new deal), linked contacts (link/unlink), history slot for Phase 2 timeline; names in Contacts table link to pages. Verified in headless Chromium (desktop/dark/mobile, create company → link contact → new deal).

### T-027 · Custom fields UI (settings + forms + table columns)
- Status: DONE
- Owner: lead-claude
- Role: frontend
- Priority: P1
- Files: client/src/components/CustomFieldsSettings.jsx (new), CustomFieldInputs.jsx (new), LeadModal.jsx, DealModal.jsx, Settings.jsx, client/src/api.js
- Depends on: T-025, T-023, T-024
- Updated: 2026-10-01 02:16

- Notes: Settings → Custom fields (per entity: add, rename, options, required, reorder, delete), CustomFieldInputs in contact + deal modals, custom columns in Contacts table. Verified in headless Chromium: created 4 contact fields + 1 deal field, filled them on a new contact, values saved typed and shown as columns. Filtering by custom field in the UI → part of T-030 saved views.

### T-024 · Deals UI: kanban board + pipeline settings
- Status: DONE
- Owner: lead-claude
- Role: frontend
- Priority: P0
- Files: client/src/components/DealsBoard.jsx (new), DealModal.jsx (new), PipelineSettings.jsx (new), client/src/api.js, App.jsx, Sidebar.jsx, Settings.jsx
- Depends on: T-022
- Updated: 2026-10-01 02:08
- Notes: Drag & drop between stages (no new dependency unless @lead agrees), column totals (count + value), won/lost actions with lost reason.
  → DealsBoard.jsx (kanban, native DnD, totals, lost-reason prompt, idle badges, owner filter), DealModal.jsx, RecordPicker.jsx, PipelineSettings.jsx (Settings → Pipelines), format.js, api.js; GET /projects/:id/members for owner pickers. Build OK; NOT visually checked — needs a browser pass (light/dark, mobile, drag & drop).

_(none)_
  → Visually + interactively verified: create deal via modal with contact search, drag to Proposal, drag to Lost → reason prompt → status lost, history in modal. Fixed during review: page-wide overflow (Layout min-w-0) hid toolbar and Won/Lost columns.

### T-023 · Contacts UI: Leads → Contacts with lifecycle; Clients = customers view
- Status: DONE
- Owner: lead-claude
- Role: frontend
- Priority: P0
- Files: client/src/App.jsx, client/src/api.js, client/src/components/Sidebar.jsx, LeadsTable.jsx, LeadModal.jsx, ClientsList.jsx
- Depends on: T-020
- Updated: 2026-10-01 02:08
- Notes: Lifecycle filter chips + column; convert-to-client becomes 'mark as customer'.
  → Contacts page (lifecycle tabs + column, company column, owner filter, bulk lifecycle/owner), contact modal (lifecycle/owner/company), sidebar Contacts + Deals (Clients removed), dashboard/picker counts from contacts + new deal metrics. Build OK, 48 tests; NOT visually checked.
  → Visually verified in headless Chromium on live-data snapshot (desktop/dark/mobile): lifecycle tabs, columns, modal. Fixed during review: tab plurals, overlapping tag chips (also Dead list), 'Create contact' wording.

### T-033 · Include companies, deals, pipelines, contacts fields in backup export/restore
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P1
- Files: server/index.js (/api/export, /api/import/backup), server/test/backup.test.js
- Updated: 2026-10-01 01:43
- Notes: Export/restore currently only covers leads, stages, tags, campaigns. Keep id remapping for new tables.
  → lib/backup.js (export v2 + restore with id remapping for all CRM tables, owners kept only if workspace members). Verified round-trip of the real Default workspace on a snapshot (319 contacts, 40 deals, stages intact). test/backup.test.js.

### T-025 · Custom fields backend (migration 009)
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P1
- Files: server/migrations/009-custom-fields.js, server/routes/customFields.js (new), server/lib/customFields.js (validation), routes/contacts.js, companies.js, deals.js
- Depends on: T-020, T-021, T-022
- Updated: 2026-10-01 01:41
- Notes: Spec: PHASE-1-DESIGN § Custom fields. Validation helper used by all three entity routes.
  → Migration 009, lib/customFields.js (12 types, coercion, merge, required, cf.* filters), routes/customFields.js; wired into contacts/companies/deals. test/custom-fields.test.js. @frontend T-027 unblocked.

### T-032 · Google Maps import creates companies + contacts
- Status: DONE
- Owner: lead-claude
- Role: integrations
- Priority: P1
- Files: server/routes/gmaps.js
- Depends on: T-021
- Updated: 2026-10-01 01:39
- Notes: Dedupe company by name+phone within workspace; source='gmaps'.
  → Maps import creates/reuses a company per business (by phone, else name) and links the contact; also fixed a pre-existing crash (SQL "" literal) that made the Maps import hang on this build. test/gmaps-import.test.js + csv-import.test.js.

### T-026 · Record owners: owner filters, default owner, bulk assign
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P1
- Files: server/routes/contacts.js, companies.js, deals.js, server/test/owners.test.js
- Depends on: T-020, T-021, T-022
- Updated: 2026-10-01 01:32
- Notes: owner=me|<id>|none filter; owner must be workspace member.
  → Delivered inside T-020/T-021/T-022: creator = default owner; owner=me|none|id filters on contacts, companies, deals; owner must be workspace member (isProjectMember); bulk assign on contacts. Tested in contacts/companies/deals tests.

### T-022 · Pipelines & deals backend (migration 008)
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P0
- Files: server/migrations/008-deals.js, server/routes/pipelines.js, server/routes/deals.js (new), server/index.js, server/routes/auth.js (deals.* perms), server/lib/scope.js, server/routes/projects.js, server/test/deals.test.js
- Depends on: T-020
- Updated: 2026-10-01 01:25
- Notes: Spec: PHASE-1-DESIGN § Pipelines & deals. Default pipeline seeded for every workspace (existing + new). Endpoint for moving a deal between stages (records history).
  → Migration 008 (pipelines, stages, deals, history; clients→deals; leads.*→deals.* perms), routes/pipelines.js, routes/deals.js (board, move, won/lost), lib/pipelines.js. Live snapshot: 40 clients → 22 Qualified, 16 Contact made, 2 Lost. test/deals.test.js.

### T-021 · Companies backend (migration 007, /api/companies)
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P0
- Files: server/migrations/007-companies.js, server/routes/companies.js (new), server/index.js, server/lib/scope.js, server/routes/projects.js, server/test/companies.test.js
- Depends on: T-020
- Updated: 2026-10-01 01:21
- Notes: Spec: PHASE-1-DESIGN § Companies. Include contacts count + linking/unlinking contacts.
  → Migration 007, routes/companies.js, contact company_id validation/filter/bulk. test/companies.test.js.

### T-020 · Contacts: merge clients into leads (migration 006) + /api/contacts
- Status: DONE
- Owner: lead-claude
- Role: backend
- Priority: P0
- Files: server/migrations/006-contacts.js, server/routes/contacts.js (new), server/routes/clients.js (shim), server/index.js, server/lib/scope.js, server/test/contacts.test.js
- Updated: 2026-10-01 01:20
- Notes: Spec: handoffs/PHASE-1-DESIGN.md § Contacts. Test the migration on a copy of the live DB (40 clients in Default) and on the legacy DB.
  → Migration 006 (leads gets lifecycle/owner_id/company_id/source/custom/updated_at; clients merged via client_contact_map). /api/contacts = leads router. Verified on live snapshot + legacy DB (40 clients → 40 existing leads marked qualified, no dupes). test/contacts.test.js.

### T-006 · Hide UI actions the user lacks permission for
- Status: DONE
- Owner: lead-claude
- Role: frontend
- Priority: P2
- Files: client/src/components/Sidebar.jsx, LeadsTable.jsx, Campaigns.jsx, Settings.jsx
- Depends on: T-005
- Updated: 2026-10-01 01:14

- Notes: Partly done: ProjectPicker hides create/edit/delete, Accounts has workspace picker. Remaining: Sidebar/LeadsTable/Campaigns/Settings should hide actions the user lacks (API already returns 403).
  → client/src/permissions.js can(); Sidebar + Settings tabs + ProjectPicker filtered. Row-level buttons (delete/verify/bulk) still visible → T-019. Not visually checked.

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
