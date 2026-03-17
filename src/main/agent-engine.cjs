/**
 * Agent engine: runs in Electron main, polls server for price (or other metrics)
 * and can send to renderer. Minimal loop for Phase 3; extend later for arbitrage, etc.
 */
const http = require("http");

const DEFAULT_INTERVAL_MS = 60000;
const POLL_PATH = "/api/agent/price";

const DRIFT_PRICE_PATH = "/api/agent/drift-price";
const ARB_SPREAD_THRESHOLD = 0.001;

function fetchJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${port}${path}`,
      { timeout: 8000 },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function fetchPrice(port) {
  return fetchJson(port, POLL_PATH);
}

let intervalId = null;

/**
 * Start the agent engine: poll price every intervalMs and send to renderer.
 * @param {import("electron").BrowserWindow} mainWindow - may be null
 * @param {number} port - server port (e.g. 3333)
 * @param {number} [intervalMs] - poll interval (default 60000)
 */
function startAgentEngine(mainWindow, port, intervalMs = DEFAULT_INTERVAL_MS) {
  if (intervalId) clearInterval(intervalId);
  function tick() {
    Promise.all([
      fetchJson(port, POLL_PATH),
      fetchJson(port, DRIFT_PRICE_PATH).catch(() => ({})),
    ]).then(([spotData, driftData]) => {
      const spotPrice = spotData?.prices?.SOL?.usdPrice ?? spotData?.data?.SOL?.usdPrice;
      const perpPrice = driftData?.mark_price_usd ?? driftData?.mark_price;
      let arb = null;
      if (typeof spotPrice === "number" && typeof perpPrice === "number" && perpPrice > 0) {
        const spread = Math.abs(spotPrice - perpPrice) / perpPrice;
        if (spread >= ARB_SPREAD_THRESHOLD) {
          arb = { spotPrice, perpPrice, spreadPct: (spread * 100).toFixed(2) };
        }
      }
      const payload = { spot: spotData, drift: driftData, arb };
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send("agent-price", payload);
      }
    }).catch(() => {});
  }
  tick();
  intervalId = setInterval(tick, intervalMs);
}

function stopAgentEngine() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startAgentEngine, stopAgentEngine, fetchPrice };
