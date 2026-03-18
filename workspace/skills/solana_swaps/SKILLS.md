# Solana Swaps (Jupiter) — Skill

When the user wants to **convert SOL ↔ USDC** (or other allowed pairs), use the **prepare → confirm → execute** flow. Never simulate swaps in text or bypass the intent system.

---

## Forbidden behavior (do not do this)

- **Do not** estimate or invent swap outputs (e.g. "~4.85 USDC"), prices, or balances. Get them from tools only.
- **Do not** simulate swaps in text (e.g. "Simulation passed", "Transaction signed & sent").
- **Do not** invent `intent_id` values (e.g. "temp-001", "abc-123"). The only valid intent_ids are those returned by the `jupiter_swap_prepare` tool.
- **Do not** produce a swap summary or "execution status" without having called the corresponding tool. If you did not call a tool, do not claim a swap was prepared or executed.
- **Do not** claim or imply that you executed a swap based on `solana_tx_history` or "recent transactions." Transaction history can include transfers, other apps, etc. The **only** proof that you executed a swap is a successful **jupiter_swap_execute** tool response that returns a real transaction signature. If you did not call `jupiter_swap_execute` and get back a signature in this conversation, you have not executed any swap—say so clearly.

## Required behavior

- **Always** call `jupiter_swap_prepare` for swap requests. Never describe a prepared swap without calling the tool first.
- **Never** proceed to execution without a real `intent_id` from a prepare tool response.
- Report only what the tools return. If prepare fails, say so; do not invent success.

---

## 1. When to use swaps

| User intent | Action |
| ----------- | ------ |
| "Swap 1 SOL to USDC" / "Sell my SOL" / "Go to cash" | **Prepare** immediately (SOL → USDC default). |
| "Convert 0.5 SOL to USDC" | **Prepare** with amount in lamports (0.5 SOL = 500_000_000). |
| "How much would I get for 1 SOL?" / "Quote only" | Use **jupiter_quote** first; offer to prepare when they want to execute. |
| "Execute the swap" / "Confirm intent abc-123" | Call **jupiter_swap_execute** with that `intent_id` only if it was prepared and is now confirmed. |

Default output for "sell SOL" / "go to cash" is **USDC**. Use policy allowlists (see Settings); do not guess mints.

---

## 2. Exact tool flow (burn this in)

**ALWAYS:**

1. **Prepare:** `jupiter_swap_prepare` with `input_mint`, `output_mint` (default SOL → USDC), `amount` (string, smallest units), optional `slippage_bps` (e.g. 50).
2. **Show summary:** expected out, min out, `intent_id`. Tell the user to confirm in the UI (or that autopilot confirmed).
3. **Wait for confirmation:** User confirms in the chat card, or autopilot does. Do not call execute until the intent is confirmed.
4. **Execute:** `jupiter_swap_execute` with the same `intent_id`. Only after step 1 and confirmation.

Never call **jupiter_swap_execute** without a prior **jupiter_swap_prepare** and user (or autopilot) confirmation.

---

## 3. Parameter defaults

| Parameter | Default / note |
| --------- | ----------------- |
| **output_mint** | USDC when user says "sell SOL" / "go to cash" (unless they specify another token). |
| **input_mint** | SOL (native) when user says "swap SOL" or "sell SOL". |
| **amount** | Required. String, in **smallest units** (e.g. 1 SOL = `1000000000` lamports). |
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

→ **After the tool returns**, presents the summary from the response: "Prepared swap: 1 SOL → [exact expected_out from tool] USDC (min [min_out from tool]). Intent ID: [intent_id from tool]. Confirm in the card above to execute."

---

### Example 2: User confirms

**User:** confirm / yes / execute it

**Assistant:**  
→ If the intent is now confirmed in the UI, calls `jupiter_swap_execute` with the **exact intent_id that came from the prepare tool response** (e.g. the UUID returned earlier).  
→ Reports what the execute tool returns: signature, Solscan link, post-swap balances. Do not invent a signature or status.

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
