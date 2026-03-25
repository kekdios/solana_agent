import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "../store/chatStore";
import { fetchTrendData } from "../api/trendApi";
import {
  buildDailySeries,
  anchoredVwap,
  breadthSeries,
  latestMarketState,
  ratioSeries,
} from "../utils/trendMath";
import { buildTrendStatsPayload } from "../utils/trendStatsPayload";
import TrendLineCard from "./trend/TrendLineCard";

function mergePriceAndVwap(series, vwap, key = "price") {
  return series.map((row, i) => ({
    day: row.day,
    [key]: row.close,
    vwap: vwap[i],
  }));
}

function normalizeRatio(series, label) {
  return series.map((x) => ({ day: x.day, value: x[label] }));
}

function formatLastUpdated(ts) {
  if (ts == null) return null;
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function TrendPage() {
  const setView = useChatStore((s) => s.setView);
  const apiBase = useChatStore((s) => s.apiBase) || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [raw, setRaw] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const postedStatsKeyRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTrendData(365);
      setRaw(data);
      setLastUpdated(data.fromCache && data.cacheAt != null ? data.cacheAt : Date.now());
    } catch (e) {
      setError(e.message || "Failed to load trend data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const computed = useMemo(() => {
    if (!raw) return null;
    const btc = buildDailySeries(raw.btc.prices, raw.btc.total_volumes);
    const eth = buildDailySeries(raw.eth.prices, raw.eth.total_volumes);
    const sol = buildDailySeries(raw.sol.prices, raw.sol.total_volumes);

    const btcVwap = anchoredVwap(btc, 30);
    const ethVwap = anchoredVwap(eth, 30);
    const solVwap = anchoredVwap(sol, 30);

    const ethBasketSeries = Object.fromEntries(
      Object.entries(raw.ethBasket)
        .filter(([, v]) => v.ok && v.data)
        .map(([k, v]) => [k, buildDailySeries(v.data.prices, v.data.total_volumes)])
    );
    const solBasketSeries = Object.fromEntries(
      Object.entries(raw.solBasket)
        .filter(([, v]) => v.ok && v.data)
        .map(([k, v]) => [k, buildDailySeries(v.data.prices, v.data.total_volumes)])
    );

    const ethBreadth = breadthSeries(ethBasketSeries, 20);
    const solBreadth = breadthSeries(solBasketSeries, 20);

    const ethBtc = normalizeRatio(ratioSeries(eth, btc, "ratio"), "ratio");
    const solEth = normalizeRatio(ratioSeries(sol, eth, "ratio"), "ratio");
    const solBtc = normalizeRatio(ratioSeries(sol, btc, "ratio"), "ratio");

    const state = latestMarketState({
      solSeries: sol,
      solVwap,
      solBreadth,
      ethBtc,
      solBtc,
    });

    return {
      state,
      btcChart: mergePriceAndVwap(btc, btcVwap),
      ethChart: mergePriceAndVwap(eth, ethVwap),
      solChart: mergePriceAndVwap(sol, solVwap),
      ethBtc,
      solEth,
      solBtc,
      ethBreadth,
      solBreadth,
    };
  }, [raw]);

  useEffect(() => {
    if (!computed || !raw || lastUpdated == null) return;
    const payload = buildTrendStatsPayload(computed, raw, lastUpdated);
    const dedupeKey = `${payload.updated_at}-${payload.market_state}-${payload.from_cache}`;
    if (postedStatsKeyRef.current === dedupeKey) return;
    postedStatsKeyRef.current = dedupeKey;
    const base = apiBase || "";
    fetch(`${base}/api/trend/stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, [computed, raw, lastUpdated, apiBase]);

  return (
    <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#0d0d0f] overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setView("chat")} className="text-sm text-slate-400 hover:text-white transition">
              ← Back to chat
            </button>
            <h1 className="text-xl font-semibold text-slate-200">Trend</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {lastUpdated != null && (
              <span className="text-xs text-slate-500 tabular-nums" title="When CoinGecko data was last fetched in this session">
                Last updated: <span className="text-slate-400">{formatLastUpdated(lastUpdated)}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => loadData()}
              disabled={loading}
              className="rounded-lg border border-[#2a2a30] bg-[#121214] px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
              title="Refetch market data from CoinGecko"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <div className="text-xs rounded-full border border-[#2a2a30] px-3 py-1.5 text-slate-300 bg-[#121214]">
              Market State: <span className="text-emerald-300 font-medium">{computed?.state || "—"}</span>
            </div>
          </div>
        </div>

        {loading && !raw && <div className="text-sm text-slate-500">Loading trend data…</div>}
        {error && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 space-y-1">
            <p>{error}</p>
            {(String(error).includes("NetworkError") ||
              String(error).includes("Failed to fetch") ||
              String(error).includes("Load failed")) && (
              <p className="text-xs text-amber-200/80">
                Trend loads market data via <code className="text-slate-400">/api/trend/…</code> on this app&apos;s server. Run{" "}
                <code className="text-slate-400">node server.js</code> (Vite dev proxies <code className="text-slate-400">/api</code> to it).
              </p>
            )}
          </div>
        )}
        {raw?.fromCache && (
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-200/90">
            Showing cached CoinGecko data (rate limit or network). Try <strong className="text-sky-100">Refresh</strong> in a few minutes.
          </div>
        )}

        {computed && (
          <div className="space-y-8">
            <section className="space-y-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-300">Core spot &amp; anchored VWAP</h2>
                <p className="text-xs text-slate-500 max-w-4xl leading-relaxed">
                  Daily USD close (CoinGecko) with volume-weighted average price anchored after a <strong className="text-slate-400 font-medium">30-day high breakout</strong>. Compares
                  price to where volume has accumulated since that reset—useful for trend vs mean-reversion context.
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TrendLineCard
                title="BTC Price + Anchored VWAP"
                data={computed.btcChart}
                lines={[
                  { key: "price", name: "Price", color: "#10b981" },
                  { key: "vwap", name: "VWAP", color: "#f59e0b" },
                ]}
                yFormatter={(v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              />
              <TrendLineCard
                title="ETH Price + Anchored VWAP"
                data={computed.ethChart}
                lines={[
                  { key: "price", name: "Price", color: "#38bdf8" },
                  { key: "vwap", name: "VWAP", color: "#f59e0b" },
                ]}
                yFormatter={(v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              />
              <TrendLineCard
                title="SOL Price + Anchored VWAP"
                data={computed.solChart}
                lines={[
                  { key: "price", name: "Price", color: "#a78bfa" },
                  { key: "vwap", name: "VWAP", color: "#f59e0b" },
                ]}
                yFormatter={(v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              />
              </div>
            </section>

            <section className="space-y-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-300">Relative strength (pair ratios)</h2>
                <p className="text-xs text-slate-500 max-w-4xl leading-relaxed">
                  Closing-price ratios: <strong className="text-slate-400 font-medium">ETH/BTC</strong>, <strong className="text-slate-400 font-medium">SOL/ETH</strong>,{" "}
                  <strong className="text-slate-400 font-medium">SOL/BTC</strong>. Shows which layer/asset is outperforming on a given day—rising SOL/BTC means SOL is gaining vs BTC in
                  relative terms.
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TrendLineCard title="ETH / BTC" data={computed.ethBtc} lines={[{ key: "value", color: "#34d399" }]} />
              <TrendLineCard title="SOL / ETH" data={computed.solEth} lines={[{ key: "value", color: "#60a5fa" }]} />
              <TrendLineCard title="SOL / BTC" data={computed.solBtc} lines={[{ key: "value", color: "#f472b6" }]} />
              </div>
            </section>

            <section className="space-y-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-300">Ecosystem breadth</h2>
                <p className="text-xs text-slate-500 max-w-4xl leading-relaxed">
                  For each day, the share of tracked tokens in that basket trading <strong className="text-slate-400 font-medium">above their 20-day SMA</strong> (0–100%). A crude
                  participation gauge: higher breadth suggests more names participating on the upside; small baskets are illustrative, not a full-market index.
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrendLineCard
                title="ETH Ecosystem Breadth"
                data={computed.ethBreadth}
                lines={[{ key: "breadth", color: "#22d3ee" }]}
                yDomain={[0, 1]}
                yFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
              />
              <TrendLineCard
                title="SOL Ecosystem Breadth"
                data={computed.solBreadth}
                lines={[{ key: "breadth", color: "#c084fc" }]}
                yDomain={[0, 1]}
                yFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
              />
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
