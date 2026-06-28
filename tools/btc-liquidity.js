/**
 * BTC liquidity regime — stablecoin plumbing, perp funding, ETF volume proxy.
 * Watch-mode indicators for early stress (not price forecasts).
 */

import { getBtcPriceUsd } from "./price.js";

const DEFILLAMA_STABLES = "https://stablecoins.llama.fi/stablecoins";
const DEFILLAMA_CHART = (id) => `https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=${id}`;
const HL_INFO = "https://api.hyperliquid.xyz/info";
const YAHOO_CHART = (sym) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=3mo`;

const USDT_CHART_ID = 1;
const USDC_CHART_ID = 2;
const ETF_SYMBOLS = ["IBIT", "FBTC"];
const YAHOO_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function deltaFromValues(values, lookbackDays) {
  if (!values?.length || lookbackDays < 1) return { absolute: null, pct: null };
  const last = values[values.length - 1];
  const idx = Math.max(0, values.length - 1 - lookbackDays);
  const prev = values[idx];
  if (!Number.isFinite(last) || !Number.isFinite(prev)) return { absolute: null, pct: null };
  return {
    absolute: last - prev,
    pct: prev !== 0 ? ((last - prev) / prev) * 100 : null,
  };
}

function chartToDailyValues(chartRows) {
  if (!Array.isArray(chartRows)) return [];
  return chartRows
    .map((row) => {
      const v =
        row?.totalCirculatingUSD?.peggedUSD ??
        row?.totalCirculating?.peggedUSD ??
        null;
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      return { date: Number(row.date) * 1000, value: n };
    })
    .filter(Boolean);
}

function mergeStableSeries(a, b) {
  const byDay = new Map();
  for (const row of a) {
    byDay.set(row.date, row.value);
  }
  for (const row of b) {
    byDay.set(row.date, (byDay.get(row.date) ?? 0) + row.value);
  }
  return [...byDay.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([date, value]) => ({ date, value }));
}

function smaLast(values, period) {
  if (!values?.length || values.length < period) return null;
  const slice = values.slice(-period);
  return mean(slice);
}

function volumeRatioVsSma(volumes, period = 20) {
  if (!volumes?.length || volumes.length < period + 1) return null;
  const last = volumes[volumes.length - 1];
  const base = smaLast(volumes.slice(0, -1), period);
  if (!Number.isFinite(last) || !Number.isFinite(base) || base === 0) return null;
  return last / base;
}

async function hlPost(body) {
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Hyperliquid non-JSON (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`Hyperliquid HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return parsed;
}

async function fetchStablecoinPillar() {
  const listRes = await fetch(DEFILLAMA_STABLES, { signal: AbortSignal.timeout(20_000) });
  if (!listRes.ok) throw new Error(`DefiLlama stablecoins HTTP ${listRes.status}`);
  const list = await listRes.json();

  const usdtMeta = list?.peggedAssets?.find((x) => x?.symbol === "USDT");
  const usdcMeta = list?.peggedAssets?.find((x) => x?.symbol === "USDC");

  const [usdtChart, usdcChart] = await Promise.all([
    fetch(DEFILLAMA_CHART(USDT_CHART_ID), { signal: AbortSignal.timeout(25_000) }).then((r) => r.json()),
    fetch(DEFILLAMA_CHART(USDC_CHART_ID), { signal: AbortSignal.timeout(25_000) }).then((r) => r.json()),
  ]);

  const usdtSeries = chartToDailyValues(usdtChart);
  const usdcSeries = chartToDailyValues(usdcChart);
  const totalSeries = mergeStableSeries(usdtSeries, usdcSeries);

  const usdtUsd = Number(usdtMeta?.circulating?.peggedUSD);
  const usdcUsd = Number(usdcMeta?.circulating?.peggedUSD);
  const totalUsd =
    Number.isFinite(usdtUsd) && Number.isFinite(usdcUsd)
      ? usdtUsd + usdcUsd
      : totalSeries.at(-1)?.value ?? null;

  const totalValues = totalSeries.map((x) => x.value);
  const usdtValues = usdtSeries.map((x) => x.value);
  const usdcValues = usdcSeries.map((x) => x.value);

  const sparkline = totalSeries.slice(-90).map((x) => ({
    day: new Date(x.date).toISOString().slice(0, 10),
    value: x.value,
  }));

  return {
    ok: true,
    total_usd: totalUsd,
    usdt_usd: Number.isFinite(usdtUsd) ? usdtUsd : null,
    usdc_usd: Number.isFinite(usdcUsd) ? usdcUsd : null,
    delta_7d: deltaFromValues(totalValues, 7),
    delta_30d: deltaFromValues(totalValues, 30),
    usdt_delta_7d: deltaFromValues(usdtValues, 7),
    usdc_delta_7d: deltaFromValues(usdcValues, 7),
    sparkline_90d: sparkline,
    source: "defillama",
  };
}

