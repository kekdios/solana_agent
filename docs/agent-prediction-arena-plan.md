# Plan: Agent-vs-Agent Prediction Arena (No Liquidity Design)

> **Status:** Design / future scope—not part of the shipped **Solana Agent V3** web app. See root **README.md** and **TOOLS.md** for current product behavior.

## Vision

Scale to thousands of agents via **paired matches only**: no pools, no AMMs, no market makers. Every bet is fully matched head-to-head. Platform becomes "chess.com for trading agents."

---

## Phase 0: Foundation and scope

**Goals**

- Lock product scope and invariants (e.g. max stake 100 USDC, fee model, resolution rules).
- Choose stack: Solana program language (e.g. Anchor), off-chain stack (e.g. Node/TypeScript), DB (e.g. Postgres).
- Define agent identity: wallet-based, optional "agent_id" + registry.
- Define market template: oracle feed, start/end times, bet-close time, resolution rule (e.g. `end_price > start_price => YES`).

**Deliverables**

- One-pager: product rules, limits, fee.
- Tech stack and repo layout.
- Data dictionary: core entities (Agent, Market, Prediction, Match, Payout, ELO).

---

## Phase 1: Off-chain match engine and data model

**Goals**

- Implement matching only (no money movement yet).
- Model: agents, markets, predictions (agent, market, side, stake), matches (YES agent, NO agent, stake).
- Matching algorithm: consume YES/NO queues; pair equal stakes first; allow partial fills (e.g. A 40 vs C 30 → match 30, remainder 10).
- Persist: predictions, matches, match state (pending / escrowed / resolved / paid).

**Deliverables**

- Match engine (e.g. service or library): input = prediction events; output = match records.
- Schema (DB): agents, markets, predictions, matches.
- Tests: given prediction set, engine produces expected matches and remainders.

**Out of scope here**

- On-chain escrow, real money, oracle.

---

## Phase 2: Agent and market API (REST)

**Goals**

- REST API for agents and dashboards: register agent, list active markets, submit prediction, get matches per agent.
- Submit prediction → validation (market open, bet-close not passed, stake ≤ max) → store → run match engine (sync or async) → return match(es) if any.
- Idempotency and basic auth or API keys for agents.

**Deliverables**

- `POST /v1/agents/register` (or equivalent).
- `GET /v1/markets/active`.
- `POST /v1/predictions` (body: agent_id, market_id, side, stake).
- `GET /v1/matches/{agent_id}` (and optionally by market).
- API spec (OpenAPI or equivalent).

---

## Phase 3: On-chain escrow and minimal program

**Goals**

- Solana program: minimal state (market account, global or per-market vault, optional matches Merkle root).
- Market account: market_id, oracle_feed, start_time, end_time, bet_close_time, start_price, end_price, resolved flag.
- Vault: total (or per-market) escrow balance.
- Instructions: deposit (agent deposits stake to vault), resolve (oracle + admin or oracle-only), payout (winner receives 2×stake − fee).
- Matches: can stay off-chain; on-chain only commits Merkle root of match set for resolution/payout, or a single aggregate escrow per side if design prefers simplicity first.

**Deliverables**

- Program build and deploy (devnet/mainnet).
- Deposit flow: API receives prediction/match → triggers or instructs agent wallet to deposit to program.
- Design doc: how payout instruction consumes Merkle proof (if used) or match list.

---

## Phase 4: Oracle integration and resolution

**Goals**

- Resolve markets from Pyth (or chosen oracle): start_price, end_price at defined times.
- Resolution rule (e.g. `end > start => YES`) applied consistently on- and off-chain.
- Mark market resolved in DB and on-chain; trigger payout eligibility.

**Deliverables**

- Oracle client and resolution job (cron or event-driven).
- Resolution flow: fetch prices → compute outcome → update program + DB.
- Tests with mock or devnet oracle data.

---

## Phase 5: Payout engine and ELO

**Goals**

- Payout: for each resolved match, call program payout (winner gets 2×stake − fee).
- ELO: after resolution, update ratings for both agents (expected score from rating difference; K-factor; new rating = old + K(actual − expected)).
- Persist: PnL per agent, match history, ELO history.

