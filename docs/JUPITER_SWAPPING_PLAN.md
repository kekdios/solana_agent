# Jupiter swapping plan (sovereign + hardened)

Build SOL→USDC swap execution into the desktop agent as a **self-custody trading primitive**: locally signed, deterministically constrained, and resistant to prompt injection / parameter drift.

---

## 1) Principles (non-negotiable)

- **Self-custody only**: swaps are signed locally with the app wallet. Never use custodial reserve APIs (e.g. the website SOL→BTC reserve swap).
- **AI proposes; system enforces; user commits**: the model cannot execute a swap from free-form parameters.
- **Deterministic constraints > AI judgment**: caps, allowlists, and checks must be enforced server-side.
- **No `exec` path to spend funds**: swaps must occur through a narrow swap tool, not shell scripts.

---

## 2) Tier integration

- **Tier 1–3**: quote-only (`jupiter_quote`) + read-only wallet tools.
- **Tier 4**: swap execution enabled, but **still** requires intent binding + explicit confirmation.

---

## 3) Tool design: intent binding (prepare → execute)

### Tool A — `jupiter_swap_prepare`

**Purpose**: create a server-stored, immutable swap intent.

**Inputs**

- `input_mint`, `output_mint`
- `amount` (string, smallest units)
- `slippage_bps` (number)
- optional: `only_direct_routes` (boolean)

**Server actions**

1. Validate **policy** (allowlist + caps + tier + swaps enabled).
2. Fetch a Jupiter quote (fresh).
3. Compute:
   - `expected_out_amount`
   - `min_out_amount` (from slippage)
   - route summary + estimated fees
4. Store an intent record in SQLite:
   - full quote payload (canonical JSON) + `quote_hash`
   - policy snapshot
   - `created_at`, `expires_at` (TTL)
   - status: `prepared`

**Returns**

- `intent_id`
- `summary` (human readable, exact values)
- `expires_at`

---

### Confirmation (must be bound to the intent)

No execution happens until the user explicitly confirms the intent:

- UI: “Execute swap” button bound to `intent_id`, or
- Chat: explicit confirmation referencing `intent_id` (e.g. `confirm swap <intent_id>`).

---

### Tool B — `jupiter_swap_execute`

**Purpose**: execute only a stored intent.

**Inputs**

- `intent_id`

**Server actions (strict order)**

1. Load intent and validate:
   - status = `prepared`
   - not expired
   - Tier = 4 and swaps enabled
2. **Wallet mutex**: only one swap execution at a time per wallet.
3. **Swap lock (default ON)**: while `executing`, block other high-risk tools (at minimum `exec` and `fetch_url` POST).
4. **Execution-time re-quote check**:
   - fetch a fresh quote for the same params
   - abort if deviation exceeds a threshold (bps)
5. Request serialized swap transaction from Jupiter.
6. **Mandatory simulation** with explicit checks:
   - **min-out enforcement** via simulated token balance delta: output delta ≥ stored `min_out_amount`
   - input delta ≈ intended input (tolerance for wrap/fees)
   - **program allowlist**: reject unexpected program IDs/instructions
   - fee + compute within bounds
7. If simulation passes: sign locally, send, confirm.
8. Persist:
   - signature, slot, status transitions: `executing → sent → confirmed` (or `failed`)

**Returns**

- `ok`, `signature`, confirmation status, and the same summary.

---

### Tool C — `jupiter_swap_cancel` (recommended)

Cancels a prepared intent and prevents later execution.

---

## 4) Guardrails (enforced server-side, snapshotted into the intent)

All guardrails are stored in the config table (Settings UI), and the values used are copied into the intent so execution can’t be affected by mid-flight config changes.

Recommended policy keys:

- `SWAPS_ENABLED` (default false)
- `ALLOWED_OUTPUT_MINTS` (start: USDC only)
- `MAX_SLIPPAGE_BPS` (default 50)
- `MAX_SWAP_SOL` (absolute cap)
- `MAX_SWAP_PCT_BALANCE` (e.g. 20%)
- `SWAP_COOLDOWN_SECONDS`
- `MAX_SWAPS_PER_HOUR`
- `MAX_SWAPS_PER_DAY`
- `MAX_DAILY_SWAP_SOL_VOLUME`
- `QUOTE_DEVIATION_BPS_MAX` (execute-time re-quote threshold)
- `MAX_TX_FEE_LAMPORTS` and compute cap

---

## 5) Storage: `swap_intents` table (SQLite)

Create `swap_intents` with:

- `intent_id` (UUID, PK)
- wallet pubkey
- request params (mints, amount, slippage)
- quote JSON + `quote_hash`
- `expected_out_amount`, `min_out_amount`
- policy snapshot JSON
- state machine fields (`status`, `created_at`, `expires_at`, `signature`, errors)
- indexes on `status`, `created_at`, and wallet pubkey

---

## 6) UI changes

### Settings

Add a Swaps section (Tier 4 only):

- enable swaps toggle
- slippage default + maximum
- per-swap caps + % cap
- cooldown/rate limits + daily volume cap
- sovereignty warning (this signs transactions with your local wallet)

### Confirmation UX

When `prepare` returns an intent:

- Show a compact confirmation summary:
  - “Swap 1.00 SOL → ~172.3 USDC (min 171.4)”
  - slippage, route, estimated fee
- Require explicit confirm tied to `intent_id`.

---

## 7) Implementation milestones (recommended order)

1. Add `swap_intents` storage + cleanup for expired intents
2. Implement `prepare` (policy checks + quote + intent storage)
3. Implement wallet mutex + swap lock (default ON)
4. Implement `execute` with re-quote check + simulation enforcement
5. Add Settings controls for swap policies + Tier 4 gating
6. Add UI confirmation flow
7. Devnet validation, then mainnet with tiny caps

---

## 8) Out of scope (v1)

- Fully autonomous trading loops/strategies
- Multi-swap portfolio rebalancing
- Large-trade splitting (can be added later)

