#!/usr/bin/env node
/**
 * Quick test that the server starts and /api/help responds.
 * Run from project root: node scripts/test-server-start.js
 */
import { spawn } from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const PORT = 3338;
const WAIT_MS = 10000;

const child = spawn(process.execPath, ["server.js"], {
  cwd: projectRoot,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (d) => { stderr += d.toString(); process.stderr.write(d); });
child.stdout.on("data", (d) => process.stdout.write(d));
child.on("error", (err) => {
  console.error("Spawn error:", err.message);
  process.exit(1);
});

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await wait(3000);
  const ok = await new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/help`, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve(res.statusCode === 200));
    });
    req.on("error", () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
  child.kill();
  if (ok) {
    console.log("OK: Server started and /api/help returned 200");
    process.exit(0);
  } else {
    console.error("FAIL: Server did not respond in time or returned non-200");
    if (stderr) console.error("Stderr:", stderr);
    process.exit(1);
  }
}

main();
