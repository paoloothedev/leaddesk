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
