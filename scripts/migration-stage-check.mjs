#!/usr/bin/env node
/**
 * Migration sanity checks (filesystem + optional live server).
 * Usage:
 *   npm run migrate:check
 *   MIGRATION_CHECK_URL=http://127.0.0.1:3333 npm run migrate:check
 */
import { existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "data");
const dbPath = process.env.DB_PATH ? process.env.DB_PATH : join(dataDir, "solagent.db");
const keyPath = join(dirname(dbPath), ".encryption-key");
const workspaceDir = process.env.WORKSPACE_DIR || join(root, "workspace");
const checkUrl = (process.env.MIGRATION_CHECK_URL || "").replace(/\/$/, "");

let failed = false;
function ok(msg) {
  console.log("OK  ", msg);
}
function bad(msg) {
  console.error("FAIL", msg);
  failed = true;
}

console.log("--- STAGE 1: filesystem ---\n");
if (!existsSync(dbPath)) bad(`Missing DB: ${dbPath}`);
else ok(`solagent.db (${statSync(dbPath).size} bytes)`);

if (!existsSync(keyPath)) bad(`Missing encryption key: ${keyPath}`);
else {
  const st = statSync(keyPath);
  if (st.size !== 32) bad(`.encryption-key should be 32 bytes, got ${st.size}`);
  else ok(".encryption-key (32 bytes)");
}

if (!existsSync(join(workspaceDir, "AGENTS.md")))
  bad(`Missing ${join(workspaceDir, "AGENTS.md")} (set WORKSPACE_DIR if using custom workspace)`);
else ok(`workspace/AGENTS.md`);

let configCount = -1;
function countConfigViaSqlite3Cli() {
  try {
    const out = execFileSync("sqlite3", [dbPath, "SELECT COUNT(*) FROM config;"], {
      encoding: "utf8",
      maxBuffer: 64,
    });
    const n = parseInt(String(out).trim(), 10);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}
configCount = countConfigViaSqlite3Cli();
if (configCount < 0) {
  try {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    configCount = db.prepare("SELECT COUNT(*) AS c FROM config").get().c;
    db.close();
  } catch (e) {
    console.log(
      "SKIP config row count (install `sqlite3` CLI, or run `npm rebuild better-sqlite3` for this Node):",
      e.message?.split("\n")[0] || e
    );
  }
}
if (configCount >= 0) {
  ok(`config table: ${configCount} row(s)`);
  if (configCount === 0) bad("config table empty — wrong DB or fresh install?");
}

const distRenderer = join(root, "dist-renderer");
if (existsSync(join(distRenderer, "index.html"))) ok("dist-renderer/ (built UI present)");
else console.log("SKIP dist-renderer/ (run npm run build:renderer for Stage 3)");

if (checkUrl) {
  console.log("\n--- STAGE 2+: HTTP ---\n");
  for (const path of ["/api/help", "/api/config"]) {
    const url = `${checkUrl}${path}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const ct = r.headers.get("content-type") || "";
      if (!r.ok) bad(`${path} -> HTTP ${r.status}`);
      else if (!ct.includes("json")) bad(`${path} -> expected JSON, got ${ct}`);
      else ok(`${path} -> ${r.status}`);
    } catch (e) {
      const hint =
        String(e.cause?.code || e.code || "") === "ECONNREFUSED"
          ? " nothing listening (start server in another terminal: node server.js). Port may differ — read the line Solana Agent: http://… from that terminal, or check PORT in Settings / config DB."
          : ` ${e.message || e}`;
      bad(`${path} ->${hint}`);
    }
  }
} else {
  console.log("\nSKIP HTTP checks (set MIGRATION_CHECK_URL=http://127.0.0.1:PORT when server is up)");
}

console.log(failed ? "\nMIGRATION CHECK: FAILED\n" : "\nMIGRATION CHECK: PASSED\n");
process.exit(failed ? 1 : 0);
