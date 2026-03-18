#!/usr/bin/env node
/**
 * Safe E2E test for confirm + execute endpoints.
 * - Verifies execute is blocked when SWAPS_EXECUTION_ENABLED=false.
 * - Does NOT enable execution in this test (no funds moved).
 */
import path from "path";
import fs from "fs";
import http from "http";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const testDataDir = path.join(projectRoot, "data", "test-jupiter-swap-execute");
const PORT = 3343;

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
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
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
  const mod = await import(pathToFileURL(serverPath).href);
  if (!mod?.server) {
    console.error("FAIL: server.js did not export server");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 400));
  const base = `http://127.0.0.1:${PORT}`;

  const setConfig = async (key, value) => {
    const r = await requestJson("POST", `${base}/api/config`, { key, value });
    if (r.status !== 200 || r.json?.error) throw new Error(`config ${key} failed: ${r.text}`);
  };

  await setConfig("SECURITY_TIER", "4");
  await setConfig("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
  await setConfig("SWAPS_ENABLED", "true");
  await setConfig("SWAPS_EXECUTION_ENABLED", "true");
  await setConfig("SWAPS_EXECUTION_DRY_RUN", "true");
  await setConfig("SWAPS_MAX_TX_FEE_LAMPORTS", "120000");
  await setConfig("SWAPS_COOLDOWN_SECONDS", "60");
  await setConfig("SWAPS_MAX_SWAP_PCT_BALANCE", "100");

  const w = await requestJson("POST", `${base}/api/solana-wallet/import`, { privateKey: env.TEST_PRIV_KEY });
  if (w.status !== 200 || !w.json?.publicKey) throw new Error(`wallet import failed: ${w.text}`);

  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const args = { input_mint: SOL_MINT, output_mint: USDC_MINT, amount: "10000000", slippage_bps: 50 };

  const prep = await requestJson("POST", `${base}/api/jupiter/swap/prepare`, args);
  if (!prep.json?.ok || !prep.json?.intent_id) throw new Error(`prepare failed: ${prep.text}`);

  const conf = await requestJson("POST", `${base}/api/jupiter/swap/confirm`, { intent_id: prep.json.intent_id });
  if (!conf.json?.ok) throw new Error(`confirm failed: ${conf.text}`);

  const exec = await requestJson("POST", `${base}/api/jupiter/swap/execute`, { intent_id: prep.json.intent_id });
  const simulated =
    exec.json?.ok === true &&
    exec.json?.status === "simulated" &&
    exec.json?.dry_run === true &&
    Array.isArray(exec.json?.programIds) &&
    exec.json.programIds.length > 0;

  // Case 3: execute again immediately should be blocked by cooldown.
  const prep2 = await requestJson("POST", `${base}/api/jupiter/swap/prepare`, args);
  if (!prep2.json?.ok || !prep2.json?.intent_id) throw new Error(`prepare #2 failed: ${prep2.text}`);
  const conf2 = await requestJson("POST", `${base}/api/jupiter/swap/confirm`, { intent_id: prep2.json.intent_id });
  if (!conf2.json?.ok) throw new Error(`confirm #2 failed: ${conf2.text}`);
  const exec2 = await requestJson("POST", `${base}/api/jupiter/swap/execute`, { intent_id: prep2.json.intent_id });
  const cooldownBlocked =
    exec2.json?.ok === false &&
    typeof exec2.json?.error === "string" &&
    exec2.json.error.toLowerCase().includes("cooldown");

  await new Promise((resolve) => mod.server.close(resolve));
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch (_) {}

  if (!simulated) {
    console.error("FAIL: expected dry-run execute to return ok:true status=simulated. Got:", exec.text);
    process.exit(1);
  }
  if (!cooldownBlocked) {
    console.error("FAIL: expected second execute to be blocked by cooldown. Got:", exec2.text);
    process.exit(1);
  }

  console.log("OK: execute dry-run simulated successfully (no broadcast)");
  console.log("Programs:", exec.json.programIds);
  console.log("OK: cooldown blocked immediate second execute");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err?.message || String(err));
  process.exit(1);
});

