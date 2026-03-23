# Paths & layout (canonical)

Run **`node server.js`** from the **repository root** (the folder that contains `server.js`, `package.json`, `data/`, `workspace/`).

| What | Default location | Override |
|------|------------------|----------|
| **SQLite database** | `data/solagent.db` | `DB_PATH` env (absolute path to the file) |
| **Encryption key** | `data/.encryption-key` (same directory as the DB file’s parent) | Moves with `DB_PATH` |
| **Workspace** (markdown, skills, agent files) | `workspace/` | `WORKSPACE_DIR` in Settings (`.env`) or env |
| **Built web UI** | `dist-renderer/` (after `npm run build:renderer`) | Served by `server.js` at `/` |
| **Saved chat sessions** | `data/sessions/` | — |
| **Approved swap test dir** | `data/approved-swap/` (created by `scripts/run-approved-swap.js`; **gitignored**, may hold a throwaway DB) | — |
| **Cron / file tool storage** | `data/files/`, `data/memory/` (e.g. alerts) | — |

**Not** used for the current web workflow:

- **`~/Library/Application Support/solagent/`** — only relevant if you are migrating **from** the old Mac desktop app or still have a legacy copy. Scripts prefer **`./data/solagent.db`** when both exist.

Legacy product-site APIs are outside this runtime; use your local server URL (**http://127.0.0.1:3333** by default).

See also **`docs/MIGRATION_SINGLE_ROOT_WEBAPP.md`** and **`docs/MIGRATION_STAGES.md`**.

**Release:** The web UI labels this tree **V3** (see `package.json` version and sidebar footer). Canonical behavior for chat + workspace is described in the root **README.md** (section *Chat (V3) — tools and workspace files*).
