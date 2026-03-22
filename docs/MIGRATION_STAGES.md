# Web migration — stages & testing (no Electron)

Targets the current **Solana Agent V3** layout (Node + browser UI + `data/solagent.db`). Work through these in order. **Stop and fix** if any stage test fails before continuing.

**Assumptions**

- Project root = repo root (e.g. `.../agent`).
- `data/solagent.db` + `data/.encryption-key` are already in place (paired).
- You run commands from project root unless noted.

---

## Stage 1 — Filesystem & database

**Goal:** One tree; DB and key discoverable; workspace present.

**Do**

- Confirm `data/solagent.db` and `data/.encryption-key` exist (same folder).
- Confirm `workspace/` has your markdown/skills (e.g. `AGENTS.md`, `skills/solana/SKILLS.md` if you use them).

**Test**

```bash
npm run migrate:check
```

Expect: `STAGE 1: OK` (and config row count > 0 if you migrated from Electron).

`migrate:check` uses the **`sqlite3` CLI** for row counts when available (avoids `better-sqlite3` native rebuild issues). If you have neither CLI nor a working native module, install SQLite CLI (`brew install sqlite` on macOS) or run `npm rebuild better-sqlite3`.

**Optional**

```bash
sqlite3 data/solagent.db "SELECT COUNT(*) FROM config;"
```

---

## Stage 2 — API server (Node only)

**Goal:** `server.js` binds and answers HTTP using **this** `data/`.

**Do**

- Do **not** set `DB_PATH` unless the DB is not at `./data/solagent.db`.
- Optional: `PORT=3333` (default comes from config DB or 3333).

```bash
node server.js
```

Leave it running in a terminal.

**Test** (second terminal)

```bash
curl -sS http://127.0.0.1:3333/api/help | head -c 200
curl -sS http://127.0.0.1:3333/api/config | head -c 400
```

Expect: JSON from both (not HTML error page). `/api/config` should show `securityTier`, `swapsPolicy`, masked keys if configured.

**Automated**

1. **Terminal A:** start the server and note the printed URL (port comes from **config DB `PORT`**, then `process.env.PORT`, else **3333**):

   ```bash
   node server.js
   ```

   Example log: `Solana Agent: http://localhost:3333` or another port.

2. **Terminal B:** use **that** port:

   ```bash
   MIGRATION_CHECK_URL=http://127.0.0.1:3333 npm run migrate:check
   ```

If you see `fetch failed` / `ECONNREFUSED`, the server is **not** running on that host/port, or **`PORT` in your DB** is not `3333` (use the URL from Terminal A).

**Then**

- Ctrl+C the server when done.

**Also run**

```bash
npm run test:in-process-server
```

Uses an **isolated** test DB under `data/test-in-process/` (does not touch your real DB).

---

## Stage 3 — Static UI (built renderer)

**Goal:** Browser loads the React app from the **same** origin as `/api/*` (no Electron).

**Do**

```bash
npm run build:renderer
node server.js
```

**Test**

- Open `http://127.0.0.1:3333/` (or your `PORT`).
- Expect: app shell loads (not 404).
- Open **Settings**: values should match migrated DB (RPC, tier, swap toggles, key “connected” states).

**Automated (partial)**

```bash
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3333/
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3333/assets/index-*.js 2>/dev/null || true
```

Expect first line `200` for `/`. (Exact asset URL may vary; check Network tab if needed.)

---

## Stage 4 — Chat round-trip

**Goal:** LLM backend + tool loop against local server.

**Prerequisites:** Valid chat API key in Settings (Inception / Venice / NanoGPT per `CHAT_BACKEND`).

**Do**

- In the web UI: new chat, short message (“reply ping”).

**Test**

- Assistant reply appears.
- No 500 in terminal logs.

**Optional**

```bash
curl -sS -X POST http://127.0.0.1:3333/api/chat/test -H "Content-Type: application/json" -d '{}'
```

(Adjust if your server exposes a different smoke route; use UI if unsure.)

---

## Stage 5 — Solana tools (read-only first)

**Goal:** RPC + wallet from DB still work.

**Do**

- In chat: ask for `solana_address` / balance, or run a script if you prefer.

**Test**

```bash
# If .env has RPC + key for scripts:
node scripts/run-agent-solana-balance.mjs
```

Or use chat: **`solana_balance`** / **`solana_token_balance`** with `token_symbol` SABTC.

Expect: real data, no “wallet not configured” if Electron had it working before migration.

---

## Stage 6 — Treasury dry-run (optional)

**Goal:** Orca path without broadcast.

**Test**

```bash
node scripts/run-agent-treasury-swap.mjs
```

Expect: `dry_run: true`, `ok: true` or a clear RPC/pool error (not policy fiction).

---

## Quick reference

| Stage | Command / action |
|-------|-------------------|
| 1 | `npm run migrate:check` |
| 2 | `node server.js` + `curl /api/help` + `npm run test:in-process-server` |
| 3 | `npm run build:renderer` + browser to `/` |
| 4 | Chat ping in UI |
| 5 | Balance tool or `run-agent-solana-balance.mjs` |
| 6 | `run-agent-treasury-swap.mjs` (dry) |

---

## Troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| `better-sqlite3` / `NODE_MODULE_VERSION` / `ERR_DLOPEN_FAILED` | Native module built for a **different Node** than the one running `node server.js`. Fix: `npm rebuild better-sqlite3` (from project root). After any Node upgrade, rebuild again. |
| Empty Settings | Wrong `cwd` or `DB_PATH`; server using another `data/` |
| `migrate:check` STAGE 1 fails | Missing `data/solagent.db` or `.encryption-key` |
| `/api/config` 403 on POST | Normal from non-localhost; UI must be same host or use localhost |
| UI 404 | `npm run build:renderer` not run; `dist-renderer/` missing |

See also **`docs/MIGRATION_SINGLE_ROOT_WEBAPP.md`** for DB + key pairing.
