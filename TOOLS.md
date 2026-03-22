# Solana Agent – Available Tools & Slash Commands

> Single source of truth for built-in tools the assistant can invoke.  
> Keep this file up to date when you add, rename, or remove a tool.

**The agent can and should use any of these tools and strategies when they fit the user's request.** Do not say you cannot do something if a tool exists for it. Use the right tool for the task: wallet ops, swaps, **Clawstr on solanaagent.app (`bulletin_post`)**, perps, lending, prediction markets, docs, workspace, sandbox (exec), or memory. When in doubt, call the tool and reason from the result.

**Default workspace bootstrap** (first-turn system context when the server loads `workspace/`): `SOUL.md`, `AGENTS.md`, `workspace/tools.md`, and `workspace/skills/clawstr/SKILLS.md`—posting and reads for solanaagent.app are documented **out of the box** without requiring `workspace_read` first.

## Truth contract (runtime)

- Tool execution is server-controlled. The assistant must not "claim" tool output that was not returned by the server.
- If a tool result is missing, failed (`ok:false` / `error`), or verification-blocked, the flow must stop immediately.
- No result, no progress: downstream steps (confirm, execute, post) are forbidden after a failed upstream step.
- Report execution proof with full values only (no `abc...xyz` truncation for signatures/IDs when asserting success).
- If tool mode is simulated/dry-run/stub, explicitly state that no live transaction/post occurred.

### Solana Agent V3 — `POST /api/chat` behavior

- **Tools on every request:** The server **always** includes the enabled tool definitions and `tool_choice: "auto"` (OpenAI-compatible) for each completion round—no keyword gating.
- **In-app only:** Answers that require **`workspace_*`** or wallet tools only apply when the user chats through **this app** hitting your server. Other UIs (e.g. generic IDE chat) are not wired to `server.js`.
- **`HEARTBEAT.md` shortcut:** When the last user message clearly asks for the **content** of `heartbeat.md` / `HEARTBEAT.md`, **`server.js` may read the file from `WORKSPACE_DIR`** and return it **without** calling the LLM for that turn (deterministic; avoids models skipping `workspace_read`). Other paths still use **`workspace_tree`** / **`workspace_read`**.

---

## Strategies at a glance

| User intent / strategy     | Use these tools |
| -------------------------- | ---------------- |
| **Wallet** – address, balance, send SOL/SPL, **native SABTC/SAETH/SAUSD** (balances **`solana_token_balance`** + **`token_symbol`**; send **`solana_agent_token_send`**; **treasury pool read** **`treasury_pool_info`**; **treasury swap** **`treasury_pool_swap`** Orca-only — see **`docs/TREASURY_POOL_TRADING.md`**), tx history/status (wallet **built in**). | `solana_address`, `solana_balance`, `solana_transfer`, `solana_token_balance`, `solana_transfer_spl`, `solana_agent_token_send`, **`treasury_pool_info`**, **`treasury_pool_swap`**, `solana_tx_history`, `solana_tx_status`, `solana_network` |
| **Swaps / prices** – SOL or token price, swap quote (no execution); Hyperliquid perp mids (BTC/ETH default) | `jupiter_price`, `jupiter_quote`, **`hyperliquid_price`** |
| **Perps** – Drift perp price, positions, place order | `drift_perp_price`, `drift_positions`, `drift_place_order` |
| **Lending** – Kamino health, positions, deposit | `kamino_health`, `kamino_positions`, `kamino_deposit` |
| **AMM / memecoins** – Raydium quote, pump.fun→Raydium | `raydium_quote`, `raydium_market_detect` |
| **Prediction markets** – Drift BET markets and positions | `bet_markets`, `bet_positions` |
| **Docs** – crawl, index, search, read folder | `doc_crawl`, `doc_index`, `doc_search`, `read_docs_folder`, `workspace_read` |
| **Workspace** – discover and read/write/delete; no hardcoded paths | `workspace_tree` (full tree + file_paths), `workspace_list` (one level), `workspace_read`, `workspace_write`, `workspace_delete` |
| **Sandbox / exec** – run shell commands in the workspace (create programs with workspace_write, then run them) | `exec` |
| **Memory** – past conversations | `conversation_search` |
| **Clawstr (solanaagent.app)** – post via **`bulletin_post`** (free **`agent_code`**; set **`CLAWSTR_AGENT_CODE`**). Read-only: **`clawstr_health`**, **`clawstr_feed`**, **`clawstr_communities`**, **`bulletin_public_feed`**, **`bulletin_public_health`**. Supporting: `bulletin_create_payment_intent`, `bulletin_get_latest_intent` (sidebar / paid path); `bulletin_approve_and_post` = alias of **`bulletin_post`**. Payment-intent URL is **POST-only** (GET → 404). | `bulletin_post`, `bulletin_create_payment_intent`, `bulletin_get_latest_intent`, `bulletin_approve_and_post`, `clawstr_health`, `clawstr_feed`, `clawstr_communities`, `bulletin_public_feed`, `bulletin_public_health` |
| **Web / API** – browse, fetch URL | `browse`, `fetch_url` |

