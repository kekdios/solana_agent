function toDayKey(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function buildDailySeries(prices = [], volumes = []) {
  const volByDay = new Map();
  for (const [ts, vol] of volumes) {
    volByDay.set(toDayKey(ts), Number(vol) || 0);
  }
  return prices.map(([ts, close]) => ({
    day: toDayKey(ts),
    close: Number(close) || 0,
    volume: volByDay.get(toDayKey(ts)) ?? 0,
  }));
}

export function sma(values, period = 20) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function anchoredVwap(series, lookback = 30) {
  const highs = series.map((x) => x.close);
  const out = new Array(series.length).fill(null);
  let anchor = -1;
  for (let i = lookback; i < highs.length; i++) {
    let prevMax = -Infinity;
    for (let j = i - lookback; j < i; j++) prevMax = Math.max(prevMax, highs[j]);
    if (highs[i] > prevMax) anchor = i;
  }
  if (anchor < 0) return out;

  let cumPv = 0;
  let cumVol = 0;
  for (let i = anchor; i < series.length; i++) {
    const c = Number(series[i].close) || 0;
    const v = Number(series[i].volume) || 0;
    cumPv += c * v;
    cumVol += v;
    out[i] = cumVol > 0 ? cumPv / cumVol : null;
  }
  return out;
}

export function ratioSeries(a = [], b = [], label = "ratio") {
  const byDayB = new Map(b.map((x) => [x.day, x.close]));
  const out = [];
  for (const row of a) {
    const den = byDayB.get(row.day);
    if (!den) continue;
    out.push({ day: row.day, [label]: row.close / den });
  }
  return out;
}

export function breadthSeries(basketSeries = {}, period = 20) {
  const symbols = Object.keys(basketSeries);
  const allDays = new Set();
  for (const s of symbols) {
    for (const row of basketSeries[s] || []) allDays.add(row.day);
  }
  const days = Array.from(allDays).sort();
  const aboveBySymbol = {};
  for (const s of symbols) {
    const rows = basketSeries[s] || [];
    const closes = rows.map((r) => r.close);
    const smas = sma(closes, period);
    const map = new Map();
    for (let i = 0; i < rows.length; i++) {
      map.set(rows[i].day, smas[i] != null && closes[i] > smas[i] ? 1 : 0);
    }
    aboveBySymbol[s] = map;
  }

  return days.map((day) => {
    let count = 0;
    let total = 0;
    for (const s of symbols) {
      const v = aboveBySymbol[s].get(day);
      if (v == null) continue;
      total += 1;
      count += v;
    }
    return { day, breadth: total > 0 ? count / total : 0 };
  });
}

export function latestMarketState({ solSeries, solVwap, solBreadth, ethBtc, solBtc }) {
  const i = solSeries.length - 1;
  if (i < 20) return "TRANSITION";

  const ethBtcVals = ethBtc.map((r) => r.value);
  const solBtcVals = solBtc.map((r) => r.value);
  const ethBtcSma = sma(ethBtcVals, 20);
  const solBtcSma = sma(solBtcVals, 20);
  const ethBtcNow = ethBtcVals[ethBtcVals.length - 1];
  const solBtcNow = solBtcVals[solBtcVals.length - 1];
  const ethBtcTrend = ethBtcSma[ethBtcSma.length - 1];
  const solBtcTrend = solBtcSma[solBtcSma.length - 1];

  if (ethBtcTrend != null && solBtcTrend != null && ethBtcNow < ethBtcTrend && solBtcNow < solBtcTrend) {
    return "WEAK_DEFENSIVE";
  }

  const price = solSeries[i]?.close;
  const vwap = solVwap[i];
  const breadth = solBreadth[solBreadth.length - 1]?.breadth ?? 0;
  if (price == null || vwap == null) return "TRANSITION";

  if (price > vwap * 1.08 && breadth > 0.8) return "DISTRIBUTION";
  if (price > vwap && breadth > 0.6) return "ACTIVE_WAVE";
  if (price > vwap && breadth < 0.4) return "NARROW_WEAKENING";
  if (price < vwap && breadth < 0.4) return "NO_WAVE";
  return "TRANSITION";
}
