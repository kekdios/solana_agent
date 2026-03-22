/**
 * Native treasury pool swaps: SABTC↔SAUSD and SAETH↔SAUSD via Orca Whirlpool SDK only (no Jupiter).
 * Uses the app wallet; mints from env.saAgentTokenMap (same as solana_agent_token_send).
 */

import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import BN from "bn.js";
import { getMint } from "@solana/spl-token";
import { WhirlpoolContext, buildWhirlpoolClient, swapQuoteByInputToken } from "@orca-so/whirlpools-sdk";
import { Percentage } from "@orca-so/common-sdk";
import { getConnection, getKeypair, paceSolanaRpc } from "./solana.js";

/** Same cap as solana_agent_token_send auto-sends. */
const MAX_AUTO_NETWORK_FEE_LAMPORTS = 1_000_000;

const DEFAULT_POOLS = Object.freeze({
  SABTC_SAUSD: "GSpVz4P5HKzVBccAFAdfWzXc1VYhGLKvzRNQZCw4KCoJ",
  SAETH_SAUSD: "BzwjX8hwMbkVdhGu2w9qTtokr5ExqSDSw9bNMxdkExRS",
});

function poolPubkeyForPair(inSym, outSym) {
  const a = inSym.toUpperCase();
  const b = outSym.toUpperCase();
  if ((a === "SABTC" && b === "SAUSD") || (a === "SAUSD" && b === "SABTC")) {
    return (
      (process.env.TREASURY_POOL_SABTC_SAUSD || "").trim() || DEFAULT_POOLS.SABTC_SAUSD
    );
  }
  if ((a === "SAETH" && b === "SAUSD") || (a === "SAUSD" && b === "SAETH")) {
    return (
      (process.env.TREASURY_POOL_SAETH_SAUSD || "").trim() || DEFAULT_POOLS.SAETH_SAUSD
    );
  }
  return null;
}

function looksLikeBase58Mint(s) {
  const t = String(s).trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t);
}

function anchorWalletFromKeypair(keypair) {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
      } else {
        tx.partialSign(keypair);
      }
      return tx;
    },
    signAllTransactions: async (txs) => {
      for (const t of txs) {
        if (t instanceof VersionedTransaction) t.sign([keypair]);
        else t.partialSign(keypair);
      }
      return txs;
    },
  };
}

/** Reuse logic aligned with solana_agent_token_send amount parsing. */
function parseSwapAmount(amountRaw, amountUi, decimals) {
  if (typeof amountRaw === "number" && Number.isFinite(amountRaw) && amountRaw > 0) {
    if (!Number.isInteger(amountRaw)) {
      return { ok: false, error: "amount as number must be a positive integer (smallest token units)" };
    }
    amountRaw = String(amountRaw);
  }
  if (amountRaw != null && String(amountRaw).trim() !== "") {
    const s = String(amountRaw).trim();
    if (!/^\d+$/.test(s) || BigInt(s) <= 0n) {
      return { ok: false, error: "amount must be a positive integer string (smallest units)" };
    }
    return { ok: true, raw: BigInt(s) };
  }
  if (amountUi == null || amountUi === "") {
    return { ok: false, error: "Provide amount (smallest units string) or amount_ui (decimal)" };
  }
  const uiStr = String(amountUi).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(uiStr);
  if (!m) return { ok: false, error: "Invalid amount_ui; use e.g. 1.5 or 100" };
  const intPart = m[1] || "0";
  let frac = m[2] || "";
  if (frac.length > decimals) {
    return { ok: false, error: `amount_ui exceeds token decimals (${decimals})` };
  }
  frac = frac.padEnd(decimals, "0");
  const combined = intPart + frac;
  const raw = BigInt(combined);
  if (raw <= 0n) return { ok: false, error: "amount_ui must be positive" };
  return { ok: true, raw };
}

/**
 * @param {object} args
 * @param {string} args.input_token_symbol - SABTC | SAETH | SAUSD
 * @param {string} args.output_token_symbol - paired treasury token
 * @param {string} [args.amount] - input amount smallest units
 * @param {number} [args.amount_ui] - input human amount
 * @param {number} [args.slippage_bps] - default 100 (1%)
 * @param {boolean} [args.dry_run] - if true: simulate only, no send
 * @param {object} env
 * @param {object} env.saAgentTokenMap - symbol -> mint
 */
