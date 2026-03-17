/**
 * Bitcoin price check for cron. Fetches from CoinGecko (no API key).
 * Used by cron task "check_btc" to alert when price drops below threshold.
 */

import { appendFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MEMORY_DIR = process.env.DATA_DIR
  ? join(process.env.DATA_DIR, "memory")
  : join(__dirname, "..", "data", "memory");
const ALERTS_FILE = join(MEMORY_DIR, "alerts.md");

const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

/**
 * Fetch current Bitcoin price in USD.
 * @returns {{ ok: boolean, price?: number, error?: string }}
 */
export async function getBtcPriceUsd() {
  try {
    const res = await fetch(COINGECKO_URL, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "solagent/1.0" },
    });
    if (!res.ok) return { ok: false, error: `CoinGecko ${res.status}` };
    const data = await res.json();
    const price = data?.bitcoin?.usd;
    if (typeof price !== "number") return { ok: false, error: "No price in response" };
    return { ok: true, price };
  } catch (e) {
    return { ok: false, error: e.message || "Fetch failed" };
  }
}

/**
 * Run hourly check: if BTC price < threshold, append to alerts file.
 * @param {number} thresholdUsd - Alert when price drops below this (default 65000)
 * @returns {{ ok: boolean, price?: number, alerted?: boolean, error?: string }}
 */
export async function checkBtcAndAlert(thresholdUsd = 65000) {
  const result = await getBtcPriceUsd();
  if (!result.ok) {
    console.error("[check_btc]", result.error);
    return result;
  }
  const { price } = result;
  if (price >= thresholdUsd) {
    return { ok: true, price, alerted: false };
  }
  try {
    await mkdir(MEMORY_DIR, { recursive: true });
    const line = `[${new Date().toISOString()}] BTC price $${price} is below $${thresholdUsd}. Alert.\n`;
    await appendFile(ALERTS_FILE, line, "utf8");
    return { ok: true, price, alerted: true };
  } catch (e) {
    console.error("[check_btc] write alert failed", e.message);
    return { ok: true, price, alerted: false, writeError: e.message };
  }
}

/**
 * Read recent alerts (last 50 lines) for API or UI.
 */
export async function getRecentAlerts() {
  try {
    const raw = await readFile(ALERTS_FILE, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    return { ok: true, alerts: lines.slice(-50) };
  } catch (e) {
    if (e.code === "ENOENT") return { ok: true, alerts: [] };
    return { ok: false, error: e.message, alerts: [] };
  }
}
