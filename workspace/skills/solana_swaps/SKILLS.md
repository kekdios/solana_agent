# Solana Swaps (Jupiter) — Skill

When the user wants to **convert SOL ↔ USDC** (or other allowed pairs), use the **prepare → confirm → execute** flow. Never simulate swaps in text or bypass the intent system.

---

## Forbidden behavior (do not do this)

- **Do not** estimate or invent swap outputs (e.g. "~4.85 USDC"), prices, or balances. Get them from tools only.
- **Do not** simulate swaps in text (e.g. "Simulation passed", "Transaction signed & sent").
- **Do not** invent `intent_id` values (e.g. "temp-001", "abc-123"). The only valid intent_ids are those returned by the `jupiter_swap_prepare` tool.
- **Do not** produce a swap summary or "execution status" without having called the corresponding tool. If you did not call a tool, do not claim a swap was prepared or executed.
- **Do not** claim or imply that you executed a swap based on `solana_tx_history` or "recent transactions." Transaction history can include transfers, other apps, etc. The **only** proof that you executed a swap is a successful **jupiter_swap_execute** tool response that returns a real transaction signature. If you did not call `jupiter_swap_execute` and get back a signature in this conversation, you have not executed any swap—say so clearly.
- **Do not** report success or show a signature when the user clicked the **Execute** button in the chat card. That action does not run your tools—the UI calls the server directly. You have no `jupiter_swap_execute` result. Do not invent VERIFIED_SIGNATURE or SOLSCAN_URL. Point the user to the card (error or success shown there).

## Required behavior

- **Always** call `jupiter_swap_prepare` for swap requests. Never describe a prepared swap without calling the tool first.
- **Never** proceed to execution without a real `intent_id` from a prepare tool response.
- Report only what the tools return. If prepare fails, say so; do not invent success.

---

## 1. When to use swaps

| User intent | Action |
| ----------- | ------ |
| "Swap 1 SOL to USDC" / "Sell my SOL" / "Go to cash" | **Prepare** immediately (SOL → USDC default). |
| **"Swap $5 SOL" / "$5 worth of SOL" / "swap $X to USDC"** | User means **$X USD value**. First call **jupiter_price** (ids: "SOL") to get current SOL price, then **amount_lamports = round(X / sol_price_usd * 1e9)**. Then **jupiter_swap_prepare** with that amount. This ensures input is ~$X and output is ~$X USDC (minus fees/slippage). Do **not** use a fixed SOL amount (e.g. 0.0288) that was "roughly $5" at some other price. |
| "Convert 0.5 SOL to USDC" | **Prepare** with amount in lamports (0.5 SOL = 500_000_000). |
| "How much would I get for 1 SOL?" / "Quote only" | Use **jupiter_quote** first; offer to prepare when they want to execute. |
| "Confirm swap abc-123" / "yes execute it" | Call **jupiter_swap_confirm** with that `intent_id`, then **jupiter_swap_execute** with the same id. |

Default output for "sell SOL" / "go to cash" is **USDC**. Use policy allowlists (see Settings); do not guess mints.

---

## 2. Exact tool flow (burn this in)

**ALWAYS:**

1. **Prepare:** `jupiter_swap_prepare` with `input_mint`, `output_mint` (default SOL → USDC), `amount` (string, smallest units), optional `slippage_bps` (e.g. 50).
2. **Show summary:** expected out, min out, `intent_id`. Tell the user to **click the Execute button** in the swap card above (one click = confirm + broadcast). Do **not** ask them to "reply exactly: execute swap &lt;id&gt;"—the card already has the button. Optionally add: "Or reply 'confirm swap &lt;id&gt;' and I'll run confirm + execute via tools."
3. **Confirm:** When the user says "confirm swap &lt;intent_id&gt;" or "yes execute it" in chat, call **`jupiter_swap_confirm`** then **`jupiter_swap_execute`**.
4. **Execute:** `jupiter_swap_execute` with the same `intent_id` only after a successful confirm (from tools or from the user having clicked Execute in the card).

Never call **jupiter_swap_execute** without a prior **jupiter_swap_prepare** and user (or autopilot) confirmation.

---

## 3. Parameter defaults

| Parameter | Default / note |
| --------- | ----------------- |
| **output_mint** | USDC when user says "sell SOL" / "go to cash" (unless they specify another token). |
| **input_mint** | SOL (native) when user says "swap SOL" or "sell SOL". |
| **amount** | Required. String, in **smallest units** (e.g. 1 SOL = `1000000000` lamports). When user says **"$5" or "$X worth"**, that is USD value: get SOL price via **jupiter_price**, then `amount = round(X / price * 1e9)` so the swap uses ~$X of SOL. |
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

### Example: "$5 SOL" = $5 USD value

**User:** swap $5 sol for usdc

**Assistant (CORRECT):**  
→ Calls **jupiter_price** (ids: "SOL") to get current SOL price (e.g. $146.20).  
→ Computes **amount_lamports = round(5 / 146.20 * 1e9)** = 34_199_726 (≈ 0.0342 SOL, ~$5).  
→ Calls **jupiter_swap_prepare** with `amount: "34199726"` (or the computed string), SOL→USDC.  
→ Reports the tool result (expected_out, min_out, intent_id). User gets ~$5 worth of SOL swapped to ~$5 USDC (minus fees).

**Assistant (WRONG):** Using a fixed 28_800_000 lamports (0.0288 SOL) — that is only ~$5 when SOL ≈ $173; at $146 it's ~$4.21 input and ~$2.70 USDC out. Always derive amount from current price when user says "$X".

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

- **Prepare first, confirm, then execute.** No shortcuts.
- Default SOL → USDC for "sell SOL" / "go to cash".
- Amounts in smallest units; always surface min_out.
- For full tool specs and mints, see **TOOLS.md**.
