import { useState, useEffect, useCallback, useMemo } from "react";
import { useChatStore } from "../store/chatStore";

const AGENT_SYMBOLS = new Set(["SABTC", "SAETH", "SAUSD"]);

function Sparkline({ points, className = "text-emerald-400", height = 56 }) {
  if (!points || points.length < 2) return <div className="h-14 rounded-lg bg-[#0d0d0f] border border-[#2a2a30]" />;
  const w = 280;
  const pad = 4;
  const vals = points.map((p) => Number(p));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const n = vals.length;
  const step = (w - pad * 2) / (n - 1);
  const d = vals
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (1 - (v - min) / range) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={height} className={className} viewBox={`0 0 ${w} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function TradingPage() {
  const apiBase = useChatStore((s) => s.apiBase) || "";
  const setView = useChatStore((s) => s.setView);

  const [loading, setLoading] = useState(true);
  const [snapshotting, setSnapshotting] = useState(false);
  const [error, setError] = useState(null);
  const [latest, setLatest] = useState(null);
  const [hlHistory, setHlHistory] = useState([]);
  const [poolSbtc, setPoolSbtc] = useState([]);
  const [poolSaeth, setPoolSaeth] = useState([]);
  const [balance, setBalance] = useState(null);
  const [config, setConfig] = useState(null);
  const [pegMonitor, setPegMonitor] = useState(null);
  const [pegRunning, setPegRunning] = useState(false);

  const fetchReadOnly = useCallback(async () => {
    setError(null);
    try {
      const [lat, hl, ps, pe, bal, cfg, peg] = await Promise.all([
        fetch(`${apiBase}/api/trading/latest`).then((r) => r.json()),
        fetch(`${apiBase}/api/trading/hl?limit=120`).then((r) => r.json()),
        fetch(`${apiBase}/api/trading/pools?pair=SABTC_SAUSD&limit=120`).then((r) => r.json()),
        fetch(`${apiBase}/api/trading/pools?pair=SAETH_SAUSD&limit=120`).then((r) => r.json()),
        fetch(`${apiBase}/api/solana-wallet/balance`).then((r) => r.json()),
        fetch(`${apiBase}/api/config`).then((r) => r.json()),
        fetch(`${apiBase}/api/trading/peg-monitor`).then((r) => r.json()),
      ]);
      if (lat && lat.ok !== false) setLatest(lat);
      setHlHistory(Array.isArray(hl.rows) ? hl.rows : []);
      setPoolSbtc(Array.isArray(ps.rows) ? ps.rows : []);
      setPoolSaeth(Array.isArray(pe.rows) ? pe.rows : []);
      if (bal?.ok !== false) setBalance(bal);
      if (cfg?.config) setConfig(cfg.config);
      if (peg?.ok) setPegMonitor(peg);
    } catch (e) {
      setError(e.message || "Failed to load trading data");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const runSnapshot = useCallback(async () => {
    setSnapshotting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/trading/snapshot`, { method: "POST" });
      const data = await res.json();
      if (!data.ok && data.error) setError(data.error);
      await fetchReadOnly();
    } catch (e) {
      setError(e.message || "Snapshot failed");
    } finally {
      setSnapshotting(false);
    }
  }, [apiBase, fetchReadOnly]);

  const runPegCheck = useCallback(async () => {
    setPegRunning(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/trading/peg-monitor/run`, { method: "POST" });
      const data = await res.json();
      if (!data.ok && data.error) setError(data.error);
      await fetchReadOnly();
    } catch (e) {
      setError(e.message || "Peg monitor run failed");
    } finally {
      setPegRunning(false);
    }
  }, [apiBase, fetchReadOnly]);

  useEffect(() => {
    setLoading(true);
    fetchReadOnly();
  }, [fetchReadOnly]);

  const address = config?.solanaWallet?.publicKey || balance?.address;

  const agentRows = useMemo(() => {
    const raw = balance?.agentTokens?.length ? balance.agentTokens : balance?.tokens || [];
    const out = [];
    for (const t of raw) {
      const sym = (t.symbol || "").toUpperCase();
      if (AGENT_SYMBOLS.has(sym)) out.push(t);
    }
    return out;
  }, [balance?.tokens, balance?.agentTokens]);

  const hlBtcSeries = useMemo(() => hlHistory.map((r) => r.btc_price).filter((x) => x != null && Number.isFinite(Number(x))), [hlHistory]);
  const hlEthSeries = useMemo(() => hlHistory.map((r) => r.eth_price).filter((x) => x != null && Number.isFinite(Number(x))), [hlHistory]);

  /** Parsed snapshot_json is { ok, pool_address, pool_data_source, data: pool } — price lives on `pool`. */
  const poolPriceFromSnapshot = (row) => {
    const d = row?.data;
    if (!d || typeof d !== "object") return null;
    const pool = d.data != null && typeof d.data === "object" ? d.data : d;
    const p = pool?.price;
    if (p == null || p === "") return null;
    const n = Number(p);
    return Number.isFinite(n) ? n : null;
  };

  /** If GET /api/trading/latest fails (ok: false), still show HL refs from history (same table, smaller payload). */
  const hlDisplay = useMemo(() => {
    const fromLatest = latest?.hl;
    if (fromLatest?.btc_price != null && fromLatest?.eth_price != null) return fromLatest;
    const last = hlHistory.length ? hlHistory[hlHistory.length - 1] : null;
    if (last?.btc_price != null && last?.eth_price != null) return last;
    return null;
  }, [latest?.hl, hlHistory]);

  /** Fallback to newest pool history row when latest snapshot response is missing pools. */
  const poolRowSbtc = useMemo(() => {
    const fromLatest = latest?.pools?.SABTC_SAUSD;
    if (fromLatest) return fromLatest;
    return poolSbtc.length ? poolSbtc[poolSbtc.length - 1] : null;
  }, [latest?.pools?.SABTC_SAUSD, poolSbtc]);

  const poolRowSaeth = useMemo(() => {
    const fromLatest = latest?.pools?.SAETH_SAUSD;
    if (fromLatest) return fromLatest;
    return poolSaeth.length ? poolSaeth[poolSaeth.length - 1] : null;
  }, [latest?.pools?.SAETH_SAUSD, poolSaeth]);

  const pxSbtc = poolPriceFromSnapshot(poolRowSbtc);
  const pxSaeth = poolPriceFromSnapshot(poolRowSaeth);

  return (
    <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#0d0d0f] overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setView("chat")}
              className="text-sm text-slate-400 hover:text-white transition"
            >
              ← Back to chat
            </button>
            <h1 className="text-xl font-semibold text-slate-200">Trading</h1>
          </div>
          <button
            type="button"
            onClick={runSnapshot}
            disabled={snapshotting}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition"
          >
            {snapshotting ? "Recording…" : "Refresh snapshot"}
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Hyperliquid <strong className="text-slate-400">spot</strong> references: UBTC/USDC (<code className="text-slate-400">@142</code>), UETH/USDC (
          <code className="text-slate-400">@151</code>). Orca Whirlpool pools: SABTC/SAUSD, SAETH/SAUSD. Mids and pool prices are indicative—not executable quotes.
        </p>

        {error && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error}</div>
        )}

        <section className="rounded-xl border border-[#2a2a30] bg-[#121214] p-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Peg monitor</h2>
            <button
              type="button"
              onClick={runPegCheck}
              disabled={pegRunning || pegMonitor?.running}
              className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition shrink-0"
            >
              {pegRunning || pegMonitor?.running ? "Running peg check…" : "Run peg check"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Dry-run only (no live <code className="text-slate-400">treasury_pool_swap</code> broadcast). Full vs quick ticks alternate; see{" "}
            <code className="text-slate-400">memory/heartbeat-state.json</code>. Edit <code className="text-slate-400">PEG_MONITOR_*</code> in{" "}
            <code className="text-slate-400">.env</code> and restart the server.
          </p>
          {pegMonitor?.schedule?.bullets && (
            <ul className="text-xs text-slate-500 list-disc pl-4 space-y-0.5">
              <li className="font-medium text-slate-400 list-none -ml-4 mb-1">{pegMonitor.schedule.title}</li>
              {pegMonitor.schedule.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {pegMonitor?.env && (
            <div className="rounded-lg border border-[#1e1e24] bg-[#0d0d0f] p-3 space-y-2">
              <div className="text-xs font-medium text-slate-500">Effective PEG_MONITOR_* (empty in .env → default)</div>
              <dl className="grid gap-1 text-xs font-mono text-slate-300 sm:grid-cols-2">
                {Object.entries(pegMonitor.env).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-white/5 pb-1 last:border-0">
                    <dt className="text-slate-500 shrink-0">{k}</dt>
                    <dd className="text-right truncate text-emerald-200/90" title={String(v)}>
                      {String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {pegMonitor?.last && (
            <div className="rounded-lg border border-[#1e1e24] bg-[#0d0d0f] p-3 space-y-2 text-sm">
              <div className="text-xs font-medium text-slate-500">Last completed run (persisted in DB)</div>
              {!pegMonitor.last.last_run_at ? (
                <p className="text-slate-500 text-xs">No run recorded yet — click Run peg check or use cron / CLI.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>
                      At: <span className="text-slate-200">{pegMonitor.last.last_run_at}</span>
                    </span>
                    <span>
                      Mode: <span className="text-slate-200">{pegMonitor.last.mode || "—"}</span>
                    </span>
                    <span>
                      Heartbeat:{" "}
                      <span className={pegMonitor.last.heartbeat_ok ? "text-emerald-400" : "text-amber-300"}>
                        {pegMonitor.last.heartbeat_ok ? "OK" : "Attention"}
                      </span>
                    </span>
                  </div>
                  <p className="text-slate-200 text-xs leading-relaxed">{pegMonitor.last.summary || "—"}</p>
                  {pegMonitor.last.error && (
                    <p className="text-xs text-red-300/90 rounded border border-red-500/20 bg-red-500/10 px-2 py-1">{pegMonitor.last.error}</p>
                  )}
                  {pegMonitor.last.state && (
                    <div className="text-xs font-mono text-slate-400 space-y-1 pt-1 border-t border-white/5">
                      {pegMonitor.last.state.note && <p>{pegMonitor.last.state.note}</p>}
                      {pegMonitor.last.state.sbtc && (
                        <p>
                          SABTC: {pegMonitor.last.state.sbtc.deviation_bps != null ? `${Number(pegMonitor.last.state.sbtc.deviation_bps).toFixed(1)} bps` : "—"} ·{" "}
                          {pegMonitor.last.state.sbtc.suggested_action || "—"}
                          {pegMonitor.last.state.sbtc.dry_run != null && (
                            <span className={pegMonitor.last.state.sbtc.dry_run.ok ? " text-emerald-400" : " text-amber-300"}>
                              {" "}
                              · dry_run {pegMonitor.last.state.sbtc.dry_run.ok ? "ok" : "fail"}
                              {pegMonitor.last.state.sbtc.dry_run.error ? `: ${pegMonitor.last.state.sbtc.dry_run.error}` : ""}
                            </span>
                          )}
                        </p>
                      )}
                      {pegMonitor.last.state.saeth && (
                        <p>
                          SAETH: {pegMonitor.last.state.saeth.deviation_bps != null ? `${Number(pegMonitor.last.state.saeth.deviation_bps).toFixed(1)} bps` : "—"} ·{" "}
                          {pegMonitor.last.state.saeth.suggested_action || "—"}
                          {pegMonitor.last.state.saeth.dry_run != null && (
                            <span className={pegMonitor.last.state.saeth.dry_run.ok ? " text-emerald-400" : " text-amber-300"}>
                              {" "}
                              · dry_run {pegMonitor.last.state.saeth.dry_run.ok ? "ok" : "fail"}
                              {pegMonitor.last.state.saeth.dry_run.error ? `: ${pegMonitor.last.state.saeth.dry_run.error}` : ""}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#2a2a30] bg-[#121214] p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Agent wallet</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !address ? (
            <p className="text-sm text-slate-500">No wallet configured. Add a wallet in Settings.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Address</span>
                <code className="text-xs text-emerald-400 break-all">{address}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(address)}
                  className="text-xs rounded-md bg-white/10 px-2 py-1 text-slate-300 hover:bg-white/15"
                >
                  Copy
                </button>
              </div>
              {balance?.solBalance != null && (
                <p className="text-sm text-slate-300">
                  SOL: <strong>{Number(balance.solBalance).toFixed(4)}</strong>
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-3">
                {agentRows.length === 0 ? (
                  <p className="text-sm text-slate-500 col-span-full">No SABTC / SAETH / SAUSD token rows in balance (fund the wallet or wait for RPC).</p>
                ) : (
                  agentRows.map((t) => (
                    <div key={t.mint || t.symbol} className="rounded-lg border border-[#1e1e24] bg-[#0d0d0f] px-3 py-2">
                      <div className="text-xs font-medium text-slate-400">{t.symbol || "—"}</div>
                      <div className="text-sm text-slate-200 tabular-nums">{t.uiAmount ?? t.amount ?? "—"}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-[#2a2a30] bg-[#121214] p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Hyperliquid spot (UBTC / UETH)</h2>
          {hlDisplay?.btc_price != null && hlDisplay?.eth_price != null ? (
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                BTC ref: <strong className="text-slate-100 tabular-nums">${Number(hlDisplay.btc_price).toLocaleString()}</strong>
              </div>
              <div>
                ETH ref: <strong className="text-slate-100 tabular-nums">${Number(hlDisplay.eth_price).toLocaleString()}</strong>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No HL snapshot yet. Click &quot;Refresh snapshot&quot;.</p>
          )}
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-slate-500 mb-1">HL BTC (last {hlBtcSeries.length})</div>
              <Sparkline points={hlBtcSeries} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">HL ETH (last {hlEthSeries.length})</div>
              <Sparkline points={hlEthSeries} className="text-sky-400" />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[#2a2a30] bg-[#121214] p-4 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Orca pools (implied)</h2>
          {latest?.meta?.last_snapshot_error && latest?.meta?.last_snapshot_ok === "0" && (
            <p className="text-xs text-amber-200/90 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              Last snapshot did not save pool rows: {latest.meta.last_snapshot_error}
            </p>
          )}
          {!loading && !poolRowSbtc && !poolRowSaeth && (
            <p className="text-sm text-slate-500">
              No Orca pool snapshots yet. Click <strong className="text-slate-400">Refresh snapshot</strong> — the server calls Orca&apos;s API, then Solana RPC if needed (check network and{" "}
              <code className="text-slate-400">SOLANA_RPC_URL</code>).
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[#1e1e24] p-3 space-y-1">
              <div className="text-xs text-slate-500">SABTC / SAUSD</div>
              <div className="text-lg text-slate-100 tabular-nums">{pxSbtc != null ? pxSbtc.toFixed(6) : "—"}</div>
              <div className="text-xs text-slate-600 font-mono truncate">
                {poolRowSbtc?.pool_address || poolRowSbtc?.data?.pool_address || poolRowSbtc?.data?.data?.address || "—"}
              </div>
            </div>
            <div className="rounded-lg border border-[#1e1e24] p-3 space-y-1">
              <div className="text-xs text-slate-500">SAETH / SAUSD</div>
              <div className="text-lg text-slate-100 tabular-nums">{pxSaeth != null ? pxSaeth.toFixed(6) : "—"}</div>
              <div className="text-xs text-slate-600 font-mono truncate">
                {poolRowSaeth?.pool_address || poolRowSaeth?.data?.pool_address || poolRowSaeth?.data?.data?.address || "—"}
              </div>
            </div>
          </div>
          {hlDisplay?.btc_price != null && pxSbtc != null && (
            <p className="text-xs text-slate-500">
              Basis (pool vs HL UBTC ref, rough):{" "}
              <span className="text-slate-400">
                {((((pxSbtc - Number(hlDisplay.btc_price)) / Number(hlDisplay.btc_price)) * 100).toFixed(3))}%
              </span>{" "}
              — SA assets ≠ spot BTC; interpret cautiously.
            </p>
          )}
          {hlDisplay?.eth_price != null && pxSaeth != null && (
            <p className="text-xs text-slate-500">
              Basis (pool vs HL UETH ref, rough):{" "}
              <span className="text-slate-400">
                {((((pxSaeth - Number(hlDisplay.eth_price)) / Number(hlDisplay.eth_price)) * 100).toFixed(3))}%
              </span>
            </p>
          )}
        </section>

        <p className="text-xs text-slate-600">
          Snapshots stored in <code className="text-slate-500">data/solagent.db</code>. Private keys are never shown here; signing uses the same server wallet as chat tools.
        </p>
      </div>
    </main>
  );
}
