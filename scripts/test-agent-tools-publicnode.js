#!/usr/bin/env node
/**
 * Exercise agent-facing RPC + price helpers against PublicNode Solana RPC.
 *
 *   npm run test:publicnode-agent-tools
 *
 * Forces SOLANA_RPC_URL=https://solana-rpc.publicnode.com for this process (after .env load).
 * Uses TEST_PRIV_KEY from .env for solana_token_balance / treasury_pool_swap dry-run (same as other scripts).
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

const PUBLICNODE_MAINNET = "https://solana-rpc.publicnode.com";

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

function section(title) {
  console.log("\n---", title, "---");
}

async function main() {
  loadDotEnv(ENV_PATH);
  process.env.SOLANA_RPC_URL = PUBLICNODE_MAINNET;
  console.log("SOLANA_RPC_URL (forced for this test):", process.env.SOLANA_RPC_URL);

  const env = {
    SOLANA_RPC_URL: PUBLICNODE_MAINNET,
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

  section("hyperliquid_price (tool: hyperliquidPerpMids)");
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
    section("solana_token_balance ×2 (SABTC, SAUSD)");
    async function balanceWithRetry(sym, attempts = 3) {
      let last = { ok: false, error: "no attempt" };
      for (let i = 0; i < attempts; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1500 * i));
        try {
          last = await solanaTokenBalance({ token_symbol: sym }, env);
        } catch (e) {
          last = { ok: false, error: e.message || String(e) };
        }
        if (last.ok) return last;
        const msg = String(last.error || "");
        if (!/403|429|Forbidden|Too many/i.test(msg)) break;
      }
      return last;
    }

    for (const sym of ["SABTC", "SAUSD"]) {
      const b = await balanceWithRetry(sym);
      mark(
        `solana_token_balance(${sym})`,
        b.ok === true,
        b.ok ? `ui=${b.uiAmount} dec=${b.decimals}` : b.error
      );
    }

    section("treasury_pool_swap dry_run (tiny SAUSD in)");
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
