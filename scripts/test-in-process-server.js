#!/usr/bin/env node
/**
 * Test that the HTTP server can be started in-process (Method 2).
 * Run with: node scripts/test-in-process-server.js
 * Uses dynamic import(server.js) with env set, then checks /api/help and closes the server.
 */
import path from "path";
import fs from "fs";
import http from "http";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const testDataDir = path.join(projectRoot, "data", "test-in-process");
const PORT = 3339;

async function main() {
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
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
  if (!fs.existsSync(serverPath)) {
    console.error("FAIL: server.js not found at", serverPath);
    process.exit(1);
  }

  let mod;
  try {
    mod = await import(pathToFileURL(serverPath).href);
  } catch (err) {
    console.error("FAIL: import(server.js) threw:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
  if (!mod || !mod.server) {
    console.error("FAIL: server.js did not export server");
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 300));

  const ok = await new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/help`, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve(res.statusCode === 200));
    });
    req.on("error", (e) => {
      console.error("Request error:", e.message);
      resolve(false);
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });

  return new Promise((resolve) => {
    mod.server.close(() => {
      if (ok) {
        console.log("OK: In-process server started and /api/help returned 200");
        try {
          fs.rmSync(testDataDir, { recursive: true, force: true });
        } catch (_) {}
        resolve();
        process.exit(0);
      } else {
        console.error("FAIL: /api/help did not return 200");
        process.exit(1);
      }
    });
  });
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
