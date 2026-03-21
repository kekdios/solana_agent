#!/usr/bin/env node
/**
 * Read-only: list SPL token accounts for an address on mainnet (or SOLANA_RPC_URL).
 * Usage:
 *   node scripts/inspect-wallet-tokens.js
 *   node scripts/inspect-wallet-tokens.js <base58_address>
 *
 * Default address matches .env TEST_ADDRESS used for local testing.
 */
import { Connection, PublicKey } from "@solana/web3.js";

const DEFAULT_ADDR = "7qx973x8A8tAc18U79Xaf2VYHnKKjV25AEjZgaiEa8TR";
const SPL = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

const addr = process.argv[2]?.trim() || DEFAULT_ADDR;
const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

async function main() {
  let pk;
  try {
    pk = new PublicKey(addr);
  } catch (e) {
    console.error("Invalid address:", e.message);
    process.exit(1);
  }
  const conn = new Connection(rpc, { commitment: "confirmed" });
  console.log("RPC:", rpc);
  console.log("Owner:", pk.toBase58());
  const lamports = await conn.getBalance(pk);
  console.log("SOL:", lamports / 1e9, "\n");

  for (const label of ["legacy", "token-2022"]) {
    const programId = label === "legacy" ? SPL : T22;
    const res = await conn.getParsedTokenAccountsByOwner(pk, { programId });
    const rows = res.value || [];
    console.log(`--- ${label} (${rows.length} accounts) ---`);
    for (const a of rows) {
      const info = a.account?.data?.parsed?.info;
      const ta = info?.tokenAmount;
      if (!info?.mint) continue;
      console.log(
        JSON.stringify({
          mint: info.mint,
          amount: ta?.amount,
          decimals: ta?.decimals,
          uiAmount: ta?.uiAmount ?? ta?.uiAmountString,
        })
      );
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
