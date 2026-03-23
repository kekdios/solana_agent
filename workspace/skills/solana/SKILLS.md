# Solana Agent Skills

**V3:** In-app chat always includes the full function-tool list from the server—never claim you lack wallet or workspace tools here.

When to use Solana tools and strategies. **You have these tools—use them when the user's request fits.** See TOOLS.md for full parameter and output specs.

## Native agent tokens (SABTC / SAETH / SAUSD)

When summarizing **diagnostics**, copy **`mint`**, **`built_in_mint`**, and **`mint_matches_built_in`** from the **tool JSON** only. For **SAETH**, **`built_in_mint`** must be **`AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS`** on this app—never substitute other mainnet “ETH” mints from memory.

| Tool | When |
|------|------|
| **`solana_token_balance`** | When the user asks how much SABTC, SAETH, SAUSD, or **agent dollars** they have. Pass **`token_symbol`** only (`SABTC`, `SAETH`, or `SAUSD`)—server resolves mint; do not paste mints for these three. |
| **`solana_agent_token_send`** | When the user clearly wants to **send** one of those symbols (**Tier 4**). `token_symbol`, `to`, `amount_ui` or `amount`. |
| **`treasury_pool_info`** | **Read-only** pool snapshot (vault balances, spot price as token B per 1 token A, tick, liquidity, fees) using Orca API with RPC decode fallback. `pair`: `SABTC_SAUSD` (default) or `SAETH_SAUSD`, or `pool_address`. Optional `orca_proxy_base_url` for a custom proxy. For **market-making / monitoring**; not an executable quote—use **`treasury_pool_swap`** + **`dry_run:true`** to simulate a size. |
| **`treasury_pool_swap`** | When the user wants to **trade** SABTC/SAETH against SAUSD in the **native Whirlpool** (not Jupiter). `input_token_symbol`, `output_token_symbol`, `amount` or `amount_ui`. Use **`dry_run:true`** first if unsure. **Tier 4**. **Not** gated by Settings → Swaps **`SWAPS_EXECUTION_ENABLED`** / **`SWAPS_ENABLED`** (those are **Jupiter** only). Real tool results include **`_treasury_swap_server`**. |

Canonical mints are **built in** for send/swap; for balance use **`token_symbol`** for the three native tokens. Use **`solana_transfer_spl`** only for **other** SPL mints (e.g. USDC).

## Important: wallet is built in

**Do NOT ask the user for their wallet address or a file location** (e.g. wallet_address.txt). There is **no** `account_balance` tool—use **`solana_balance`** and **`solana_token_balance`** only. The app wallet is already configured (Settings / encrypted config). For balance checks, capital, top-up, SOL, USDC, or "check my wallet"—call the tools **immediately** and report; never say you need an address first.

### `solana_balance` rows (no invented tickers)

Each SPL row has **mint**, **decimals**, **uiAmount**. When the server adds **token_symbol**, copy that label only for that row (e.g. **USDC**, **USDT**, **SABTC**, **SAETH**, **SAUSD**). **Never** put the same uiAmount on two different mints—**decimals + mint** identify the asset (e.g. **8.9** with **8** decimals on **`2kR1…`** is **SABTC**, not USDC). If **token_symbol** is absent, report **mint + decimals + uiAmount** only. Do not invent portfolio USD totals.

## Configuration

- **RPC:** Set `SOLANA_RPC_URL` in Settings → Environment (or in app config; .env is for testing only).
- **Wallet:** The app wallet is configured in Settings (encrypted in config). All Solana tools use this wallet unless a tool accepts an optional `owner` (e.g. `solana_token_balance`); omit owner to use the app wallet.

---

## Wallet strategy

