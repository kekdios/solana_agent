# `workspace/memory`

Short-lived or reference notes for the agent and humans—not a source of truth for chain/state.

## Conventions

| Pattern | Use |
|--------|-----|
| `YYYY-MM-DD.md` | Day-scoped log (swaps, incidents, what worked). |
| `<topic>-notes.md` | Themed notes (e.g. `swap-notes.md`). |

## Rules

- Prefer **facts from tool output**; mark estimates and old PnL as **stale** unless re-verified.
- Remove or archive files that are empty, duplicate, or misleading after a few weeks (human judgment).
- Do not store secrets (keys, seeds); use env / Settings only.
