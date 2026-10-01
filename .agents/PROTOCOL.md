# Multi-agent protocol

How several agents (possibly different tools/models, possibly at the same time) work on LeadDesk without
stepping on each other, and how they talk to each other.

Everything is **plain files in git** so any agent that can read/write files can take part:

| File | Purpose | Who writes |
|---|---|---|
| `AGENTS.md` | Project rules every agent must follow | anyone (keep it short and true) |
| `.agents/ARCHITECTURE.md` | Deep technical reference | anyone who changes the architecture |
| `.agents/BOARD.md` | Task board — the single source of truth for *who is doing what* | anyone |
| `.agents/LOG.md` | Append-only message channel between agents (and the human) | anyone, append only |
| `.agents/roles/*.md` | Role cards: scope, owned files, checklists | lead / human |
| `.agents/handoffs/<TASK-ID>.md` | Optional long handoff notes for big tasks | task owner |

---

## 1. Identity

Pick a name when you start and use it everywhere: `<role>-<short-id>`, e.g. `backend-a1`, `frontend-claude`,
`reviewer-codex`. The human user is `@human`.

## 2. Session lifecycle

**Start (always, in this order)**
1. Read `AGENTS.md`.
2. Read `.agents/BOARD.md`.
3. Read the last ~40 lines of `.agents/LOG.md`; answer anything addressed to you or your role (`@backend`, `@all`).
4. Read your role card in `.agents/roles/`.
5. `git status` — note uncommitted work that isn't yours; never revert it.

**Work**
6. Claim a task (§3) *before* editing code. If the human gave you work that isn't on the board, add it first.
7. Only edit files in your task's **Files** list. Need another file? Update the list; if it is claimed by
   someone else, ask them in the LOG (§4) and wait / pick something else.
8. Keep the claim fresh: update `Updated:` on the task whenever you post progress. A claim with no update for
   **2 hours** is stale — another agent may take it over after posting a `NOTE` in the LOG.

**Finish**
9. Verify (see your role card + `AGENTS.md` §3/§6). Write down *how* you verified.
10. Move the task to `REVIEW` (code changes) or `DONE` (docs/trivial), post a `DONE` or `HANDOFF` message.
11. If you learned something future agents need, update `AGENTS.md` / `ARCHITECTURE.md`.

## 3. Board format (`.agents/BOARD.md`)

```markdown
### T-012 · Short imperative title
- Status: TODO | IN PROGRESS | BLOCKED | REVIEW | DONE
- Owner: backend-a1            (— when unclaimed)
- Role: backend | frontend | integrations | reviewer | lead
- Priority: P0 | P1 | P2
- Files: server/routes/tags.js, client/src/api.js
- Depends on: T-010            (optional)
- Updated: 2026-10-01 14:20
- Notes: one or two lines; long context → handoffs/T-012.md
```

Rules:
- IDs are sequential; take the next free number (`grep -o 'T-[0-9]*' .agents/BOARD.md | sort -V | tail -1`).
- Tasks live under the section matching their status; move the block when status changes.
- Never delete tasks; `DONE` ones can be moved to the Archive section.
- Only the owner changes a task's status — except the reviewer (REVIEW → DONE / back to IN PROGRESS) and
  stale-claim takeovers.

## 4. Messages (`.agents/LOG.md`)

Append at the **bottom**. Never edit or delete other agents' entries.

```markdown
---
**2026-10-01 14:32 · backend-a1 → @frontend** · `T-012` · QUESTION
Tags API now returns `lead_count` as number, was string. Does TagsView rely on string concat anywhere?
```

Header fields: timestamp (local, `YYYY-MM-DD HH:MM`) · sender → recipient(s) (`@agent-name`, `@role`, `@all`,
`@human`) · task ID (or `-`) · type.

| Type | Use it when | Expected reply |
|---|---|---|
| `NOTE` | FYI, no action needed | none |
| `QUESTION` | you need info/decision from someone | `ANSWER` referencing the same task |
| `ANSWER` | replying to a QUESTION | — |
| `REQUEST` | asking another role to do work (also add a board task, and link it) | claim / ANSWER |
| `HANDOFF` | stopping mid-task; someone else continues | next owner posts `NOTE` when they pick it up |
| `BLOCKED` | you can't continue; say on what/whom | unblocker replies |
| `DONE` | task finished; include **Changed**, **Verified**, **Follow-ups** | reviewer picks up |
| `CONTRACT` | you changed an interface other roles depend on (API shape, socket event, DB column) | consumers ack with `NOTE` |

A `DONE` / `HANDOFF` message must contain:
```markdown
- Changed: files + one line each
- Verified: commands run / what you clicked / results
- Follow-ups: new task IDs or "none"
- Gotchas: anything surprising (optional)
```

Questions for the human go to `@human`. If the answer blocks you, set the task to `BLOCKED` and move on.

## 5. Contracts between roles

The boundary between backend and frontend is **`client/src/api.js` ↔ server routes**. Whoever changes an
endpoint's path, params, or response shape must:
1. update both sides in the same task **or** post a `CONTRACT` message + create a task for the other role,
2. update the API map in `ARCHITECTURE.md` §3.

The same applies to Socket.IO events (`index.js` ↔ `WhatsAppPage.jsx`) and DB schema (`db.js`).

## 6. Running agents in parallel

- **Different files → same checkout is OK.** The board's Files list is the lock.
- **Overlapping files or big refactors → use a git worktree per agent**:
  ```bash
  git worktree add ../leaddesk-T-012 -b agent/T-012
  # work there, then the lead/human merges agent/T-012 into main
  ```
  `.agents/` lives in git, so in a worktree always write board/log updates **in the main checkout**
  (`/home/admin/projects/leaddesk/.agents/`) so everyone sees them live.
- Only one agent runs the dev server at a time (ports 3001/5173). Say so in the LOG (`NOTE: dev server up`).
- The SQLite DB and WhatsApp session are shared, live data — see `AGENTS.md` rules 7–8.

## 7. Orchestration (lead role)

The lead (or the human) breaks a goal into board tasks with clear **Files** lists that don't overlap,
sets `Depends on`, then assigns / spawns one agent per task. In Claude Code, sub-agents are in
`.claude/agents/`; pass each one exactly one task ID, e.g.:

> "You are leaddesk-backend. Take task T-012 from .agents/BOARD.md and follow .agents/PROTOCOL.md."

After agents finish, the lead reads the LOG, sends REVIEW tasks to the reviewer, and merges.
