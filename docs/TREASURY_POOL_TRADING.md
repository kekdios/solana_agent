# Treasury Whirlpool pools — trading plan

## Stack (agreed)

| Layer | Use |
|--------|-----|
| **Pool reads** | Custom RPC / `https://www.solanaagent.app/api/orca/pool/...` (Orca indexer optional). |
| **Execution** | **Orca only:** **`@orca-so/whirlpools-sdk`** — quote + build swap transactions against the known Whirlpool addresses on-chain. **Do not use Jupiter** for these treasury pairs. |
| **Not required** | Pools being “officially listed” on Orca’s marketing UI — SDK talks to **on-chain** Whirlpool accounts. |

Default mainnet addresses (override via env / Settings when integrated):

- **SAUSD** `CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG`
- **SABTC** `2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy`
- **SAETH** `AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS`
- **Whirlpool SABTC/SAUSD** `GSpVz4P5HKzVBccAFAdfWzXc1VYhGLKvzRNQZCw4KCoJ`
- **Whirlpool SAETH/SAUSD** `BzwjX8hwMbkVdhGu2w9qTtokr5ExqSDSw9bNMxdkExRS`
- **Whirlpool program** `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc`

**A/B:** Never assume SAUSD is always token B — compare mints to `tokenMintA` / `tokenMintB` on-chain.

> **Note:** The app may still expose **Jupiter** tools for unrelated swaps (e.g. SOL/USDC). That is separate from **treasury SABTC/SAETH/SAUSD** pool trading, which stays **strictly Orca**.

## Pre-flight: confirm a trade *can* be built (no agent code required)

```bash
npm run verify:treasury-trade-path
```

This script (`scripts/verify-treasury-trade-path.js`) uses **only** the Orca Whirlpool SDK: `swapQuoteByInputToken` + `pool.swap()`, and checks that the compressed instruction bundle is **non-empty**.

**PASS criteria:** all **4** checks succeed (both pools × both input-mint directions). Use a reliable RPC if public endpoints return **429**.

## Integration status

- **Agent tools:** **`treasury_pool_info`** in `tools/treasury-pool-info.js` — read-only pool snapshot (Orca REST → on-chain decode, aligned with **[solanaagent.app](https://www.solanaagent.app/sabtc.html)** / `website/api-server.cjs`). **`treasury_pool_swap`** in `tools/treasury-pool-swap.js` — Whirlpool SDK execution only; both wired in **`server.js`** + **`config/tools.yaml`**.
- **Policy:** **`treasury_pool_swap`** (Orca Whirlpool) is **not** gated by **`SWAPS_ENABLED`** / **`SWAPS_EXECUTION_ENABLED`** (those apply to **Jupiter** and related flows). **`dry_run:true`** still simulates without broadcast. **Tier 4** is still required for the tool in tiered mode.
- **LP** remains out of scope until specified.
- **Wallet “Agent” badge:** successful live **`treasury_pool_swap`** txs are written to **`swap_intents`** (status `succeeded` + signature), same table as **`jupiter_swap_execute`**, so the Wallet panel can flag them as agent-executed.

## Periodic peg checks (`HEARTBEAT.md`)

For **automated agent turns** that re-check pool vs reference prices (Hyperliquid mids), use the **chat heartbeat**: set **`HEARTBEAT_INTERVAL_MS`** in Settings → Environment and keep the **Chat** view open. The model reads **`workspace/HEARTBEAT.md`** when the default heartbeat user message fires. The repository ships a default checklist in **`workspace/HEARTBEAT.md`** (SABTC/SAETH vs HL, balances, dry-run swap, logging); edit under your **`WORKSPACE_DIR`**. **V3:** If the user asks directly for the **text** of `heartbeat.md`, the server may inject the file from disk before the LLM (see root **README.md**). The **`cronjob`** task **`heartbeat`** is **only** a server health log—it does **not** run this checklist.
