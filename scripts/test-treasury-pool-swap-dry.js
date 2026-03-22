#!/usr/bin/env node
/**
 * Treasury Whirlpool swap test using TEST_PRIV_KEY (+ optional TEST_ADDRESS check) from .env.
 * Default: SAUSD → SAETH on SAETH_SAUSD pool, dry_run (simulate only, no broadcast).
 *
 *   npm run test:treasury-pool-swap-dry
 *   npm run test:treasury-pool-swap-dry -- saeth --reverse     # SAETH → SAUSD
 *   npm run test:treasury-pool-swap-dry -- sabtc               # SAUSD → SABTC (raw 1e6)
 *   npm run test:treasury-pool-swap-dry -- saeth --live       # LIVE broadcast (careful)
 *
 * Optional .env: TEST_SWAP_AMOUNT_UI (e.g. 1 for 1 SAUSD input when buying SAETH)
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
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

function parseArgs(argv) {
  const rest = argv.slice(2);
  const live = rest.includes("--live");
  const reverse = rest.includes("--reverse");
  const pos = rest.filter((a) => !a.startsWith("--"));
  const pair = (pos[0] || "saeth").toLowerCase();
  return { pair, live, reverse };
}

async function main() {
  loadDotEnv(ENV_PATH);
  const pkStr = process.env.TEST_PRIV_KEY?.trim();
  if (!pkStr) {
    console.error("TEST_PRIV_KEY not set in .env");
    process.exit(1);
  }

  let keypair;
  try {
    keypair = Keypair.fromSecretKey(bs58.decode(pkStr));
  } catch (e) {
    console.error("Invalid TEST_PRIV_KEY:", e.message || e);
    process.exit(1);
  }

  const pub = keypair.publicKey.toBase58();
  const expectAddr = process.env.TEST_ADDRESS?.trim();
  if (expectAddr && expectAddr !== pub) {
    console.error(`Pubkey mismatch: derived ${pub} from TEST_PRIV_KEY !== TEST_ADDRESS ${expectAddr}`);
    process.exit(1);
  }
  console.log("Wallet (TEST_PRIV_KEY):", pub, expectAddr ? "(matches TEST_ADDRESS)" : "(TEST_ADDRESS not set; skipped check)");

  process.env.SOLANA_PRIVATE_KEY = pkStr;

  const { pair, live, reverse } = parseArgs(process.argv);

  /** @type {Record<string, unknown>} */
  let args;

  if (pair === "sabtc") {
    args = {
      input_token_symbol: "SAUSD",
      output_token_symbol: "SABTC",
      amount: "1000000",
      dry_run: !live,
      slippage_bps: 100,
    };
  } else if (pair === "saeth") {
    const amountUi = process.env.TEST_SWAP_AMOUNT_UI?.trim() || (reverse ? "0.001" : "1");
    args = {
      input_token_symbol: reverse ? "SAETH" : "SAUSD",
      output_token_symbol: reverse ? "SAUSD" : "SAETH",
      amount_ui: Number(amountUi),
      dry_run: !live,
      slippage_bps: 100,
    };
  } else {
    console.error('First arg must be "saeth" (default) or "sabtc"');
    process.exit(1);
  }

  if (live) {
    console.warn("\n*** --live: WILL BROADCAST TO CHAIN ***\n");
  }

  console.log("RPC:", process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com");
  console.log("treasury_pool_swap:", args);

  const out = await treasuryPoolSwap(args, { saAgentTokenMap: { ...DEFAULT_SA_AGENT_TOKEN_MINTS } });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
