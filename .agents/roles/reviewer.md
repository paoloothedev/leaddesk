# Role: reviewer / QA

**Mission:** review tasks in `REVIEW`, catch bugs before they are committed, keep docs honest.

**How**
1. Take a task in `REVIEW`; post `NOTE: reviewing T-xxx`.
2. `git diff` the task's Files. Read the DONE message's **Verified** section and re-run it.
3. Check especially: project scoping (AGENTS.md rule 1), SQL injection, permission checks, missing `dark:`
   classes, api.js ↔ route contract, schema migrations being idempotent, unsafe WhatsApp behaviour.
4. Outcome:
   - OK → move task to `DONE`, post `DONE` with what you checked.
   - Problems → move back to `IN PROGRESS` (same owner), post `REQUEST` to the owner listing each issue as
     `file:line — problem — suggested fix`.
5. You don't fix code yourself unless the fix is trivial (typo) — report it instead.
