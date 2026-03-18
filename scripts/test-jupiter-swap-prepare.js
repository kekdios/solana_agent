#!/usr/bin/env node
/**
 * E2E test for POST /api/jupiter/swap/prepare with policy enforcement.
 *
 * Runs an in-process server with an isolated DB/workspace, but uses the project
 * .env for TEST_PRIV_KEY / JUPITER_API_KEY.
 */
import path from "path";
import fs from "fs";
import http from "http";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const testDataDir = path.join(projectRoot, "data", "test-jupiter-swap-prepare");
const PORT = 3341;

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
    req.setTimeout(15000, () => {
      req.destroy(new Error("timeout"));
    });
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
  if (!env.TEST_PRIV_KEY) {
    console.error("FAIL: TEST_PRIV_KEY missing from", projectEnvPath);
    process.exit(1);
  }
  if (!env.JUPITER_API_KEY) {
    console.error("FAIL: JUPITER_API_KEY missing from", projectEnvPath);
    process.exit(1);
  }

  process.env.PORT = String(PORT);
  process.env.DB_PATH = dbPath;
  process.env.WORKSPACE_DIR = workspaceDir;
  process.env.DATA_DIR = dataDir;
  process.env.ENV_PATH = projectEnvPath;
  process.env.HOST = "127.0.0.1";

  const serverPath = path.join(projectRoot, "server.js");
  let mod;
  try {
    mod = await import(pathToFileURL(serverPath).href);
  } catch (err) {
    console.error("FAIL: import(server.js) threw:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
  if (!mod?.server) {
    console.error("FAIL: server.js did not export server");
    process.exit(1);
  }

  // Give the server a moment to bind.
  await new Promise((r) => setTimeout(r, 400));
  const base = `http://127.0.0.1:${PORT}`;

  const setConfig = async (key, value) => {
    const r = await requestJson("POST", `${base}/api/config`, { key, value });
    if (r.status !== 200 || !r.json?.ok) throw new Error(`config ${key} failed: ${r.text}`);
  };

  // Tier 4 required for swap tools.
  await setConfig("SECURITY_TIER", "4");

  // Use mainnet RPC so the provided test wallet balance is visible.
  await setConfig("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");

  // Import test wallet into config (server reads privkey from request).
  const w = await requestJson("POST", `${base}/api/solana-wallet/import`, { privateKey: env.TEST_PRIV_KEY });
  if (w.status !== 200 || !w.json?.publicKey) throw new Error(`wallet import failed: ${w.text}`);

  // Ensure policy caps allow the test amount.
  await setConfig("SWAPS_MAX_SLIPPAGE_BPS", "50");
  await setConfig("SWAPS_MAX_SWAP_SOL", "0.05");
  await setConfig("SWAPS_MAX_SWAP_PCT_BALANCE", "100");

  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const args = { input_mint: SOL_MINT, output_mint: USDC_MINT, amount: "10000000", slippage_bps: 50 };

  // Case 1: swaps disabled => must fail.
  await setConfig("SWAPS_ENABLED", "false");
  const a = await requestJson("POST", `${base}/api/jupiter/swap/prepare`, args);
  const disabledOk = a.json?.ok === false;

  // Case 2: swaps enabled => must succeed.
  await setConfig("SWAPS_ENABLED", "true");
  await setConfig("SWAPS_AUTOPILOT_ENABLED", "false");
  const b = await requestJson("POST", `${base}/api/jupiter/swap/prepare`, args);
  const enabledOk = b.json?.ok === true && typeof b.json?.intent_id === "string";

  await new Promise((resolve) => mod.server.close(resolve));
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch (_) {}

  if (!disabledOk) {
    console.error("FAIL: expected disabled swaps to return ok:false. Got:", a.text);
    process.exit(1);
  }
  if (!enabledOk) {
    console.error("FAIL: expected enabled swaps to return ok:true with intent_id. Got:", b.text);
    process.exit(1);
  }

  console.log("OK: swap prepare policy enforcement (disabled blocks, enabled prepares intent)");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err?.message || String(err));
  process.exit(1);
});

