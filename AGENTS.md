# AGENTS.md — LeadDesk

> Start here if you are an AI agent (Claude, Codex, Cursor, Gemini, …) working on this repo.
> Read this whole file, then follow the **Session protocol** in `.agents/PROTOCOL.md`.

## 1. What this project is

**LeadDesk** is a self-hosted outreach CRM:

- Scrape businesses from **Google Maps** (Playwright) → import as **leads**
- Organise leads with **stages** (pipeline), **tags**, **campaigns**, verification, "dead list"
- Send bulk **WhatsApp** broadcasts (Baileys, unofficial WA Web API) with human-like pacing
- **Email campaigns** (data model + UI only; no actual sending yet)
- Convert leads → **clients** (CRM with activities)
- Multi-user **accounts** with role + permission list
- **Multi-project workspaces**: every piece of data belongs to a project (`project_id`)

**Product goal:** become a full CRM that replaces paid subscriptions (HubSpot, Pipedrive, Zoho, Kommo) for
small/medium businesses, while keeping our edge (Google Maps lead gen + WhatsApp outreach, easy self-hosting).
The phased plan is in **`.agents/ROADMAP.md`** — check which phase is active before proposing features.
Docker/deployment work is **parked** until @human says otherwise.

## 2. Stack & layout

| Part | Tech |
|---|---|
| Frontend | React 18, Vite 5, Tailwind 3, Framer Motion, Phosphor icons, react-router-dom 7, socket.io-client |
| Backend | Node 18+/20, Express 4, **ESM** (`"type": "module"`), better-sqlite3 (sync API), socket.io |
| WhatsApp | `@whiskeysockets/baileys` — one socket per project |
| Scraper | Playwright Chromium, parses `APP_INITIALIZATION_STATE` from Maps |

```
leaddesk/
├── AGENTS.md            ← you are here (shared rules for every agent)
├── CLAUDE.md            ← Claude Code entry point (imports this file)
├── .agents/             ← multi-agent workspace (protocol, board, log, roles, architecture)
├── .claude/agents/      ← Claude Code sub-agent definitions
├── client/src/
│   ├── main.jsx         ← BrowserRouter bootstrap
│   ├── App.jsx          ← auth gate, routes: "/" = ProjectPicker, "/p/:projectId/*" = ProjectShell
│   ├── api.js           ← ALL HTTP calls; injects X-Project-Id header
│   └── components/      ← one file per page/modal (no sub-folders, no state lib)
└── server/
    ├── index.js         ← Express app, router mounting, inline /api/stats|export|import routes, socket.io
    ├── db.js            ← schema, migrations, seeding, createProject(), logAudit()
    ├── middleware/project.js ← resolveProject → req.project
    ├── routes/*.js      ← one Router per resource
    ├── whatsapp.js      ← per-project Baileys clients (Map<projectId, state>)
    └── gmaps/           ← scraper.js (Playwright) + jobs.js (in-memory jobs persisted to jobs_data.json)
```

Deep reference (data model, every endpoint, request flow): **`.agents/ARCHITECTURE.md`**.

## 3. Commands

```bash
npm run setup      # install root + server + client deps
npm run dev        # server (node --watch, :3001) + client (vite, :5173, proxies /api → :3001)
npm run build      # vite build → client/dist, also copied to server/public
npm start          # production server (serves client/dist if it exists)
docker compose up -d --build
```

