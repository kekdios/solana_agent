#!/usr/bin/env node
/**
 * Run treasury_pool_swap the same way the chat agent does (server runTool + DB config).
 *
 * - Loads solagent.db → RPC, wallet, saAgentTokenMap (same as agent).
 * - Live swaps are not gated by SWAPS_ENABLED / SWAPS_EXECUTION_ENABLED (same as server.js treasury_pool_swap).
 *
 * Usage:
 *   node scripts/run-agent-treasury-swap.mjs
 *     → dry_run: true, SAETH → SAUSD, amount_ui 1, slippage 100 bps (simulate only; no tx).
 *
 *   node scripts/run-agent-treasury-swap.mjs --live
 *     → dry_run: false (broadcasts from app wallet).
 *
 *   node scripts/run-agent-treasury-swap.mjs --in SABTC --out SAUSD --amount-ui 0.1
 *   DB_PATH="..." node scripts/run-agent-treasury-swap.mjs --live
 */
import { initAgentDatabase } from "./agent-db-bootstrap.mjs";

function argVal(name, def) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

async function main() {
  const { dbPath, mintMap } = await initAgentDatabase();

  const live = process.argv.includes("--live");
  const dry_run = !live;

  const inSym = (argVal("--in", "SAETH") || "SAETH").toUpperCase();
  const outSym = (argVal("--out", "SAUSD") || "SAUSD").toUpperCase();
  const amountUi = Number(argVal("--amount-ui", "1"));
  const slippageBps = Number(argVal("--slippage-bps", "100")) || 100;

  console.log("DB_PATH:", dbPath);
  console.log("SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL || "(default public RPC)");
  console.log("");
  console.log("Request:", { input: inSym, output: outSym, amount_ui: amountUi, slippage_bps: slippageBps, dry_run });

  const treasury = await import("../tools/treasury-pool-swap.js");
  const out = await treasury.treasuryPoolSwap(
    {
      input_token_symbol: inSym,
      output_token_symbol: outSym,
      amount_ui: amountUi,
      slippage_bps: slippageBps,
      dry_run,
    },
    { saAgentTokenMap: mintMap }
  );

  console.log("");
  console.log("--- treasury_pool_swap (agent-equivalent path) ---");
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok === true ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
