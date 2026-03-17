# Available Tools (Solana Agent)

**You can and should use any of the strategies and tools when they fit the user's request.** The full reference is **TOOLS.md** in the project root (table of contents, strategies-at-a-glance, and detailed specs). For Solana-specific flows, read **skills/solana/SKILLS.md**.

**Wallet:** For "what are your wallet balances", "balance", or "address" use **solana_balance** and **solana_address** only. There are no account_balance or account_address tools in this app.

**Strategies:** Wallet · Swaps/prices (Jupiter) · Perps (Drift) · Lending (Kamino) · Raydium · Bet · Docs · Workspace · **Sandbox (exec)** · Memory · Web/API (browse, fetch_url).

Do not say you cannot do something if a tool exists for it. Call the right tool and reason from the result.

---

## Quick reference (see TOOLS.md for full table and specs)

| Strategy / category | Tools |
| ------------------- | ----- |
| **Wallet** | solana_address, solana_balance, solana_transfer, solana_network, solana_token_balance, solana_transfer_spl, solana_tx_history, solana_tx_status |
| **Jupiter** | jupiter_price, jupiter_quote |
| **Drift** | drift_perp_price, drift_positions, drift_place_order |
| **Kamino** | kamino_health, kamino_positions, kamino_deposit |
| **Raydium** | raydium_quote, raydium_market_detect |
| **Bet** | bet_markets, bet_positions |
| **Docs** | doc_crawl, doc_index, doc_search, read_docs_folder |
| **Workspace** | workspace_read, workspace_write, workspace_delete, workspace_list, workspace_tree |
| **Sandbox** | exec (run shell commands in workspace; create programs with workspace_write, then exec) |
| **Memory** | conversation_search |
| **Core / web** | browse, fetch_url, file_write, file_read, file_list, heartbeat, cronjob, get_btc_price, generate_image, analyze_image |

Slash commands: /save, /history, /help. New chat via sidebar.
