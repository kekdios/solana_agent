# Solana Agent

**Release V3** — `package.json` version **3.0.1**; the web UI sidebar shows **V3** plus semver and date. Local **Node.js HTTP server** + **React** UI with Solana trading tools (balance, transfer, **native SABTC/SAETH/SAUSD** via **`solana_agent_token_send`** + canonical mints for **`solana_token_balance`**, Jupiter price/quote), workspace file tools, and a **sandbox** to create and run programs (exec). Chat can use **NanoGPT** (pick any model from the provider list in **Settings**; default model id in env **`NANOGPT_MODEL`**), **Inception** (mercury-2), or **Venice** (venice-uncensored). Choose the provider, set the API key, and for NanoGPT use **Refresh** on the model list (`GET /api/nanogpt/models` on your server proxies NanoGPT’s models API). Optional env: `NANOGPT_API_KEY`, `NANOGPT_MODEL`, `INCEPTION_API_KEY`, `VENICE_ADMIN_KEY`, `CHAT_BACKEND=nanogpt|inception|venice`. Wallet and DeFi tools use the app’s Solana keypair only.

Run it locally with **`node server.js`** (and a browser). **`./build-and-run.sh`** builds the UI and opens the app. There are no packaged-desktop or auto-update flows in this repo anymore.

This repository runs as a local-first web app (server + renderer in this workspace).

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (comes with Node)

## Setup

1. Clone the repository (or download and extract), then install dependencies:
   ```bash
   cd agent
   npm install
   ```

2. **Configure in Settings (gear icon):** Set your **NanoGPT API key** (default chat provider), choose a **NanoGPT chat model** (save key first, then **Refresh** the list), and optionally Inception/Venice keys and **JUPITER_API_KEY** for swaps. Secrets/bootstrap values are maintained in **`.env`**; non-secret maintainable policy keys are stored in **`data/app-settings.json`**. Wallet and **SOLANA_RPC_URL** can be set or imported under Settings → Solana Wallet and Settings → Environment.

3. Run the UI + server (builds `dist-renderer/`, starts Node, opens the browser):

   ```bash
   ./build-and-run.sh
   ```

   Or manually:

   ```bash
   npm run build:renderer
   node server.js
   ```

   Then open **http://127.0.0.1:3333** (or the port shown in the terminal if you changed **PORT** in Settings).

**Dev UI (Vite hot reload):** In two terminals: `npm run dev:renderer` and `npm start` (or `node server.js`). Open the Vite URL for the frontend; ensure `apiBase` / same-origin matches your server port.

### Chat (V3) — tools and workspace files

- **In-app chat only:** File and wallet answers come from **`POST /api/chat`** on your running server. External assistants (e.g. IDE chat) **do not** have your workspace tools—use the **Solana Agent browser UI** for agent file access.
- **Tools on every turn:** The server **always** sends OpenAI-style **`tools`** + **`tool_choice: "auto"`** with each chat completion so the model can call `workspace_tree`, `workspace_read`, `exec`, wallet tools, etc.
- **`HEARTBEAT.md` shortcut:** If the user clearly asks for the **content** of **`heartbeat.md`** / **`HEARTBEAT.md`**, the server **reads the file from `WORKSPACE_DIR` first** and may respond **without** calling the LLM for that turn—so the answer matches disk even if a model would skip tools. Other files still use **`workspace_read`** (or tree + read).

Chat history and runtime state are stored in SQLite (**`data/solagent.db`**). Configuration is split: secrets/bootstrap values in **`.env`**, and maintainable non-secret settings in **`data/app-settings.json`**.

**Where is solagent.db?**  
By default, when you run **`node server.js`** from the project root, the DB is at **`data/solagent.db`** (with **`data/.encryption-key`** next to it). Override with **`DB_PATH`** if needed. Canonical layout: **`docs/PATHS.md`**. Migration from old desktop data: **`docs/MIGRATION_SINGLE_ROOT_WEBAPP.md`**.

**Token usage** is recorded in the same DB: each chat completion writes one row to `token_usage`. Query usage via `GET /api/usage?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&conversation_id=N&limit=100` (returns `rows` and `summary`).

