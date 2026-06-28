#!/usr/bin/env node
/**
 * Remove leftover SolveQuest config and worker metadata after the feature was deleted.
 *
 * - SQLite `trading_dashboard_meta`: keys like solvequest_worker_*
 * - `.env` (default: repo root `.env`, override with ENV_PATH=): lines SOLVEQUEST_*
 * - `app-settings.json` next to solagent.db: keys SOLVEQUEST_*
 *
 * DB path: DB_PATH env, else ./data/solagent.db if present, else macOS
 * ~/Library/Application Support/solagent/data/solagent.db
 *
 * Usage: node scripts/cleanup-solvequest-artifacts.mjs
 */
import Database from "better-sqlite3";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveDbPath() {
  const fromEnv = process.env.DB_PATH?.trim();
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      console.error(`DB_PATH is set but file not found: ${fromEnv}`);
      process.exit(1);
    }
    return fromEnv;
  }
  const repoData = join(root, "data", "solagent.db");
  if (existsSync(repoData)) return repoData;
  const macLegacy = join(homedir(), "Library", "Application Support", "solagent", "data", "solagent.db");
  if (existsSync(macLegacy)) return macLegacy;
  return null;
}

function stripSolvequestEnvLines(envPath) {
  if (!existsSync(envPath)) {
    console.log(`Skip .env (not found): ${envPath}`);
    return 0;
  }
  const txt = readFileSync(envPath, "utf8");
  const lines = txt.split(/\r?\n/);
  const out = [];
  let removed = 0;
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m && m[1].startsWith("SOLVEQUEST_")) {
      removed++;
      continue;
    }
    out.push(line);
  }
  if (removed > 0) {
    writeFileSync(envPath, out.join("\n").replace(/\n+$/, "") + "\n", "utf8");
  }
  console.log(`${envPath}: removed ${removed} SOLVEQUEST_* line(s).`);
  return removed;
}

function stripSolvequestAppSettings(jsonPath) {
  if (!existsSync(jsonPath)) {
    console.log(`Skip app-settings (not found): ${jsonPath}`);
    return 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch {
    console.log(`Skip app-settings (invalid JSON): ${jsonPath}`);
    return 0;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return 0;
  let removed = 0;
  for (const k of Object.keys(parsed)) {
    if (k.startsWith("SOLVEQUEST_")) {
      delete parsed[k];
      removed++;
    }
  }
  if (removed > 0) {
    writeFileSync(jsonPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  }
  console.log(`${jsonPath}: removed ${removed} SOLVEQUEST_* key(s).`);
  return removed;
}

function main() {
  const dbPath = resolveDbPath();
  if (!dbPath) {
    console.error("No solagent.db found. Set DB_PATH to your database file.");
    process.exit(1);
  }
  console.log("Using DB:", dbPath);

  let metaRemoved = 0;
  try {
    const db = new Database(dbPath);
    try {
      const info = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='trading_dashboard_meta'`).get();
      if (info) {
        const r = db.prepare(`DELETE FROM trading_dashboard_meta WHERE key LIKE ?`).run("solvequest%");
        metaRemoved = r.changes;
        console.log(`trading_dashboard_meta: deleted ${metaRemoved} row(s) (solvequest%).`);
      } else {
        console.log("trading_dashboard_meta: table missing, skip.");
      }
    } finally {
      db.close();
    }
  } catch (e) {
    console.error("SQLite:", e.message);
    process.exit(1);
  }

  const envPath = process.env.ENV_PATH || join(root, ".env");
  stripSolvequestEnvLines(envPath);
  const envNextToDb = join(dirname(dbPath), ".env");
  if (envNextToDb !== envPath) stripSolvequestEnvLines(envNextToDb);

  const appSettingsPath = join(dirname(dbPath), "app-settings.json");
  stripSolvequestAppSettings(appSettingsPath);

  console.log("Done.");
}

main();
