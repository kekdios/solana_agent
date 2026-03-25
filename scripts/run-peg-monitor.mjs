#!/usr/bin/env node
/**
 * One-shot peg monitor (same logic as peg_monitor_tick / cron peg_monitor).
 * Loads `.env` into `process.env` before tools run (matches test scripts; server already has env).
 *
 *   node scripts/run-peg-monitor.mjs
 *   node scripts/run-peg-monitor.mjs --full
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENV_PATH = process.env.ENV_PATH || join(ROOT, ".env");

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
  }
}

loadDotEnv(ENV_PATH);

const { runPegMonitorTick } = await import("../tools/peg-monitor.js");

const forceFull = process.argv.includes("--full");
const out = await runPegMonitorTick({ forceFull });
console.log(out.reply || out.summary);
if (process.env.PEG_MONITOR_VERBOSE === "1") console.log(JSON.stringify(out, null, 2));