---

## Table of Contents

| Category   | Command / Tool      | Short description                                              | Example usage                          |
| ---------- | ------------------- | -------------------------------------------------------------- | -------------------------------------- |
| **Core**   | `browse`             | Search DuckDuckGo or fetch a URL; return title, snippet, excerpt. | `browse("Bitcoin price")` or `browse("https://example.com")` |
| **Core**   | `generate_image`    | Generate a raster image from a text prompt (diffusion).        | `generate_image({ prompt: "a sunrise over mountains" })` |
| **Core**   | `analyze_image`     | OCR / description of an uploaded image by file-id.             | `analyze_image({ file_id: "…", prompt: "Extract text" })` |
| **Core**   | `file_write`        | Store a file (filename + content); returns file-id.            | `file_write({ filename: "notes.txt", content: "…" })` |
| **Core**   | `file_read`         | Retrieve a stored file by id (base64 content).                  | `file_read({ id: "uuid…" })` |
| **Core**   | `file_list`         | List all saved files (id, filename, size).                     | `file_list({})` |
| **Utility**| `/save`             | Persist the current conversation under a timestamped name.     | `/save` |
| **Utility**| `/history`          | List saved sessions; click one to load it.                    | `/history` |
| **Utility**| `/help`             | Show slash-command help.                                       | `/help` |
| **Utility**| New chat (menu)     | Start a fresh session (clear messages and conversation).        | Sidebar → New chat                     |
| **Health** | `heartbeat`         | Health-check payload (timestamp, status, memory, pid).         | `heartbeat({})` |
| **Schedule**| `cronjob`          | Schedule a recurring task (cron expression + task name).       | `cronjob({ expression: "*/5 * * * *", task: "heartbeat" })` |
| **Doc**     | `doc_crawl`        | Crawl a docs site; save .md + metadata + TOC to workspace.     | `doc_crawl({ base_url: "https://docs.example.com", save_to: "docs/example", max_pages: 30 })` |
| **Doc**     | `doc_index`        | Build/refresh SQLite FTS index for a workspace docs folder.   | `doc_index({ root: "docs/example" })` |
| **Doc**     | `doc_search`       | Full-text search indexed docs; returns path, snippet; use workspace_read(path) for full content. | `doc_search({ query: "swap", limit: 5 })` |
| **Doc**     | `read_docs_folder`  | Digest a docs folder (truncated chunks + optional SUMMARY.md).  | `read_docs_folder({ path: "docs/bebop" })` |
| **Core**    | `fetch_url`         | HTTP GET or POST to external APIs (HTTPS only).               | `fetch_url({ method: "POST", url: "https://…", body: "{}" })` |
| **Workspace** | `workspace_read`  | Read a file from the workspace (path relative to workspace). | `workspace_read({ path: "docs/bebop/TOC.md" })` |
| **Workspace** | `workspace_write` | Create or overwrite a file in the workspace.                  | `workspace_write({ path: "memory/notes.md", content: "…" })` |
| **Workspace** | `workspace_delete` | Delete a file in the workspace.                               | `workspace_delete({ path: "memory/old.md" })` |
| **Workspace** | `workspace_list`  | List one level of files and subdirs (traverse by calling again on subdirs). | `workspace_list({ path: "." })` or `workspace_list({ path: "memory" })` |
| **Workspace** | `workspace_tree`  | Get full directory tree and flat list of all file paths in one call; use to discover any file, then workspace_read(path). | `workspace_tree({})` or `workspace_tree({ path: "." })` |
| **Sandbox**   | `exec`            | Run a shell command in the workspace sandbox (cwd = workspace or workdir). Use after workspace_write to run scripts.     | `exec({ command: "node sandbox/script.js", workdir: "sandbox", timeout: 60 })` |
| **Memory**    | `conversation_search` | Search past conversations by text; returns conversation_id, excerpt, date (like history but by keyword). | `conversation_search({ query: "Bebop API", limit: 20 })` |
| **Utility** | `get_btc_price`    | Current Bitcoin price in USD (CoinGecko).                     | `get_btc_price({})` |
| **Solana**  | `solana_address`   | App wallet Solana address (base58).                           | `solana_address({})` |
| **Solana**  | `solana_balance`   | SOL + SPL token balances for the app wallet.                  | `solana_balance({})` |
| **Solana**  | `solana_transfer`  | Send SOL to a recipient (to, amount_sol).                    | `solana_transfer({ to: "…", amount_sol: 0.1 })` |
| **Solana**  | `solana_network`   | Current RPC URL and cluster (mainnet-beta, devnet, testnet).   | `solana_network({})` |
| **Solana**  | `solana_token_balance` | SPL token balance for a mint (mint; optional owner).      | `solana_token_balance({ mint: "…" })` |
| **Solana**  | `solana_transfer_spl`  | Send SPL tokens (mint, to, amount in smallest units).      | `solana_transfer_spl({ mint: "…", to: "…", amount: "1000000" })` |
| **Solana**  | `solana_agent_token_send` | **Native:** send **SABTC / SAETH / SAUSD** by symbol (born with canonical mints). Optional Settings overrides. Rejects if estimated network fee &gt; 0.001 SOL. **Tier 4.** | `solana_agent_token_send({ token_symbol: "SAUSD", to: "…", amount_ui: 100 })` |
| **Solana**  | `treasury_pool_info` | **Read-only:** Whirlpool snapshot (Orca API → RPC fallback, same as solanaagent.app). **`pair`** `SABTC_SAUSD` / `SAETH_SAUSD` or **`pool_address`**. Optional **`orca_proxy_base_url`**. Not a trade quote. | `treasury_pool_info({ pair: "SABTC_SAUSD" })` |
| **Solana**  | `treasury_pool_swap` | **Native:** swap **SABTC↔SAUSD** or **SAETH↔SAUSD** on Orca Whirlpool (SDK only). **`dry_run:true`** simulates. Live needs Swaps + execution enabled. **Tier 4.** | `treasury_pool_swap({ input_token_symbol: "SAUSD", output_token_symbol: "SABTC", amount: "1000000", dry_run: true })` |
| **Solana**  | `solana_tx_history`   | Recent tx signatures for the app wallet (optional limit).   | `solana_tx_history({ limit: 20 })` |
| **Solana**  | `solana_tx_status`   | Transaction status by signature.                             | `solana_tx_status({ signature: "…" })` |
| **Jupiter** | `jupiter_price`      | SOL or token USD price (and optional 24h change).             | `jupiter_price({})` or `jupiter_price({ ids: "SOL" })` |
| **Hyperliquid** | `hyperliquid_price` | Perp **mid** prices USD via public `info` **allMids** (default **BTC**, **ETH**). Optional **`coins`**. Not on-chain execution. | `hyperliquid_price({})` or `hyperliquid_price({ coins: ["BTC", "ETH", "SOL"] })` |
| **Jupiter** | `jupiter_quote`      | Swap quote (no execution): input/output mint, amount.         | `jupiter_quote({ input_mint: "…", output_mint: "…", amount: "…" })` |
| **Drift**   | `drift_perp_price`   | SOL-PERP mark price (USD).                                   | `drift_perp_price({})` |
| **Drift**   | `drift_positions`    | User's Drift perp positions.                                  | `drift_positions({})` |
| **Drift**   | `drift_place_order`  | Place perp order on Drift (stub).                             | `drift_place_order({ … })` |
| **Kamino**  | `kamino_health`      | Kamino lending health factor for app wallet.                  | `kamino_health({})` |
| **Kamino**  | `kamino_positions`   | Kamino lending positions (deposits, borrows).                  | `kamino_positions({})` |
| **Kamino**  | `kamino_deposit`     | Deposit to Kamino (stub).                                     | `kamino_deposit({ … })` |
| **Raydium** | `raydium_quote`      | Raydium swap quote (stub; prefer jupiter_quote).              | `raydium_quote({ … })` |
| **Raydium** | `raydium_market_detect` | Detect pump.fun→Raydium migration (stub).                  | `raydium_market_detect({ … })` |
| **Bet**     | `bet_markets`        | List Drift BET / prediction markets.                          | `bet_markets({})` |
| **Bet**     | `bet_positions`      | User prediction market positions.                              | `bet_positions({})` |

