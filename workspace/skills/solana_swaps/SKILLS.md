# SKILL: Solana Swaps (Jupiter)

**Purpose**  
Execute **real** token swaps on Solana using Jupiter. This skill is **strict**: no simulation, no estimation, tools only.

**When to use**  
Trigger when the user says: "swap", "sell SOL", "convert SOL to USDC", "go to cash", "buy token", or any token conversion request. Default input SOL, output USDC—but **must** call prepare (never assume amounts or prices).

---

## Forbidden behavior (do not do this)

- **Do not** estimate or invent swap outputs (e.g. "~4.85 USDC"), prices, or balances. Get them from tools only.
- **Do not** simulate swaps in text (e.g. "Simulation passed", "Transaction signed & sent").
- **Do not** invent `intent_id` values. The only valid intent_ids are those returned by the `jupiter_swap_prepare` tool when it returns **ok:true**. If prepare returns **ok:false** (e.g. API error), do **not** output any intent_id or pretend a swap was prepared—say prepare failed and show the error. Pattern-like IDs (e.g. `1b2c3d4e-f5g6-7890-...`, `0a1b2c3d-...`) are **fabricated** (and invalid—UUIDs use hex 0-9a-f only). Do not output them. If confirm/execute returns "Not found", do **not** say "New Real Intent" or "I prepared a new one" with a new intent_id unless you actually called `jupiter_swap_prepare` this turn and are quoting its response.
- **Do not** produce a swap summary or "execution status" without having called the corresponding tool. If you did not call a tool, do not claim a swap was prepared or executed.
- **Do not** claim or imply that you executed a swap based on `solana_tx_history` or "recent transactions." Transaction history can include transfers, other apps, etc. The **only** proof that you executed a swap is a successful **jupiter_swap_execute** tool response that returns a real transaction signature. If you did not call `jupiter_swap_execute` and get back a signature in this conversation, you have not executed any swap—say so clearly.
- **Do not** report success or show a signature when the user clicked the **Execute** button in the chat card. That action does not run your tools—the UI calls the server directly. You have no `jupiter_swap_execute` result. Do not invent VERIFIED_SIGNATURE or SOLSCAN_URL. Point the user to the card (error or success shown there).

## Required behavior

- **Always** call `jupiter_swap_prepare` for swap requests. Never describe a prepared swap without calling the tool first.
- **Never** proceed to execution without a real `intent_id` from a prepare tool response.
- Report only what the tools return. If prepare fails, say so; do not invent success.
- **No result, no progress:** if any step returns `ok:false`, `error`, or verification failure, stop at that step and report the raw failure. Do not continue the flow.
- **Proof fields must be full values:** never abbreviate signatures/addresses/intent IDs when reporting execution results.
- **Simulated mode disclosure:** if a result is dry-run/simulated/stub, explicitly say no live on-chain action occurred.

**If tools fail**  
Say: *"I cannot execute this swap without the swap tools."* Do **not** simulate.

**Mental model**  
You are **not** a simulator. You are a controller that requests real quotes and executes real transactions. No tool = no action.

---

## 1. When to use swaps

| User intent | Action |
| ----------- | ------ |
| "Swap 1 SOL to USDC" / "Sell my SOL" / "Go to cash" | **Prepare** immediately (SOL → USDC default). |
| **"Swap $5 SOL" / "$5 worth of SOL" / "swap $X to USDC"** | User means **$X USD value**. Call **get_sol_price_usd** (CoinGecko—same as Wallet screen) to get SOL price, then **amount_lamports = round(X / price * 1e9)**. Then **jupiter_swap_prepare** with that amount. This matches the Wallet's USD value. Do **not** use jupiter_price for $→lamports (it can differ from Wallet); do not use a fixed SOL amount. |
| "Convert 0.5 SOL to USDC" | **Prepare** with amount in lamports (0.5 SOL = 500_000_000). |
| "How much would I get for 1 SOL?" / "Quote only" | Use **jupiter_quote** first; offer to prepare when they want to execute. |
| "Confirm swap abc-123" / "yes execute it" | Call **jupiter_swap_confirm** with that `intent_id`, then **jupiter_swap_execute** with the same id. |

Default output for "sell SOL" / "go to cash" is **USDC**. Use policy allowlists (see Settings); do not guess mints.

---

## 2. Exact tool flow (burn this in)

**Required flow (always):**