Default login: `admin` / `admin` (seeded when `accounts` is empty).
Tests: `npm test --prefix server` (Node's built-in `node --test`, no extra deps). Each test file boots a real
server on a random port with a throwaway DB/jobs file/WA dir via `server/test/helpers.js` — **every new endpoint
needs tests, including a cross-workspace isolation test in `test/isolation.test.js`.** No linter; also run
`node --check <file>` and `npm run build --prefix client` for frontend changes.

Env overrides (used by tests, handy for local experiments): `DB_PATH`, `GMAPS_JOBS_FILE`, `WA_AUTH_DIR`, `PORT`, `HOST`.
⚠ Port 3001 on the dev box is used by an unrelated app — run LeadDesk on another port (e.g. `PORT=3101`).
Native modules (`better-sqlite3`, `bcrypt`) must be built for the OS you run on (dev box is Alpine/musl).

## 4. Hard rules (all agents)

1. **Project scoping is mandatory.** Every query on a scoped table
   (`leads, campaigns, stages, tags, message_templates, broadcast_jobs, clients, email_campaigns, import_logs, audit_log, settings`)
   must filter by `req.project.id`, and every INSERT must set `project_id`.
   Lookups by id must be `WHERE id = ? AND project_id = ?` — otherwise one project can read/modify another's data.
   **Any id arriving in a request body/params** (stage_id, tag_ids, leadIds, …) must be checked with
   `ownedIds()` / `isOwned()` from `server/lib/scope.js`. LeadDesk is used in **agency mode** (one install,
   many client businesses) so a leak between workspaces is a P0 bug.
2. **New project-scoped routers** are mounted in `server/index.js` as `app.use('/api/x', resolveProject, xRouter)`
   (after the global `authMiddleware`), and **every route gets `requirePermission(...)`** (see ARCHITECTURE §1).
   New scoped tables must be added to `SCOPED` in `lib/scope.js`, to the cascade delete in
   `routes/projects.js`, and to export/restore in `lib/backup.js` (with id remapping).
3. **Schema changes = a new migration** in `server/migrations/NNN-name.js` (export `id` + `up(db)`), appended to
   `MIGRATIONS` in `server/migrations/index.js`. Runs once, inside a transaction, recorded in `schema_migrations`.
   Never edit a migration that is already committed; never drop/rename columns without a data migration.
   Test it on a copy of a real DB (`server/leaddesk.db.pre-multiproject-backup` is a real old-install schema).
4. **Always parameterised SQL** (`db.prepare('… ?').run(x)`). No string interpolation of user input
   (there is one legacy exception in `index.js` `/api/import/backup` — do not copy it).
5. **Call `logAudit(action, entityType, id, name, details, projectId)`** on create/edit/delete of user data.
5b. **Async route handlers must be wrapped** with `wrap()` from `server/lib/async.js` (Express 4 otherwise
   leaves the request hanging on a thrown error). SQL string literals use single quotes (`!= ''`) — this
   SQLite build rejects `""` as a string.
6. **Frontend talks to the server only via `client/src/api.js`.** Add a function there; never `fetch('/api/…')`
   in components (exceptions: auth bootstrap in `App.jsx`).
7. **Never commit or print secrets/data:** `server/*.db*`, `server/baileys_auth/**` (WhatsApp session keys),
   `server/gmaps/jobs_data.json`, `test.csv`, `.env`. Do not delete them either — they are the user's live data.
8. **Do not send real WhatsApp messages** or start broadcast jobs while testing unless the user explicitly asks.
   The WA account can get restricted/banned.
9. Keep the existing style: ESM imports, 2-space indent, no semicolons in client JSX / semicolons in server JS,
   Tailwind classes inline, `dark:` variants for every colour (dark mode is supported everywhere).
10. Don't commit/push unless the user asks. Coordinate through `.agents/` (next section).

## 5. Multi-agent coordination (summary)

Full protocol: **`.agents/PROTOCOL.md`**. The short version:

1. **On start:** read `AGENTS.md` → `.agents/ROADMAP.md` (skim) → `.agents/BOARD.md` → last ~40 lines of `.agents/LOG.md` → your role file in `.agents/roles/`.
2. **Claim** a task on the board (set owner + status `IN PROGRESS` + files you will touch) *before* editing code.
3. **Don't edit files** listed under another agent's `IN PROGRESS` task. Ask in the LOG instead.
4. **Talk** to other agents by appending messages to `.agents/LOG.md` (`@agent-name`, types: NOTE / QUESTION / ANSWER / HANDOFF / BLOCKED / DONE).
5. **On finish:** update the task status, write a `DONE` or `HANDOFF` entry with what changed, how you verified it, and what's left.
6. If you learn something every future agent needs to know, update `AGENTS.md` or `.agents/ARCHITECTURE.md` (keep them true).

Roles: `backend`, `frontend`, `integrations` (WhatsApp + scraper), `reviewer`, `lead` (planner/orchestrator).
See `.agents/roles/*.md`.

## 6. Quick manual verification

```bash
# login and keep the cookie
curl -s -c /tmp/ld.cookie -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' localhost:3001/api/auth/login
curl -s -b /tmp/ld.cookie localhost:3001/api/projects             # get a project id
curl -s -b /tmp/ld.cookie -H 'X-Project-Id: <id>' localhost:3001/api/stats
```

Test against a **copy** of the DB if you are doing destructive checks (the DB path is hard-coded to
`server/leaddesk.db`; back it up first: `cp server/leaddesk.db /tmp/leaddesk.bak.db`).
