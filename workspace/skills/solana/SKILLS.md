# Solana Agent Skills

When to use Solana tools and strategies. **You have these tools—use them when the user's request fits.** See TOOLS.md for full parameter and output specs.

## Native agent tokens (SABTC / SAETH / SAUSD)

When summarizing **diagnostics**, copy **`mint`**, **`built_in_mint`**, and **`mint_matches_built_in`** from the **tool JSON** only. For **SAETH**, **`built_in_mint`** must be **`AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS`** on this app—never substitute other mainnet “ETH” mints from memory.

| Tool | When |
|------|------|
| **`solana_token_balance`** | When the user asks how much SABTC, SAETH, SAUSD, or **agent dollars** they have. Pass **`token_symbol`** only (`SABTC`, `SAETH`, or `SAUSD`)—server resolves mint; do not paste mints for these three. |
| **`solana_agent_token_send`** | When the user clearly wants to **send** one of those symbols (**Tier 4**). `token_symbol`, `to`, `amount_ui` or `amount`. |

Canonical mints are **built in** for send; for balance use **`token_symbol`** for the three native tokens. Use **`solana_transfer_spl`** only for **other** SPL mints (e.g. USDC).

## Important: wallet is built in

**Do NOT ask the user for their wallet address or a file location** (e.g. wallet_address.txt). There is **no** `account_balance` tool—use **`solana_balance`** and **`solana_token_balance`** only. The app wallet is already configured (Settings / encrypted config). For balance checks, capital, top-up, SOL, USDC, or "check my wallet"—call the tools **immediately** and report; never say you need an address first.

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
| Send **SABTC / SAETH / SAUSD** (native symbols; built-in mints) | **`solana_agent_token_send`** (`token_symbol`, `to`, `amount` or `amount_ui`) — **core send**; **Tier 4**; rejects if estimated network fee exceeds 0.001 SOL |
| "Recent transactions" / "Tx history" | `solana_tx_history` |
| "Did this tx confirm?" / "Status of signature …" | `solana_tx_status` |

**Do not send SOL, SPL, or native agent tokens without clear user intent.** Confirm amount and recipient before calling `solana_transfer`, `solana_transfer_spl`, or **`solana_agent_token_send`**.

---

## Swaps and prices (Jupiter)

| User asks | Tool(s) to use |
| --------- | --------------- |
| "SOL price" / "How much is SOL in USD?" | `jupiter_price` (default is SOL) |
| "Price of [token]" | `jupiter_price` with ids (mint or "SOL", etc.) |
| "What would I get if I swapped 1 SOL for USDC?" / "Quote a swap" | `jupiter_quote` (input_mint, output_mint, amount) |
| **"Swap X to USDC" / "Sell my SOL" / "Execute a swap"** | **Prepare→confirm→execute flow:** `jupiter_swap_prepare` → user confirms → `jupiter_swap_execute`. See **`workspace/skills/solana_swaps/SKILLS.md`** for the full playbook. |

For **executing** swaps (not just quotes), use the prepare→confirm→execute flow. Read **skills/solana_swaps/SKILLS.md** for when to use each tool and examples.

---

## Perps (Drift)

| User asks | Tool(s) to use |
| --------- | --------------- |
| "SOL perp price" / "Drift mark price" | `drift_perp_price` |
| "My Drift positions" / "Open perp positions" | `drift_positions` |
| "Place a perp order" | `drift_place_order` (stub; report if not yet implemented) |

---

## Lending (Kamino)

| User asks | Tool(s) to use |
| --------- | --------------- |
| "Kamino health" / "Lending health" / "Am I safe?" | `kamino_health` |
| "My Kamino positions" / "What am I supplying/borrowing?" | `kamino_positions` |
| "Deposit to Kamino" | `kamino_deposit` (stub; report if not yet implemented) |

Use `kamino_health` and `kamino_positions` when the user asks about lending status.

---

## Raydium and Bet (prediction markets)

| User asks | Tool(s) to use |
| --------- | --------------- |
| Raydium swap quote | `raydium_quote` (stub; prefer `jupiter_quote` for quotes) |
| Pump.fun → Raydium migration / memecoin | `raydium_market_detect` (stub) |
| "What prediction markets exist?" / "BET markets" | `bet_markets` |
| "My prediction market positions" | `bet_positions` |

---

## Sandbox (exec)

| User asks | Tool(s) to use |
| --------- | --------------- |
| "Run this script" / "Execute the code" / "Create a script that does X and run it" | `workspace_write` to create the file (e.g. `sandbox/script.js`), then `exec` with `command` (e.g. `node script.js`), `workdir` (e.g. `sandbox`), and optional `timeout` (seconds). |
| "What's in the sandbox?" / "Run ls in the workspace" | `exec({ command: "ls -la", workdir: "." })` or use `workspace_list` / `workspace_tree` for discovery. |

Commands run with the workspace (or workdir) as cwd; output is capped and timeout applies (default 60s, max 300s).

---

## Summary

- **Wallet:** address, balance, transfer SOL/SPL, native SABTC/SAETH/SAUSD (`solana_token_balance` + `token_symbol`, `solana_agent_token_send`), network, tx history/status — use the matching tool.
- **Prices / swaps:** Jupiter for price and quote; no execution.
- **Perps:** Drift for price and positions; place order is stub.
- **Lending:** Kamino for health and positions; deposit is stub.
- **Bet:** markets and positions.
- **Sandbox:** Create scripts with `workspace_write`, run with `exec` (command, workdir, timeout).

When in doubt, call the tool and reason from the result. Do not say you cannot do something if a tool exists for it.
