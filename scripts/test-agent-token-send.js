#!/usr/bin/env node
/**
 * Live test: solanaAgentTokenSend using TEST_PRIV_KEY from repo .env.
 * Usage:
 *   node scripts/test-agent-token-send.js
 *   node scripts/test-agent-token-send.js SAUSD 100 Cx7KLX...
 *
 * Requires network. Does not print private keys.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { solanaAgentTokenSend } from "../tools/solana.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENV_PATH = process.env.ENV_PATH || join(ROOT, ".env");

const DEFAULT_SA_AGENT_TOKEN_MINTS = {
  SABTC: "2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy",
  SAETH: "AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS",
  SAUSD: "CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG",
};

function loadDotEnv(path) {
  if (!existsSync(path)) {
    console.error("Missing .env at", path);
    process.exit(1);
  }
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadDotEnv(ENV_PATH);
  const pk = process.env.TEST_PRIV_KEY?.trim();
  if (!pk) {
    console.error("TEST_PRIV_KEY not set in .env");
    process.exit(1);
  }
  process.env.SOLANA_PRIVATE_KEY = pk;

  const tokenSymbol = (process.argv[2] || "SAUSD").trim().toUpperCase();
  const amountUi = Number(process.argv[3] ?? "100");
  const to = (process.argv[4] || "Cx7KLXVPUoaU8Z79vW6pJCF56i5Yub2myun3ZtWQXS8W").trim();

  if (!Number.isFinite(amountUi) || amountUi <= 0) {
    console.error("Invalid amount");
    process.exit(1);
  }

  console.log("RPC:", process.env.SOLANA_RPC_URL || "(default mainnet)");
  console.log("Tool: solana_agent_token_send");
  console.log({ token_symbol: tokenSymbol, amount_ui: amountUi, to });

  const out = await solanaAgentTokenSend(
    { token_symbol: tokenSymbol, to, amount_ui: amountUi },
    { saAgentTokenMap: { ...DEFAULT_SA_AGENT_TOKEN_MINTS } }
  );

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
