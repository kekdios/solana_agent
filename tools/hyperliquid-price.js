/**
 * Hyperliquid public mid prices (perps + spot) via POST https://api.hyperliquid.xyz/info { type: "allMids" }.
 * Spot pairs use names like `@107` or `PURR/USDC` (see spotMeta). Perps use symbols like BTC, ETH, SOL.
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 */

const HL_INFO = "https://api.hyperliquid.xyz/info";
const DEFAULT_COINS_PERP = ["BTC", "ETH"];
/** Default spot request: HYPE/USDC-style pair is exposed as `@107` in allMids when resolvable. */
const DEFAULT_COINS_SPOT = ["HYPE"];

/**
 * @param {object} [args]
 * @param {string[]} [args.coins] - Perp: uppercase symbols e.g. ["BTC","ETH"]. Spot: `["@107"]`, `["PURR/USDC"]`, or base names like `["HYPE"]` when resolvable via spotMeta.
 * @param {string} [args.market] - `"perp"` (default) or `"spot"`.
 * @param {object} [_env]
 */
export async function hyperliquidPerpMids(args = {}, _env = {}) {
  const marketRaw = args?.market ?? args?.venue;
  const market = String(marketRaw || "perp").toLowerCase() === "spot" ? "spot" : "perp";

  const rawCoins = args?.coins ?? args?.symbols;
  let coins = market === "spot" ? [...DEFAULT_COINS_SPOT] : [...DEFAULT_COINS_PERP];
  if (Array.isArray(rawCoins) && rawCoins.length > 0) {
    coins = rawCoins.map((c) => String(c).trim()).filter(Boolean);
  } else if (typeof rawCoins === "string" && rawCoins.trim()) {
    coins = rawCoins
      .split(/[,;\s]+/)
      .map((c) => c.trim())
      .filter(Boolean);
  }
  if (coins.length === 0) coins = market === "spot" ? [...DEFAULT_COINS_SPOT] : [...DEFAULT_COINS_PERP];

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
      market,
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
      market,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `Hyperliquid HTTP ${res.status}`,
      detail: typeof parsed === "object" ? parsed : text.slice(0, 300),
      source: "hyperliquid",
      endpoint: HL_INFO,
      market,
    };
  }

  /** @type {Record<string, string>} */
  const allMids =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};

  /** @type {{ requested: string, hl_key: string, label: string }[]} */
  const resolved = [];
  /** @type {string[]} */
  const hlKeys = [];

  if (market === "spot") {
    let spotMeta;
    try {
      const sm = await fetch(HL_INFO, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ type: "spotMeta" }),
        signal: AbortSignal.timeout(12_000),
      });
      const smText = await sm.text();
      spotMeta = JSON.parse(smText);
      if (!sm.ok) {
        return {
          ok: false,
          error: `Hyperliquid spotMeta HTTP ${sm.status}`,
          source: "hyperliquid",
          endpoint: HL_INFO,
          market: "spot",
        };
      }
    } catch (e) {
      return {
        ok: false,
        error: e?.message || String(e),
        source: "hyperliquid",
        endpoint: HL_INFO,
        market: "spot",
        detail: "Failed to load spotMeta for symbol resolution",
      };
    }

    for (const c of coins) {
      const r = resolveSpotCoinToHlKey(c, spotMeta);
      if (!r) {
        return {
          ok: false,
          error: `Could not resolve spot symbol "${c}". Use a pair name like @107 or PURR/USDC, or a base token that has a USDC spot market on Hyperliquid.`,
          source: "hyperliquid",
          endpoint: HL_INFO,
          method: "allMids",
          market: "spot",
          coins_requested: coins,
        };
      }
      resolved.push(r);
      hlKeys.push(r.hl_key);
    }
  } else {
    for (const c of coins) {
      const sym = String(c).trim().toUpperCase();
      hlKeys.push(sym);
      resolved.push({ requested: c, hl_key: sym, label: sym });
    }
  }

  const out = {};
  const raw = {};
  const missing = [];

  for (const r of resolved) {
    const sym = r.hl_key;
    const v = allMids[sym];
    if (v == null || v === "") {
      missing.push(sym);
      continue;
    }
    raw[sym] = String(v);
    const n = Number(v);
    out[sym] = Number.isFinite(n) ? n : null;
  }

  const kindLabel = market === "spot" ? "spot" : "perp";
  const lines = resolved
    .filter((r) => out[r.hl_key] != null)
    .map((r) => {
      const px = out[r.hl_key];
      const tag = market === "spot" ? `${r.label} (${r.hl_key})` : r.label;
      return `${tag} mid: ${px} USD (Hyperliquid ${kindLabel})`;
    });

  const agent_report = [
    lines.length ? lines.join("\n") : "No requested mids in response.",
    missing.length ? `Missing symbols in allMids: ${missing.join(", ")}` : null,
    market === "spot"
      ? "Spot mid from allMids (vs perp ticker with same name); not an executable quote."
      : "Mid ≈ (best bid + best ask) / 2 per Hyperliquid; not an executable quote.",
  ]
    .filter(Boolean)
    .join("\n");

  if (Object.keys(out).length === 0) {
    return {
      ok: false,
      error: `None of the requested ${market === "spot" ? "spot pairs" : "coins"} were found in Hyperliquid allMids.`,
      source: "hyperliquid",
      endpoint: HL_INFO,
      method: "allMids",
      market,
      coins_requested: coins,
      resolved,
      sample_keys_from_api: Object.keys(allMids).slice(0, 40),
    };
  }

  return {
    ok: true,
    source: "hyperliquid",
    endpoint: HL_INFO,
    method: "allMids",
    market,
    coins_requested: coins,
    resolved,
    mids_usd: out,
    mids_raw: raw,
    missing_in_response: missing.length ? missing : undefined,
    agent_report,
  };
}

/**
 * @param {string} coin
 * @param {object} spotMeta
 */
function resolveSpotCoinToHlKey(coin, spotMeta) {
  const s = String(coin || "").trim();
  if (!s) return null;

  if (/^@[0-9]+$/.test(s)) {
    return { requested: s, hl_key: s, label: s };
  }
  if (s.includes("/")) {
    return { requested: s, hl_key: s, label: s };
  }

  const tokens = spotMeta?.tokens;
  const universe = spotMeta?.universe;
  if (!Array.isArray(tokens) || !Array.isArray(universe)) return null;

  const base = s.toUpperCase();
  const ti = tokens.findIndex((t) => t && String(t.name).toUpperCase() === base);
  if (ti < 0) return null;

  const u = universe.find((x) => x && x.tokens && x.tokens[0] === ti && x.tokens[1] === 0);
  if (!u || !u.name) return null;

  return { requested: s, hl_key: u.name, label: `${base}/USDC` };
}
