# Self-Contained Agent App — Plan (Mac + Solana)

**Scope:** How to build a single agent app (Solana Agent) that runs on **Mac (Electron)** with a **Solana** wallet and DeFi tooling. No code in this doc — architecture and rollout only.

**Current state:** The app has **Chat** and **Wallet** views only (sidebar). **Exec (sandbox)** is available: the agent can run shell commands in the workspace (create programs with workspace_write, then exec). No Monitor/Lending or Perps strategy pages or parameter tools in the UI or agent; those can be re-added later per separate plans (e.g. `docs/PERPS_TRADING_ENGINE_PLAN.md`).

**Reference:** The Solana Agent stack: Node HTTP server (`server.js`), SQLite (`db.js`), tools (browse, files, workspace, **exec** (sandbox), doc_*, **Solana** wallet and DeFi, Jupiter, Drift, Kamino, etc.), and a React + Tailwind chat UI. The app uses a **Solana** keypair (not EVM) for agent signing; wallet is stored encrypted in the config table.

---

## 1. What “Self-Contained” Means

| Aspect | Meaning |
|--------|---------|
| **Mac** | One .app: user double-clicks, gets chat. Backend runs locally inside the app (in-process Node server). Data (DB, workspace, config) under user data dir. |
| **Wallet** | One Solana keypair: generated if missing, stored encrypted in the config table. User can view public/private and passphrase backup via Settings. |

So: **desktop = local backend + local UI + local Solana wallet in config**.

---

## 2. Shared Core (One Codebase)

Keep a single backend and a single frontend:

- **Backend:** Node server: `server.js`, `db.js`, `config/tools.yaml`, all under `tools/`, `workspace/` (SOUL.md, AGENTS.md, skills). Dependencies include `better-sqlite3`, `@solana/web3.js`, `js-yaml`, `node-cron`, etc. **Config table** in SQLite stores encrypted secrets (e.g. `INCEPTION_API_KEY`, Solana keypair). API surface unchanged; only packaging and env (e.g. `PORT`, data paths) differ.
- **Frontend:** React + Tailwind chat UI; same chat, sidebar, slash commands, Settings (gear). It talks to the API via relative URLs.
- **Data:** SQLite DB path and workspace path configurable (env or args). **Electron:** use app user-data directory (e.g. `app.getPath('userData')/data/solagent.db`, `.../workspace`, config table in same DB).

Design rule: **no forking the server or UI.** Solana keypair is the agent wallet; stored in config, not in .env only.

---

## 3. Mac (Electron) — Self-Contained Desktop

**Previous state (before in-process server):** Electron could open a `BrowserWindow` to a remote URL. The app now runs the server in-process by default and loads chat at http://127.0.0.1:3333.

**Target:** User runs the app → backend starts automatically → window shows chat at `http://127.0.0.1:3333` (or next free port). Data and workspace live in macOS user data (e.g. `~/Library/Application Support/solagent/`).

**Plan:**

1. **Bundle the Node backend with the app**
   - In `electron-builder` `files`, include: `server.js`, `db.js`, `sessionStore.js`, `config/`, `tools/`, `workspace/` (template), and a minimal `node_modules` (or a single bundled Node binary). Exclude dev-only and Electron’s own deps from the server bundle.
   - Resolve paths at runtime from `process.resourcesPath` (or equivalent) so the main process knows where server and workspace live.

2. **Implement “local server” mode in the main process**
   - On `app.whenReady()`: set `userData`-based paths for DB and workspace via env, then **load the Node server in-process** (dynamic `import` of `server.js`) so it listens on `PORT=3333` (or dynamic port). No separate `node` process; server runs inside Electron main.
   - `BrowserWindow` loads `http://127.0.0.1:PORT`. On app quit, close the server gracefully.

3. **Secrets and env**
   - API key: user must set it somewhere. Options: (a) first-run wizard in the UI that calls a “set API key” API, server writes to a file under userData; (b) env/file read by the spawned Node process (e.g. `userData/.env`). No key in the packaged app.

4. **Build**
   - Keep `electron-builder` with `mac` target(s): `dir` and optionally `dmg`/`zip`. Icon and app id already in place. After build, the .app contains the server and runs it when the app starts.

