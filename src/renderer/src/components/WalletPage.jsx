import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chatStore";

const EXPLORER = "https://explorer.solana.com";
const LOGOS_API_PATH = "/api/logos";

const TOKEN_META_BY_MINT = {
  // Common Solana tokens
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", name: "USDC" },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", name: "USDT" }, // USDT (legacy mint)
};

const FALLBACK_LOGOS = {
  USDT: "https://s2.coinmarketcap.com/static/img/coins/64x64/825.png",
};

/** Format SOL for balance display: always 4 decimal places, no scientific notation. */
function formatSolBalance(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const val = Number(n);
  if (val === 0 || (val > 0 && val < 1e-10)) return "0.0000";
  return val.toFixed(4);
}

function formatSol(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n === 0 || (n > 0 && n < 1e-6)) return "0";
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toExponential(2);
}

function formatUsd(n) {
  if (n == null || Number.isNaN(n) || n < 0) return "—";
  if (n === 0) return "$0.00";
  if (n >= 1) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function shortSignature(sig) {
  if (!sig || sig.length < 12) return sig;
  return `${sig.slice(0, 6)}…${sig.slice(-6)}`;
}

function formatTokenAmount(t) {
  if (!t) return "—";
  if (t.uiAmount != null && Number.isFinite(Number(t.uiAmount))) {
    const n = Number(t.uiAmount);
    if (n === 0) return "0";
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
    return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (t.amount == null) return "—";
  return String(t.amount);
}

export default function WalletPage({ onOpenSettings }) {
  const apiBase = useChatStore((s) => s.apiBase) || "";
  const setView = useChatStore((s) => s.setView);
  const [config, setConfig] = useState(null);
  const [balance, setBalance] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [solUsd, setSolUsd] = useState(null);
  const [tokenPage, setTokenPage] = useState(0);
  const [activityPage, setActivityPage] = useState(0);
  const [logoBySymbol, setLogoBySymbol] = useState({});
  const [refreshingActivity, setRefreshingActivity] = useState(false);
  const [activityError, setActivityError] = useState(null);
  const [activityAddress, setActivityAddress] = useState(null);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);
  const [hasMoreActivity, setHasMoreActivity] = useState(true);
  const [syncFromChainFeedback, setSyncFromChainFeedback] = useState(null);

  const fetchConfig = useCallback(() => {
    fetch(`${apiBase}/api/config`)
      .then((r) => r.json())
      .then((data) => data.config && setConfig(data.config))
      .catch(() => setConfig(null));
  }, [apiBase]);

  const fetchBalance = useCallback(() => {
    fetch(`${apiBase}/api/solana-wallet/balance`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok !== false) setBalance(data);
        else setBalance(null);
      })
      .catch(() => setBalance(null));
  }, [apiBase]);

  const fetchSignatures = useCallback((beforeSig = null) => {
    if (!beforeSig) setActivityError(null);
    return fetch(
      `${apiBase}/api/solana-wallet/signatures?limit=30${beforeSig ? `&before=${encodeURIComponent(beforeSig)}` : ""}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.signatures)) {
          if (!beforeSig) {
            setSignatures(data.signatures);
            setActivityError(null);
            setActivityAddress(data.address || null);
            setHasMoreActivity(data.signatures.length >= 30);
            setActivityPage(0);
          } else {
            setSignatures((prev) => [...prev, ...data.signatures]);
            setHasMoreActivity(data.signatures.length >= 30);
          }
        } else {
          if (!beforeSig) setActivityError(data.error || "Could not load transactions");
          setHasMoreActivity(false);
        }
      })
      .catch((err) => {
        if (!beforeSig) setActivityError(err?.message || "Network error");
        setHasMoreActivity(false);
      });
  }, [apiBase]);

  const fetchSolUsd = useCallback(() => {
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
      .then((r) => r.json())
      .then((data) => {
        const usd = data?.solana?.usd;
        setSolUsd(typeof usd === "number" ? usd : null);
      })
      .catch(() => setSolUsd(null));
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setActivityError(null);
    fetchSolUsd();
    Promise.all([
      fetchConfig(),
      fetchBalance(),
      fetchSignatures(),
    ]).finally(() => setLoading(false));
  }, [fetchConfig, fetchBalance, fetchSignatures, fetchSolUsd]);

  const refreshActivity = useCallback(() => {
    setRefreshingActivity(true);
    setHasMoreActivity(true);
    fetchSignatures().finally(() => setRefreshingActivity(false));
  }, [fetchSignatures]);

  const syncFromChain = useCallback(() => {
    setSyncFromChainFeedback(null);
    setRefreshingActivity(true);
    setHasMoreActivity(true);
    fetchSignatures()
      .then(() => {
        setSyncFromChainFeedback("Synced from Solana");
        setTimeout(() => setSyncFromChainFeedback(null), 3000);
      })
      .finally(() => setRefreshingActivity(false));
  }, [fetchSignatures]);

  const loadMoreActivity = useCallback(() => {
    if (signatures.length === 0 || loadingMoreActivity) return;
    const lastSig = signatures[signatures.length - 1]?.signature;
    if (!lastSig) return;
    setLoadingMoreActivity(true);
    fetchSignatures(lastSig).finally(() => setLoadingMoreActivity(false));
  }, [signatures, loadingMoreActivity, fetchSignatures]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // Reset pagination when token list changes.
    setTokenPage(0);
  }, [balance?.tokens?.length]);

  useEffect(() => {
    const tokens = balance?.tokens || [];
    if (!Array.isArray(tokens) || tokens.length === 0) return;

    const symbols = new Set(["SOL"]);
    for (const t of tokens) {
      const meta = t?.mint ? TOKEN_META_BY_MINT[t.mint] : null;
      if (meta?.symbol) symbols.add(meta.symbol);
    }
    const payload = {
      symbols: Array.from(symbols),
      resolution: "64",
    };

    let cancelled = false;
    fetch(`${apiBase}${LOGOS_API_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((r) => r.json())
      .then((arr) => {
        if (cancelled) return;
        const next = {};
        if (Array.isArray(arr)) {
          for (const x of arr) {
            if (x?.symbol && x?.png) next[String(x.symbol).toUpperCase()] = String(x.png);
          }
        }
        // fallbacks for common tokens not present in API dataset
        for (const [sym, url] of Object.entries(FALLBACK_LOGOS)) {
          if (!next[sym]) next[sym] = url;
        }
        setLogoBySymbol(next);
      })
      .catch(() => {
        if (!cancelled) setLogoBySymbol({ ...FALLBACK_LOGOS });
      });

    return () => {
      cancelled = true;
    };
  }, [balance?.tokens]);

  const hasWallet = config?.solanaWallet?.hasKeypair && (config.solanaWallet.publicKey || balance?.address);
  const address = config?.solanaWallet?.publicKey || balance?.address;

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => { /* optional toast */ });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const to = sendTo.trim();
    const amount = parseFloat(sendAmount);
    if (!to || !Number.isFinite(amount) || amount <= 0) {
      setSendResult({ ok: false, error: "Enter a valid address and amount (SOL)." });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`${apiBase}/api/solana-wallet/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, amount_sol: amount }),
      });
      const data = await res.json();
      setSendResult(data);
      if (data.ok) {
        setSendTo("");
        setSendAmount("");
        fetchBalance();
        fetchSignatures();
      }
    } catch (err) {
      setSendResult({ ok: false, error: err.message || "Send failed" });
    } finally {
      setSending(false);
    }
  };

  if (loading && !hasWallet) {
    return (
      <main className="flex-1 flex flex-col min-w-0 bg-[#0d0d0f] p-6">
        <div className="text-slate-400 text-sm">Loading wallet…</div>
      </main>
    );
  }

  if (!hasWallet) {
    return (
      <main className="flex-1 flex flex-col min-w-0 bg-[#0d0d0f] p-6 overflow-y-auto">
        <button
          type="button"
          onClick={() => setView("chat")}
          className="self-start flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="max-w-lg mx-auto mt-12 text-center">
          <div className="text-6xl mb-4" aria-hidden>👛</div>
          <h2 className="text-xl font-semibold text-slate-200 mb-2">No wallet</h2>
          <p className="text-slate-400 text-sm mb-6">
            Create a Solana wallet in Settings to view balance, receive SOL, and send transactions.
          </p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-1.5 px-2 transition"
          >
            Open Settings
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[#0d0d0f] overflow-y-auto">
      <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView("chat")}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition"
            title="Back to chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-semibold text-slate-200">Wallet</h1>
          {config?.swapsPolicy && (
            <span
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                config.swapsPolicy.autopilotEnabled
                  ? config.swapsPolicy.autopilotAutoExecute
                    ? "bg-amber-500/20 text-amber-200 border border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-200 border border-emerald-500/25"
                  : "bg-white/5 text-slate-300 border border-white/10"
              }`}
              title="Autopilot status (Swaps)"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  config.swapsPolicy.autopilotEnabled
                    ? config.swapsPolicy.autopilotAutoExecute
                      ? "bg-amber-300"
                      : "bg-emerald-300"
                    : "bg-slate-500"
                }`}
              />
              {config.swapsPolicy.autopilotEnabled
                ? config.swapsPolicy.autopilotAutoExecute
                  ? "Autopilot: Auto-exec"
                  : "Autopilot: Confirm"
                : "Autopilot: Off"}
            </span>
          )}
        </div>

        {/* Address & SOL balance */}
        <section className="rounded-2xl border border-[#1e1e24] bg-[#121214] p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Address</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyAddress}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition"
              >
                Copy
              </button>
              <a
                href={`${EXPLORER}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Explorer →
              </a>
            </div>
          </div>
          <p className="font-mono text-sm text-slate-300 break-all mb-4">{address}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-100 tabular-nums">
              {balance?.sol != null ? formatSolBalance(balance.sol) : "—"}
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-500 text-sm">
              {logoBySymbol?.SOL && (
                <img
                  src={logoBySymbol.SOL}
                  alt="Solana"
                  className="w-4 h-4 rounded-sm"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              SOL
            </span>
          </div>
          {balance?.sol != null && solUsd != null && (
            <p className="text-sm text-slate-400 mt-1 tabular-nums">
              {formatUsd(balance.sol * solUsd)} USD
            </p>
          )}
          {balance?.lamports != null && (
            <p className="text-xs text-slate-500 mt-1">{balance.lamports.toLocaleString()} lamports</p>
          )}
          <button
            type="button"
            onClick={refresh}
            className="mt-3 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Refresh
          </button>
        </section>

        {/* Tokens (if any) */}
        {balance?.tokens?.length > 0 && (
          <section className="rounded-2xl border border-[#1e1e24] bg-[#121214] p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-medium text-slate-400">Token accounts</h2>
              <span className="text-xs text-slate-500 tabular-nums">{balance.tokens.length} total</span>
            </div>

            {(() => {
              const rows = (balance.tokens || []).map((t) => {
                const mint = t?.mint || "";
                const meta = mint ? TOKEN_META_BY_MINT[mint] : null;
                const symbol = meta?.symbol || "";
                return {
                  mint,
                  symbol,
                  name: meta?.name || "",
                  amountText: formatTokenAmount(t),
                };
              });
              const pageSize = 10;
              const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
              const page = Math.min(tokenPage, totalPages - 1);
              const start = page * pageSize;
              const viewRows = rows.slice(start, start + pageSize);

              return (
                <>
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-[#1e1e24]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[#121214]">
                        <tr className="text-xs uppercase tracking-wider text-slate-500">
                          <th className="text-left px-3 py-2 font-medium">Token</th>
                          <th className="text-right px-3 py-2 font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewRows.map((r, idx) => {
                          const logo = r.symbol ? logoBySymbol?.[r.symbol] : null;
                          return (
                            <tr key={`${r.mint}-${idx}`} className="border-t border-[#1e1e24]">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {logo ? (
                                    <img
                                      src={logo}
                                      alt={r.symbol || "Token"}
                                      className="w-5 h-5 rounded-sm shrink-0"
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-5 h-5 rounded-sm bg-white/10 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="text-slate-200 font-medium">
                                      {r.symbol || (r.mint ? `${r.mint.slice(0, 4)}…${r.mint.slice(-4)}` : "—")}
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono truncate" title={r.mint}>
                                      {r.mint ? `${r.mint.slice(0, 8)}…${r.mint.slice(-6)}` : "—"}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-200 tabular-nums">{r.amountText}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 tabular-nums">
                      Page {page + 1} / {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTokenPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => setTokenPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </section>
        )}

        {/* Receive / Send */}
        <section className="rounded-2xl border border-[#1e1e24] bg-[#121214] p-5 space-y-4">
          <h2 className="text-sm font-medium text-slate-400">Actions</h2>
          <div>
            <p className="text-xs text-slate-500 mb-1">Receive SOL — share your address</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={address}
                className="flex-1 rounded-lg bg-[#0d0d0f] border border-[#1e1e24] px-2 py-1 font-mono text-xs text-slate-300"
              />
              <button
                type="button"
                onClick={copyAddress}
                className="rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm px-2 py-1 transition"
              >
                Copy
              </button>
            </div>
          </div>
          <form onSubmit={handleSend} className="space-y-3">
            <p className="text-xs text-slate-500">Send SOL</p>
            <input
              type="text"
              placeholder="Recipient address"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              className="w-full rounded-lg bg-[#0d0d0f] border border-[#1e1e24] px-2 py-1 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Amount (SOL)"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              className="w-full rounded-lg bg-[#0d0d0f] border border-[#1e1e24] px-2 py-1 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-2 py-1 transition"
            >
              {sending ? "Sending…" : "Send"}
            </button>
            {sendResult && (
              <p className={`text-sm ${sendResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                {sendResult.ok
                  ? `Sent. Signature: ${shortSignature(sendResult.signature)}`
                  : sendResult.error}
              </p>
            )}
          </form>
          <p className="text-xs text-slate-500">
            Backup & private key: <button type="button" onClick={onOpenSettings} className="text-emerald-400 hover:underline">Settings</button>
          </p>
        </section>

        {/* Recent activity — source: on-chain (RPC). Agent badge = executed by this app via jupiter_swap_execute. */}
        <section className="rounded-2xl border border-[#1e1e24] bg-[#121214] p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-medium text-slate-400">Recent activity</h2>
              {activityAddress && (
                <p className="text-xs text-slate-500 mt-0.5" title={activityAddress}>
                  Same wallet as in chat: {activityAddress.slice(0, 8)}…{activityAddress.slice(-4)}
                </p>
              )}
              {syncFromChainFeedback && (
                <p className="text-xs text-emerald-400 mt-1" role="status">{syncFromChainFeedback}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={syncFromChain}
                disabled={refreshingActivity}
                className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-50 transition border border-[#1e1e24]"
                title="Reload list from Solana (on-chain source of truth)"
              >
                Sync from chain
              </button>
              <button
                type="button"
                onClick={refreshActivity}
                disabled={refreshingActivity}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-50 transition"
                title="Refresh transaction list"
                aria-label="Refresh recent activity"
              >
                <svg
                  className={`w-4 h-4 ${refreshingActivity ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          {activityError ? (
            <p className="text-sm text-amber-400/90" title={activityError}>
              {activityError}. The agent uses the same wallet and API (solana_tx_history); if the agent showed transactions, this panel should show them after a successful refresh.
            </p>
          ) : signatures.length === 0 ? (
            <p className="text-slate-500 text-sm">No recent transactions</p>
          ) : (
            <>
              {(() => {
                const pageSize = 10;
                const totalPages = Math.max(1, Math.ceil(signatures.length / pageSize));
                const page = Math.min(activityPage, totalPages - 1);
                const start = page * pageSize;
                const viewRows = signatures.slice(start, start + pageSize);
                return (
                  <>
                    <ul className="space-y-2">
                      {viewRows.map((s, i) => (
                        <li key={`${s.signature}-${i}`} className="flex items-start justify-between gap-2 text-sm">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <a
                          href={`${EXPLORER}/tx/${s.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-slate-300 hover:text-emerald-400 transition truncate max-w-[14rem]"
                          title={s.signature}
                        >
                          {shortSignature(s.signature)}
                        </a>
                        {s.agent_executed && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400" title="Executed by this app (Jupiter swap)">
                            Agent
                          </span>
                        )}
                      </div>
                      {s.agent_executed && s.swap && (
                        <div className="text-[11px] text-slate-400 font-mono">
                          {(() => {
                            const inMint = s.swap.input_mint;
                            const outMint = s.swap.output_mint;
                            const inLabel = inMint === "So11111111111111111111111111111111111111112" ? "SOL" : inMint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ? "USDC" : `${inMint.slice(0, 4)}…${inMint.slice(-4)}`;
                            const outLabel = outMint === "So11111111111111111111111111111111111111112" ? "SOL" : outMint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ? "USDC" : `${outMint.slice(0, 4)}…${outMint.slice(-4)}`;
                            return `${inLabel} in: ${s.swap.amount_in} → ${outLabel} out: ${s.swap.expected_out_amount} (min ${s.swap.min_out_amount})`;
                          })()}
                        </div>
                      )}
                    </div>
                    <span className="text-slate-500 text-xs tabular-nums shrink-0">{formatDate(s.blockTime)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 tabular-nums">
                  Page {page + 1} / {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
              </>
            );
          })()}
              {hasMoreActivity && (
                <button
                  type="button"
                  onClick={loadMoreActivity}
                  disabled={loadingMoreActivity}
                  className="mt-3 w-full py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-50 transition"
                >
                  {loadingMoreActivity ? "Loading…" : "Load older transactions"}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
