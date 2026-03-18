#!/usr/bin/env node
/**
 * Broadcast an approved swap using the local intent flow:
 * prepare -> confirm -> execute (with SWAPS_EXECUTION_ENABLED=true and dry-run=false).
 *
 * This uses the project's .env for TEST_PRIV_KEY and JUPITER_API_KEY and runs
 * the server in-process with an isolated DB directory.
 */
import path from "path";
import fs from "fs";
import http from "http";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const testDataDir = path.join(projectRoot, "data", "approved-swap");
const PORT = 3345;

function readDotEnv(envPath) {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const req = http.request(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": String(payload.length),
            }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch (_) {}
          resolve({ status: res.statusCode, json, text: data });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  fs.mkdirSync(testDataDir, { recursive: true });
  const dataDir = path.join(testDataDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "solagent.db");
  const workspaceDir = path.join(testDataDir, "workspace");
  fs.mkdirSync(workspaceDir, { recursive: true });

  const projectEnvPath = path.join(projectRoot, ".env");
  const env = readDotEnv(projectEnvPath);
  if (!env.TEST_PRIV_KEY) throw new Error(`TEST_PRIV_KEY missing from ${projectEnvPath}`);
  if (!env.JUPITER_API_KEY) throw new Error(`JUPITER_API_KEY missing from ${projectEnvPath}`);

  process.env.PORT = String(PORT);
  process.env.DB_PATH = dbPath;
  process.env.WORKSPACE_DIR = workspaceDir;
  process.env.DATA_DIR = dataDir;
  process.env.ENV_PATH = projectEnvPath;
  process.env.HOST = "127.0.0.1";

  const serverPath = path.join(projectRoot, "server.js");
  const mod = await import(pathToFileURL(serverPath).href);
  if (!mod?.server) throw new Error("server.js did not export server");
  await new Promise((r) => setTimeout(r, 500));
  const base = `http://127.0.0.1:${PORT}`;

  const setConfig = async (key, value) => {
    const r = await requestJson("POST", `${base}/api/config`, { key, value });
    if (r.status !== 200 || r.json?.error) throw new Error(`config ${key} failed: ${r.text}`);
  };

  // Ensure Tier 4 + mainnet, swap caps permissive for tiny swap.
  await setConfig("SECURITY_TIER", "4");
  await setConfig("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
  await setConfig("SWAPS_ENABLED", "true");
  await setConfig("SWAPS_EXECUTION_ENABLED", "true");
  await setConfig("SWAPS_EXECUTION_DRY_RUN", "false");
  await setConfig("SWAPS_MAX_SWAP_PCT_BALANCE", "100");

  // Import wallet.
  const w = await requestJson("POST", `${base}/api/solana-wallet/import`, { privateKey: env.TEST_PRIV_KEY });
  if (w.status !== 200 || !w.json?.publicKey) throw new Error(`wallet import failed: ${w.text}`);

  // Tiny approved swap: 0.001 SOL (1,000,000 lamports) -> USDC.
  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const prepArgs = { input_mint: SOL_MINT, output_mint: USDC_MINT, amount: "1000000", slippage_bps: 50 };

  const prep = await requestJson("POST", `${base}/api/jupiter/swap/prepare`, prepArgs);
  if (!prep.json?.ok || !prep.json?.intent_id) throw new Error(`prepare failed: ${prep.text}`);

  const intent_id = prep.json.intent_id;
  const conf = await requestJson("POST", `${base}/api/jupiter/swap/confirm`, { intent_id });
  if (!conf.json?.ok) throw new Error(`confirm failed: ${conf.text}`);

  const exec = await requestJson("POST", `${base}/api/jupiter/swap/execute`, { intent_id });
  if (!exec.json?.ok || !exec.json?.signature) throw new Error(`execute failed: ${exec.text}`);

  await new Promise((resolve) => mod.server.close(resolve));
  console.log(JSON.stringify({ ok: true, intent_id, signature: exec.json.signature }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err?.message || String(err));
  process.exit(1);
});