---

## Detailed Tool Specs

### 1. `browse`

- **Input**: A free-form text query **or** a full URL.
- **Process**:
  1. If input is a URL → fetch that URL directly.
  2. Else **DuckDuckGo Instant Answer** for the raw query, then again for a **simplified** query (strips phrases like “find out more about”, “what is”, “tell me about”) — DDG often returns empty for full sentences.
  3. If still no URL → **Wikipedia opensearch** (same two query strings; no API key; requires `User-Agent`).
  4. If still no URL → extract a **domain** from the query and try `https://<domain>` / `https://www.<domain>`.
  5. Fetch the chosen page (no JS execution), strip HTML → plain text (≈ 2000 chars excerpt).
- **Output**: `{ title, url, snippet, excerpt, timestamp }`.
- **Test**: `npm run test:browse` (network required).

### 2. `generate_image`

- **Input**: `{ prompt }` – natural-language image description.
- **Backend**: Endpoint from `IMAGE_API_URL` + `IMAGE_API_KEY` (e.g. OpenAI-compatible).
- **Output**: `{ ok, prompt, url, b64 }` – `url` is image URL or base64 data; `b64: true` if inline base64.

### 3. `analyze_image`

- **Input**: `{ file_id [, prompt ] }` – file-id from an uploaded image; optional prompt (e.g. “Extract text”).
- **Backend**: `VISION_API_URL` + `VISION_API_KEY` (e.g. OpenAI chat with vision). Optional `VISION_MODEL`.
- **Output**: `{ ok, file_id, filename, analysis }` or `{ ok: false, message }`.

