/**
 * Same-origin proxy on the Solana Agent server (see server.js). Avoids cross-origin / mixed-context
 * "NetworkError when attempting to fetch resource" when the UI cannot reach api.coingecko.com directly.
 */
const CG_BASE = "/api/trend/coingecko/v3";

/** Ordered unique CoinGecko IDs (avoids duplicate fetches for ETH/SOL in core + baskets). */
const CHART_IDS = [
  "bitcoin",
  "ethereum",
  "solana",
  "arbitrum",
  "optimism",
  "uniswap",
  "aave",
  "jupiter-exchange-solana",
  "raydium",
  "orca",
  "pyth-network",
];

const GAP_MS = 450;
const CACHE_KEY = "trend_coingecko_v1";
const CACHE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readCachePayload() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { t, data } = JSON.parse(raw);
    if (!data || typeof t !== "number") return null;
    if (Date.now() - t > CACHE_MAX_AGE_MS) return null;
    return { t, data };
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Single market_chart fetch with 429 retries (sequential callers stay under burst limits).
 */
async function fetchCoinMarketChart(id, days = 365) {
  const url = `${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const maxAttempts = 6;
  let backoffMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url);

    if (res.status === 429) {
      const ra = res.headers.get("Retry-After");
      const waitMs = ra ? Math.min(Math.max(0, parseInt(ra, 10)) * 1000, 120000) : backoffMs;
      await sleep(waitMs);
      backoffMs = Math.min(backoffMs * 2, 60000);
      continue;
    }

    if (!res.ok) {
      throw new Error(`CoinGecko request failed for ${id}: ${res.status}`);
    }
    return res.json();
  }

  throw new Error(`CoinGecko rate limited for ${id} after retries`);
}

export async function fetchTrendData(days = 365) {
  const map = new Map();

  try {
    for (let i = 0; i < CHART_IDS.length; i++) {
      if (i > 0) await sleep(GAP_MS);
      const id = CHART_IDS[i];
      const data = await fetchCoinMarketChart(id, days);
      map.set(id, data);
    }

    const g = (id) => map.get(id);

    const out = {
      btc: g("bitcoin"),
      eth: g("ethereum"),
      sol: g("solana"),
      ethBasket: {
        ETH: { ok: true, data: g("ethereum") },
        ARB: { ok: true, data: g("arbitrum") },
        OP: { ok: true, data: g("optimism") },
        UNI: { ok: true, data: g("uniswap") },
        AAVE: { ok: true, data: g("aave") },
      },
      solBasket: {
        SOL: { ok: true, data: g("solana") },
        JUP: { ok: true, data: g("jupiter-exchange-solana") },
        RAY: { ok: true, data: g("raydium") },
        ORCA: { ok: true, data: g("orca") },
        PYTH: { ok: true, data: g("pyth-network") },
      },
    };
    writeCache(out);
    return { ...out, fromCache: false };
  } catch (e) {
    const payload = readCachePayload();
    if (payload) return { ...payload.data, fromCache: true, cacheAt: payload.t };
    throw e;
  }
}
