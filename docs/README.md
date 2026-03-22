# Solana Agent — Documentation

| Document | Description |
|----------|-------------|
| **SELF_CONTAINED_AGENT_APP_PLAN.md** | Architecture and rollout plan for the Mac Electron app: in-process server, Solana wallet in config, single codebase. |
| **VENICE_API.md** | Venice API reference for the Venice chat provider option (auth, endpoints, usage). |
| **WORKSPACE_FILE_HANDLING.md** | Technical description of workspace file handling in `tools/workspace.js` (security, path sanitization, exec sandbox). |
| **agent-prediction-arena-plan.md** | Plan for an agent-vs-agent prediction arena (paired matches, no AMM; out of scope for the desktop app). |
| **QUICK_START.md** | Owner/operator quick start: keys, wallet, tiers, swaps, autopilot, and backups. |
| **JUPITER_SWAPPING_PLAN.md** | Sovereign Jupiter swapping (implemented): intent binding, simulation enforcement, program allowlist, Tier 4 gating, and optional autopilot. |
| **SA_AGENT_TOKENS.md** | Native agent SPL send (**`solana_agent_token_send`**), canonical mints for **`solana_token_balance`**, **`treasury_pool_info`** / **`treasury_pool_swap`**, **`hyperliquid_price`** (BTC/ETH perp mids), optional overrides, Wallet panel. |
| **TREASURY_POOL_TRADING.md** | SABTC/SAETH/SAUSD Whirlpool pools: **Orca SDK only** (no Jupiter for these pairs), agent tool **`treasury_pool_swap`**, pool addresses, **`npm run verify:treasury-trade-path`**. Live swaps are recorded in **`swap_intents`** for the Wallet **Agent** badge (same as Jupiter executes). |

The main project README is in the repository root. A dedicated website for Solana Agent is at **https://solanaagent.app**.