export async function treasuryPoolSwap(args, env = {}) {
  await paceSolanaRpc(env);
  const inSym = String(args?.input_token_symbol ?? "")
    .trim()
    .toUpperCase();
  const outSym = String(args?.output_token_symbol ?? "")
    .trim()
    .toUpperCase();
  if (!inSym || !outSym) {
    return { ok: false, error: "input_token_symbol and output_token_symbol required (SABTC, SAETH, SAUSD pairs with SAUSD)" };
  }
  if (inSym === outSym) {
    return { ok: false, error: "input and output symbols must differ" };
  }

  const poolPkStr = poolPubkeyForPair(inSym, outSym);
  if (!poolPkStr) {
    return {
      ok: false,
      error: "Unsupported pair. Allowed: SABTC↔SAUSD and SAETH↔SAUSD only.",
    };
  }

  const map = env.saAgentTokenMap;
  if (!map || typeof map !== "object") {
    return { ok: false, error: "Token map missing (saAgentTokenMap)" };
  }
  const inMintStr = map[inSym];
  const outMintStr = map[outSym];
  if (!inMintStr || !outMintStr || !looksLikeBase58Mint(inMintStr) || !looksLikeBase58Mint(outMintStr)) {
    return { ok: false, error: `Could not resolve mints for ${inSym}/${outSym}. Check SA_AGENT_TOKENS / defaults.` };
  }

  const keypair = await getKeypair(env);
  if (!keypair) {
    return { ok: false, error: "Solana wallet not configured" };
  }

  const slippageBps = Math.max(1, Math.min(Number(args?.slippage_bps ?? 100) || 100, 5000));
  const dryRun = args?.dry_run === true || String(args?.dry_run).toLowerCase() === "true";
  const slippage = Percentage.fromFraction(slippageBps, 10_000);

  let inputMintPk;
  let poolPk;
  try {
    inputMintPk = new PublicKey(inMintStr);
    poolPk = new PublicKey(poolPkStr);
  } catch (e) {
    return { ok: false, error: `Invalid mint or pool address: ${e.message || e}` };
  }

  const conn = getConnection(env);
  let decimals;
  try {
    const mintInfo = await getMint(conn, inputMintPk);
    decimals = mintInfo.decimals;
  } catch (e) {
    return { ok: false, error: `Failed to read input mint: ${e.message || e}` };
  }

  const parsed = parseSwapAmount(args?.amount, args?.amount_ui, decimals);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const amountBn = new BN(parsed.raw.toString());

  const wallet = anchorWalletFromKeypair(keypair);
  const ctx = WhirlpoolContext.from(conn, wallet);
  const client = buildWhirlpoolClient(ctx);
  let pool;
  try {
    pool = await client.getPool(poolPk);
  } catch (e) {
    return { ok: false, error: `Failed to load Whirlpool: ${e.message || e}` };
  }

  const data = pool.getData();
  const mintA = data.tokenMintA.toBase58();
  const mintB = data.tokenMintB.toBase58();
  if (!new Set([mintA, mintB]).has(inMintStr) || !new Set([mintA, mintB]).has(outMintStr)) {
    return {
      ok: false,
      error: `Pool ${poolPkStr} does not list both ${inSym} and ${outSym} mints (on-chain: ${mintA}, ${mintB}).`,
    };
  }

  let quote;
  try {
    quote = await swapQuoteByInputToken(
      pool,
      inputMintPk,
      amountBn,
      slippage,
      ctx.program.programId,
      ctx.fetcher
    );
  } catch (e) {
    return { ok: false, error: `swapQuoteByInputToken failed: ${e.message || e}` };
  }

  let txBuilder;
  try {
    txBuilder = await pool.swap(quote, keypair.publicKey);
  } catch (e) {
    return { ok: false, error: `pool.swap build failed: ${e.message || e}` };
  }

  const built = await txBuilder.build({});
  const tx = built.transaction;

  const feeResp = await conn.getFeeForMessage(tx.message).catch(() => null);
  const feeLamports = feeResp?.value != null ? Number(feeResp.value) : null;
  if (feeLamports != null && Number.isFinite(feeLamports) && feeLamports > MAX_AUTO_NETWORK_FEE_LAMPORTS) {
    return {
      ok: false,
      error: `Estimated network fee ${feeLamports} lamports exceeds limit ${MAX_AUTO_NETWORK_FEE_LAMPORTS} (0.001 SOL).`,
      estimated_network_fee_lamports: feeLamports,
    };
  }

  const estOut = quote.estimatedAmountOut?.toString?.() ?? String(quote.estimatedAmountOut);
  const minOut = quote.otherAmountThreshold?.toString?.() ?? String(quote.otherAmountThreshold);

  if (dryRun) {
    try {
      if (tx instanceof VersionedTransaction) {
        const signers = [keypair, ...(Array.isArray(built.signers) ? built.signers.filter(Boolean) : [])];
        tx.sign(signers);
        const sim = await conn.simulateTransaction(tx, { commitment: "confirmed" });
        return {
          ok: true,
          dry_run: true,
          input_token_symbol: inSym,
          output_token_symbol: outSym,
          pool: poolPkStr,
          input_mint: inMintStr,
          output_mint: outMintStr,
          amount_in: parsed.raw.toString(),
          decimals_in: decimals,
          estimated_amount_out: estOut,
          min_amount_out: minOut,
          slippage_bps: slippageBps,
          simulation_err: sim.value?.err ?? null,
          simulation_logs: sim.value?.logs?.slice?.(0, 12) ?? undefined,
          estimated_network_fee_lamports: feeLamports,
          agent_report: `DRY_RUN treasury Whirlpool swap ${inSym} → ${outSym}: quote ok; simulation ${sim.value?.err ? "failed" : "ok"}.`,
        };
      }
    } catch (e) {
      return { ok: false, dry_run: true, error: `Simulation failed: ${e.message || e}` };
    }
    return { ok: false, dry_run: true, error: "Dry-run simulation supports versioned transactions only." };
  }

  try {
    const sig = await txBuilder.buildAndExecute(undefined, { skipPreflight: false, maxRetries: 3 }, "confirmed");
    return {
      ok: true,
      dry_run: false,
      signature: sig,
      input_token_symbol: inSym,
      output_token_symbol: outSym,
      pool: poolPkStr,
      input_mint: inMintStr,
      output_mint: outMintStr,
      amount_in: parsed.raw.toString(),
      decimals_in: decimals,
      estimated_amount_out: estOut,
      min_amount_out: minOut,
      slippage_bps: slippageBps,
      estimated_network_fee_lamports: feeLamports,
      agent_report: `Treasury Whirlpool swap ${inSym} → ${outSym} submitted. Signature: ${sig}`,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
