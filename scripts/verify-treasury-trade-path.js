#!/usr/bin/env node
/**
 * Verify treasury pool trades using **Orca Whirlpool SDK only** (no Jupiter).
 *
 * swapQuoteByInputToken + pool.swap() must build a non-empty compressed ix bundle.
 * No keys required; no broadcast. Uses mainnet RPC (SOLANA_RPC_URL or default).
 *
 * Usage: node scripts/verify-treasury-trade-path.js
 *    or: npm run verify:treasury-trade-path
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { WhirlpoolContext, buildWhirlpoolClient, swapQuoteByInputToken } from "@orca-so/whirlpools-sdk";
import { Percentage } from "@orca-so/common-sdk";

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const SAUSD = "CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG";
const SABTC = "2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy";
const SAETH = "AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS";

const POOL_SABTC_SAUSD = "GSpVz4P5HKzVBccAFAdfWzXc1VYhGLKvzRNQZCw4KCoJ";
const POOL_SAETH_SAUSD = "BzwjX8hwMbkVdhGu2w9qTtokr5ExqSDSw9bNMxdkExRS";

function dummyWallet() {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey,
    signTransaction: async () => {
      throw new Error("not signing");
    },
    signAllTransactions: async () => {
      throw new Error("not signing");
    },
  };
}

async function verifyWhirlpoolPool(poolPkStr, label, inputMintStr, amountSmallest) {
  const connection = new Connection(RPC, { commitment: "confirmed" });
  const ctx = WhirlpoolContext.from(connection, dummyWallet());
  const client = buildWhirlpoolClient(ctx);
  const poolPk = new PublicKey(poolPkStr);
  const pool = await client.getPool(poolPk);
  const inputMint = new PublicKey(inputMintStr);
  const slippage = Percentage.fromFraction(100, 10000); // 1%

  const quote = await swapQuoteByInputToken(
    pool,
    inputMint,
    new BN(amountSmallest),
    slippage,
    ctx.program.programId,
    ctx.fetcher
  );

  const tb = await pool.swap(quote, ctx.wallet.publicKey);
  const compressed = tb.compressIx(true);
  const ixCount = compressed?.instructions?.length ?? 0;

  return {
    ok: ixCount > 0,
    label,
    estimatedAmountOut: quote.estimatedAmountOut?.toString?.() ?? String(quote.estimatedAmountOut),
    ixCount,
  };
}

async function main() {
  console.log("Treasury trade path verification — Orca Whirlpool SDK only (no Jupiter)\n");
  console.log("RPC:", RPC, "\n");

  let sdkOk = 0;
  const sdkTests = [
    ["SABTC/SAUSD pool, in=SAUSD", POOL_SABTC_SAUSD, SAUSD, 1_000_000],
    ["SABTC/SAUSD pool, in=SABTC", POOL_SABTC_SAUSD, SABTC, 100_000],
    ["SAETH/SAUSD pool, in=SAUSD", POOL_SAETH_SAUSD, SAUSD, 1_000_000],
    ["SAETH/SAUSD pool, in=SAETH", POOL_SAETH_SAUSD, SAETH, 100_000],
  ];

  console.log("--- Orca Whirlpool SDK (swap quote + swap ix build) ---");
  for (const [label, pool, mint, amt] of sdkTests) {
    try {
      const r = await verifyWhirlpoolPool(pool, label, mint, amt);
      if (r.ok) {
        sdkOk++;
        console.log(`OK  ${label}  estOut=${r.estimatedAmountOut}  instructions=${r.ixCount}`);
      } else {
        console.log(`FAIL ${label}`, r);
      }
    } catch (e) {
      console.log(`FAIL ${label}`, e.message || e);
    }
  }

  const pass = sdkOk === sdkTests.length;

  console.log("\n--- Summary ---");
  console.log(`Whirlpool SDK builds succeeded: ${sdkOk}/${sdkTests.length} (all required — Orca-only path)`);
  console.log(
    pass
      ? "\nPASS: Treasury swaps can be quoted and built via Orca SDK for both pools and directions."
      : "\nFAIL: Fix RPC (429?), network, or pool addresses before agent integration."
  );

  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
