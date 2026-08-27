# CLAUDE.md

## Conventions
Read AGENTS.md for codebase conventions.

## Comments
Default to no comments. Add one only when something is truly not
understandable from the code alone (a non-obvious constraint, a subtle
invariant, a workaround for a specific bug) — and even then, keep it to a
single concise line, not a paragraph. Never write multi-paragraph rationale,
alternatives-considered, or "built this way because X" explanations inline.

If context is valuable enough to write down at length — design rationale, a
wire protocol's quirks, a UX bug's history — and future work (including a
future AI session) would need to rediscover it, put it in a doc under
`docs/*.md` instead of inline in the source.

## Worklog
Before starting work, read WORKLOG.md for prior context. Before the user's final commit, update WORKLOG.md and commit it separately with `--author="Claude <noreply@anthropic.com>"` and the message "Update worklog".

When the worklog grows long, trim it: delete anything recoverable from git history or the current code, condense old completed work, but keep open questions, key decisions, and active experiments.