**Workspace:** The `workspace/` folder holds persona and rules the model sees on the first message of each conversation (when the server injects workspace context): **`SOUL.md`**, **`AGENTS.md`**, **`tools.md`**, and **`HEARTBEAT.md`** (optional checklist when a **chat heartbeat** runs). Edit these to change identity, behavior, and tool reminders. The model can CRUD files in `workspace/` via `workspace_read`, `workspace_write`, `workspace_delete`, `workspace_list`, `workspace_tree`. The **exec** tool runs shell commands in the workspace sandbox.

**Heartbeat checklist file:** **`HEARTBEAT.md`** lives in **`workspace/HEARTBEAT.md`**. Set **`HEARTBEAT_INTERVAL_SECONDS`** in Settings → Environment to enable periodic heartbeat **user messages** in the Chat view. **`cronjob` task `heartbeat`** is only a server health log—it does not read `HEARTBEAT.md` or call the LLM.

**Confirming agent-created memory files:** When the agent says it wrote to `memory/YYYY-MM-DD.md` or `MEMORY.md`, that path is **inside the workspace** (default: **`workspace/`** under the project root, or **`WORKSPACE_DIR`** if set). If the file is missing, the agent may have described the write without actually calling `workspace_write`; ask it to write the path again and check.

**Testing:** From the project root:
- `node scripts/test-exec-sandbox.js` — exec/sandbox test suite (temp workspace, echo, cwd, workdir, timeout).
- `npm run test:server-start` — spawns `server.js` on a test port and checks `/api/help`.
- `npm run test:browse` — smoke-test **`browse`** (DDG + Wikipedia fallback; needs network).
- `npm run test:in-process-server` — starts the server in-process and checks `/api/help` (uses a temp data dir, then removes it).
- `npm run test:nanogpt-models` — integration check for NanoGPT **`/api/v1/models`** (public + keyed; needs network).
- `npm run test:hyperliquid-btc-eth` — Hyperliquid **perp** mids for BTC and ETH (needs network).
- `npm run test:hyperliquid-api-key-price` — requires **`HYPERLIQUID_API_KEY`** in `.env`; fetches **allMids** (see script header: HL info API is public; key is a gate for your smoke test only).
- `node scripts/test-solana-tools.js` — runs Solana tool handlers (requires wallet in config or, for testing only, `SOLANA_PRIVATE_KEY` in .env; transfer test sends 0.001 SOL to a test address).
- `npm run test:agent-token-send` — live **`solana_agent_token_send`** smoke test (uses **`TEST_PRIV_KEY`** from repo `.env` if set). See **`docs/SA_AGENT_TOKENS.md`**.

**Settings (gear icon):** Choose **Chat provider** (NanoGPT default, Inception, or Venice) and set keys. Manage **Solana wallet** (view/copy public key, reveal private key, generate wallet, passphrase backup). **Environment** writes bootstrap values to `.env` (PORT/HOST apply after restart). Policy settings persist in `data/app-settings.json`.

**Making swaps work (checklist):**

1. **Settings → API keys:** Set **JUPITER_API_KEY** (required for Jupiter quote/swap API).
2. **Settings → Solana Wallet:** Create or import a wallet and fund it with SOL.
3. **Settings → Security tier:** Set to **Tier 4** (required for swap tools; Tier 1–3 block execution).
4. **Settings → Swaps (Jupiter):**
   - Turn **Enable swaps** ON (otherwise "Swaps are disabled" when you ask for a swap).
   - To **broadcast** real swaps: turn **Execution** ON and **Dry-run** OFF. Keep Dry-run ON to test without sending transactions.
   - Optionally set **Max slippage (bps)** (e.g. 200 = 2% max) and save swap policy.

In chat: ask e.g. "swap $5 SOL to USDC". The agent will prepare an intent; use the **Execute** button in the swap card (or reply "confirm swap &lt;intent_id&gt;") to confirm and broadcast. If you see "Not found" on confirm, start a **New chat** so old intents are cleared, then ask for a fresh swap.

**Direct Nostr mode:** The agent uses unified **`nostr_action`** and connects to relays directly. Use `type:"publish"` with `payload.content` (requires **`NOSTR_NSEC`** in env for signing), and `type:"read"` with scoped payload (`feed|public_feed|communities|health|public_health`). `reply` / `react` / `profile` are supported. Tier note: **Tier 4 is for swaps**, not Nostr posting (Tier 1 remains read-only for mutating actions).

**Nostr identity env vars:** Use `NOSTR_NSEC` (required for write/sign), optional `NOSTR_NPUB` (display/reporting), and optional `NOSTR_RELAYS` (comma-separated relay list). Keep secret keys private and never print them in logs or chat output.

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

