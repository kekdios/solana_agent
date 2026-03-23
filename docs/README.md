# Solana Agent — Documentation

**App release: V3** (`package.json` **3.0.1**; sidebar shows **V3** + semver + date). Stack: **Node `server.js`** + **React UI** (`dist-renderer/`) + **SQLite** `data/solagent.db`.

| Document | Description |
|----------|-------------|
| **PATHS.md** | Canonical paths: `data/solagent.db`, `workspace/`, `dist-renderer/`, env overrides, approved-swap test dir, legacy Application Support. |
| **MIGRATION_SINGLE_ROOT_WEBAPP.md** / **MIGRATION_STAGES.md** | Moving from desktop `userData` to repo-root `data/` + browser; staged checks. |
| **VENICE_API.md** | Venice chat provider (auth, endpoints, tools body, `venice_parameters`). |
| **WORKSPACE_FILE_HANDLING.md** | `tools/workspace.js`: security, path rules, symlink/size limits, server integration + HEARTBEAT read shortcut. |
| **QUICK_START.md** | Owner/operator quick start: keys, wallet, tiers, swaps, backups, V3 chat notes. |
| **SA_AGENT_TOKENS.md** | Native agent SPL send, canonical mints, treasury pool tools, Hyperliquid mids. |
| **TREASURY_POOL_TRADING.md** | SABTC/SAETH/SAUSD Whirlpool, `treasury_pool_swap`, `HEARTBEAT.md` peg checklist notes. |
| **agent-prediction-arena-plan.md** | Future design notes (agent-vs-agent arena; not shipped). |
| **Heartbeat** | **`workspace/HEARTBEAT.md`** + **`HEARTBEAT_INTERVAL_SECONDS`**. Cron **`heartbeat`** task ≠ model checklist. Server may return HEARTBEAT file content directly for explicit “content of heartbeat.md” questions—see root **README.md** (Chat V3). |

The main project README is in the repository root. Runtime behavior here is local-first (server + renderer in this workspace).