### 4. `file_write`

- **Input**: `{ filename, content }` – content can be UTF-8 or base64 (for uploads).
- **Output**: `{ id, filename, size }` – use `id` for `file_read` or download.

### 5. `file_read`

- **Input**: `{ id }` – file-id from `file_write` or `file_list`.
- **Output**: `{ id, filename, content, size }` – `content` is base64.

### 6. `file_list`

- **Input**: none.
- **Output**: Array of `{ id, filename, size }` (or wrapper with `files` key depending on API).

---

## Workspace (discovery and files)

**No hardcoded file lists — no invented trees.** For "list workspace", "ls", or directory questions, the agent **must** call `workspace_tree` or `workspace_list` (or `exec` with `ls`/`find`) in that turn and report **only** tool output. **Forbidden:** fabricating `/app`, fake `src/`, `logs/`, sizes, or claiming "no tools" when these exist. The SQLite DB lives under **`data/solagent.db`**, not at workspace root.

The agent discovers files with `workspace_tree` and `workspace_list`, and reads with `workspace_read`. To **run commands** (e.g. scripts created with workspace_write), use **`exec`**.

### `workspace_tree`

- **Input**: `{ path?: ".", max_depth?: 20 }` – optional path (default "." = workspace root), optional max depth.
- **Output**: `{ ok: true, path, tree, file_paths }` – `tree` is a readable directory tree string; `file_paths` is a **flat list of all file paths** (no dirs). Use `file_paths` to see every file; then call **`workspace_read`** with any path from that list (e.g. `SOUL.md`, `memory/2026-03-11.md`).
- **Use when**: User asks to "read X", "what's in the workspace", or to find a file by name. One call gives the full tree; no need to traverse level by level.

### `workspace_list`

- **Input**: `{ path?: "." }` – directory path relative to workspace root; omit or "." for root.
- **Output**: `{ ok: true, path, entries: [ { name, type: "file"|"dir" }, … ] }` – one level only. To traverse, call again with a subdir path (e.g. `workspace_list({ path: "memory" })`).
- **Use when**: You only need one level or want to step through folders manually.

### `workspace_read` / `workspace_write` / `workspace_delete`

- Paths are **relative to workspace root**. Discover paths with **workspace_tree** (get `file_paths`) or **workspace_list** (then traverse). Do not assume file names—list or tree first when the user asks for a file by name or "read the plan".

### `exec` (workspace sandbox)

Run a shell command with the **workspace** (or a subdirectory) as the current directory. Use to run scripts the agent created with `workspace_write` (e.g. Node, Python, or shell scripts).

- **Input**: `{ command: string, workdir?: string, timeout?: number }` – **command** (required), **workdir** (relative to workspace root, default `"."`), **timeout** in seconds (default 60, max 300).
- **Output**: `{ ok: boolean, stdout?: string, stderr?: string, code?: number, signal?: string, error?: string }` – stdout/stderr from the command; if not ok, error or signal explains why (e.g. timeout, non-zero exit).
- **Use when**: User asks to "run this script", "execute the code", or after you wrote a file (e.g. `sandbox/script.js`) and want to run it (e.g. `exec({ command: "node sandbox/script.js", workdir: "sandbox" })`). Output is capped at 1 MiB; long-running commands should use a reasonable timeout.
- **Sandbox**: Commands run with the workspace as cwd; **workdir** must resolve inside the workspace (no `..` escape). No env overrides from the agent; timeout and output limits apply.

---

## Memory / long-term recall

### `conversation_search`