| User asks | Tool(s) to use |
| --------- | --------------- |
| "What's my Solana address?" / "Where do I receive SOL?" | `solana_address` (no args; wallet built in) |
| "How much SOL do I have?" / "Solana balance" / "Check my wallet" / "SOL and USDC" | `solana_balance` (no args); for USDC use `solana_token_balance` with USDC mint, omit owner. Do not ask for address. |
| "How much SABTC / SAETH / SAUSD?" / "agent dollars?" | `solana_token_balance` with **`token_symbol`** (e.g. `SABTC`)—not pasted mint. |
| "Check wallet balances" / "Give me SOL and USDC amounts" | `solana_balance` then `solana_token_balance` with USDC mint if needed. Wallet is built in—call tools directly. |
| "Send SOL to …" / "Transfer 0.1 SOL to …" | `solana_transfer` (confirm amount and recipient first) |
| "What network am I on?" / "Which RPC?" | `solana_network` |
| Token balance for a mint (e.g. USDC) | `solana_token_balance` (mint only; omit owner = app wallet) |
| Send SPL token (e.g. USDC by mint) | `solana_transfer_spl` (mint, to, amount in smallest units) |
| Send **SABTC / SAETH / SAUSD** (native symbols; built-in mints) | **`solana_agent_token_send`** (`token_symbol`, `to`, `amount` or `amount_ui`) — **Tier 4**; fee cap 0.001 SOL |
| **Pool state** (treasury Whirlpool: reserves, spot price, tick, fees) | **`treasury_pool_info`** — read-only; then **`treasury_pool_swap`** + `dry_run` to validate a trade size |
| **Swap** SABTC↔SAUSD or SAETH↔SAUSD (treasury pool) | **`treasury_pool_swap`** — Orca Whirlpool only; **Tier 4**; `dry_run` optional; no Jupiter execution toggle |
| "Recent transactions" / "Tx history" | `solana_tx_history` |
| "Did this tx confirm?" / "Status of signature …" | `solana_tx_status` |

**Do not send or treasury-swap without clear user intent.** Confirm amounts (and swap direction) before `solana_transfer`, `solana_transfer_spl`, **`solana_agent_token_send`**, or **`treasury_pool_swap`**.

---

## Swaps and prices (Jupiter)

| User asks | Tool(s) to use |
| --------- | --------------- |
| "SOL price" / "How much is SOL in USD?" | `jupiter_price` (default is SOL) |
| "Hyperliquid BTC/ETH price" / "HL perp mid" / compare pool to external | **`hyperliquid_price`** (default BTC+ETH; optional `coins`: e.g. `["SOL"]`) |
| "Price of [token]" | `jupiter_price` with ids (mint or "SOL", etc.) |
| "What would I get if I swapped 1 SOL for USDC?" / "Quote a swap" | `jupiter_quote` (input_mint, output_mint, amount) |
| **"Swap X to USDC" / "Sell my SOL" / "Execute a swap"** | **Prepare→confirm→execute flow:** `jupiter_swap_prepare` → user confirms → `jupiter_swap_execute`. See **`workspace/skills/solana_swaps/SKILLS.md`** for the full playbook. |

For **executing** swaps (not just quotes), use the prepare→confirm→execute flow. Read **skills/solana_swaps/SKILLS.md** for when to use each tool and examples.

---


## Sandbox (exec)

| User asks | Tool(s) to use |
| --------- | --------------- |
| "Run this script" / "Execute the code" / "Create a script that does X and run it" | `workspace_write` to create the file (e.g. `sandbox/script.js`), then `exec` with `command` (e.g. `node script.js`), `workdir` (e.g. `sandbox`), and optional `timeout` (seconds). |
| "What's in the sandbox?" / "Run ls in the workspace" | `exec({ command: "ls -la", workdir: "." })` or use `workspace_list` / `workspace_tree` for discovery. |

Commands run with the workspace (or workdir) as cwd; output is capped and timeout applies (default 60s, max 300s).

---

## Summary

- **Wallet:** address, balance, transfer SOL/SPL, native SABTC/SAETH/SAUSD (`solana_token_balance`, `solana_agent_token_send`, **`treasury_pool_info`**, **`treasury_pool_swap`**), network, tx history/status — use the matching tool.
- **Prices / swaps:** Jupiter for price and quote; no execution.
- **Sandbox:** Create scripts with `workspace_write`, run with `exec` (command, workdir, timeout).

When in doubt, call the tool and reason from the result. Do not say you cannot do something if a tool exists for it.
