# Available Tools (Solana Agent)

**You can and should use any of the strategies and tools when they fit the user's request.** The full reference is **TOOLS.md** in the project root (table of contents, strategies-at-a-glance, and detailed specs). For Solana-specific flows, read **skills/solana/SKILLS.md**.

**Wallet:** For "what are your wallet balances", "balance", or "address" use **solana_balance** and **solana_address** only. There are no account_balance or account_address tools in this app.

**Strategies:** Wallet · Swaps/prices (Jupiter) · Docs · Workspace · **Sandbox (exec)** · Memory · Web/API (browse, fetch_url).

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
| **Wallet** | solana_address, solana_balance, solana_transfer, solana_network, solana_token_balance, solana_transfer_spl, solana_tx_history, solana_tx_status |
| **Jupiter** | jupiter_price, jupiter_quote |
| **Docs** | doc_crawl, doc_index, doc_search, read_docs_folder |
| **Workspace** | workspace_read, workspace_write, workspace_delete, workspace_list, workspace_tree — for **any** file/directory listing, call **workspace_tree** or **workspace_list** first; never invent file trees |
| **Sandbox** | exec (run shell commands in workspace; create programs with workspace_write, then exec) |
| **Memory** | conversation_search |
| **Core / web** | browse, fetch_url, file_write, file_read, file_list, heartbeat, cronjob, get_btc_price, generate_image, analyze_image |

Slash commands: /save, /history, /help. New chat via sidebar.
