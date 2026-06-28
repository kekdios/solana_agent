#!/usr/bin/env node
/**
 * Verifies BTC liquidity regime builder + GET /api/liquidity/btc-regime.
 * Usage: node scripts/test-liquidity-regime.mjs
 */
import path from "path";
import fs from "fs";
import http from "http";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const testDataDir = path.join(projectRoot, "data", "test-liquidity-regime");
const PORT = 3342;

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request(
      { method: "GET", hostname: u.hostname, port: u.port, path: u.pathname + u.search },
      (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => resolve({ status: res.statusCode, body: b }));
      }
    );
    req.on("error", reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

async function main() {
  const { buildBtcLiquidityRegime } = await import(pathToFileURL(path.join(projectRoot, "tools/btc-liquidity.js")).href);
  const direct = await buildBtcLiquidityRegime();
  if (!direct.ok || !direct.stablecoins?.ok || !direct.funding?.ok) {
    console.error("FAIL: buildBtcLiquidityRegime", {
      ok: direct.ok,
      stablecoins: direct.stablecoins?.ok,
      funding: direct.funding?.ok,
      errors: direct.errors,
    });
    process.exit(1);
  }
  console.log("OK: buildBtcLiquidityRegime regime=", direct.regime);

  if (!fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir, { recursive: true });
  const dataDir = path.join(testDataDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const workspaceDir = path.join(testDataDir, "workspace");
  process.env.PORT = String(PORT);
  process.env.DB_PATH = path.join(testDataDir, "data", "solagent.db");
  process.env.WORKSPACE_DIR = workspaceDir;
  process.env.DATA_DIR = path.join(testDataDir, "data");
  process.env.ENV_PATH = path.join(testDataDir, ".env");
  process.env.HOST = "127.0.0.1";

  const mod = await import(pathToFileURL(path.join(projectRoot, "server.js")).href);
  await new Promise((r) => setTimeout(r, 500));

  const { status, body } = await httpGet(`http://127.0.0.1:${PORT}/api/liquidity/btc-regime?refresh=1`);
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    console.error("FAIL: API not JSON", status, body.slice(0, 300));
    mod.server.close(() => process.exit(1));
    return;
  }

  const snapPath = path.join(workspaceDir, "memory", "btc-liquidity-latest.json");
  const apiOk =
    status === 200 &&
    json.ok &&
    json.regime &&
    json.stablecoins?.ok &&
    json.funding?.ok &&
    fs.existsSync(snapPath);

  mod.server.close(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch (_) {}
    if (apiOk) {
      console.log("OK: GET /api/liquidity/btc-regime + snapshot file");
      process.exit(0);
    }
    console.error("FAIL: API route", { status, json: { ok: json.ok, regime: json.regime }, snapPath });
    process.exit(1);
  });
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  process.exit(1);
});
