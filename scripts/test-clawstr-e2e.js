#!/usr/bin/env node
/**
 * Clawstr / solanaagent.app smoke tests (no funded wallet required for phase A).
 * Phase A: production POST /api/v1/bulletin/payment-intent
 * Phase B: production GET /api/v1/clawstr/* and /api/v1/bulletin/feed|health (read APIs)
 * Phase C: in-process server /api/help includes bulletin + clawstr read tools
 *
 * Run: node scripts/test-clawstr-e2e.js
 * Full: npm run test:clawstr (add to package.json)
 */
import path from "path";
import fs from "fs";
import http from "http";
import https from "https";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const BULLETIN_BASE = "https://www.solanaagent.app";
const TEST_WALLET = "11111111111111111111111111111111";

function httpJson(url, opts = {}) {
  const u = new URL(url);
  const lib = u.protocol === "https:" ? https : http;
  const body = opts.body != null ? Buffer.from(JSON.stringify(opts.body), "utf8") : null;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: opts.method || "GET",
        headers: {
          ...(body ? { "Content-Type": "application/json", "Content-Length": body.length } : {}),
          ...(opts.headers || {}),
        },
        timeout: 20000,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (_) {}
          resolve({ status: res.statusCode, data, raw });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function testProductionPaymentIntent() {
  const { status, data } = await httpJson(`${BULLETIN_BASE}/api/v1/bulletin/payment-intent`, {
    method: "POST",
    body: { wallet_address: TEST_WALLET },
  });
  if (status !== 200) {
    throw new Error(`payment-intent expected 200, got ${status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  const pi = data?.payment_intent;
  const pay = data?.payment;
  if (!pi?.id || !pay?.amount_lamports || !pay?.treasury_solana_address || !pay?.reference) {
    throw new Error(`payment-intent malformed: ${JSON.stringify(data).slice(0, 500)}`);
  }
  if (Number(pay.amount_lamports) !== 10_000_000) {
    console.warn("WARN: expected 10_000_000 lamports, got", pay.amount_lamports);
  }
  console.log("OK: production payment-intent", pi.id, pay.amount_lamports, "lamports");
}

async function testProductionReadApis() {
  const checks = [
    {
      url: `${BULLETIN_BASE}/api/v1/clawstr/health`,
      validate: (d) =>
        typeof d === "object" &&
        (d.signing_configured === true || d.signing_configured === false || d.signing_configured == null),
    },
    {
      url: `${BULLETIN_BASE}/api/v1/clawstr/feed?limit=3`,
      validate: (d) => typeof d === "object" && Array.isArray(d.posts),
    },
    {
      url: `${BULLETIN_BASE}/api/v1/clawstr/communities`,
      validate: (d) => Array.isArray(d) || (typeof d === "object" && (Array.isArray(d.communities) || Array.isArray(d.items))),
    },
    {
      url: `${BULLETIN_BASE}/api/v1/bulletin/feed?limit=3`,
      validate: (d) => typeof d === "object" && (Array.isArray(d.posts) || Array.isArray(d.items) || Array.isArray(d.results)),
    },
    {
      url: `${BULLETIN_BASE}/api/v1/bulletin/health`,
      validate: (d) => typeof d === "object" && d != null,
    },
  ];
  for (const { url, validate } of checks) {
    const { status, data } = await httpJson(url, { method: "GET" });
    if (status !== 200) {
      throw new Error(`GET ${url} expected 200, got ${status}: ${JSON.stringify(data).slice(0, 400)}`);
    }
    if (!validate(data)) {
      throw new Error(`GET ${url} unexpected shape: ${JSON.stringify(data).slice(0, 500)}`);
    }
    console.log("OK: GET", url.replace(BULLETIN_BASE, ""));
  }
}

async function testLocalHelpIncludesBulletinTools() {
  const testDataDir = path.join(projectRoot, "data", "test-clawstr-help");
  const dataDir = path.join(testDataDir, "data");
  const dbPath = path.join(dataDir, "solagent.db");
  const workspaceDir = path.join(testDataDir, "workspace");
  const envPath = path.join(testDataDir, ".env");
  const PORT = 3341;

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

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
  } catch (e) {
    const msg = e?.message || String(e);
    if (/NODE_MODULE_VERSION|better_sqlite3|better-sqlite3/i.test(msg)) {
      console.warn("WARN: skip local /api/help test (native module mismatch). Run: npm rebuild better-sqlite3");
      return false;
    }
    throw e;
  }
  if (!mod?.server) throw new Error("server.js did not export server");

  await new Promise((r) => setTimeout(r, 400));

  const payload = await new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/help`, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("help timeout"));
    });
  });

  const names = (payload.tools || []).map((t) => t.name).filter(Boolean);
  if (!names.includes("bulletin_post")) {
    throw new Error(`/api/help missing bulletin_post; have: ${names.slice(0, 20).join(", ")}…`);
  }
  if (!names.includes("bulletin_approve_and_post")) {
    throw new Error("/api/help missing bulletin_approve_and_post");
  }
  const readTools = [
    "clawstr_health",
    "clawstr_feed",
    "clawstr_communities",
    "bulletin_public_feed",
    "bulletin_public_health",
  ];
  for (const n of readTools) {
    if (!names.includes(n)) {
      throw new Error(`/api/help missing ${n}; have: ${names.slice(0, 30).join(", ")}…`);
    }
  }
  console.log("OK: /api/help exposes bulletin + clawstr read tools");

  await new Promise((resolve) => mod.server.close(resolve));
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch (_) {}
  return true;
}

async function main() {
  await testProductionPaymentIntent();
  await testProductionReadApis();
  const localOk = await testLocalHelpIncludesBulletinTools();
  if (localOk) {
    console.log("OK: Clawstr E2E smoke tests passed (production API + local /api/help)");
  } else {
    console.log(
      "OK: production Clawstr/bulletin read APIs passed (local /api/help test skipped — rebuild better-sqlite3 to enable)"
    );
  }
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
