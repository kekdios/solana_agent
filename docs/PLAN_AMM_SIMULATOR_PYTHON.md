# Plan: Python AMM trading simulator (adaptive bot + dashboard)

**Status:** Planning only — no implementation in this repo yet.  
**Audience:** You (or a future implementer) building a **local Python** simulation **alongside** Solana Agent, not inside `server.js`.

**See also:** **`docs/PLAN_TRADING_PAGE.md`** — **in-app Trading** dashboard (Orca + HL spot snapshots, wallet strip, **peg monitor** UI + **`PEG_MONITOR_*`**, **`/api/trading/peg-monitor`**). **`peg_monitor_tick`** / cron **`peg_monitor`** implement HL-vs-pool **dry-run** checks in Node. **`browse`** may use **SerpApi** when **`SERPAPI_API_KEY`** is set. All **Node/React + `solagent.db`**, not Python.

---

## Executive summary

The spec below is a solid **learning and research** stack: constant-product AMMs, a synthetic “Hyperliquid-like” feed, a single adaptive allocator, and a dashboard. Mapped onto **this project**, the *economic* story matches what operators already care about—**implied pool prices vs external reference mids**—but the **on-chain reality here is Orca Whirlpool (concentrated liquidity)**, not a toy `x * y = k` pool. The simulator is still valuable if you treat it as **step one** (intuition + strategy plumbing) and optionally **step two** (closer Whirlpool math or live `treasury_pool_info` snapshots).

---

## Opinion — grounded in this repo’s tokens and Orca pools

### What the agent actually uses

- **Tokens:** **SABTC**, **SAETH**, **SAUSD** (agent-branded SPL; canonical mints; `solana_agent_token_send`, `solana_token_balance`). In UX/docs, SAUSD is the stable **quote** side for agent-dollar thinking.
- **Pools:** **Orca Whirlpool** pairs (e.g. SABTC/SAUSD, SAETH/SAUSD) via **`treasury_pool_info`** (read) and **`treasury_pool_swap`** (execute, Tier 4, policy-gated). See **`docs/TREASURY_POOL_TRADING.md`** and **`docs/SA_AGENT_TOKENS.md`**.
- **External reference:** **`hyperliquid_price`** — **perp** mids by default (BTC, ETH, …); optional **`market: "spot"`** for HL spot-style keys (e.g. HYPE, `@107`). Mids are **not** executable quotes; they are **comparison** anchors—same role your simulator assigns to “external BTC/ETH.”

### How the proposed simulator relates

| Simulator piece | This project analogue | Caveat |
|-----------------|------------------------|--------|
| USDC/BTC, USDC/ETH CP AMM | **Conceptually** like “volatile vs stable” legs (SABTC/SAUSD, SAETH/SAUSD) | Real pools are **Whirlpool CLMM**, not constant product; price impact and liquidity live **in ticks**, not a single global `k`. |
| Mock HL BTC/ETH series | **`hyperliquid_price`** in production | For sim, mock is fine; for **validation**, you could later **log or pull** real mids into an offline notebook (still not “coding” this task—just a future hook). |
| Arbitrage AMM vs external | Same **narrative** as **`workspace/HEARTBEAT.md`** peg / monitoring checklist | On-chain fees, slippage, execution lag, and **SA** vs **spot BTC/ETH** basis mean edges in sim won’t transfer 1:1. |
| LP strategy | “Add liquidity” in toy AMM | Real LP is **range**, **IL**, and **Orca** instructions—your simplified LP is a **placeholder** until you model ranges or ignore LP and focus on swap-only bots. |

### Strategic opinion

1. **Keep the constant-product simulator** — It is the right **teaching** and **prototyping** surface for: portfolio accounting, multi-strategy routing, adaptive weights, and dashboard storytelling.
2. **Rename mentally (or in docs)** — e.g. “toy USDC/BTC” → “abstract SABTC-style leg vs USD quote” so you don’t confuse future you into thinking this *is* Whirlpool math.
3. **Hold baseline is essential** — With random-walk or tuned noise, **momentum / mean reversion** can look artificially good. Always plot **buy-and-hold** (or fixed 50/50) vs bot; consider **walk-forward** or different RNG seeds.
4. **Arbitrage is the most “on-brand” strategy** for this codebase — It mirrors **external mid vs pool implied** thinking; tune thresholds to include **fee + buffer** as you already imply in the spec.
5. **Next step after sim works** — Optional “phase 2”: drive **external** series from saved HL mids; optional “phase 3”: approximate **CLMM** slice (single tick range) or call **read-only** pool APIs offline—without mixing into the Electron/Node app unless you explicitly want that.

