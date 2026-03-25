function lastRow(arr) {
  if (!arr?.length) return null;
  return arr[arr.length - 1];
}

function pctVsVwap(row) {
  if (!row || row.vwap == null || !Number.isFinite(Number(row.price))) return null;
  const v = Number(row.vwap);
  if (!Number.isFinite(v) || v === 0) return null;
  return ((Number(row.price) - v) / v) * 100;
}

/**
 * Builds the JSON body for POST /api/trend/stats (persisted to workspace/memory/trend-latest.json).
 */
export function buildTrendStatsPayload(computed, raw, lastUpdatedMs) {
  const btcL = lastRow(computed.btcChart);
  const ethL = lastRow(computed.ethChart);
  const solL = lastRow(computed.solChart);
  const ethBtcL = lastRow(computed.ethBtc);
  const solEthL = lastRow(computed.solEth);
  const solBtcL = lastRow(computed.solBtc);
  const ethBrL = lastRow(computed.ethBreadth);
  const solBrL = lastRow(computed.solBreadth);

  const state = computed.state;
  const lastDay = solL?.day || null;

  const btcVwapPct = pctVsVwap(btcL);
  const social_comment_bullets = [
    `Regime (rules-based): ${state}.`,
    lastDay ? `Last daily bar date: ${lastDay}.` : null,
    btcL
      ? `BTC ~$${Number(btcL.price).toLocaleString(undefined, { maximumFractionDigits: 0 })} vs anchored VWAP (distance ${btcVwapPct != null ? `${btcVwapPct.toFixed(2)}%` : "n/a"}).`
      : null,
    ethBrL && solBrL
      ? `Breadth (share of basket above 20d SMA): ETH ${(ethBrL.breadth * 100).toFixed(0)}%, SOL ${(solBrL.breadth * 100).toFixed(0)}%.`
      : null,
    ethBtcL && solBtcL
      ? `Ratios (close): ETH/BTC ${Number(ethBtcL.value).toFixed(5)}, SOL/BTC ${Number(solBtcL.value).toFixed(6)}.`
      : null,
  ].filter(Boolean);

  return {
    schema_version: 1,
    updated_at: new Date(lastUpdatedMs).toISOString(),
    ui_last_updated_ms: lastUpdatedMs,
    data_source: "coingecko_via_app_proxy",
    from_cache: !!raw?.fromCache,
    market_state: state,
    last_day: lastDay,
    prices_usd: {
      btc: btcL?.price ?? null,
      eth: ethL?.price ?? null,
      sol: solL?.price ?? null,
    },
    vwap_distance_pct: {
      btc: pctVsVwap(btcL),
      eth: pctVsVwap(ethL),
      sol: pctVsVwap(solL),
    },
    ratios: {
      eth_btc: ethBtcL?.value ?? null,
      sol_eth: solEthL?.value ?? null,
      sol_btc: solBtcL?.value ?? null,
    },
    breadth: {
      eth_ecosystem: ethBrL?.breadth ?? null,
      sol_ecosystem: solBrL?.breadth ?? null,
    },
    social_comment_bullets,
    disclaimer: "Rule-based dashboard from daily CoinGecko data; not financial advice. Refresh Trend to update.",
  };
}