async function fetchFundingPillar() {
  const [metaCtx, history] = await Promise.all([
    hlPost({ type: "metaAndAssetCtxs" }),
    hlPost({
      type: "fundingHistory",
      coin: "BTC",
      startTime: Date.now() - 35 * 86400 * 1000,
    }),
  ]);

  const meta = metaCtx?.[0];
  const ctxs = metaCtx?.[1];
  if (!meta?.universe || !Array.isArray(ctxs)) {
    throw new Error("Hyperliquid metaAndAssetCtxs shape unexpected");
  }
  const btcIdx = meta.universe.findIndex((u) => u?.name === "BTC");
  if (btcIdx < 0) throw new Error("BTC not found in Hyperliquid universe");
  const btcCtx = ctxs[btcIdx];

  const rates = (Array.isArray(history) ? history : [])
    .map((h) => Number(h?.fundingRate))
    .filter((n) => Number.isFinite(n));

  const current = Number(btcCtx?.funding);
  const currentFromHistory = rates.length ? rates[rates.length - 1] : null;
  const rate = Number.isFinite(current) ? current : currentFromHistory;

  const m = mean(rates);
  const sd = stddev(rates);
  const z = Number.isFinite(rate) && sd > 0 ? (rate - m) / sd : null;
  const p75 = percentile(rates, 0.75);

  const last3 = rates.slice(-3);
  const rising3 =
    last3.length === 3 && last3[0] < last3[1] && last3[1] < last3[2];
  const falling3 =
    last3.length === 3 && last3[0] > last3[1] && last3[1] > last3[2];

  const oiCoins = Number(btcCtx?.openInterest);
  const markPx = Number(btcCtx?.markPx);
  const oiUsd =
    Number.isFinite(oiCoins) && Number.isFinite(markPx) ? oiCoins * markPx : null;

  const sparkline = rates.slice(-90).map((r, i) => ({
    idx: i,
    value: r,
  }));

  return {
    ok: true,
    venue: "hyperliquid",
    coin: "BTC",
    rate_period: "hourly",
    rate_hourly: rate,
    rate_8h_equiv: Number.isFinite(rate) ? rate * 8 : null,
    vs_30d_mean: m,
    vs_30d_z: z,
    vs_30d_p75: p75,
    rising_3: rising3,
    falling_3: falling3,
    open_interest_btc: Number.isFinite(oiCoins) ? oiCoins : null,
    open_interest_usd: oiUsd,
    mark_px_usd: Number.isFinite(markPx) ? markPx : null,
    sparkline_90d: sparkline,
    history_points: rates.length,
    source: "hyperliquid",
    note: "Single venue (HL). Global perps often lead spot; Binance/CME not included here.",
  };
}

