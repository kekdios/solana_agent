# Solana Agent

Self-contained Mac Electron app with Solana trading tools (balance, transfer, **native SABTC/SAETH/SAUSD** via **`solana_agent_token_send`** + canonical mints for **`solana_token_balance`**, Jupiter price/quote, Drift perps, Kamino/Raydium/Bet stubs), workspace file tools, and a **sandbox** to create and run programs (exec). React + Tailwind chat UI. Chat can use **NanoGPT** (Grok 4 Fast — default), **Inception** (mercury-2), or **Venice** (venice-uncensored). Choose the provider and set the API key in **Settings**; optional env: `NANOGPT_API_KEY`, `INCEPTION_API_KEY`, `VENICE_ADMIN_KEY`, `CHAT_BACKEND=nanogpt|inception|venice`. Wallet and DeFi tools use the app’s Solana keypair only.

This is a **desktop-only** app: it runs locally (Electron or `node server.js`). There are no server/deploy scripts in this repository.

A dedicated website for Solana Agent is at **https://solanaagent.app**.

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (comes with Node)

## Setup

1. Clone the repository (or download and extract), then install dependencies:
   ```bash
   cd agent
   npm install
   ```

2. **Configure in Settings (gear icon):** Set your **NanoGPT API key** (default chat provider), and optionally Inception/Venice keys and **JUPITER_API_KEY** for swaps. All keys are stored encrypted in the **config table** (solagent.db). Wallet and **SOLANA_RPC_URL** can be set or imported under Settings → Solana Wallet and Settings → Environment.  
   **The app does not use a `.env` file** — config is from the config table (Settings) only. `.env` is not read or used and will be deleted when the app is shipped. See **TOOLS.md**.

3. Run the server:
   ```bash
   ./run.sh
   ```
   Or: `node server.js`

4. Open http://localhost:3333

**Electron app (desktop):** Run `npm run electron`. By default the app runs the HTTP server **in-process** (inside the Electron main process) and loads the chat at http://127.0.0.1:3333 (data under `~/Library/Application Support/solagent/`). No separate Node.js install is required for the packaged app. To open a **remote** URL instead, set `DLLM_REMOTE_URL` and `DLLM_USE_LOCAL=0`. To use the **React dev UI** (Vite), run `npm run dev:renderer` and `npm run start` in two terminals, then `ELECTRON_LOAD_VITE=1 npm run electron`. To build a **macOS app**: run `npm run build`, then open `dist/mac-arm64/Solana Agent.app`. No code-signing by default (first launch may require right‑click → Open). Auto-update uses `electron-updater` when packaged and `publish` is configured.

**API key in the packaged app:** Set your chat and Jupiter keys in **Settings** (stored in the config table). The app does not use `.env`; config is from the config table only.

**"Server failed to start" in the built app:** The server runs inside Electron (Method 2). If it fails, the error screen shows the **Error** and **Stack** (e.g. missing dependency or bad path). Ensure you run the app via the Electron binary (e.g. double‑click the .app or `npm run electron`), not with `node electron-main.cjs`.

**Electron app icon (macOS):** The icon you see in the Dock and in Applications is set at build time. Put your icon file at `build/icon.icns` (macOS icon set), then run `npm run build`. If you only have a PNG, use a 512×512 or 1024×1024 image and convert it to `.icns` (e.g. with `iconutil`, or an online tool), or temporarily set `"icon": "build/icon.png"` under `build.mac` in `package.json` and place `build/icon.png` (512×512 minimum). After changing the icon, rebuild with `npm run build`.

All chats and **all configuration** are stored in a single SQLite database, **solagent.db**. The **config table** is the sole source of truth: API keys (NanoGPT, Inception, Venice, Jupiter), chat provider (CHAT_BACKEND), Solana wallet (public/private key), and env-style variables (PORT, HOST, SOLANA_RPC_URL, etc.) are set via **Settings** and stored there; API keys and wallet private keys are **encrypted**. **The app does not use `.env`** — it is not read or used; it will be deleted when the app is shipped. **Note:** `DB_PATH` and `ENV_PATH` are not stored in config (they are set by the process or by Electron when needed).

**Where is solagent.db?**  
- **When you run `node server.js`** from the project root: the DB is created at **`data/solagent.db`** on first run (the `data/` folder is created if needed). You’ll see it there after starting the server once.  
- **When you run the Electron app** (e.g. `npm run electron` or the built .app): the DB lives in the app’s **user data** directory, not in the project. See **Finding the app data folder** below for how to locate it on your machine.