The chat uses **OpenAI-compatible tool/function calling** (NanoGPT, Inception, or Venice). **V3:** tools are attached on **every** message. The model can call:

- **browse** – Web search (DuckDuckGo + Wikipedia fallback) and fetch first result page; returns title, url, snippet, excerpt. Prefer a **short keyword** or a full **`https://` URL**; long sentences often return no hit.
- **hyperliquid_price** – Hyperliquid **perp** or **spot** mid USD via public **`allMids`** (`market`: `"perp"` default or **`"spot"`**; spot: e.g. `HYPE`, `@107`, `PURR/USDC`). Reference only—not an executable quote. See **TOOLS.md**.
- **get_sol_price_usd** – SOL/USD from CoinGecko (same idea as Wallet pricing for “$X in SOL”).
- **jupiter_quote** / **jupiter_swap_*** – Swap quote and gated execution flow (Tier 4 + Settings → Swaps). See **TOOLS.md**.
- **treasury_pool_info** / **treasury_pool_swap** – Read Orca Whirlpool for **SABTC/SAETH/SAUSD** pairs; native swap with **`dry_run`**. See **`docs/TREASURY_POOL_TRADING.md`**.
- **file_write** – Save a file (filename + content); returns file id.
- **file_read** – Read a file by id.
- **file_list** – List saved files.
- **generate_image** – Generate an image from a text prompt. Set `IMAGE_API_URL` and `IMAGE_API_KEY` in Settings (or .env for local testing) to enable (e.g. OpenAI-compatible image endpoint).
- **analyze_image** – Describe or OCR an uploaded image. Set `VISION_API_URL` and `VISION_API_KEY` in Settings (or .env for local testing). Optional: `VISION_MODEL` (default `gpt-4o-mini`).
- **heartbeat** – Returns a health-check payload (timestamp, status, memory, pid). Optional: set `HEARTBEAT_INTERVAL_SECONDS` in Settings → Environment. When set, the server logs a lightweight heap heartbeat on that interval; the Chat UI can inject the default heartbeat user prompt on the same interval.
- **cronjob** – Schedule a recurring task with a cron expression. Tasks: `log`, **`heartbeat`** (server health payload only—**not** LLM / **not** `HEARTBEAT.md`), **`check_btc`** (Bitcoin price check; writes an alert to `data/memory/alerts.md` when price drops below threshold). Example: `0 * * * *` = every hour; `*/5 * * * *` = every 5 minutes. Set `BTC_ALERT_BELOW=65000` in .env (testing only) to change the alert threshold (default 65k).
- **get_btc_price** – Get current Bitcoin price in USD (CoinGecko). Use with **cronjob** task `check_btc` to “check every hour and alert if below $65k”; view alerts via `GET /api/alerts` or `data/memory/alerts.md`.
- **conversation_search** – Search past conversations by text (long-term memory). Returns conversation_id, excerpt, date; use when the user asks what you discussed or to find past chats about a topic. See **TOOLS.md**.
- **Wallet (Solana):** `solana_address`, `solana_balance`, `solana_transfer`, `solana_token_balance`, `solana_transfer_spl`, `solana_tx_history`, `solana_tx_status`, `solana_network`. Uses the app wallet (configured in Settings). See **TOOLS.md** for full list and details.
- **Workspace & sandbox:** `workspace_read`, `workspace_write`, `workspace_delete`, `workspace_list`, `workspace_tree` for files; **`exec`** to run shell commands in the workspace (e.g. run scripts created with workspace_write). See **TOOLS.md**.

Files are stored under `data/files/`. Uploaded images can be analysed with **analyze_image** (file_id from the attachment message). Upload via API or when the model calls `file_write`.

**Tool registry:** The list and descriptions of tools are loaded from `config/tools.yaml` at startup (single source of truth). Set `enabled: false` on a tool to hide it. `GET /api/help` returns the enabled tools (name, description, options) as JSON for the UI or monitoring.

**Database schema and migrations**  
All schema and migrations live in **`db.js`**:

- **Initial schema:** The first `db.exec(\`...\`)` block in `db.js` creates the core tables if they don’t exist: **conversations**, **messages**, **token_usage** (and other runtime tables).  
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

If you want to get set up quickly (keys, wallet, tiers, swaps, autopilot), see:

- `docs/QUICK_START.md`