async function fetchYahooEtf(sym) {
  const res = await fetch(YAHOO_CHART(sym), {
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    return { ok: false, symbol: sym, error: `Yahoo HTTP ${res.status}` };
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];
  const timestamps = result?.timestamp ?? [];

  const volRatio = volumeRatioVsSma(volumes.filter((v) => v != null), 20);
  const lastClose = closes.filter((c) => c != null).at(-1);
  const prevClose = closes.filter((c) => c != null).at(-2);
  const dayChgPct =
    Number.isFinite(lastClose) && Number.isFinite(prevClose) && prevClose !== 0
      ? ((lastClose - prevClose) / prevClose) * 100
      : null;

  const sparkline = timestamps.slice(-30).map((ts, i) => {
    const idx = timestamps.length - 30 + i;
    const realIdx = Math.max(0, timestamps.length - 30 + i);
    return {
      day: new Date(timestamps[realIdx] * 1000).toISOString().slice(0, 10),
      volume: volumes[realIdx] ?? null,
    };
  });

  return {
    ok: true,
    symbol: sym,
    volume_vs_20d: volRatio,
    last_volume: volumes.filter((v) => v != null).at(-1) ?? null,
    day_change_pct: dayChgPct,
    sparkline_30d: sparkline.filter((x) => x.volume != null),
    source: "yahoo_volume_proxy",
  };
}

async function fetchEtfPillar() {
  const results = {};
  for (const sym of ETF_SYMBOLS) {
    results[sym] = await fetchYahooEtf(sym);
    await sleep(300);
  }

  const okSyms = ETF_SYMBOLS.filter((s) => results[s]?.ok);
  const volRatios = okSyms
    .map((s) => results[s].volume_vs_20d)
    .filter((v) => Number.isFinite(v));
  const avgVolRatio = volRatios.length ? mean(volRatios) : null;
  const maxVolRatio = volRatios.length ? Math.max(...volRatios) : null;

  const downDays = okSyms.filter(
    (s) => Number.isFinite(results[s].day_change_pct) && results[s].day_change_pct < 0
  ).length;

  return {
    ok: okSyms.length > 0,
    symbols: results,
    avg_volume_vs_20d: avgVolRatio,
    max_volume_vs_20d: maxVolRatio,
    ibit_day_change_pct: results.IBIT?.ok ? results.IBIT.day_change_pct : null,
    fbtc_day_change_pct: results.FBTC?.ok ? results.FBTC.day_change_pct : null,
    down_day_count: downDays,
    symbol_count_ok: okSyms.length,
    source: "yahoo_volume_proxy",
    note: "IBIT/FBTC share volume vs 20d SMA — not official ETF flow. Spot pipe (IBIT), not income products (e.g. BITA).",
  };
}

function evaluateWarnings({ stablecoins, funding, etf }) {
  const warnings = [];

  if (stablecoins?.ok && stablecoins.delta_7d?.absolute != null && stablecoins.delta_7d.absolute < 0) {
    warnings.push("stablecoin_7d_negative");
  }
  if (
    stablecoins?.ok &&
    stablecoins.delta_30d?.pct != null &&
    stablecoins.delta_30d.pct < -0.5
  ) {
    warnings.push("stablecoin_30d_decline");
  }

  if (funding?.ok && Number.isFinite(funding.vs_30d_z) && funding.vs_30d_z > 1.25) {
    warnings.push("funding_elevated");
  }
  if (
    funding?.ok &&
    Number.isFinite(funding.rate_hourly) &&
    Number.isFinite(funding.vs_30d_p75) &&
    funding.rate_hourly > funding.vs_30d_p75
  ) {
    warnings.push("funding_above_p75");
  }
  if (funding?.ok && funding.rising_3) {
    warnings.push("funding_rising_3");
  }
  if (funding?.ok && funding.falling_3 && funding.vs_30d_z < -1) {
    warnings.push("funding_crowded_short");
  }

  if (etf?.ok && Number.isFinite(etf.max_volume_vs_20d) && etf.max_volume_vs_20d >= 1.5) {
    warnings.push("etf_volume_elevated");
  }
  if (etf?.ok && etf.down_day_count >= 1 && etf.max_volume_vs_20d >= 1.3) {
    warnings.push("etf_volume_on_down_day");
  }

  return warnings;
}

const MAJOR_WARNING_IDS = new Set([
  "stablecoin_7d_negative",
  "stablecoin_30d_decline",
  "funding_elevated",
  "funding_above_p75",
  "etf_volume_on_down_day",
]);

function computeRegime(warnings) {
  const hardStress =
    warnings.includes("stablecoin_7d_negative") &&
    (warnings.includes("funding_elevated") || warnings.includes("funding_above_p75"));
  const majorCount = warnings.filter((w) => MAJOR_WARNING_IDS.has(w)).length;
  if (hardStress || majorCount >= 2 || warnings.length >= 3) return "STRESSED";
  if (warnings.length >= 1) return "WATCH";
  return "FLUID";
}

function formatUsdShort(n) {
  if (!Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

function buildWatchBullets({ regime, stablecoins, funding, etf, warnings }) {
  const bullets = [`Regime (watch-mode, not a forecast): ${regime}.`];

  if (stablecoins?.ok) {
    const d7 = stablecoins.delta_7d;
    bullets.push(
      `Stables (USDT+USDC): $${formatUsdShort(stablecoins.total_usd)} total; 7d Δ ${formatUsdShort(d7?.absolute)} (${d7?.pct != null ? d7.pct.toFixed(2) : "n/a"}%).`
    );
  } else {
    bullets.push("Stables: data unavailable.");
  }

  if (funding?.ok) {
    const rh = funding.rate_hourly;
    bullets.push(
      `HL BTC funding ${Number.isFinite(rh) ? (rh * 100).toFixed(4) : "n/a"}%/hr (z ${funding.vs_30d_z != null ? funding.vs_30d_z.toFixed(2) : "n/a"}; HL only).`
    );
  } else {
    bullets.push("Funding: data unavailable.");
  }

  if (etf?.ok) {
    const ibitChg = etf.ibit_day_change_pct;
    bullets.push(
      `ETF vol proxy: max ${etf.max_volume_vs_20d != null ? etf.max_volume_vs_20d.toFixed(2) : "n/a"}× 20d SMA; IBIT day ${ibitChg != null ? `${ibitChg.toFixed(2)}%` : "n/a"} (volume proxy, not flow).`
    );
  } else {
    bullets.push("ETF proxy: unavailable.");
  }

  if (warnings.length) {
    bullets.push(`Warnings: ${warnings.join(", ")}.`);
  }

  bullets.push("Headlines move price when they hit levered books; this snapshot is plumbing/positioning only.");

  return bullets;
}

/**
 * Build full BTC liquidity regime payload for API + snapshot.
 */
export async function buildBtcLiquidityRegime() {
  const errors = [];
  let stablecoins = { ok: false };
  let funding = { ok: false };
  let etf = { ok: false };

  try {
    stablecoins = await fetchStablecoinPillar();
  } catch (e) {
    errors.push(`stablecoins: ${e?.message || e}`);
    stablecoins = { ok: false, error: e?.message || String(e) };
  }

  try {
    funding = await fetchFundingPillar();
  } catch (e) {
    errors.push(`funding: ${e?.message || e}`);
    funding = { ok: false, error: e?.message || String(e) };
  }

  try {
    etf = await fetchEtfPillar();
  } catch (e) {
    errors.push(`etf: ${e?.message || e}`);
    etf = { ok: false, error: e?.message || String(e) };
  }

  const warnings = evaluateWarnings({ stablecoins, funding, etf });
  const regime = computeRegime(warnings);
  const watch_bullets = buildWatchBullets({ regime, stablecoins, funding, etf, warnings });

  let btc_price_usd = null;
  let btc_price_source = null;
  const cg = await getBtcPriceUsd();
  if (cg.ok && Number.isFinite(cg.price)) {
    btc_price_usd = cg.price;
    btc_price_source = "coingecko";
  } else if (funding?.ok && Number.isFinite(funding.mark_px_usd)) {
    btc_price_usd = funding.mark_px_usd;
    btc_price_source = "hyperliquid_mark";
  }

  const ok = stablecoins.ok && funding.ok;

  return {
    schema_version: 1,
    ok,
    updated_at: new Date().toISOString(),
    btc_price_usd,
    btc_price_source,
    regime,
    warnings,
    stablecoins,
    funding,
    etf,
    watch_bullets,
    disclaimer:
      "Liquidity watch: stablecoin plumbing, HL perp positioning, IBIT/FBTC volume proxy. Not headlines, not fair value, not financial advice.",
    errors: errors.length ? errors : undefined,
  };
}
