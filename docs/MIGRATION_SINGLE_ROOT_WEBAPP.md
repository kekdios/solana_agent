# Migration plan: Electron → single-root / web-style deployment

This document is for moving from the **two-root** Electron layout (app bundle + `~/Library/Application Support/solagent/`) to **one tree** you control (e.g. repo + `data/` on a server or laptop), with a **browser UI** talking to the same Node `server.js` — the same model as **Solana Agent V3** today.

---

## Goals

- **One root** for “the thing I care about”: code + `data/` + (optionally) `workspace/` under the same project directory.
- **Builders** can still use GitHub clone + build; this is about **how you run it**, not changing that story.
- **Recover Settings / secrets** from the existing app without re-entering everything—**use the database**, not a giant `.env` export.

---

## What to recover from Application Support (macOS)

| Item | Typical path | Required? |
|------|----------------|-----------|
| **SQLite database** | `~/Library/Application Support/solagent/data/solagent.db` | **Yes** — holds encrypted `config` rows, conversations, swap intents, sessions metadata, etc. |
| **Encryption key file** | `~/Library/Application Support/solagent/data/.encryption-key` | **Yes** — **without this file, config values in the DB cannot be decrypted.** Same directory as the DB’s parent folder (see below). |

**Treat `solagent.db` + `.encryption-key` as a single unit.** Copy both into your new `data/` directory together.

Optional (only if you want old chat transcripts and history in DB):

- Nothing extra—the DB already contains `conversations` / `messages` if you used chat in the Electron app.

Optional (separate from DB):

- **`workspace/`** under Application Support — only if you want the **files** the agent edited (SOUL, HEARTBEAT, memory, etc.). Not required for **config**; config lives in the DB `config` table.

You said you only care about recovering config: **DB + `.encryption-key` is enough** for that.

---

## Config: keep using the DB or move everything to `.env`?

**Keep using the database.** You do **not** need to import all Settings into `.env`.

In this codebase, **`loadConfigKey()` reads the `config` table in `solagent.db` first** (values are stored encrypted). Some call sites pass an **optional** `process.env` fallback for specific keys (e.g. token mint overrides), but **the product’s Settings UI and API keys are designed around the DB**, not a flat `.env` mirror.

**Using `.env` instead** would mean:

- Duplicating dozens of keys by hand.
- Losing the Settings UI model unless you reimplement it.
- Splitting “truth” between DB and env (error-prone).

**Recommended:** After migration, continue to manage secrets and toggles **via the same DB** (Settings in the web UI, or direct DB tooling if you must). Use **`.env` only for deployment plumbing**, for example:

- `DB_PATH` — absolute path to `solagent.db` (optional; default is `./data/solagent.db` relative to the server).
- `PORT` / `HOST` — how the HTTP server binds.
- `WORKSPACE_DIR` / `DATA_DIR` — if you want explicit single-root paths.

Those env vars are **host-level** and part of the current settings model (`.env` + `data/app-settings.json`).

---

## Target folder layout (example)

```text
your-agent-root/
  server.js
  db.js
  …
  data/
    solagent.db              ← copied from Application Support
    .encryption-key          ← copied alongside (same folder)
  workspace/                 ← optional: repo default or your copy
```

Point the process at this tree:

- Either rely on defaults (`data/solagent.db` under the repo), **or**
- Set `DB_PATH=/absolute/path/to/your-agent-root/data/solagent.db` so the server finds the file you migrated.

The encryption key path is derived as **`dirname(DB_PATH)/.encryption-key`**, so the key file must live in **`data/`** next to `solagent.db`.

---

## Migration checklist

1. **Stop** the Electron app (avoid writing to the DB while copying).
2. Copy **`solagent.db`** to `your-agent-root/data/solagent.db`.
3. Copy **`.encryption-key`** to `your-agent-root/data/.encryption-key` (same directory as the DB file’s parent).
4. Set permissions on `.encryption-key` restrictive (e.g. `600`) on Unix.
5. Start **only** the Node HTTP server (or your future container) with `DB_PATH` set if the DB is not at `./data/solagent.db`.
6. Open the **web UI** against that server; open **Settings** and confirm API keys / RPC / swap toggles still load (proves decrypt + DB path are correct).
7. **New chat** recommended for sanity (optional: keep old conversations—they’re in the same DB).

---

## Verification

- **Settings load** without re-entering keys → DB + key path correct.
- **`get_swap_settings`** (or equivalent) returns sensible values → config rows readable.
- If everything reads empty or defaults: wrong **`DB_PATH`**, missing **`.encryption-key`**, or key file from a **different** machine/install (then decrypt fails silently for some paths—treat as mis-paired DB+key).

---

## Pitfalls

| Problem | Cause |
|--------|--------|
| Config “gone” or API key empty | Only copied `solagent.db`, not **`.encryption-key`**, or key not in **`data/`** next to that DB. |
| Two databases | Electron userData DB vs repo `./data/solagent.db`—server uses **one**; `DB_PATH` must be explicit if you have both. |
| “Portable app” confusion | The `.app` bundle does not include user data; portability of **state** = copy **`data/`** (DB + key), not only the app. |

---

## Relationship to a future “just webapp” setup

- **Backend:** Same `server.js` + `db.js`; single process, one `data/` directory.
- **Frontend:** Static build served by the same server or a reverse proxy; no `userData` split.
- **Config source of truth:** Remains **`solagent.db` `config` table** + **`.encryption-key`** unless you intentionally redesign storage later.

This migration doc stops at **recovering config via the DB**; wiring TLS, auth, and public deployment is a separate hardening step.

---

## After files are in place: staged testing

Follow **`docs/MIGRATION_STAGES.md`** for ordered steps (filesystem → Node server → built UI → chat → Solana tools) and run:

```bash
npm run migrate:check
```

With the server running:

```bash
MIGRATION_CHECK_URL=http://127.0.0.1:3333 npm run migrate:check
```
