# Plan: **Trading** page (dashboard)

**Status:** **Implemented (v1 + peg monitor)** — sidebar **Trading**, SQLite snapshots, **`/api/trading/*`**, wallet strip, and **peg monitor** status (**`GET /api/trading/peg-monitor`**, **`POST /api/trading/peg-monitor/run`**) showing resolved **`PEG_MONITOR_*`** env and last run persisted in **`trading_dashboard_meta`**. Still **no live swap broadcast** from this page (same as v1: **Refresh snapshot** is read-only capture; **Run peg check** only **dry-runs** Orca swaps).  
**Goal:** An operator dashboard: **real** Orca Whirlpool data for **SAUSD/SABTC** and **SAUSD/SAETH**, **Hyperliquid spot** mids for **UBTC/USDC (`@142`)** and **UETH/USDC (`@151`)** as BTC/ETH references, history in **`data/solagent.db`**, **wallet context**, plus visibility into the **peg bot** (chat tool **`peg_monitor_tick`**, cron **`peg_monitor`**, CLI **`npm run peg-monitor`**).

---

## Scope summary

| Area | Decision |
|------|-----------|
| Pools | **Actual** Orca Whirlpools for treasury pairs (same program + default addresses as **`docs/TREASURY_POOL_TRADING.md`**). |
| Reference prices | **Hyperliquid** — use **spot** mids for BTC and ETH (not perp), per product requirement. Resolve correct **spot** symbols / `@index` pair names from HL **`spotMeta`** + **`allMids`** (BTC/ETH on HL spot may use **`@…`** names or UI remappings such as UBTC — document at implementation time). |
| Persistence | New **SQLite tables** in **`data/solagent.db`** (append-only or snapshot rows with timestamps). |
| UI | New **Trading** entry in sidebar / nav; dedicated **dashboard** view (charts + tables + latest numbers). |
| Wallet | **Agent app wallet** only: **public address** + **token balances** on the dashboard. **Private key** remains **server-side only** (same storage/signing path as `solana_*` / `treasury_pool_*` tools). Do **not** expose private key material in the Trading UI by default; optional future parity with Settings “reveal key” is a separate, explicit decision. |

---

## Relationship to existing features

- **`treasury_pool_info`** / **`treasury_pool_swap`** already implement Orca reads and Whirlpool swaps for these pairs. The Trading page **reuses the same pool identities and wallet**, but adds **scheduled or on-demand snapshots**, **HL spot series**, and a **first-class UI** (not only chat tools).
- **`hyperliquid_price`** already supports **`market: "spot"`** and pair resolution (e.g. `HYPE`, `@107`). Implementation must add or reuse resolution paths for **BTC** and **ETH** **spot** legs as HL defines them (may differ from perp tickers `BTC` / `ETH` in **`allMids`**).
- **Wallet page** already shows address + tokens; Trading should **show the same wallet address** (and token summary) for context, possibly **focused** on SABTC / SAETH / SAUSD + link or copy to full Wallet.

---

## Data model (SQLite — proposed)

All new tables live in **`data/solagent.db`**. Exact DDL is deferred; **conceptual** tables:

1. **`trading_hl_spot_snapshot`** (or similar)  
   - `id`, `created_at` (server time), `btc_price_usd`, `eth_price_usd`, optional `btc_hl_key`, `eth_hl_key` (e.g. `@…`), optional `raw_json` for audit.  
   - Purpose: time series for dashboard charts (“HL spot BTC/ETH over time”).

2. **`trading_pool_snapshot`**  
   - `id`, `created_at`, `pair` (`SABTC_SAUSD` | `SAETH_SAUSD` or pool address), implied metrics from **`treasury_pool_info`**-equivalent data (e.g. price, tick, liquidity summary, vault balances if available).  
   - Purpose: AMM-side time series vs HL.

3. **Optional `trading_dashboard_meta`**  
   - Single row or kv: last successful fetch times, last error messages, sampling interval if periodic jobs exist.

**Migrations:** Follow existing pattern in **`db.js`** (conditional `hasColumn` / `CREATE TABLE IF NOT EXISTS`).

**Privacy / size:** Snapshots are **not** user chat content; cap retention or prune old rows if disk growth matters (policy TBD).

---

## Backend behavior (future implementation)

- **Read path:** Endpoints or internal jobs that (a) fetch HL spot BTC/ETH mids, (b) call existing pool read logic (Orca API + RPC fallback), (c) `INSERT` snapshot rows.  
- **Auth:** Same-origin session as rest of app; no new public API without auth if the app is exposed beyond localhost.  
- **Wallet signing:** Any future “trade from dashboard” button would use **server-side** signing with the **configured agent wallet** — identical policy to **`treasury_pool_swap`** (Tier 4, dry-run, etc.). Initial milestone can be **read-only dashboard** (snapshots + display only).

---

## Frontend — **Trading** page

- **Navigation:** New item **Trading** (alongside Chat, Wallet, Settings, …).  
- **Dashboard panels (minimum):**  
  - **Wallet:** public address (copy), SOL + SPL balances with emphasis on **SAUSD / SABTC / SAETH** (reuse or mirror Wallet APIs, e.g. `GET /api/solana-wallet/balance` patterns).  
  - **Hyperliquid spot:** latest BTC & ETH spot mids + small sparkline or chart from DB history.  
  - **Pools:** latest implied prices / key stats for **SABTC/SAUSD** and **SAETH/SAUSD** + charts from DB.  
  - **Spread / basis (optional):** computed column: pool implied vs HL spot (with clear disclaimer: not executable, basis risk SA vs underlying).  
- **Refresh:** Manual **Refresh snapshot** + **Run peg check** (peg tick). Optional auto-refresh interval (configurable later).
- **Peg monitor:** Panel lists when the bot can run (tool, cron, CLI, POST), effective **`PEG_MONITOR_*`** values, and last completed summary / SABTC·SAETH bps + dry-run status from DB.

---

## Security and compliance notes (for implementers)

- **Private key:** Never log full key; never return in JSON to renderer except an explicit Settings-style reveal flow if product requires it.  
- **RPC / rate limits:** Snapshot loops should respect existing **`SOLANA_RPC_PACE_MS`** / staggering patterns where RPC is used.  
- **Hyperliquid:** Spot mids are **reference** only; label charts accordingly.

---

## Documentation updates (this repo)

- **`docs/README.md`** — index row pointing here.  
- **`docs/TREASURY_POOL_TRADING.md`** — short “Planned: Trading dashboard” pointer.  
- **`docs/PLAN_AMM_SIMULATOR_PYTHON.md`** — “See also” for **in-app** Trading vs **offline Python** simulator.  
- Root **`README.md`** (optional later) — one bullet under UI when shipped.

---

## Milestones (suggested)

1. **DB schema + migration** — snapshot tables only.  
2. **Server snapshot job or POST trigger** — HL spot + `treasury_pool_info` payload persisted.  
3. **GET API** — latest + time-range for charts.  
4. **Trading page** — wallet strip + tables/charts.  
5. **Polish** — auto-refresh, retention policy, HL symbol documentation in-code comments.

---

## Open questions (resolve before coding)

- Exact **Hyperliquid spot** keys for BTC and ETH on mainnet at implementation time (check **`spotMeta`** + docs for remappings).  
- Snapshot **frequency** (on page load only vs background cron vs both).  
- Whether Trading page allows **one-click dry-run swap** or stays **read-only** v1.

---

*End of plan.*