**Finding the app data folder (Electron)**  
When you run the Electron app, all writable data (solagent.db, workspace, sessions, files) lives in a **user data** folder named **solagent** (from `"name": "solagent"` in package.json).

- **macOS:** Open Finder → **Go → Go to Folder** (⇧⌘G), then enter:
  ```text
  ~/Library/Application Support
  ```
  Look for a folder named **`solagent`** (from `"name": "solagent"` in package.json). Your DB is inside that folder at **`data/solagent.db`**.  
  **Terminal:** To see exactly where the DB is on your machine:
  ```bash
  ls -la ~/Library/Application\ Support/solagent/data/solagent.db
  ```
  Inside **solagent/** you’ll find **data/** (containing **solagent.db**, **.encryption-key**, **sessions/**, **files/**, **memory/**) and **workspace/**.

- **Windows:** The user data folder is **`%APPDATA%\solagent\`**. In File Explorer, paste `%APPDATA%` in the address bar, then open **solagent**; **data/solagent.db** is inside.

**Token usage** is recorded in the same DB: each chat completion writes one row to `token_usage`. Query usage via `GET /api/usage?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&conversation_id=N&limit=100` (returns `rows` and `summary`).

**Workspace:** The `workspace/` folder holds persona and rules the model sees on the first message of each conversation (when the server injects workspace context): **`SOUL.md`**, **`AGENTS.md`**, **`tools.md`**, and **`skills/clawstr/SKILLS.md`** (posting on **solanaagent.app**—**out of the box** with the default workspace). Edit these to change identity, behavior, and tool reminders. The model can also CRUD files in `workspace/` via tools: `workspace_read`, `workspace_write`, `workspace_delete`, `workspace_list`, `workspace_tree` (paths relative to workspace). The **exec** tool runs shell commands in the workspace (sandbox). **Skills** (MCP-like): structured docs under `workspace/skills/*/SKILLS.md` (e.g. `skills/solana/SKILLS.md`, `skills/solana_swaps/SKILLS.md`). Tables: `conversations`, `messages` (conversation_id, role, content, created_at).

**Confirming agent-created memory files:** When the agent says it wrote to `memory/YYYY-MM-DD.md` or `MEMORY.md`, that path is **inside the workspace**. To verify the file exists:
- **Running from project** (`node server.js` or `./run.sh`): workspace is `agent/workspace/`. Check `agent/workspace/memory/2026-03-18.md` (create the `memory/` folder if the agent just created it).
- **Electron app** (packaged .app or `npm run electron`): workspace is inside the app's user data folder. On macOS: `~/Library/Application Support/solagent/workspace/`. So daily memory is at `~/Library/Application Support/solagent/workspace/memory/2026-03-18.md`, and long-term memory at `~/Library/Application Support/solagent/workspace/MEMORY.md`. In Terminal: `ls -la ~/Library/Application\ Support/solagent/workspace/memory/` to list daily files.
If the file is missing, the agent may have described the write without actually calling `workspace_write`; ask it to "write that to memory/2026-03-18.md now" and check again.

**Testing:** From the project root:
- `node scripts/test-exec-sandbox.js` — exec/sandbox test suite (temp workspace, echo, cwd, workdir, timeout).
- `npm run test:in-process-server` — starts the server in-process and checks `/api/help` (uses a temp data dir, then removes it).
- `npm run test:clawstr` — smoke test: live `POST …/bulletin/payment-intent`, GET Clawstr/bulletin read APIs on solanaagent.app, and (when SQLite native loads) local `/api/help` includes bulletin + read tools (see `scripts/test-clawstr-e2e.js`).
- `node scripts/test-solana-tools.js` — runs Solana tool handlers (requires wallet in config or, for testing only, `SOLANA_PRIVATE_KEY` in .env; transfer test sends 0.001 SOL to a test address).
- `npm run test:agent-token-send` — live **`solana_agent_token_send`** smoke test (uses **`TEST_PRIV_KEY`** from repo `.env` if set). See **`docs/SA_AGENT_TOKENS.md`**.

**Settings (gear icon):** Choose **Chat provider** (NanoGPT default, Inception, or Venice) and set **NanoGPT API key**, **Inception API key**, and/or **Venice API key** (stored encrypted). Manage **Solana wallet** (view/copy public key, reveal private key, generate wallet, passphrase backup). **Environment** — set PORT, HOST, SOLANA_RPC_URL, etc. in the config table (PORT/HOST apply after restart). **Clear all conversation history** — removes all chats, messages, token usage, and saved sessions; confirm before running.

**Making swaps work (checklist):**

1. **Settings → API keys:** Set **JUPITER_API_KEY** (required for Jupiter quote/swap API).
2. **Settings → Solana Wallet:** Create or import a wallet and fund it with SOL.
3. **Settings → Security tier:** Set to **Tier 4** (required for swap tools; Tier 1–3 block execution).
4. **Settings → Swaps (Jupiter):**
   - Turn **Enable swaps** ON (otherwise "Swaps are disabled" when you ask for a swap).
   - To **broadcast** real swaps: turn **Execution** ON and **Dry-run** OFF. Keep Dry-run ON to test without sending transactions.
   - Optionally set **Max slippage (bps)** (e.g. 200 = 2% max) and save swap policy.

In chat: ask e.g. "swap $5 SOL to USDC". The agent will prepare an intent; use the **Execute** button in the swap card (or reply "confirm swap &lt;intent_id&gt;") to confirm and broadcast. If you see "Not found" on confirm, start a **New chat** so old intents are cleared, then ask for a fresh swap.

**Clawstr (solanaagent.app):** The agent can call **`bulletin_post`** to pay (~0.01 SOL + fees) from the app wallet and publish in one step. **Read-only** APIs: **`clawstr_health`**, **`clawstr_feed`**, **`clawstr_communities`**, **`bulletin_public_feed`**, **`bulletin_public_health`** (responses include **`agent_report`** when useful). **Tier 4 is for swaps**, not Clawstr posting (Tier 1 stays read-only). Fund the app wallet on the same network as your RPC. Smoke test: `npm run test:clawstr`.

**Execution reporting guarantees (anti-fabrication):**
- The server is the source of truth for tool results; the assistant can only report returned tool payloads.
- On any failed or verification-blocked tool result, the flow stops immediately ("no result, no progress").
- Simulated/dry-run tool outcomes are labeled as simulation only (no live broadcast).
- For claimed success, proof fields are full values (full signature/intent/event IDs), not abbreviated placeholders.

**Swaps (Jupiter) — settings reference:**

| Setting | What it does |
|--------|----------------|
| **Enable swaps** | Must be ON to prepare any swap intent. Separate from Security Tier 4. |
| **Execution** | ON = app may broadcast transactions. OFF = no broadcast (prepare/confirm only). |
| **Dry-run** | ON = simulate only, no tx sent. OFF = live broadcast when you Execute. |
| **Max slippage (bps)** | Cap on slippage (200 = 2%, 50 = 0.5%). Requested slippage above this is rejected. |
| **Max swap size (SOL)** | Max SOL amount per swap (e.g. 0.05). |
| **Max swap % of balance** | Max share of wallet SOL per swap (e.g. 20%). |
| **Max requote deviation (bps)** | If quote moves more than this before execute, execution can be blocked. |
| **Autopilot ON** | Agent can auto-confirm intents that pass limits. |
| **Auto-execute ON** | After confirm, agent can auto-execute (still needs Execution ON; respects Dry-run). |
| **Cooldown (s)** | Min seconds between executions. |
| **Max swaps / hour, / day** | Rate limits. |
| **Max daily SOL volume** | Total SOL swap volume cap per day. |

**Wallet page:** Shows address + SOL balance, and a paginated token table (10 rows/page) with logos for common tokens (e.g. SOL/USDC) pulled from `https://logos.tradeloop.app/`.