---

## Your spec (preserved structure)

### Goal

Create a local simulation that:

- Models two AMM pools (USDC/BTC and USDC/ETH)
- Uses an external price feed (mock Hyperliquid prices for BTC and ETH)
- Runs a single adaptive bot that allocates capital across both markets
- Learns which strategies perform best over time
- Displays a real-time dashboard of performance and behavior

---

### Core components

#### 1. AMM engine

Implement a constant product AMM for each pool:

- Pools: USDC/BTC, USDC/ETH  
- Formula: `x * y = k`  
- Include: `swap_x_for_y`, `swap_y_for_x`, `price()`  
- Include fee (e.g. 0.003)

#### 2. External price feed

Simulate Hyperliquid prices:

- Generate BTC and ETH price series (random walk or trend + noise)  
- Example: BTC starts at 30,000; ETH starts at 2,000  

Expose: `btc_price`, `eth_price`

#### 3. Portfolio

Track bot holdings: USDC, BTC, ETH  

Functions: `total_value(btc_price, eth_price)`

#### 4. Strategies

Four strategies:

**a) Arbitrage (per pool)**  
- Compare AMM price vs external price  
- Trade if edge > threshold (include fees + slippage buffer)

**b) Momentum**  
- If price increasing → buy; if decreasing → sell

**c) Mean reversion**  
- Compare to moving average; trade toward mean

**d) LP (simplified)**  
- Add liquidity to pool; track contribution (no full LP token system initially)

#### 5. Adaptive bot (single bot controlling all strategies)

- Maintains: strategy scores, last action, portfolio value before/after action  
- Logic: weighted random by scores; pick market (BTC or ETH); execute; measure PnL change; update scores (profitable ↑, unprofitable ↓)  
- Prevent: overtrading (cooldown / min time); avoid full capital in one trade

#### 6. Simulation loop

Each step:

1. Update prices  
2. Update AMM state  
3. Bot decides action  
4. Execute trade  
5. Update portfolio value  
6. Update strategy scores  
7. Log metrics  

Run for 1000+ steps

---

### Dashboard (required)

Use matplotlib, Plotly, or Streamlit.

Display:

1. **Portfolio value over time** — bot vs hold baseline  
2. **Strategy weights** — scores over time  
3. **AMM vs external price** — BTC and ETH  
4. **Trades log** — time, strategy, market, size, estimated edge  
5. **Pool state** — reserves and AMM prices  

---

### Key requirements

- Modular: `amm.py`, `strategies.py`, `bot.py`, `simulation.py`, `dashboard.py`  
- Configurable: fees, thresholds, volatility, initial liquidity  
- Simple but extensible  

---

### Bonus (if time permits)

- Slippage-aware sizing  
- Latency simulation (not every tick)  
- Per-strategy PnL attribution  
- Multiple competing bots  

---

### Output

- Working simulation script  
- Live-updating dashboard  
- Clean, readable code  

The system should show: which strategies win, how the bot adapts, how AMM tracks external prices, and where profits come from.

---

## Suggested milestones (add-on)

1. **M1 — AMM + feed + portfolio + log to CSV** (no UI)  
2. **M2 — Four strategies + arb-only baseline**  
3. **M3 — Adaptive bot + cooldown + position limits**  
4. **M4 — Streamlit dashboard**  
5. **M5 (optional) — Feed from recorded `hyperliquid_price`-style series; doc link to SA/Whirlpool reality**

---

## References in this repository

- **`docs/TREASURY_POOL_TRADING.md`** — Whirlpool, dry-run, heartbeat context  
- **`docs/SA_AGENT_TOKENS.md`** — SABTC / SAETH / SAUSD, treasury tools  
- **`TOOLS.md`** — `hyperliquid_price`, `treasury_pool_info`, `treasury_pool_swap`  
- **`workspace/HEARTBEAT.md`** — Anti-fabrication; real tool results for live agent (simulator is separate)

---

*End of plan.*