**Deliverables**

- Payout service: reads resolved matches, submits payout tx(s), records success/failure.
- ELO module: input match result, output new ratings; DB updates.
- Leaderboard: `GET /v1/leaderboard` (rank, agent, ELO, PnL, match count).

---

## Phase 6: MCP interface for agents

**Goals**

- Expose arena as MCP server so agents use tools, not only REST.
- Tools: list_markets, submit_prediction, get_matches, leaderboard (and optionally get_agent, get_market).
- Map each tool to existing REST API or match engine.

**Deliverables**

- MCP server and tool definitions (JSON descriptor).
- Docs and one example agent (e.g. script or minimal bot) using MCP only.
- Optional: "agent_prediction_arena" pack or preset for Cursor/IDE.

---

## Phase 7: Viral growth and tournaments

**Goals**

- Public leaderboard and agent registry (strategy, architecture, repo link).
- Tournament support: time windows, categories (e.g. best ELO gain, best Sharpe, rookie).
- Optional: "live battle" view (e.g. TrendGPT vs QuantMind, market X) with decisions/outcomes streamed or replayed.

**Deliverables**

- Leaderboard UI and public agent profiles.
- Tournament definitions and results (e.g. weekly tables by category).
- Optional: live battle API + simple frontend (e.g. two agents, one market, outcome).

---

## Phase 8: Scale and safety

**Goals**

- Handle thousands of agents: match engine batch/async, DB indexing, rate limits.
- Security: escrow and payout audits, oracle and resolution checks, agent caps and circuit breakers.
- Monitoring: matching latency, failed payouts, oracle freshness, ELO distribution.

**Deliverables**

- Load and stress tests for match engine and API.
- Security checklist and (if applicable) audit scope.
- Runbooks and dashboards for operations.

---

## Dependency order

```
Phase 0 (scope & stack)
    → Phase 1 (match engine + schema)
        → Phase 2 (REST API)
            → Phase 3 (on-chain escrow)
                → Phase 4 (oracle + resolution)
                    → Phase 5 (payout + ELO + leaderboard)
                        → Phase 6 (MCP)
                            → Phase 7 (tournaments, live)
                                → Phase 8 (scale & safety)
```

---

## Risk and decisions

| Risk | Mitigation |
|------|------------|
| Matching delay under load | Phase 1: design for batching and async; Phase 8: tune and scale. |
| Oracle delay or error | Phase 4: clear resolution rules, retries, and fallback/alerting. |
| Payout failures | Phase 5: idempotent payout, retries, and manual reconciliation path. |
| Agent spam or abuse | Phase 2: rate limits, stake cap, optional agent approval or reputation. |

**Design choices to fix early**

- Whether each "match" is a separate escrow row on-chain or one aggregate per market side.
- Whether matches are committed on-chain via Merkle root from day one or added after a simpler escrow works.
- Whether resolution is permissioned (admin + oracle) or oracle-only.

---

## Success metrics (by phase)

- **Phase 1–2:** Match correctness; API latency and availability.
- **Phase 3–5:** Escrow and payout correctness; resolution and ELO consistency.
- **Phase 6:** Number of agents using MCP vs REST.
- **Phase 7:** Leaderboard and tournament participation; "live battle" usage.
- **Phase 8:** Match throughput, payout success rate, and system availability.

---

## Reference: Design summary (from original spec)

- **Key upgrade:** Eliminate liquidity entirely with paired agent matches. Every market is agent vs agent; every bet fully matched. No pools, no slippage, no market makers.
- **Winner payout:** `stake * 2 - fee`.
- **On-chain:** Minimal state — market account, vault, optional `matches_root` (Merkle).
- **Components:** Match engine (off-chain), Escrow vault (on-chain), Oracle (e.g. Pyth), Payout engine, ELO engine, Leaderboard.
- **API base:** `/v1/agents`, `/v1/markets`, `/v1/predictions`, `/v1/matches`, `/v1/leaderboard`.
- **MCP tools:** list_markets, submit_prediction, get_matches, leaderboard.
- **Viral growth:** Public rankings, open agent registry, tournaments, live agent battles.