**Deliverable:** One Mac .app; double-click → agent chat with local backend and local data.

---

## 4. Solana Wallet (Keypair) and Config

**Context:** The agent uses a **Solana** keypair for DeFi (Drift, Kamino, Raydium, prediction tools), not an EVM wallet. The keypair is the single in-app wallet used for signing.

**Target:**

- App **detects** whether a Solana keypair exists (config table or env).
- If **not present**, the app **generates** a new keypair.
- **Public key** and **private key** are stored **encrypted** in the existing **config** table (same encryption as `INCEPTION_API_KEY`).
- User can open **Settings** (gear icon) to view public key, private key, and passphrase/backup info.
- **Passphrase:** The private key is encrypted (e.g. with app storage key or a user-chosen passphrase). If the user is given a **one-time passphrase** (or backup phrase) at creation, they must be prompted to **write it down**.
- **Acknowledgment:** Show a prompt asking the user to confirm they have written down the passphrase. Once they acknowledge, set an **indicator in config** (e.g. `PASSPHRASE_BACKUP_ACKNOWLEDGED`) so the app **stops showing** that notification on future launches.

**Plan:**

1. **Detection and generation**
   - On startup (or first use of Solana tools): check config table for stored keypair; else check env (`SOLANA_PRIVATE_KEY` / `SOLANA_KEYPAIR_PATH`). If none, generate a new keypair (e.g. `Keypair.generate()`), encrypt and store in config.

2. **Storage**
   - Reuse the same config table and encryption (AES-256-GCM, key file next to DB). Store encrypted entries for public key and private key (and any backup-passphrase blob if applicable). Do **not** store the user’s passphrase in plain form; use it only to derive encryption key or to unlock once, then discard.

3. **Settings UX**
   - In Settings: show **public key** (safe to show). For **private key**: reveal on demand (e.g. “Show” button) with copy. For **passphrase**: if it’s a one-time backup phrase shown at creation, do not store it; show it only once at creation and rely on the acknowledgment flow. Optionally show “Passphrase: set at creation (not stored)” in Settings.

4. **Passphrase acknowledgment**
   - After first keypair generation (or first run with a generated key), show a modal/prompt: “Write down your passphrase in a safe place. You will need it to recover this wallet.” Require an explicit “I have written it down” (or similar) before continuing. On confirm, set config flag `PASSPHRASE_BACKUP_ACKNOWLEDGED` (or equivalent). On subsequent launches, if that flag is set, do not show the prompt.

5. **DeFi tools**
   - All Solana tools (Drift, Kamino, Raydium, prediction) use the keypair loaded from config (decrypted at runtime). Single keypair is sufficient for MVP; multi-wallet rotation can be a later extension.

**Deliverable:** Solana keypair lifecycle (detect → generate if missing → store encrypted in config), Settings access to keys, and one-time passphrase backup prompt with acknowledgment stored in config to turn off the notification.

---

## 5. Order of Work and Dependencies

Suggested sequence (planning only):

1. **Shared core**
   - Ensure server and UI work with configurable DB path, workspace path, and port. Config table with encrypted secrets (e.g. API key) already in place.

2. **Electron local mode (Mac)**
   - Backend runs in-process (Method 2). One .app that runs fully offline after API key and (if needed) Solana keypair are set.

3. **Solana keypair and config**
   - Detect/generate keypair; store public and private key encrypted in config; Settings UX for viewing keys; passphrase backup prompt with acknowledgment flag in config.

4. **DeFi tooling**
   - Drift, Kamino, Raydium, prediction tools use the keypair from config. Single keypair for MVP.

---

## 6. Summary Table

| Aspect       | Backend runs           | UI runs                | Data / secrets                          |
|-------------|------------------------|------------------------|------------------------------------------|
| **Mac**     | In-process Node (Electron main) | Electron BrowserWindow (React) | userData (data/solagent.db, workspace, .env, config) |
| **Solana wallet** | —                      | Settings (gear)        | Config table: encrypted public key, private key; flag for passphrase acknowledgment |

**Single codebase:** one server, one frontend. Solana keypair is the agent’s signing wallet; no EVM wallet required for core agent/DeFi flows. No coding in this doc — use this as the roadmap for implementation.