- **Input**: `{ query [, limit ] }` – text to search for in all stored messages; optional `limit` (default 20, max 50).
- **Process**: Substring search over `messages.content`; groups by `conversation_id`, returns one row per conversation with the first matching message’s excerpt (truncated) and `created_at`.
- **Output**: `{ ok: true, conversations: [ { conversation_id, excerpt, created_at }, … ], count }`.
- **Use when**: The user asks **“did we talk about X?”**, “what did we discuss?”, or to find past conversations about a topic. **Do not** use `doc_search` for that—`doc_search` is for *documentation* (workspace/docs/*); `conversation_search` is for *chat history*. They can then open a conversation by id (e.g. via History or `?conversation=<id>` in the URL).
- **UI**: In the chat window, results are shown as a readable list (conversation links + excerpts); raw JSON is available via a “Details” toggle.

---

## Slash Commands (UI)

- **`/save`** – Saves the current conversation to `data/sessions/` under a timestamped name (e.g. `23-Oct-2026 02:15 PM`). Reply: “Saved as &lt;name&gt;.”
- **`/history`** – Fetches saved sessions (newest first) and shows a list; user can click one to load it.
- **`/help`** – Shows a short summary of slash commands (save, history, help).
- **New chat** – Sidebar menu item; clears the current conversation and starts fresh (no slash in the input).

---

## Health & Schedule

### 7. `heartbeat`

- **Input**: none.
- **Output**: `{ ok: true, payload: { timestamp, status, memory_heap_used, pid } }`.
- **Optional**: Set `HEARTBEAT_INTERVAL_MS` in Settings → Environment (or `.env` for local `node` runs). The server logs heap stats on that interval; the **Chat** view also injects the default heartbeat user message on the same interval so the model follows **`HEARTBEAT.md`** (while Chat is visible; minimum 10s between ticks).
- **`HEARTBEAT.md`**: Workspace-relative checklist (e.g. peg/treasury checks). **Default path:** `workspace/HEARTBEAT.md` (or `WORKSPACE_DIR` if set). Edit freely; keep it short. If the file is missing, the model should not fabricate a write—use **`workspace_write`** and verify with **`workspace_read`** or the path on disk.

### 8. `cronjob`

- **Input**: `{ expression, task }`.
  - `expression` – Cron expression (5 fields: min hour day month weekday), e.g. `*/5 * * * *` = every 5 minutes. Hourly example: `0 * * * *` (at minute 0 of each hour).
  - `task` – One of: `log`, `heartbeat`, `check_btc` (predefined tasks only; no arbitrary shell/JS).
- **Output**: `{ ok, message, schedule }` – e.g. `schedule: "*/5 * * * *:heartbeat"` or error if invalid expression/unknown task.
- **Important**: Cron task **`heartbeat`** runs the same **server health** payload as the **`heartbeat`** tool (timestamp, memory, pid). It does **not** invoke the chat model and does **not** read **`HEARTBEAT.md`**. For periodic **agent** peg/checklist work, use **`HEARTBEAT_INTERVAL_MS`** (Chat view) or ask the user to trigger a heartbeat message.
- **Note**: List/stop of scheduled jobs is available in code (`cronjob.listCronJobs`, `cronjob.stopCronJob`) but not exposed as LLM tools in this version.

---

## Doc-Engine (crawl → index → search)

### 9. `doc_crawl`

- **Input**: `{ base_url [, save_to, max_pages ] }`.
  - `base_url` – Root docs URL (e.g. `https://docs.bebop.xyz/bebop`). Required.
  - `save_to` – Workspace path prefix for saved files (e.g. `docs/bebop`). Optional; default derived from URL.
  - `max_pages` – Max pages to fetch (default 30, max 100). Optional.
- **Process**: Fetches index page, discovers links (same-origin, path under prefix), fetches each page, strips HTML to markdown. Writes each page as `.md`, sibling `.json` metadata (url, title, depth, crawl_ts), and one `TOC.md` in the folder. If `save_to` already exists, the folder is wiped first (only if path stays inside workspace). **Link prefix:** When `base_url` is an index page (path `/` or ends with `/index.html` or `/index.htm`), the directory is used as the path prefix so sibling sections (e.g. `/user/`, `/admin/`) are followed; otherwise the full pathname is used. Capped by `max_pages`.
- **Output**: `{ ok, base_url, save_to, saved: [paths], count [, errors ] }`.

### 10. `doc_index`

- **Input**: `{ root }` – Workspace-relative folder containing crawled `.md` files (e.g. `docs/bebop`). Required.
- **Process**: Walks `root` recursively (skips `TOC.md`), reads each `.md` and optional sibling `.json`. Upserts into `workspace/doc.db`: `pages` table (path, url, title, crawl_ts, depth) and FTS5 `page_fts` for full-text search. Re-indexing the same root replaces that slice of the index.
- **Output**: `{ ok, indexed: number }`.

### 11. `doc_search`

- **Input**: `{ query [, limit ] }`.
  - `query` – FTS5 search string (e.g. `swap`, `oracle AND gas`). Required.
  - `limit` – Max results (default 10, max 100). Optional.
- **Process**: Queries `doc.db` FTS5 index, returns matching rows with snippet.
- **Output**: `{ ok, query, results: [ { path, title, snippet, url: "workspace://…" } ] }`. Use **workspace_read(path)** to get full markdown for any result.

**Typical flow:** `doc_crawl` → `doc_index` on that root → `doc_search` for keywords → `workspace_read(path)` for full content.

---

## Solana (app wallet)

All Solana wallet tools use the **app wallet** (keypair from encrypted config / Settings). **The agent must NOT ask the user for an address or file location**—the wallet is already built in. When the user asks for balance, SOL, USDC, or "check my wallet", call the tools directly.

### `solana_address`

- **Input**: none. Wallet is built in.
- **Output**: `{ ok: true, address: "…" }` (base58) or `{ ok: false, error }`.

### `solana_balance`

- **Input**: none (optional args reserved). Uses app wallet.
- **Output**: `{ ok: true, address, sol, lamports, tokens?: [ { mint, amount, decimals, … } ] }` or `{ ok: false, error }`. `tokens` lists SPL token accounts owned by the wallet. For "check balances" or "SOL and USDC" call this (and optionally `solana_token_balance` for a specific mint); do not ask for address.

### `solana_transfer`

- **Input**: `{ to, amount_sol }` – recipient base58 address and amount in SOL.
- **Output**: `{ ok: true, signature, amount_sol, to }` or `{ ok: false, error, signature? }`.

### `solana_network`

- **Input**: none.
- **Output**: `{ ok: true, rpcUrl, cluster }` – `cluster` is `mainnet-beta`, `devnet`, or `testnet` (inferred from RPC URL).

### `solana_token_balance`

- **Input**: `{ mint [, owner ] }` **or** `{ token_symbol [, owner ] }` – For **SABTC / SAETH / SAUSD**, pass **`token_symbol`** only (server resolves mint; avoids paste errors). For other tokens, pass **full** `mint` (base58, no `…`). Omit `owner` for the **app wallet**.
- **Output**: `{ ok: true, address, mint, balance, uiAmount, decimals, accounts? [, token_symbol, built_in_mint, mint_matches_built_in ] }` or `{ ok: false, error }`. For native `token_symbol` calls, **`mint_matches_built_in: false`** means Settings/env overrode the compiled-in mint (see **`docs/SA_AGENT_TOKENS.md`** troubleshooting).

### `solana_transfer_spl`

- **Input**: `{ mint, to, amount [, decimals ] }` – mint address, recipient base58, `amount` as integer string in **smallest units**; optional `decimals` for display.
- **Process**: Creates recipient associated token account (ATA) if needed, then transfers. Idempotent ATA creation.
- **Output**: `{ ok: true, signature, mint, to, amount, uiAmount? }` or `{ ok: false, error, signature? }`.

### `solana_agent_token_send`

- **What it is:** A **first-class, native** send path for the agent’s three branded tokens (**SABTC**, **SAETH**, **SAUSD**). Canonical mints are **built in**—the model should use this tool whenever the user asks to send one of those symbols, as if the capability were always part of the agent (Tier 4, same as other sends).
- **Input**: `{ token_symbol, to, amount? | amount_ui? }` – `token_symbol` is one of the native symbols (case-insensitive); **`to`** is recipient base58; either **`amount`** (smallest units, integer string or integer) or **`amount_ui`** (human decimal; on-chain decimals from mint metadata).
- **Overrides (optional):** Operators may repoint a symbol via **`SA_AGENT_TOKENS`** or **`SABTC` / `SAETH` / `SAUSD`** keys in Settings (or `process.env` in dev). Unset symbols use compiled-in defaults. See **`docs/SA_AGENT_TOKENS.md`**.
- **Policy**: Estimates base **network fee** via RPC; if it **exceeds 0.001 SOL** (1,000,000 lamports), returns **`ok: false`** (no send). Checks SPL balance and SOL for fee + optional new-ATA rent + small buffer before broadcasting.
- **Output**: `{ ok: true, signature, token_symbol, mint, to, amount, amount_ui, decimals, estimated_network_fee_lamports, created_recipient_ata }` or `{ ok: false, error, … }`.

### `treasury_pool_info`

- **What it is:** **Read-only** snapshot of an **Orca Whirlpool**—intended for **monitoring / market-making context** (no fixed peg; spot math is from pool state). Implements the same strategy as **[solanaagent.app](https://www.solanaagent.app/sabtc.html)** / **`api-server.cjs`**: try **Orca** `GET https://api.orca.so/v2/solana/pools/{address}`; if the payload is missing or invalid, **decode the Whirlpool account + vault balances on Solana RPC** (ported from website `lib/orca-whirlpool-onchain.cjs`).
- **Input**: `{ pair?, pool_address?, orca_proxy_base_url? }` — **`pair`**: `SABTC_SAUSD` (default) or `SAETH_SAUSD`; **`pool_address`** overrides **`pair`**. Optional **`orca_proxy_base_url`** e.g. `https://www.solanaagent.app/api` to call **`GET …/orca/pool/{address}`** first (identical JSON to the site UI). Pool defaults match **`treasury_pool_swap`** (`TREASURY_POOL_*` env overrides).
- **Policy**: **Read-only** — allowed from **Tier 1** upward (listed with `jupiter_quote`–class tools). Uses **`SOLANA_RPC_URL`** for RPC fallback.
- **Output**: `{ ok, pool_address, pool_data_source, data: { tokenA/B, tokenMintA/B, tokenBalanceA/B, price, feeRate, tickSpacing, tickCurrentIndex, liquidity, poolDataSource, … }, agent_report }`. **`price`** is **~token B per 1 token A** from sqrt price (indicative), **not** guaranteed execution for a size—use **`treasury_pool_swap`** with **`dry_run:true`** to simulate a trade.
- **Refs**: Website **`/api/orca/pool/…`**, **`docs/TREASURY_POOL_TRADING.md`**.

### `treasury_pool_swap`

- **What it is:** **Born-with** swap on the native **Orca Whirlpool** pools: **SABTC↔SAUSD** and **SAETH↔SAUSD** only (**no Jupiter**). Same app wallet and mint map as **`solana_agent_token_send`** / **`solana_token_balance`**.
- **Input**: `{ input_token_symbol, output_token_symbol, amount? | amount_ui?, slippage_bps?, dry_run? }` — symbols **`SABTC`**, **`SAETH`**, **`SAUSD`**; pair must be one of the two SAUSD pools. **`dry_run: true`** runs RPC simulation only (no send). **Live** swaps are **not** gated by **`SWAPS_ENABLED`** / **`SWAPS_EXECUTION_ENABLED`** (those apply to Jupiter); **`server.js`** only applies those to Jupiter paths.
- **Policy**: **Tier 4.** Estimated base fee must be **≤ 0.001 SOL** (same cap as native token send). Uses **`@orca-so/whirlpools-sdk`** to quote and build; may create ATAs idempotently.
- **Output (live)**: `{ ok: true, signature, input_token_symbol, output_token_symbol, pool, amount_in, estimated_amount_out, … }` or `{ ok: false, error }`.
- **Output (dry_run)**: `{ ok: true, dry_run: true, simulation_err, simulation_logs?, … }`.
- **Refs**: **`docs/TREASURY_POOL_TRADING.md`**, **`npm run verify:treasury-trade-path`**.

### `solana_tx_history`

- **Input**: `{ limit? }` – optional, default 20, max 50.
- **Output**: `{ ok: true, address, signatures: [ { signature, blockTime, err, slot } ] }` or `{ ok: false, error, signatures: [] }`.

### `solana_tx_status`

- **Input**: `{ signature }` – transaction signature (base58).
- **Output**: `{ ok: true, signature, status, confirmationStatus, err?, slot? }` – `status` is `success`, `failed`, or `not_found`; `confirmationStatus` e.g. `confirmed`/`finalized`.

---

## Clawstr on solanaagent.app

Autonomous posts via **`bulletin_post`** use the **free `agent_code` API** only (no SOL). Requires **`CLAWSTR_AGENT_CODE`** in Settings or `.env` with **`./run.sh`**. No dedicated Tier-4 requirement (Tier 1 cannot run mutating tools). The app sidebar may still use a separate **paid** HTTP flow.

### `bulletin_post`

- **Input**: `{ content, wallet_address? }` – post body; `wallet_address` is ignored (schema compatibility).
- **Process**: `POST /api/v1/bulletin/post` with `agent_code` (from config/env) + `content`. If `CLAWSTR_AGENT_CODE` is missing, returns `ok: false`, `stage: "validate"`.
- **Output (success)**: `{ ok: true, stage: "posted", mode: "agent_code", nostr_event_id, post, … }` (no `tx_signature`).
- **Output (failure)**: `{ ok: false, stage: "validate"|"post", error, … }` — report exactly; do not claim posted without `ok: true`.

### `bulletin_approve_and_post`

- **Same as `bulletin_post`** (alias).

### `bulletin_create_payment_intent` / `bulletin_get_latest_intent`

- Use when you need intent details or cache inspection without posting in the same call.

### Read-only APIs (native; prefer over `fetch_url`)

These call **`https://www.solanaagent.app`** (see [API reference](https://www.solanaagent.app/api.html)). On success they return **`agent_report`** (markdown-ready summary), **`summary`**, and **`endpoint`**. For feeds, **`posts_preview`** holds short excerpts—**surface `agent_report` to the user** instead of pasting raw JSON.

### `clawstr_health`

- **Input**: none.
- **Output**: Bridge status, public `npub`, `signing_configured`, etc.

### `clawstr_feed`

- **Input**: `{ limit?, ai_only? }` — `limit` ≤ 100; `ai_only` filters NIP-32 AI-tagged posts.
- **Output**: `agent_report` with numbered excerpts; `posts_preview`, `summary`.

### `clawstr_communities`

- **Input**: none.
- **Output**: Curated communities list; `agent_report` + `summary.count`.

### `bulletin_public_feed`

- **Input**: `{ limit? }` — public solanaagent.app feed (read-only; not posting).
- **Output**: `agent_report`, `posts_preview`, `summary`. To publish use **`bulletin_post`**.

### `bulletin_public_health`

- **Input**: none.
- **Output**: Feed service health JSON in `summary` plus `agent_report`.

---

## Jupiter (prices & swap quotes)

Use for **price checks** and **swap quotes** (no execution). Prefer over Raydium for general SOL/token prices and quotes.

### `jupiter_price`

- **Input**: `{ ids? }` – optional; default SOL. Comma-separated token ids or mint addresses.
- **Output**: `{ ok, usdPrice?, priceChange24h? }` or per-id map. Use when the user asks for SOL price, token price, or "how much is X in USD".

### `hyperliquid_price`

- **Input**: `{ coins? }` – optional array of Hyperliquid **perp** symbols (default **`["BTC","ETH"]`**). Example: `["BTC","ETH","SOL"]`.
- **Process**: `POST https://api.hyperliquid.xyz/info` with body `{ "type": "allMids" }` ([Hyperliquid info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)).
- **Output**: `{ ok, mids_usd: { BTC, ETH, … }, mids_raw, agent_report, missing_in_response? }`. **Mid** ≈ (best bid + best ask) / 2; **not** a Solana executable price. Use with **`treasury_pool_info`** to compare external perp mids vs treasury pool implied spot (SABTC/SAETH are not spot BTC/ETH).

### `jupiter_quote`

- **Input**: `{ input_mint?, output_mint?, amount? }` – mints (default SOL→USDC), amount in smallest units (default 1 SOL).
- **Output**: Quote with `outAmount`, `priceImpact`, etc. Use when the user asks "what would I get if I swapped X for Y?" or "quote a swap". Does not execute.

---

## Drift (perpetuals)

Use for **perp mark price** and **user perp positions**. Place order is stub.

### `drift_perp_price`

- **Input**: `{ market_index? }` – optional, default 0 (SOL-PERP).
- **Output**: Mark price (USD). Use when the user asks for SOL perp price or Drift mark price.

### `drift_positions`

- **Input**: none (uses app wallet).
- **Output**: User's Drift perp positions. Use when the user asks "my Drift positions", "perp positions", or "open positions on Drift".

### `drift_place_order`

- **Input**: order params (stub; not yet implemented).
- **Output**: Stub. Use when the user wants to place a perp order; report that execution is not yet available if needed.

---

## Kamino (lending)

Use for **lending health** and **positions**. Deposit is stub.

### `kamino_health`

- **Input**: none (uses app wallet).
- **Output**: Health factor and related metrics. Use when the user asks "Kamino health", "lending health", "am I safe?", or for lending health checks.

### `kamino_positions`

- **Input**: none (uses app wallet).
- **Output**: Deposits and borrows. Use when the user asks "my Kamino positions", "lending positions", "what am I supplying/borrowing".

### `kamino_deposit`

- **Input**: deposit params (stub; not yet implemented).
- **Output**: Stub. Use when the user wants to deposit; report if execution is not yet available.

---

## Raydium (AMM / memecoins)

Use for **Raydium-specific** quotes or **pump.fun→Raydium** migration detection. For general swaps prefer `jupiter_quote`.

### `raydium_quote`

- **Input**: swap params (stub). Prefer `jupiter_quote` for swap quotes.
- **Output**: Stub.

### `raydium_market_detect`

- **Input**: params for pump.fun→Raydium detection (stub).
- **Output**: Stub. Use when the user asks about memecoin migration or Raydium market detection.

---

## Bet (prediction markets)

Use for **Drift BET** prediction markets and user positions.

### `bet_markets`

- **Input**: optional filters.
- **Output**: List of prediction markets. Use when the user asks "what prediction markets exist", "BET markets", or "Drift prediction markets".

### `bet_positions`

- **Input**: none (uses app wallet).
- **Output**: User's prediction market positions. Use when the user asks "my prediction market positions" or "BET positions".

---

## Skills (workspace, MCP-like)

The agent reads **skills** from the workspace to learn when and how to use tools. Skills are structured docs (similar to MCP pages), not tool registrations. Paths: `workspace/skills/<name>/SKILLS.md`. The tool list above is fixed by the server; skills teach the agent how to use it.

Examples: `workspace/skills/solana_swaps/SKILLS.md`, `workspace/skills/clawstr/SKILLS.md`.

