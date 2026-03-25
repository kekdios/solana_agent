#!/usr/bin/env node
/**
 * Verifies Trend API: CoinGecko proxy GET + POST /api/trend/stats (writes memory/trend-latest.json).
 * Run: node scripts/test-trend-proxy.mjs
 */
import path from "path";
import fs from "fs";
import http from "http";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const testDataDir = path.join(projectRoot, "data", "test-trend-proxy");
const PORT = 3341;

function httpRequest(method, urlStr, bodyStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: bodyStr ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) } : {},
    };
    const req = http.request(opts, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir, { recursive: true });
  const dataDir = path.join(testDataDir, "data");
  const dbPath = path.join(dataDir, "solagent.db");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (_) {}
  const workspaceDir = path.join(testDataDir, "workspace");
  const envPath = path.join(testDataDir, ".env");

  process.env.PORT = String(PORT);
  process.env.DB_PATH = dbPath;
  process.env.WORKSPACE_DIR = workspaceDir;
  process.env.DATA_DIR = dataDir;
  process.env.ENV_PATH = envPath;
  process.env.HOST = "127.0.0.1";

  const serverPath = path.join(projectRoot, "server.js");
  let mod;
  try {
    mod = await import(pathToFileURL(serverPath).href);
  } catch (err) {
    console.error("FAIL: import(server.js) threw:", err.message);
    process.exit(1);
  }
  if (!mod?.server) {
    console.error("FAIL: server.js did not export server");
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 400));

  const base = `http://127.0.0.1:${PORT}`;
  const getUrl = `${base}/api/trend/coingecko/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=daily`;

  const { status, body } = await httpRequest("GET", getUrl);

  let json;
  try {
    json = JSON.parse(body);
  } catch {
    console.error("FAIL: GET response not JSON, status=", status, "body=", body.slice(0, 200));
    mod.server.close(() => process.exit(1));
    return;
  }

  const getOk = status === 200 && Array.isArray(json.prices) && json.prices.length > 0;
  if (!getOk) {
    mod.server.close(() => {
      console.error("FAIL: GET expected 200 and prices[], got status=", status);
      process.exit(1);
    });
    return;
  }

  const clientPayload = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    market_state: "TRANSITION",
    social_comment_bullets: ["Test bullet."],
    disclaimer: "test",
  };
  const postRes = await httpRequest("POST", `${base}/api/trend/stats`, JSON.stringify(clientPayload));
  let postJson;
  try {
    postJson = JSON.parse(postRes.body);
  } catch {
    console.error("FAIL: POST response not JSON", postRes.body.slice(0, 200));
    mod.server.close(() => process.exit(1));
    return;
  }

  const snapPath = path.join(workspaceDir, "memory", "trend-latest.json");
  const fileOk = fs.existsSync(snapPath);
  let snapParse = null;
  if (fileOk) {
    try {
      snapParse = JSON.parse(fs.readFileSync(snapPath, "utf8"));
    } catch {
      snapParse = null;
    }
  }

  const postOk =
    postRes.status === 200 &&
    postJson.ok === true &&
    fileOk &&
    snapParse?.client?.market_state === "TRANSITION" &&
    snapParse?.server_received_at;

  mod.server.close(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch (_) {}
    if (postOk) {
      console.log("OK: Trend CoinGecko proxy + POST /api/trend/stats (trend-latest.json)");
      process.exit(0);
    }
    console.error("FAIL: POST stats or snapshot file", {
      status: postRes.status,
      postJson,
      fileOk,
      snapParse: snapParse ? Object.keys(snapParse) : null,
    });
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
