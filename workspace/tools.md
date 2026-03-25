# Available Tools (Solana Agent)

**You can and should use any of the strategies and tools when they fit the user's request.** The full reference is **TOOLS.md** in the project root (table of contents, strategies-at-a-glance, detailed specs, Trading HTTP APIs). For Solana-specific flows, read **skills/solana/SKILLS.md**.

**Wallet:** For "what are your wallet balances", "balance", or "address" use **solana_balance** and **solana_address** only. There are no account_balance or account_address tools in this app.

**Strategies:** Wallet · Swaps/prices (Jupiter, CoinGecko SOL, **Hyperliquid** perp/spot mids) · **Treasury Orca** (**treasury_pool_info**, **treasury_pool_swap**) · **Peg monitor** (**peg_monitor_tick**, cron **peg_monitor**, Trading UI) · Docs · Workspace · **Sandbox (exec)** · Memory · Web/API (**browse**, **fetch_url**).

**`browse`:** Pass a **short search phrase** or a full **`https://` URL**. With **`SERPAPI_API_KEY`** in **`.env`**, search uses **SerpApi Google** organic results (better recall); otherwise DuckDuckGo Instant Answer + Wikipedia + domain fallback. Long sentences often miss — shorten the query or paste a URL.

Do not say you cannot do something if a tool exists for it. Call the right tool and reason from the result.

**Solana Agent V3:** In-app chat **always** receives the full function-tool list from the server. Never tell the user you have no tools or no workspace access in this app. For explicit “content of **HEARTBEAT.md** / **heartbeat.md**” questions, the server may read the file from disk before the model runs—see root **README.md** and **TOOLS.md**.

## Nostr (single-tool preference)

Use **`nostr_action`** as the default and preferred path for all Nostr tasks. This improves reliability by avoiding tool-routing ambiguity.

- **Publish post:** `nostr_action({ type: "publish", payload: { content: "..." } })`
- **Read feed:** `nostr_action({ type: "read", payload: { scope: "feed", limit: 20, ai_only: true } })` — `ai_only` uses OR of labels `ai`, `blockchain`, `defi` (override with `topic_labels`).
- **Read communities:** `nostr_action({ type: "read", payload: { scope: "communities" } })`
- **Health:** `nostr_action({ type: "read", payload: { scope: "health" } })`
- **Public feed:** `nostr_action({ type: "read", payload: { scope: "public_feed", limit: 20 } })`
- **Reply/react/profile:** use `type: "reply"` / `type: "react"` / `type: "profile"` payloads

Legacy website posting paths are removed; Nostr is direct relays via **`nostr_action`**.
- UI note: **Sidebar -> Nostr** opens the agent-post timeline (kind 1111, paged relay reads).

---

## Quick reference (see TOOLS.md for full table and specs)

| Strategy / category | Tools |
| ------------------- | ----- |
| **Wallet** | solana_address, solana_balance, solana_transfer, solana_network, solana_token_balance, solana_transfer_spl, **solana_agent_token_send** (SABTC/SAETH/SAUSD), solana_tx_history, solana_tx_status |
| **Jupiter / prices** | jupiter_price, jupiter_quote, get_sol_price_usd, **hyperliquid_price** (optional `market`: `"perp"` \| **`"spot"`**) |
| **Treasury pool (SABTC/SAETH/SAUSD)** | treasury_pool_info, treasury_pool_swap (Orca; Tier 4; **`dry_run`** for sim; see **docs/TREASURY_POOL_TRADING.md**) |
| **Peg monitor (HL vs pool, dry-run only)** | **peg_monitor_tick** (Tier 4); or schedule **cronjob** `{ task: "peg_monitor" }` (Tier 4); Trading page **Run peg check**; CLI **`npm run peg-monitor`**. Env **`PEG_MONITOR_*`** in **`.env`**. |
| **Docs** | doc_crawl, doc_index, doc_search, read_docs_folder |
| **Workspace** | workspace_read, workspace_write, workspace_delete, workspace_list, workspace_tree — for **any** file/directory listing, call **workspace_tree** or **workspace_list** first; never invent file trees |
| **Sandbox** | exec (run shell commands in workspace; create programs with workspace_write, then exec) |
| **Memory** | conversation_search |
| **Core / web** | **browse** (SerpApi if key set), fetch_url, file_write, file_read, file_list, heartbeat, **cronjob** (includes **peg_monitor**), get_btc_price, **trend_snapshot_read** (Trend page snapshot → `memory/trend-latest.json`), generate_image, analyze_image |

Slash commands: /save, /history, /help. New chat via sidebar.

**Trading UI (sidebar Trading):** Snapshot refresh (**HL + Orca** history), **Peg monitor** panel (effective **`PEG_MONITOR_*`**, last run, **Run peg check**). Not a substitute for **`peg_monitor_tick`** in chat — same backend logic.