## Tools (orchestrator)

The chat uses Inception tool-use. The model can call:

- **browse** – Web search (DuckDuckGo) and fetch first result page; returns title, url, snippet, excerpt.
- **file_write** – Save a file (filename + content); returns file id.
- **file_read** – Read a file by id.
- **file_list** – List saved files.
- **generate_image** – Generate an image from a text prompt. Set `IMAGE_API_URL` and `IMAGE_API_KEY` in Settings (or .env for local testing) to enable (e.g. OpenAI-compatible image endpoint).
- **analyze_image** – Describe or OCR an uploaded image. Set `VISION_API_URL` and `VISION_API_KEY` in Settings (or .env for local testing). Optional: `VISION_MODEL` (default `gpt-4o-mini`).
- **heartbeat** – Returns a health-check payload (timestamp, status, memory, pid). Optional: set `HEARTBEAT_INTERVAL_MS` in Settings → Environment (or .env for testing) to run a background heartbeat.
- **cronjob** – Schedule a recurring task with a cron expression. Tasks: `log`, `heartbeat`, **`check_btc`** (hourly Bitcoin price check; writes an alert to `data/memory/alerts.md` when price drops below threshold). Example: `0 * * * *` = every hour; `*/5 * * * *` = every 5 minutes. Set `BTC_ALERT_BELOW=65000` in .env (testing only) to change the alert threshold (default 65k).
- **get_btc_price** – Get current Bitcoin price in USD (CoinGecko). Use with **cronjob** task `check_btc` to “check every hour and alert if below $65k”; view alerts via `GET /api/alerts` or `data/memory/alerts.md`.
- **conversation_search** – Search past conversations by text (long-term memory). Returns conversation_id, excerpt, date; use when the user asks what you discussed or to find past chats about a topic. See **TOOLS.md**.
- **Wallet (Solana):** `solana_address`, `solana_balance`, `solana_transfer`, `solana_token_balance`, `solana_transfer_spl`, `solana_tx_history`, `solana_tx_status`, `solana_network`. Uses the app wallet (configured in Settings). See **TOOLS.md** for full list and details.
- **Workspace & sandbox:** `workspace_read`, `workspace_write`, `workspace_delete`, `workspace_list`, `workspace_tree` for files; **`exec`** to run shell commands in the workspace (e.g. run scripts created with workspace_write). See **TOOLS.md**.

