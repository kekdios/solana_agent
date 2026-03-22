/**
 * Hyperliquid public mid prices (perps) via POST https://api.hyperliquid.xyz/info { type: "allMids" }.
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 */

const HL_INFO = "https://api.hyperliquid.xyz/info";
const DEFAULT_COINS = ["BTC", "ETH"];

/**
 * @param {object} [args]
 * @param {string[]} [args.coins] - Uppercase symbols, e.g. ["BTC","ETH"]. Default BTC and ETH only.
 * @param {object} [_env]
 */
export async function hyperliquidPerpMids(args = {}, _env = {}) {
  const rawCoins = args?.coins ?? args?.symbols;
  let coins = DEFAULT_COINS;
  if (Array.isArray(rawCoins) && rawCoins.length > 0) {
    coins = rawCoins.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  } else if (typeof rawCoins === "string" && rawCoins.trim()) {
    coins = rawCoins
      .split(/[,;\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
  }
  if (coins.length === 0) coins = [...DEFAULT_COINS];

  let res;
  try {
    res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ type: "allMids" }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      source: "hyperliquid",
      endpoint: HL_INFO,
    };
  }

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: `Hyperliquid returned non-JSON (HTTP ${res.status})`,
      body_preview: text.slice(0, 200),
      source: "hyperliquid",
      endpoint: HL_INFO,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `Hyperliquid HTTP ${res.status}`,
      detail: typeof parsed === "object" ? parsed : text.slice(0, 300),
      source: "hyperliquid",
      endpoint: HL_INFO,
    };
  }

  /** @type {Record<string, string>} */
  const allMids =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};

  const out = {};
  const raw = {};
  const missing = [];

  for (const sym of coins) {
    const v = allMids[sym];
    if (v == null || v === "") {
      missing.push(sym);
      continue;
    }
    raw[sym] = String(v);
    const n = Number(v);
    out[sym] = Number.isFinite(n) ? n : null;
  }

  const lines = coins
    .filter((s) => out[s] != null)
    .map((s) => `${s} mid: ${out[s]} USD (Hyperliquid perp)`);
  const agent_report = [
    lines.length ? lines.join("\n") : "No requested mids in response.",
    missing.length ? `Missing symbols in allMids: ${missing.join(", ")}` : null,
    "Mid ≈ (best bid + best ask) / 2 per Hyperliquid; not an executable quote.",
  ]
    .filter(Boolean)
    .join("\n");

  if (Object.keys(out).length === 0) {
    return {
      ok: false,
      error: "None of the requested coins were found in Hyperliquid allMids.",
      source: "hyperliquid",
      endpoint: HL_INFO,
      method: "allMids",
      coins_requested: coins,
      sample_keys_from_api: Object.keys(allMids).slice(0, 40),
    };
  }

  return {
    ok: true,
    source: "hyperliquid",
    endpoint: HL_INFO,
    method: "allMids",
    coins_requested: coins,
    mids_usd: out,
    mids_raw: raw,
    missing_in_response: missing.length ? missing : undefined,
    agent_report,
  };
}
