import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "../store/chatStore";
import SparklineCard from "./liquidity/SparklineCard";

function formatUsd(n) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatDelta(d) {
  if (!d || d.absolute == null) return "—";
  const pct = d.pct != null ? ` (${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(2)}%)` : "";
  return `${d.absolute >= 0 ? "+" : ""}${formatUsd(d.absolute)}${pct}`;
}

function regimeColor(regime) {
  if (regime === "FLUID") return "text-emerald-300 border-emerald-500/40 bg-emerald-500/10";
  if (regime === "WATCH" || regime === "CAUTIOUS") return "text-amber-200 border-amber-500/40 bg-amber-500/10";
  if (regime === "STRESSED") return "text-red-300 border-red-500/40 bg-red-500/10";
  return "text-slate-300 border-[#2a2a30] bg-[#121214]";
}

function formatPct(n) {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function formatBtcSpot(n) {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function warningLabel(id) {
  const map = {
    stablecoin_7d_negative: "7d stablecoin supply down",
    stablecoin_30d_decline: "30d stablecoin trend down",
    funding_elevated: "Funding elevated (z-score)",
    funding_above_p75: "Funding above 30d p75",
    funding_rising_3: "Funding rising (3 sessions)",
    funding_crowded_short: "Crowded short funding",
    etf_volume_elevated: "ETF volume spike vs 20d",
    etf_volume_on_down_day: "High ETF volume on down day",
  };
  return map[id] || id;
}

function MetricCell({ label, value, warn }) {
  return (
    <div className="rounded-lg border border-[#2a2a30] bg-[#0d0d0f]/60 p-3 space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-mono tabular-nums ${warn ? "text-amber-200" : "text-slate-200"}`}>{value}</div>
    </div>
  );
}

export default function LiquidityPage() {
  const setView = useChatStore((s) => s.setView);
  const apiBase = useChatStore((s) => s.apiBase) || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const loadData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const q = force ? "?refresh=1" : "";
      const res = await fetch(`${apiBase}/api/liquidity/btc-regime${q}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setData(json);
    } catch (e) {
      setError(e.message || "Failed to load liquidity data");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const regime = data?.regime === "CAUTIOUS" ? "WATCH" : (data?.regime ?? "—");
  const warnings = data?.warnings ?? [];
  const st = data?.stablecoins;
  const fund = data?.funding;
  const etf = data?.etf;

  const stWarn7 = warnings.includes("stablecoin_7d_negative");
  const stWarn30 = warnings.includes("stablecoin_30d_decline");
  const fundWarn = warnings.some((w) => w.startsWith("funding_"));
  const etfWarn = warnings.some((w) => w.startsWith("etf_"));

  return (
    <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#0d0d0f] overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setView("chat")} className="text-sm text-slate-400 hover:text-white transition">
              ← Back to chat
            </button>
            <h1 className="text-xl font-semibold text-slate-200">BTC Liquidity</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data?.updated_at && (
              <span className="text-xs text-slate-500 tabular-nums">
                Updated: <span className="text-slate-400">{new Date(data.updated_at).toLocaleString()}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={loading}
              className="rounded-lg border border-[#2a2a30] bg-[#121214] px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50 transition"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <div className={`text-xs rounded-full border px-3 py-1.5 font-medium ${regimeColor(regime)}`}>
              Regime: {regime}
            </div>
          </div>
        </div>

        {(data?.btc_price_usd != null || loading) && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold text-slate-100 tabular-nums tracking-tight">
              {data?.btc_price_usd != null ? formatBtcSpot(data.btc_price_usd) : "—"}
            </span>
            <span className="text-sm font-medium text-slate-500">BTC / USD</span>
            {data?.btc_price_source && (
              <span className="text-xs text-slate-600">
                {data.btc_price_source === "coingecko" ? "CoinGecko" : "Hyperliquid mark"}
              </span>
            )}
          </div>
        )}

        <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-xs text-sky-100/90 leading-relaxed space-y-2">
          <p>
            <strong className="text-sky-100">Watch mode</strong> — measures <strong className="text-sky-50">plumbing and positioning</strong> (stables, perp funding, ETF share activity), not headlines or fair value.
          </p>
          <p className="text-sky-100/85">
            Stories coordinate trades; perps often transmit them first. A loud headline with <strong className="text-sky-50">FLUID</strong> means narrative ahead of structure.
            <strong className="text-sky-50"> STRESSED</strong> with no headline often means leverage or liquidation risk.
          </p>
        </div>

        {loading && !data && <p className="text-sm text-slate-500">Loading liquidity indicators…</p>}

        {error && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
        )}

        {data?.errors?.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90 space-y-1">
            {data.errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
            <h2 className="text-sm font-semibold text-amber-200">Active warnings</h2>
            <ul className="text-xs text-amber-100/90 space-y-1 list-disc pl-4">
              {warnings.map((w) => (
                <li key={w}>{warningLabel(w)}</li>
              ))}
            </ul>
          </section>
        )}

        {data && (
          <div className="space-y-8">
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-300">Stablecoin delta (USD plumbing)</h2>
                <p className="text-xs text-slate-500">USDT + USDC circulating — dollars near the market (DefiLlama).</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCell label="Total" value={formatUsd(st?.total_usd)} />
                <MetricCell label="7d Δ" value={formatDelta(st?.delta_7d)} warn={stWarn7} />
                <MetricCell label="30d Δ" value={formatDelta(st?.delta_30d)} warn={stWarn30} />
                <MetricCell label="USDT / USDC" value={`${formatUsd(st?.usdt_usd)} / ${formatUsd(st?.usdc_usd)}`} />
              </div>
              <SparklineCard
                title="Total stables (90d)"
                data={st?.sparkline_90d ?? []}
                color="#22d3ee"
                yFormatter={(v) => formatUsd(v)}
              />
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-300">BTC perp funding (leverage)</h2>
                <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
                  Hyperliquid BTC perp only — one venue. Global perps (Binance, Bybit, CME) often <strong className="text-slate-400 font-medium">lead spot</strong> in the short term; this pillar reads crowding on HL.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCell
                  label="Rate (per hour)"
                  value={
                    fund?.rate_hourly != null ? `${(fund.rate_hourly * 100).toFixed(4)}%` : "—"
                  }
                  warn={fundWarn}
                />
                <MetricCell
                  label="≈ 8h equivalent"
                  value={
                    fund?.rate_8h_equiv != null ? `${(fund.rate_8h_equiv * 100).toFixed(4)}%` : "—"
                  }
                />
                <MetricCell
                  label="vs 30d z"
                  value={fund?.vs_30d_z != null ? fund.vs_30d_z.toFixed(2) : "—"}
                  warn={fundWarn}
                />
                <MetricCell
                  label="Open interest"
                  value={fund?.open_interest_usd != null ? formatUsd(fund.open_interest_usd) : "—"}
                />
                <MetricCell
                  label="BTC mark"
                  value={fund?.mark_px_usd != null ? formatUsd(fund.mark_px_usd) : "—"}
                />
              </div>
              <SparklineCard
                title="Funding rate history (HL, per payment)"
                data={(fund?.sparkline_90d ?? []).map((x, i) => ({ day: String(i), value: x.value }))}
                color="#f59e0b"
                yFormatter={(v) => `${(Number(v) * 100).toFixed(4)}%`}
              />
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-300">ETF volume proxy (US spot pipe)</h2>
                <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
                  <strong className="text-slate-400 font-medium">IBIT</strong> = spot beta pipe (US institutional access).
                  <strong className="text-slate-400 font-medium"> FBTC</strong> = second spot ETF proxy. Share <strong className="text-slate-400 font-medium">volume</strong> vs 20d SMA — not official creations/redemptions; not income ETFs (e.g. BITA).
                </p>
              </div>
              {etf?.ok ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCell
                      label="Max vol vs 20d"
                      value={etf.max_volume_vs_20d != null ? `${etf.max_volume_vs_20d.toFixed(2)}×` : "—"}
                      warn={etfWarn}
                    />
                    <MetricCell
                      label="IBIT day change"
                      value={formatPct(etf.ibit_day_change_pct)}
                      warn={etfWarn && etf.ibit_day_change_pct != null && etf.ibit_day_change_pct < 0}
                    />
                    <MetricCell
                      label="FBTC day change"
                      value={formatPct(etf.fbtc_day_change_pct)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SparklineCard
                      title="IBIT volume (30d)"
                      data={etf.symbols?.IBIT?.sparkline_30d ?? []}
                      dataKey="volume"
                      color="#34d399"
                      yFormatter={(v) => Number(v).toLocaleString()}
                    />
                    <SparklineCard
                      title="FBTC volume (30d)"
                      data={etf.symbols?.FBTC?.sparkline_30d ?? []}
                      dataKey="volume"
                      color="#60a5fa"
                      yFormatter={(v) => Number(v).toLocaleString()}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">{etf?.error || "ETF volume data unavailable."}</p>
              )}
            </section>

            {data.watch_bullets?.length > 0 && (
              <section className="rounded-xl border border-[#2a2a30] bg-[#121214] px-4 py-3 space-y-2">
                <h2 className="text-sm font-semibold text-slate-300">Agent / Nostr bullets</h2>
                <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
                  {data.watch_bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-[#2a2a30] bg-[#0d0d0f]/40 px-4 py-3 space-y-2">
              <h2 className="text-sm font-semibold text-slate-400">Not measured here</h2>
              <ul className="text-xs text-slate-500 space-y-1 list-disc pl-4 leading-relaxed">
                <li>News headlines or macro narrative (SpaceX, Fed, etc.)</li>
                <li>MSTR / Strategy treasury, prefs, or corporate BTC buys/sells</li>
                <li>BITA and other covered-call / income ETF products</li>
                <li>Binance, CME, or aggregate global perp order books</li>
                <li>Spot BTC order-book depth (Binance USDT, Coinbase USD)</li>
                <li>Official ETF daily flow data (creations/redemptions)</li>
              </ul>
              <p className="text-[11px] text-slate-600">
                Regime: <strong className="text-slate-500">STRESSED</strong> = plumbing+funding stress, 2+ major warnings, or 3+ flags.
                <strong className="text-slate-500"> WATCH</strong> = one or more early signals.
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