Files are stored under `data/files/`. Uploaded images can be analysed with **analyze_image** (file_id from the attachment message). Upload via API or when the model calls `file_write`.

**Tool registry:** The list and descriptions of tools are loaded from `config/tools.yaml` at startup (single source of truth). Set `enabled: false` on a tool to hide it. `GET /api/help` returns the enabled tools (name, description, options) as JSON for the UI or monitoring.

**Database schema and migrations**  
All schema and migrations live in **`db.js`**:

- **Initial schema:** The first `db.exec(\`...\`)` block in `db.js` creates the core tables if they don’t exist: **conversations**, **messages**, **token_usage**, **config**. That’s where new tables (e.g. the config table) and base columns are defined.
- **Migrations:** Later in `db.js`, conditional blocks use **`hasColumn(table, column)`** and then run **`db.exec(...)`** with **`ALTER TABLE`** to add new columns or indexes (e.g. `server_id`, `server_ts`, `status`, `is_deleted` on `messages`). When you add a new table or column, add it either to the initial `CREATE TABLE IF NOT EXISTS` block (for new tables) or in a new `if (!hasColumn(...)) { db.exec(...) }` block (for new columns on existing tables).
- **Usage:** `server.js` and other modules only call `db.js` (e.g. `db.getConfig`, `db.setConfig`, `db.createConversation`, `db.insertMessage`). They never run raw DDL; all schema changes are made in **`db.js`** only.

## Slash commands

- **`/save`** – Save the current conversation as a timestamped session (e.g. `23-Oct-2026 02:15 PM`) under `data/sessions/`.
- **`/history`** – List saved sessions (newest first); click a session to load it.
- **`/help`** – Show slash-command help.

## File API

- `POST /api/files` – Upload: body `{ "filename": "x.txt", "content": "<base64>" }`.
- `GET /api/files` – List files (JSON).
- `GET /api/files/:id` – Download file.

## Chat API (external providers)

The app calls the chat provider you choose in Settings:

- **NanoGPT (default):** `https://nano-gpt.com/api/v1/chat/completions` — set `NANOGPT_API_KEY`
- **Inception:** `https://api.inceptionlabs.ai/v1/chat/completions` — set `INCEPTION_API_KEY`
- **Venice:** `https://api.venice.ai/api/v1/chat/completions` — set `VENICE_ADMIN_KEY`

Auth is via the corresponding API key (Bearer or header as required by each provider). See **docs/VENICE_API.md** for Venice details.

## Quick start (owners)

If you’re running the desktop app and just want to get set up quickly (keys, wallet, tiers, swaps, autopilot), see:

- `docs/QUICK_START.md`
- `docs/COMMUNITY_AGENT_ROADMAP.md` — Clawstr posting on solanaagent.app (short reference)
