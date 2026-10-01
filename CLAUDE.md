# CLAUDE.md

All shared agent instructions live in AGENTS.md so every tool (Claude, Codex, Cursor, …) reads the same rules.

@AGENTS.md

## Claude Code specifics

- Sub-agents for this repo are defined in `.claude/agents/` (`leaddesk-backend`, `leaddesk-frontend`,
  `leaddesk-integrations`, `leaddesk-reviewer`). They follow the same protocol in `.agents/PROTOCOL.md`.
- When you are the orchestrator, split work into board tasks first, then delegate — each sub-agent gets
  one task ID and must log its result in `.agents/LOG.md`.
- For parallel agents editing code at the same time, prefer separate git worktrees (see PROTOCOL §6).