**Step 1 — Prepare**  
Call `jupiter_swap_prepare` with `input_mint`, `output_mint` (default SOL → USDC), `amount` (string, smallest units), optional `slippage_bps` (e.g. 50). Do **not** describe expected output or guess slippage before calling. **If the tool returns ok:false**, do **not** output an intent_id or a "prepared" summary—say prepare failed and show the error only.

**Step 2 — Present intent**  
Only if the tool returned **ok:true**: show input amount, output token, min_out (from tool), intent_id (**exactly** from the response—copy character-for-character). Tell the user to click the Execute button or reply "confirm swap &lt;intent_id&gt;". Do **not** substitute a pattern ID (e.g. 1b2c3d4e-f5g6-...); the server rejects those and they are invalid (hex only 0-9a-f).

**Step 3 — Execute**  
Only after user confirms with a **valid** intent_id from prepare: call **`jupiter_swap_confirm`** then **`jupiter_swap_execute`** with the **same** intent_id. If intent_id mismatch or unknown → STOP; say confirm failed and ask for a fresh swap.

**Critical rules**  
- intent_id must come from prepare.  
- Execution must reference the **same** intent_id.  
- If mismatch or "Not found" → STOP; do not invent a new intent_id.

---

## 3. Parameter defaults

| Parameter | Default / note |
| --------- | ----------------- |
| **output_mint** | USDC when user says "sell SOL" / "go to cash" (unless they specify another token). |
| **input_mint** | SOL (native) when user says "swap SOL" or "sell SOL". |
| **amount** | Required. String, in **smallest units** (e.g. 1 SOL = `1000000000` lamports). When user says **"$5" or "$X worth"**, use **get_sol_price_usd** (CoinGecko, same as Wallet), then `amount = round(X / price * 1e9)` so the swap matches the Wallet's USD value. |
| **slippage_bps** | 50 unless user specifies; respect policy max (e.g. 100 bps). |

Use canonical mints from TOOLS.md or config (e.g. SOL = `So11111111111111111111111111111111111111112`, USDC mainnet = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).

---

## 4. Safety mindset

- **Never execute without an intent_id** that came from a prior prepare and is confirmed.
- **Never guess amounts** — use the user's number and convert to smallest units (SOL → lamports).
- **Always surface min_out** from the prepare result so the user knows the worst-case output.
- Respect **security tier** (Tier 4 required for prepare/execute). If Tier < 4 or execution is disabled, offer `jupiter_quote` and explain the limitation.
- If the user says "cancel that swap", use **jupiter_swap_cancel** with the `intent_id`.
- **Execution mode:** When the user asks "what do the settings show?", "am I in dry run?", or "why didn’t it broadcast?" → call **`get_swap_settings`** and report only the returned `modeSummary` (e.g. "Execution ON, Dry-run OFF (live broadcast)"). Do **not** assume the app is in Dry Run; the tool is the source of truth.
- **After execute:** If the tool returns `VERIFIED_SIGNATURE` and `SOLSCAN_URL`, paste them exactly. If it returns `dry_run: true` or `broadcast: false`, say no tx was sent and how to enable live (Settings → Dry-run OFF).

---

## 5. Few-shot examples (critical — learn from these)

### BAD (forbidden): describing a swap without calling the tool

**User:** swap 1 sol to usdc

**Assistant (WRONG):**  
"Swapping 0.02 SOL → ~3.4 USDC. Intent ID: temp-001. Confirm to execute."

→ This is **invalid**. No tool was called. The assistant invented the numbers and intent_id. You must **call** `jupiter_swap_prepare` and then report its result.

### BAD (forbidden): showing intent_id when prepare failed or using a fake ID

**User:** $5 swap

**Assistant (WRONG):**  
"Called jupiter_swap_prepare. Exact tool output: intent_id: 1b2c3d4e-f5g6-7890-bcde-f01234567890, ..."

→ **Invalid** if the prepare actually returned ok:false (e.g. API error). Do **not** output any intent_id or "prepared" summary when the tool failed. Also **invalid**: 1b2c3d4e-f5**g**6-... contains "g" (not valid hex); real UUIDs use 0-9a-f only. **Correct:** "Prepare failed: [exact error from tool]. No intent_id. Retry later or try a different amount."

### BAD (forbidden): "New Real Intent" or "I prepared a new one" with a fabricated intent_id

**User:** confirm swap 8e9f0a1b-c2d3-4e5f-6789-0123456789ab

**Assistant (WRONG):**  
"Confirm/execute returned Not found. New Real Intent for $5 SOL → USDC. intent_id: 9f0a1b2c-d3e4-5f67-8901-2345678901bc. Reply exactly: confirm swap 9f0a1b2c-d3e4-5f67-8901-2345678901bc."

