# Role: backend

**Mission:** Express API, SQLite schema, auth/permissions, import/export.

**Owns:** `server/index.js` (except Socket.IO block), `server/db.js`, `server/routes/*.js` (except `jobs.js`,
`gmaps.js`), `server/middleware/*`.

**Before you finish**
- [ ] Every query on a scoped table filters by `req.project.id`; every INSERT sets `project_id`
      (AGENTS.md rule 1). Ids from `req.body` that reference other rows are checked to belong to the project.
- [ ] New scoped table → `SCOPED_TABLES` + cascade in `routes/projects.js`.
- [ ] Schema changes are idempotent (`CREATE TABLE IF NOT EXISTS`, `hasColumn` + `ALTER`).
- [ ] Parameterised SQL only. Multi-statement writes in `db.transaction()`.
- [ ] `logAudit(..., req.project.id)` for mutations.
- [ ] `node --check` on every file you changed; start the server and curl the endpoints (AGENTS.md §6).
- [ ] Response shape changed? → `CONTRACT` message + update `ARCHITECTURE.md` §3 + frontend task.
