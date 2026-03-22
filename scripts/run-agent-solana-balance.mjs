#!/usr/bin/env node
/**
 * Run wallet tools the same way the chat agent does:
 * - Load RPC, pacing, and wallet from solagent.db (Settings), mirroring server.js startup.
 * - Call solana_balance with saAgentTokenMap (same as chat agent) plus process.env from DB.
 * - Call solana_token_balance with saAgentTokenMap + agentTokenBuiltInMints from loadSaAgentTokenMints().
 *
 * Usage:
 *   node scripts/run-agent-solana-balance.mjs
 *   DB_PATH="/path/to/solagent.db" node scripts/run-agent-solana-balance.mjs
 *
 * Default DB if DB_PATH unset (see scripts/agent-db-bootstrap.mjs):
 *   ./data/solagent.db (repo root — preferred)
 *   ~/Library/Application Support/solagent/data/solagent.db (legacy macOS desktop only)
 *
 * Requires .encryption-key next to solagent.db (same as the app).
 */
import {
  DEFAULT_SA_AGENT_TOKEN_MINTS,
  initAgentDatabase,
} from "./agent-db-bootstrap.mjs";

async function main() {
  const { dbPath, mintMap } = await initAgentDatabase();

  const solana = await import("../tools/solana.js");
  const agentEnv = {};

  console.log("DB_PATH:", dbPath);
  console.log("SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL || "(default public RPC)");
  console.log("SOLANA_RPC_PACE_MS:", process.env.SOLANA_RPC_PACE_MS || "(disabled)");
  console.log("");

  const bal = await solana.solanaBalance({}, { ...agentEnv, saAgentTokenMap: mintMap });
  console.log("--- solana_balance (agent path) ---");
  console.log(JSON.stringify(bal, null, 2));

  for (const sym of ["SABTC", "SAETH", "SAUSD"]) {
    const t = await solana.solanaTokenBalance(
      { token_symbol: sym },
      {
        ...agentEnv,
        saAgentTokenMap: mintMap,
        agentTokenBuiltInMints: DEFAULT_SA_AGENT_TOKEN_MINTS,
      }
    );
    console.log("\n--- solana_token_balance " + sym + " (agent path) ---");
    console.log(JSON.stringify(t, null, 2));
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
