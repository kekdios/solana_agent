#!/usr/bin/env node
/**
 * Same smoke test as test-agent-tools-publicnode.js, but Solana RPC URL is built from
 * HELIUS_API_KEY only (no SOLANA_RPC_URL in .env required for this run).
 *
 * URL shape: https://mainnet.helius-rpc.com/?api-key=<key>
 * @see https://www.helius.dev/docs/rpc/quickstart
 * @see https://www.helius.dev/docs/api-reference/endpoints
 *
 *   npm run test:helius-agent-tools
 *
 * Needs: HELIUS_API_KEY in .env (or env). Optional: TEST_PRIV_KEY for balance + dry-run swap.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { hyperliquidPerpMids } from "../tools/hyperliquid-price.js";
import { treasuryPoolInfo } from "../tools/treasury-pool-info.js";
import { solanaTokenBalance } from "../tools/solana.js";
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

function heliusMainnetRpcUrl(apiKey) {
  const k = String(apiKey || "").trim();
  if (!k) return null;
  return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(k)}`;
}

function section(title) {
  console.log("\n---", title, "---");
}

async function main() {
  loadDotEnv(ENV_PATH);

  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  const rpcUrl = heliusMainnetRpcUrl(heliusKey);
  if (!rpcUrl) {
    console.error("Set HELIUS_API_KEY in .env (or environment). See https://www.helius.dev/docs/rpc/quickstart");
    process.exit(1);
  }

  process.env.SOLANA_RPC_URL = rpcUrl;
  console.log("Solana RPC: Helius mainnet (URL built from HELIUS_API_KEY; key not printed)");

  const env = {
    SOLANA_RPC_URL: rpcUrl,
    saAgentTokenMap: DEFAULT_SA_AGENT_TOKEN_MINTS,
    agentTokenBuiltInMints: DEFAULT_SA_AGENT_TOKEN_MINTS,
  };

  let failed = false;
  const mark = (name, ok, detail) => {
    if (ok) console.log(`OK  ${name}`, detail ?? "");
    else {
      console.error(`FAIL ${name}`, detail ?? "");
      failed = true;
    }
  };

  section("hyperliquid_price");
  try {
    const hl = await hyperliquidPerpMids({}, env);
    mark(
      "hyperliquid",
      hl.ok && hl.mids_usd?.BTC != null,
      hl.ok ? `BTC=${hl.mids_usd?.BTC} ETH=${hl.mids_usd?.ETH}` : hl.error
    );
  } catch (e) {
    mark("hyperliquid", false, e.message || e);
  }

  section("treasury_pool_info");
  try {
    const info = await treasuryPoolInfo({ pair: "SABTC_SAUSD" }, env);
    mark(
      "treasury_pool_info",
      info.ok && info.data?.price != null,
      info.ok
        ? `source=${info.pool_data_source} price(B per A)=${info.data?.price}`
        : info.error
    );
  } catch (e) {
    mark("treasury_pool_info", false, e.message || e);
  }

  const pk = process.env.TEST_PRIV_KEY?.trim();
  if (!pk) {
    section("solana_token_balance + treasury_pool_swap dry-run");
    console.log("SKIP wallet tools: set TEST_PRIV_KEY in .env");
  } else {
    process.env.SOLANA_PRIVATE_KEY = pk;
    section("solana_token_balance ×2");
    for (const sym of ["SABTC", "SAUSD"]) {
      try {
        const b = await solanaTokenBalance({ token_symbol: sym }, env);
        mark(
          `solana_token_balance(${sym})`,
          b.ok === true,
          b.ok ? `ui=${b.uiAmount} dec=${b.decimals}` : b.error
        );
      } catch (e) {
        mark(`solana_token_balance(${sym})`, false, e.message || e);
      }
    }

    section("treasury_pool_swap dry_run");
    try {
      const sw = await treasuryPoolSwap(
        {
          input_token_symbol: "SAUSD",
          output_token_symbol: "SABTC",
          amount: "1000",
          dry_run: true,
          slippage_bps: 100,
        },
        env
      );
      mark(
        "treasury_pool_swap dry_run",
        sw.ok === true && sw.dry_run === true,
        sw.ok ? `sim_err=${sw.simulation_err}` : sw.error
      );
    } catch (e) {
      mark("treasury_pool_swap dry_run", false, e.message || e);
    }
  }

  console.log("");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
