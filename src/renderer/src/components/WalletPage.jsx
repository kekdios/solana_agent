import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chatStore";

const EXPLORER = "https://explorer.solana.com";

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

  const fetchSignatures = useCallback(() => {
    fetch(`${apiBase}/api/solana-wallet/signatures?limit=15`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.signatures)) setSignatures(data.signatures);
        else setSignatures([]);
      })
      .catch(() => setSignatures([]));
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
    fetchSolUsd();
    Promise.all([
      fetchConfig(),
      fetchBalance(),
      fetchSignatures(),
    ]).finally(() => setLoading(false));
  }, [fetchConfig, fetchBalance, fetchSignatures, fetchSolUsd]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
            <span className="text-slate-500 text-sm">SOL</span>
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
            <h2 className="text-sm font-medium text-slate-400 mb-3">Token accounts</h2>
            <ul className="space-y-2">
              {balance.tokens.map((t, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span className="font-mono text-slate-400 truncate max-w-[12rem]" title={t.mint}>
                    {t.mint ? `${t.mint.slice(0, 8)}…` : "—"}
                  </span>
                  <span className="text-slate-200 tabular-nums">{formatSolBalance(t.amount)}</span>
                </li>
              ))}
            </ul>
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

        {/* Recent activity */}
        <section className="rounded-2xl border border-[#1e1e24] bg-[#121214] p-5">
          <h2 className="text-sm font-medium text-slate-400 mb-3">Recent activity</h2>
          {signatures.length === 0 ? (
            <p className="text-slate-500 text-sm">No recent transactions</p>
          ) : (
            <ul className="space-y-2">
              {signatures.map((s, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <a
                    href={`${EXPLORER}/tx/${s.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-slate-300 hover:text-emerald-400 transition truncate max-w-[14rem]"
                    title={s.signature}
                  >
                    {shortSignature(s.signature)}
                  </a>
                  <span className="text-slate-500 text-xs tabular-nums">{formatDate(s.blockTime)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
