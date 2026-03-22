#!/usr/bin/env node
/**
 * Dry-run treasury_pool_swap (Orca Whirlpool SDK) using TEST_PRIV_KEY from .env.
 * Does not send a transaction. Does not go through server tier/policy (call tool directly).
 *
 *   npm run test:treasury-pool-swap-dry
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { treasuryPoolSwap } from "../tools/treasury-pool-swap.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENV_PATH = process.env.ENV_PATH || join(ROOT, ".env");

const DEFAULT_SA_AGENT_TOKEN_MINTS = {
  SABTC: "2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy",
  SAETH: "AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS",
  SAUSD: "CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG",
};

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadDotEnv(ENV_PATH);
  const pk = process.env.TEST_PRIV_KEY?.trim();
  if (!pk) {
    console.error("TEST_PRIV_KEY not set in .env — skipping live wallet dry-run.");
    process.exit(1);
  }
  process.env.SOLANA_PRIVATE_KEY = pk;

  const args = {
    input_token_symbol: "SAUSD",
    output_token_symbol: "SABTC",
    amount: "1000000",
    dry_run: true,
    slippage_bps: 100,
  };

  console.log("RPC:", process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com");
  console.log("treasury_pool_swap (dry_run):", args);

  const out = await treasuryPoolSwap(args, { saAgentTokenMap: { ...DEFAULT_SA_AGENT_TOKEN_MINTS } });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
