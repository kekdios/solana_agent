import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chatStore";

const CRYPTO_TICKERS = [
  "btc", "btc-ln", "ltc", "ltc-mweb", "xmr", "doge", "dash", "zec", "bch",
  "kas", "ton", "near", "egld", "vvv", "zano", "fusd",
];
const DAIMO_TICKERS = ["usdc", "usdt", "eth", "sol"];

export default function NanoGptPage() {
  const apiBase = useChatStore((s) => s.apiBase) || "";
  const setView = useChatStore((s) => s.setView);
  const nanogptBalance = useChatStore((s) => s.nanogptBalance);
  const fetchNanogptBalance = useChatStore((s) => s.fetchNanogptBalance);

  const [config, setConfig] = useState(null);
  const [nanogptKeyInput, setNanogptKeyInput] = useState("");
  const [savingNanogpt, setSavingNanogpt] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [message, setMessage] = useState(null);

  const [balanceLoading, setBalanceLoading] = useState(false);
  const [nanoPrice, setNanoPrice] = useState(null);
  const [fiatPrices, setFiatPrices] = useState(null);
  const [selectedFiat, setSelectedFiat] = useState("EUR");

  const [limitsTicker, setLimitsTicker] = useState("btc");
  const [limitsData, setLimitsData] = useState(null);
  const [limitsLoading, setLimitsLoading] = useState(false);

  const [createTicker, setCreateTicker] = useState("btc");
  const [createAmount, setCreateAmount] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState(null);

  const [daimoTicker, setDaimoTicker] = useState("usdc");
  const [daimoAmount, setDaimoAmount] = useState("");
  const [daimoLoading, setDaimoLoading] = useState(false);
  const [daimoResult, setDaimoResult] = useState(null);

  const [cardAmount, setCardAmount] = useState("");
  const [cardLoading, setCardLoading] = useState(false);
  const [cardResult, setCardResult] = useState(null);

  const [statusTicker, setStatusTicker] = useState("btc");
  const [statusTxId, setStatusTxId] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResult, setStatusResult] = useState(null);

  const fetchConfig = useCallback(() => {
    fetch(`${apiBase}/api/config`)
      .then((r) => r.json())
      .then((data) => data.config && setConfig(data.config))
      .catch(() => setConfig(null));
  }, [apiBase]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchNanogptBalance();
  }, [fetchNanogptBalance]);

  useEffect(() => {
    if (fiatPrices?.usdTo && !Object.prototype.hasOwnProperty.call(fiatPrices.usdTo, selectedFiat)) {
      const first = Object.keys(fiatPrices.usdTo).filter((k) => k !== "USD").sort((a, b) => a.localeCompare(b))[0];
      if (first) setSelectedFiat(first);
    }
  }, [fiatPrices, selectedFiat]);

  const nanogptStatus = config?.NANOGPT_API_KEY?.status ?? "NOT_CONFIGURED";
  const nanogptConnected = nanogptStatus === "CONNECTED";

  const handleSaveNanogptKey = async (e) => {
    e.preventDefault();
    setSavingNanogpt(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "NANOGPT_API_KEY", value: nanogptKeyInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "NanoGPT API key saved." });
        setConfig((c) => ({
          ...c,
          NANOGPT_API_KEY: {
            status: nanogptKeyInput.trim() ? "CONNECTED" : "NOT_CONFIGURED",
            masked: nanogptKeyInput.trim() && nanogptKeyInput.length > 8 ? nanogptKeyInput.slice(0, 4) + "…" + nanogptKeyInput.slice(-4) : null,
          },
        }));
        setNanogptKeyInput("");
        fetchNanogptBalance();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setSavingNanogpt(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/nanogpt/balance`);
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "NanoGPT connected. Balance fetched." });
        fetchNanogptBalance();
      } else {
        setMessage({ type: "error", text: data.error || "Connection failed" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setTestingConnection(false);
    }
  };

  const refreshBalance = async () => {
    setBalanceLoading(true);
    await fetchNanogptBalance();
    setBalanceLoading(false);
  };

  const fetchPrices = async () => {
    try {
      const [nanoRes, fiatRes] = await Promise.all([
        fetch(`${apiBase}/api/nanogpt/prices/nano`),
        fetch(`${apiBase}/api/nanogpt/prices/fiat`),
      ]);
      const nanoData = await nanoRes.json();
      const fiatData = await fiatRes.json();
      if (!nanoData.error) setNanoPrice(nanoData);
      if (!fiatData.error) setFiatPrices(fiatData);
    } catch (_) {}
  };

  const fetchLimits = async () => {
    setLimitsLoading(true);
    setLimitsData(null);
    try {
      const res = await fetch(`${apiBase}/api/nanogpt/limits/${encodeURIComponent(limitsTicker)}`);
      const data = await res.json();
      if (data.ok) setLimitsData(data);
      else setLimitsData({ error: data.error });
    } catch (e) {
      setLimitsData({ error: e.message });
    } finally {
      setLimitsLoading(false);
    }
  };

  const handleCreateDeposit = async (e) => {
    e.preventDefault();
    const amount = Number(createAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCreateResult({ ok: false, error: "Enter a valid amount" });
      return;
    }
    setCreateLoading(true);
    setCreateResult(null);
    try {
      const res = await fetch(`${apiBase}/api/nanogpt/transaction/create/${encodeURIComponent(createTicker)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      setCreateResult(data);
    } catch (e) {
      setCreateResult({ ok: false, error: e.message });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDaimoCreate = async (e) => {
    e.preventDefault();
    const amount = Number(daimoAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDaimoResult({ ok: false, error: "Enter a valid amount" });
      return;
    }
    setDaimoLoading(true);
    setDaimoResult(null);
    try {
      const res = await fetch(`${apiBase}/api/nanogpt/transaction/create/daimo/${encodeURIComponent(daimoTicker)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      setDaimoResult(data);
    } catch (e) {
      setDaimoResult({ ok: false, error: e.message });
    } finally {
      setDaimoLoading(false);
    }
  };

  const handleCardCreate = async (e) => {
    e.preventDefault();
    const amount = Number(cardAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCardResult({ ok: false, error: "Enter a valid amount (USD)" });
      return;
    }
    setCardLoading(true);
    setCardResult(null);
    try {
      const res = await fetch(`${apiBase}/api/nanogpt/transaction/create/usd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      setCardResult(data);
    } catch (e) {
      setCardResult({ ok: false, error: e.message });
    } finally {
      setCardLoading(false);
    }
  };

  const handleCheckStatus = async (e) => {
    e.preventDefault();
    if (!statusTxId.trim()) {
      setStatusResult({ ok: false, error: "Enter transaction ID" });
      return;
    }
    setStatusLoading(true);
    setStatusResult(null);
    try {
      const res = await fetch(
        `${apiBase}/api/nanogpt/transaction/status/${encodeURIComponent(statusTicker)}/${encodeURIComponent(statusTxId.trim())}`
      );
      const data = await res.json();
      setStatusResult(data);
    } catch (e) {
      setStatusResult({ ok: false, error: e.message });
    } finally {
      setStatusLoading(false);
    }
  };

  const sectionClass = "rounded-xl bg-[#222228] border border-[#2a2a30] p-4";
  const inputClass = "w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50";
  const labelClass = "text-xs font-medium uppercase tracking-wider text-slate-400";
  const btnClass = "rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-1.5 px-3 text-sm font-medium text-white transition";
  const btnSecondaryClass = "rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 py-1.5 px-3 text-sm font-medium text-white transition";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView("chat")}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
            aria-label="Back to chat"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-white">Nano-GPT</h1>
        </div>

        {message && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${message.type === "success" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}
          >
            {message.text}
          </div>
        )}

        {/* API key — same fields as Settings */}
        <section className={sectionClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={labelClass}>NanoGPT API key</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${nanogptConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-600/30 text-slate-400"}`}
            >
              {nanogptConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              {nanogptStatus === "CONNECTED" ? "CONNECTED" : "NOT CONFIGURED"}
            </span>
          </div>
          {config?.NANOGPT_API_KEY?.masked && (
            <p className="text-sm text-slate-500 mb-3">Current: {config.NANOGPT_API_KEY.masked}</p>
          )}
          <form onSubmit={handleSaveNanogptKey} className="space-y-3">
            <input
              type="password"
              value={nanogptKeyInput}
              onChange={(e) => setNanogptKeyInput(e.target.value)}
              placeholder="NANOGPT_API_KEY"
              className={inputClass}
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={savingNanogpt} className={btnClass}>
                {savingNanogpt ? "Saving…" : "Save key"}
              </button>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection || !nanogptConnected}
                className={btnSecondaryClass}
              >
                {testingConnection ? "Testing…" : "Test connection"}
              </button>
            </div>
          </form>
        </section>

        {/* Balance */}
        <section className={sectionClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={labelClass}>Account balance</span>
            <button type="button" onClick={refreshBalance} disabled={balanceLoading} className="text-xs text-emerald-400 hover:text-emerald-300">
              {balanceLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {nanogptBalance != null ? (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-4">
                <span className="text-slate-300">
                  USD: <strong className="text-white">${Number(nanogptBalance.usd_balance ?? 0).toFixed(2)}</strong>
                </span>
                {nanogptBalance.nano_balance != null && (
                  <span className="text-slate-300">
                    Nano: <strong className="text-white">{nanogptBalance.nano_balance}</strong>
                  </span>
                )}
              </div>
              {nanogptBalance.nano_deposit_address && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={labelClass}>Nano deposit address (send XNO here to top up)</span>
                  <code className="rounded bg-[#1a1a1e] px-2 py-1 text-xs text-slate-300 break-all font-mono max-w-full">
                    {nanogptBalance.nano_deposit_address}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(nanogptBalance.nano_deposit_address);
                      setMessage({ type: "success", text: "Nano deposit address copied." });
                      setTimeout(() => setMessage(null), 2000);
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Set API key and test connection to see balance.</p>
          )}
        </section>

        {/* Prices */}
        <section className={sectionClass}>
          <div className="flex items-center justify-between mb-3">
            <span className={labelClass}>Prices</span>
            <button type="button" onClick={fetchPrices} className={btnSecondaryClass}>
              Fetch prices
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {nanoPrice && (
              <div className="rounded-lg bg-[#1a1a1e] p-2">
                <span className="text-slate-500">NANO/USD</span>
                <p className="text-white font-medium">{nanoPrice.latestPrice != null ? `$${Number(nanoPrice.latestPrice).toFixed(2)}` : "—"}</p>
              </div>
            )}
            {fiatPrices?.usdTo && (
              <div className="rounded-lg bg-[#1a1a1e] p-2">
                <span className="text-slate-500">Fiat (vs USD)</span>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <select
                    value={selectedFiat}
                    onChange={(e) => setSelectedFiat(e.target.value)}
                    className="rounded bg-[#0d0d0f] border border-[#2a2a30] px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    {Object.keys(fiatPrices.usdTo)
                      .filter((k) => k !== "USD")
                      .sort((a, b) => a.localeCompare(b))
                      .map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                  </select>
                  <span className="text-slate-300">
                    1 USD = <strong className="text-white">{fiatPrices.usdTo[selectedFiat] != null ? Number(fiatPrices.usdTo[selectedFiat]).toFixed(4) : "—"}</strong> {selectedFiat}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="mt-3">
            <a
              href="https://nanswap.com/swap/SOL/XNO?r=nanodrop"
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              Swap SOL → Nano (Nanswap)
            </a>
          </div>
          {!nanoPrice && !fiatPrices && <p className="text-slate-500 mt-2">Click &quot;Fetch prices&quot; to load.</p>}
        </section>

        {/* Limits */}
        <section className={sectionClass}>
          <h3 className="text-sm font-medium text-slate-200 mb-3">Check payment limits</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ticker</label>
              <select value={limitsTicker} onChange={(e) => setLimitsTicker(e.target.value)} className={inputClass}>
                {CRYPTO_TICKERS.concat(DAIMO_TICKERS).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="usd">usd</option>
              </select>
            </div>
            <button type="button" onClick={fetchLimits} disabled={limitsLoading} className={btnClass}>
              {limitsLoading ? "Loading…" : "Get limits"}
            </button>
          </div>
          {limitsData && (
            <div className="mt-3 rounded-lg bg-[#1a1a1e] p-3 text-sm">
              {limitsData.error ? (
                <p className="text-red-400">{limitsData.error}</p>
              ) : (
                <dl className="grid grid-cols-2 gap-2">
                  {limitsData.minimum != null && <><dt className="text-slate-500">Minimum</dt><dd className="text-white">{limitsData.minimum}</dd></>}
                  {limitsData.maximum != null && <><dt className="text-slate-500">Maximum</dt><dd className="text-white">{limitsData.maximum}</dd></>}
                  {limitsData.fiatEquivalentMinimum != null && <><dt className="text-slate-500">Min (fiat)</dt><dd className="text-white">{limitsData.fiatEquivalentMinimum}</dd></>}
                  {limitsData.fiatEquivalentMaximum != null && <><dt className="text-slate-500">Max (fiat)</dt><dd className="text-white">{limitsData.fiatEquivalentMaximum}</dd></>}
                </dl>
              )}
            </div>
          )}
        </section>

        {/* Create crypto deposit */}
        <section className={sectionClass}>
          <h3 className="text-sm font-medium text-slate-200 mb-3">Create crypto deposit</h3>
          <form onSubmit={handleCreateDeposit} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Ticker</label>
                <select value={createTicker} onChange={(e) => setCreateTicker(e.target.value)} className={inputClass}>
                  {CRYPTO_TICKERS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[120px]">
                <label className="block text-xs text-slate-500 mb-1">Amount</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={createAmount}
                  onChange={(e) => setCreateAmount(e.target.value)}
                  placeholder="0.001"
                  className={inputClass}
                />
              </div>
            </div>
            <button type="submit" disabled={createLoading || !nanogptConnected} className={btnClass}>
              {createLoading ? "Creating…" : "Create deposit"}
            </button>
          </form>
          {createResult && (
            <div className="mt-3 rounded-lg bg-[#1a1a1e] p-3 text-sm space-y-1">
              {createResult.ok ? (
                <>
                  {createResult.txId && <p><span className="text-slate-500">Tx ID:</span> <span className="text-white break-all">{createResult.txId}</span></p>}
                  {createResult.address && <p><span className="text-slate-500">Address:</span> <span className="text-white break-all font-mono">{createResult.address}</span></p>}
                  {createResult.paymentLink && (
                    <p>
                      <a href={createResult.paymentLink} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline break-all">{createResult.paymentLink}</a>
                    </p>
                  )}
                  {createResult.status && <p><span className="text-slate-500">Status:</span> {createResult.status}</p>}
                  {createResult.amount != null && <p><span className="text-slate-500">Amount:</span> {createResult.amount}</p>}
                </>
              ) : (
                <p className="text-red-400">{createResult.error}</p>
              )}
            </div>
          )}
        </section>

        {/* Daimo Pay */}
        <section className={sectionClass}>
          <h3 className="text-sm font-medium text-slate-200 mb-3">Daimo Pay (USDC/USDT/ETH/SOL)</h3>
          <form onSubmit={handleDaimoCreate} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Ticker</label>
                <select value={daimoTicker} onChange={(e) => setDaimoTicker(e.target.value)} className={inputClass}>
                  {DAIMO_TICKERS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[120px]">
                <label className="block text-xs text-slate-500 mb-1">Amount (USD equiv.)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={daimoAmount}
                  onChange={(e) => setDaimoAmount(e.target.value)}
                  placeholder="10"
                  className={inputClass}
                />
              </div>
            </div>
            <button type="submit" disabled={daimoLoading || !nanogptConnected} className={btnClass}>
              {daimoLoading ? "Creating…" : "Create Daimo payment"}
            </button>
          </form>
          {daimoResult && (
            <div className="mt-3 rounded-lg bg-[#1a1a1e] p-3 text-sm">
              {daimoResult.ok ? (
                <p className="text-slate-300">Payment ID: <span className="text-white font-mono">{daimoResult.paymentId || "—"}</span></p>
              ) : (
                <p className="text-red-400">{daimoResult.error}</p>
              )}
            </div>
          )}
        </section>

        {/* Card (Stripe) */}
        <section className={sectionClass}>
          <h3 className="text-sm font-medium text-slate-200 mb-3">Card deposit (Stripe USD)</h3>
          <form onSubmit={handleCardCreate} className="space-y-3">
            <div className="max-w-[160px]">
              <label className="block text-xs text-slate-500 mb-1">Amount (USD)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={cardAmount}
                onChange={(e) => setCardAmount(e.target.value)}
                placeholder="10"
                className={inputClass}
              />
            </div>
            <button type="submit" disabled={cardLoading || !nanogptConnected} className={btnClass}>
              {cardLoading ? "Creating…" : "Create card payment"}
            </button>
          </form>
          {cardResult && (
            <div className="mt-3 rounded-lg bg-[#1a1a1e] p-3 text-sm">
              {cardResult.ok && cardResult.paymentLink ? (
                <a href={cardResult.paymentLink} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline break-all">
                  Open checkout
                </a>
              ) : cardResult.error ? (
                <p className="text-red-400">{cardResult.error}</p>
              ) : null}
            </div>
          )}
        </section>

        {/* Transaction status */}
        <section className={sectionClass}>
          <h3 className="text-sm font-medium text-slate-200 mb-3">Transaction status</h3>
          <form onSubmit={handleCheckStatus} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Ticker</label>
                <select value={statusTicker} onChange={(e) => setStatusTicker(e.target.value)} className={inputClass}>
                  {CRYPTO_TICKERS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs text-slate-500 mb-1">Transaction ID</label>
                <input
                  type="text"
                  value={statusTxId}
                  onChange={(e) => setStatusTxId(e.target.value)}
                  placeholder="txId from create deposit"
                  className={inputClass}
                />
              </div>
            </div>
            <button type="submit" disabled={statusLoading || !nanogptConnected} className={btnClass}>
              {statusLoading ? "Checking…" : "Check status"}
            </button>
          </form>
          {statusResult && (
            <div className="mt-3 rounded-lg bg-[#1a1a1e] p-3 text-sm">
              {statusResult.ok ? (
                <p><span className="text-slate-500">Status:</span> <span className="text-white">{statusResult.status ?? "—"}</span></p>
              ) : (
                <p className="text-red-400">{statusResult.error}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