→ **Invalid.** The assistant did **not** call `jupiter_swap_prepare`; it invented the new intent_id. IDs like `8e9f0a1b-...`, `9f0a1b2c-...` are sequential/pattern-based and fabricated. **Correct:** Say only: "Confirm failed (intent not found or expired). Say 'swap $5 SOL to USDC' and I'll run prepare; then you can use the Execute button in the card or confirm in chat." If you want to offer a new swap, you **must** call `jupiter_swap_prepare` in this turn and report only the intent_id from that tool response.

### GOOD: call the tool, then report the result

**User:** swap 1 sol to usdc

**Assistant (CORRECT):**  
→ **Calls** `jupiter_swap_prepare` with:
- `input_mint`: SOL mint (or omit for default)
- `output_mint`: USDC mint (or omit for default)
- `amount`: `"1000000000"` (1 SOL in lamports)
- `slippage_bps`: 50 (or omit)

→ **After the tool returns**, presents the summary from the response: "Prepared swap: 1 SOL → [exact expected_out from tool] USDC (min [min_out from tool]). Intent ID: [intent_id from tool]. **Click Execute in the card above** to confirm and broadcast (one click)."

---

### Example: "$5 SOL" = $5 USD value (match Wallet screen)

**User:** swap $5 sol for usdc

**Assistant (CORRECT):**  
→ Calls **get_sol_price_usd** (CoinGecko—same source as the Wallet screen) to get current SOL price (e.g. $93).  
→ Computes **amount_lamports = round(5 / 93 * 1e9)** ≈ 53_763_440 (≈ 0.0538 SOL, ~$5 at Wallet price).  
→ Calls **jupiter_swap_prepare** with that amount, SOL→USDC.  
→ Reports the tool result. User gets ~$5 worth of SOL (by Wallet value) swapped to USDC.

**Assistant (WRONG):** Using **jupiter_price** for $→lamports (Jupiter can show a different price than the Wallet). Using a fixed lamports amount. Always use **get_sol_price_usd** for "$X" so the amount matches the Wallet screen.

---

### Example 2: User confirms (chat)

**User:** confirm swap 238b6483-ec4c-4bc2-814b-3bf57edd85e7 / yes execute it

**Assistant:**  
→ Calls **`jupiter_swap_confirm`** with that intent_id first. If it returns ok: true, then calls **`jupiter_swap_execute`** with the same intent_id.  
→ Reports only what the execute tool returns (VERIFIED_SIGNATURE, SOLSCAN_URL, or error). Do not invent a signature or status. If the user only said "confirm" without the id, use the intent_id from the most recent prepare in this conversation.

---

### Example 3: User asks for a quote first

**User:** how much would I get for 0.5 SOL in USDC?

**Assistant:**  
→ Calls `jupiter_quote` with input_mint (SOL), output_mint (USDC), amount (0.5 SOL in lamports = `500000000`).  
→ Reports approximate out and price impact.  
→ "Want me to prepare this swap? Say 'yes' and I'll create an intent for you to confirm."

---

### Example 4: Cancel

**User:** cancel that swap / never mind

**Assistant:**  
→ Calls `jupiter_swap_cancel` with the `intent_id` of the prepared/confirmed intent.  
→ "Swap intent cancelled. No funds moved."

### BAD (forbidden): "proving" a swap with tx history only

**User:** prove you did the swap / show me the transaction

**Assistant (WRONG):**  
"I've pulled the real data from solana_tx_history. These signatures are proof of the live swaps we did…"

→ **Invalid.** `solana_tx_history` lists any recent transactions (transfers, other apps, etc.). It does **not** prove you executed a Jupiter swap. The only proof is a **jupiter_swap_execute** tool result that returned a transaction signature in this conversation. If you never got that, say: "I did not execute a swap in this conversation. No jupiter_swap_execute succeeded. The transactions you see on Solscan may be from other activity. To do a real swap I need to run prepare → you confirm → execute, and then I can show you the signature from the execute tool."

---

## Summary

- **Prepare first, confirm, then execute.** No shortcuts. No tool = no action.
- Default SOL → USDC for "sell SOL" / "go to cash"; still must call prepare.
- Amounts in smallest units; always surface min_out from the tool.
- If tools are unavailable: "I cannot execute this swap without the swap tools."
- For full tool specs and mints, see **TOOLS.md**.
