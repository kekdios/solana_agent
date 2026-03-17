import { useState, useEffect } from "react";
import { useChatStore } from "../store/chatStore";

const setSolanaNetwork = (n) => useChatStore.getState().setSolanaNetwork(n);
const setSolanaRpcConnected = (c) => useChatStore.getState().setSolanaRpcConnected(c);

export default function Settings({ onClose }) {
  const apiBase = useChatStore((s) => s.apiBase) || "";
  const [config, setConfig] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [veniceKeyInput, setVeniceKeyInput] = useState("");
  const [nanogptKeyInput, setNanogptKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingVenice, setSavingVenice] = useState(false);
  const [savingNanogpt, setSavingNanogpt] = useState(false);
  const [message, setMessage] = useState(null);

  const [walletEnsuring, setWalletEnsuring] = useState(false);
  const [showImportKey, setShowImportKey] = useState(false);
  const [importKeyInput, setImportKeyInput] = useState("");
  const [importingKey, setImportingKey] = useState(false);
  const [ackModal, setAckModal] = useState(null);
  const [revealedPrivateKey, setRevealedPrivateKey] = useState(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [envPort, setEnvPort] = useState("");
  const [envHost, setEnvHost] = useState("");
  const [envSolanaRpc, setEnvSolanaRpc] = useState("");
  const [envHeartbeatMs, setEnvHeartbeatMs] = useState("");
  const [envWorkspaceDir, setEnvWorkspaceDir] = useState("");
  const [envDataDir, setEnvDataDir] = useState("");
  const [savingEnv, setSavingEnv] = useState(false);
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [testingSolanaRpc, setTestingSolanaRpc] = useState(false);
  const [solanaRpcStatus, setSolanaRpcStatus] = useState(null); // "CONNECTED" | "NOT_CONNECTED" | null

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/api/config`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.config) setConfig(data.config);
      })
      .catch(() => setConfig({ INCEPTION_API_KEY: { status: "NOT_CONFIGURED" } }));
    return () => { cancelled = true; };
  }, [apiBase]);

  useEffect(() => {
    const env = config?.env;
    if (env) {
      setEnvPort(env.PORT ?? "");
      setEnvHost(env.HOST ?? "");
      setEnvSolanaRpc(env.SOLANA_RPC_URL ?? "");
      setEnvHeartbeatMs(env.HEARTBEAT_INTERVAL_MS ?? "");
      setEnvWorkspaceDir(env.WORKSPACE_DIR ?? "");
      setEnvDataDir(env.DATA_DIR ?? "");
    }
  }, [config?.env]);

  const refetchConfig = () => {
    fetch(`${apiBase}/api/config`)
      .then((r) => r.json())
      .then((data) => data.config && setConfig(data.config))
      .catch(() => {});
  };

  const handleSaveKey = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "INCEPTION_API_KEY", value: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "API key saved." });
        setConfig((c) => ({
          ...c,
          INCEPTION_API_KEY: {
            status: apiKeyInput.trim() ? "CONNECTED" : "NOT_CONFIGURED",
            masked: apiKeyInput.trim() && apiKeyInput.length > 8 ? apiKeyInput.slice(0, 4) + "…" + apiKeyInput.slice(-4) : null,
          },
        }));
        setApiKeyInput("");
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setSaving(false);
    }
  };

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
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setSavingNanogpt(false);
    }
  };

  const handleSaveVeniceKey = async (e) => {
    e.preventDefault();
    setSavingVenice(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "VENICE_ADMIN_KEY", value: veniceKeyInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "Venice API key saved." });
        setConfig((c) => ({
          ...c,
          VENICE_ADMIN_KEY: {
            status: veniceKeyInput.trim() ? "CONNECTED" : "NOT_CONFIGURED",
            masked: veniceKeyInput.trim() && veniceKeyInput.length > 8 ? veniceKeyInput.slice(0, 4) + "…" + veniceKeyInput.slice(-4) : null,
          },
        }));
        setVeniceKeyInput("");
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setSavingVenice(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/chat/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const name = data.provider === "venice" ? "Venice" : data.provider === "nanogpt" ? "NanoGPT" : "Inception";
        setMessage({ type: "success", text: `Connected to ${name} (${data.model}).` });
      } else {
        setMessage({ type: "error", text: data.error || "Connection failed" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleChatBackendChange = async (e) => {
    const value = e.target.value;
    if (value !== "inception" && value !== "venice" && value !== "nanogpt") return;
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "CHAT_BACKEND", value }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig((c) => ({ ...c, chatBackend: value }));
        const name = value === "venice" ? "Venice" : value === "nanogpt" ? "NanoGPT (Grok 4 Fast)" : "Inception";
        setMessage({ type: "success", text: `Chat provider set to ${name}.` });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    }
  };

  const handleImportPrivateKey = async (e) => {
    e.preventDefault();
    const key = importKeyInput.trim();
    if (!key) {
      setMessage({ type: "error", text: "Enter a Solana private key (base58)." });
      return;
    }
    setImportingKey(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/solana-wallet/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey: key }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage({ type: "error", text: data.error });
        return;
      }
      setMessage({ type: "success", text: "Wallet imported. Public key: " + (data.publicKey ? data.publicKey.slice(0, 8) + "…" : "") });
      setImportKeyInput("");
      setShowImportKey(false);
      refetchConfig();
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Import failed" });
    } finally {
      setImportingKey(false);
    }
  };

  const handleGenerateWallet = async () => {
    setWalletEnsuring(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/solana-wallet/ensure`, { method: "POST" });
      const data = await res.json();
      if (data.privateKeyOneTime) {
        setAckModal(data.privateKeyOneTime);
      }
      refetchConfig();
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setWalletEnsuring(false);
    }
  };

  const handleAckConfirm = async () => {
    try {
      await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "PASSPHRASE_BACKUP_ACKNOWLEDGED", value: "true" }),
      });
      setAckModal(null);
      refetchConfig();
    } catch (_) {}
  };

  const handleShowPrivateKey = async () => {
    if (revealedPrivateKey) {
      setRevealedPrivateKey(null);
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/solana-wallet/private-key`);
      const data = await res.json();
      if (data.privateKey) setRevealedPrivateKey(data.privateKey);
      else setMessage({ type: "error", text: data.error || "Failed to load" });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text).then(() => setMessage({ type: "success", text: "Copied." }));
  };

  const handleSolanaNetworkChange = async (network) => {
    const urls = config?.solanaNetworkUrls || {};
    const url = urls[network];
    if (!url) return;
    setSavingNetwork(true);
    setMessage(null);
    setSolanaRpcStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "SOLANA_RPC_URL", value: url }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig((c) => ({ ...c, solanaNetwork: network, env: { ...c?.env, SOLANA_RPC_URL: url } }));
        setEnvSolanaRpc(url);
        setSolanaNetwork(network);
        setSolanaRpcConnected(null);
        setMessage({ type: "success", text: `Solana network set to ${network}.` });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setSavingNetwork(false);
    }
  };

  const handleTestSolanaRpc = async () => {
    setTestingSolanaRpc(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/solana-rpc/test`, { method: "POST" });
      const data = await res.json();
      const connected = !!data.ok;
      setSolanaRpcStatus(connected ? "CONNECTED" : "NOT_CONNECTED");
      setSolanaRpcConnected(connected);
      if (data.ok) {
        setMessage({ type: "success", text: `Connected to ${data.network || "RPC"}.` });
      } else {
        setMessage({ type: "error", text: data.error || "Connection failed" });
      }
    } catch (err) {
      setSolanaRpcStatus("NOT_CONNECTED");
      setSolanaRpcConnected(false);
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setTestingSolanaRpc(false);
    }
  };

  const handleSaveEnv = async (e) => {
    e.preventDefault();
    setSavingEnv(true);
    setMessage(null);
    const keys = [
      { key: "PORT", value: envPort.trim() },
      { key: "HOST", value: envHost.trim() },
      { key: "SOLANA_RPC_URL", value: envSolanaRpc.trim() },
      { key: "HEARTBEAT_INTERVAL_MS", value: envHeartbeatMs.trim() },
      { key: "WORKSPACE_DIR", value: envWorkspaceDir.trim() },
      { key: "DATA_DIR", value: envDataDir.trim() },
    ];
    try {
      for (const { key, value } of keys) {
        const res = await fetch(`${apiBase}/api/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        const data = await res.json();
        if (!data.ok) {
          setMessage({ type: "error", text: data.error || `Failed to save ${key}` });
          return;
        }
      }
      setMessage({ type: "success", text: "Environment settings saved. PORT/HOST apply after restart." });
      refetchConfig();
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setSavingEnv(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearingHistory(true);
    setMessage(null);
    setConfirmClear(false);
    try {
      const res = await fetch(`${apiBase}/api/conversations/clear`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "All conversation history and saved sessions cleared." });
        useChatStore.getState().newChat();
        useChatStore.getState().fetchConversations();
        useChatStore.getState().fetchSessions();
        useChatStore.getState().fetchUsageTotal();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to clear" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setClearingHistory(false);
    }
  };

  const chatBackend = config?.chatBackend ?? "nanogpt";
  const apiStatus = config?.INCEPTION_API_KEY?.status ?? "NOT_CONFIGURED";
  const veniceStatus = config?.VENICE_ADMIN_KEY?.status ?? "NOT_CONFIGURED";
  const nanogptStatus = config?.NANOGPT_API_KEY?.status ?? "NOT_CONFIGURED";
  const isConnected = apiStatus === "CONNECTED";
  const veniceConnected = veniceStatus === "CONNECTED";
  const nanogptConnected = nanogptStatus === "CONNECTED";
  const activeProviderOk =
    chatBackend === "venice" ? veniceConnected : chatBackend === "nanogpt" ? nanogptConnected : isConnected;
  const solana = config?.solanaWallet ?? {};
  const hasWallet = solana.hasKeypair;
  const ackDone = solana.passphraseAcknowledged;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-[#1a1a1e] shadow-2xl border border-[#2a2a30] overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a30]">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-6">
          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Chat provider</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${activeProviderOk ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-600/30 text-slate-400"}`}>
                {activeProviderOk && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                {chatBackend === "venice" ? "Venice" : chatBackend === "nanogpt" ? "NanoGPT" : "Inception"} {activeProviderOk ? "" : "(no key)"}
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-2">Provider used for chat requests.</p>
            <select
              value={chatBackend}
              onChange={handleChatBackendChange}
              className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
            >
              <option value="nanogpt">NanoGPT (Grok 4 Fast)</option>
              <option value="inception">Inception (mercury-2)</option>
              <option value="venice">Venice (venice-uncensored)</option>
            </select>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingConnection || !activeProviderOk}
              className="mt-3 w-full rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 py-1.5 text-sm font-medium text-white transition"
            >
              {testingConnection ? "Testing…" : "Test connection"}
            </button>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">NanoGPT API key</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${nanogptConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-600/30 text-slate-400"}`}>
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
                className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={savingNanogpt}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-1.5 text-sm font-medium text-white transition"
              >
                {savingNanogpt ? "Saving…" : "Save NanoGPT key"}
              </button>
            </form>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Inception API key</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${isConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-600/30 text-slate-400"}`}>
                {isConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                {apiStatus === "CONNECTED" ? "CONNECTED" : "NOT CONFIGURED"}
              </span>
            </div>
            {config?.INCEPTION_API_KEY?.masked && (
              <p className="text-sm text-slate-500 mb-3">Current: {config.INCEPTION_API_KEY.masked}</p>
            )}
            <form onSubmit={handleSaveKey} className="space-y-3">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="INCEPTION_API_KEY"
                className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-1.5 text-sm font-medium text-white transition"
              >
                {saving ? "Saving…" : "Save Inception key"}
              </button>
            </form>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Venice API key</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${veniceConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-600/30 text-slate-400"}`}>
                {veniceConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                {veniceStatus === "CONNECTED" ? "CONNECTED" : "NOT CONFIGURED"}
              </span>
            </div>
            {config?.VENICE_ADMIN_KEY?.masked && (
              <p className="text-sm text-slate-500 mb-3">Current: {config.VENICE_ADMIN_KEY.masked}</p>
            )}
            <form onSubmit={handleSaveVeniceKey} className="space-y-3">
              <input
                type="password"
                value={veniceKeyInput}
                onChange={(e) => setVeniceKeyInput(e.target.value)}
                placeholder="VENICE_ADMIN_KEY"
                className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={savingVenice}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-1.5 text-sm font-medium text-white transition"
              >
                {savingVenice ? "Saving…" : "Save Venice key"}
              </button>
            </form>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Solana Wallet</span>
              {hasWallet && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  CONFIGURED
                </span>
              )}
            </div>
            {!hasWallet ? (
              <p className="text-sm text-slate-400 mb-3">No wallet. Generate one to sign Solana transactions.</p>
            ) : (
              <>
                {solana.publicKey && (
                  <div className="mb-3">
                    <p className="text-xs text-slate-500 mb-1">Public key</p>
                    <div className="flex gap-2 items-center">
                      <code className="flex-1 truncate rounded bg-[#1a1a1e] px-2 py-1.5 text-xs text-slate-300">
                        {solana.publicKey}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(solana.publicKey)}
                        className="rounded-lg bg-white/5 px-1.5 py-1 text-xs text-slate-400 hover:text-white"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-500 mb-1">Private key</p>
                  {revealedPrivateKey ? (
                    <div className="space-y-2">
                      <textarea
                        readOnly
                        value={revealedPrivateKey}
                        className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-3 py-2 text-xs text-slate-300 font-mono resize-none"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(revealedPrivateKey)}
                          className="rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs px-1.5 py-1"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevealedPrivateKey(null)}
                          className="rounded-lg bg-white/5 text-slate-400 hover:text-white text-xs px-1.5 py-1"
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleShowPrivateKey}
                      className="rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-sm px-2 py-1"
                    >
                      Show private key
                    </button>
                  )}
                </div>
                {hasWallet && !ackDone && (
                  <div className="mt-3 pt-3 border-t border-[#2a2a30]">
                    <p className="text-xs text-amber-400/90 mb-2">Confirm you have backed up your private key.</p>
                    <button
                      type="button"
                      onClick={handleAckConfirm}
                      className="rounded-lg bg-amber-600/20 hover:bg-amber-500/30 text-amber-400 text-sm px-2 py-1"
                    >
                      I have written it down
                    </button>
                  </div>
                )}
              </>
            )}
            {!hasWallet && (
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleGenerateWallet}
                  disabled={walletEnsuring}
                  className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 text-sm font-medium text-white transition"
                >
                  {walletEnsuring ? "Generating…" : "Generate wallet"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportKey((v) => !v)}
                  className="w-full rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 py-2 text-sm font-medium transition"
                >
                  {showImportKey ? "Cancel import" : "Import private key"}
                </button>
                {showImportKey && (
                  <form onSubmit={handleImportPrivateKey} className="pt-2 space-y-2 border-t border-[#2a2a30]">
                    <textarea
                      value={importKeyInput}
                      onChange={(e) => setImportKeyInput(e.target.value)}
                      placeholder="Paste Solana private key (base58, 64-byte or 32-byte seed)"
                      className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-3 py-2 text-xs text-slate-300 font-mono placeholder-slate-500 resize-none"
                      rows={3}
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      disabled={importingKey}
                      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2 text-sm font-medium text-white transition"
                    >
                      {importingKey ? "Importing…" : "Import"}
                    </button>
                  </form>
                )}
              </div>
            )}
            {hasWallet && (
              <div className="mt-3 pt-3 border-t border-[#2a2a30]">
                <button
                  type="button"
                  onClick={() => setShowImportKey((v) => !v)}
                  className="text-sm text-slate-400 hover:text-white transition"
                >
                  {showImportKey ? "Cancel" : "Import different private key"}
                </button>
                {showImportKey && (
                  <form onSubmit={handleImportPrivateKey} className="mt-2 space-y-2">
                    <p className="text-xs text-amber-400/90">This will replace the current wallet.</p>
                    <textarea
                      value={importKeyInput}
                      onChange={(e) => setImportKeyInput(e.target.value)}
                      placeholder="Paste Solana private key (base58)"
                      className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-3 py-2 text-xs text-slate-300 font-mono placeholder-slate-500 resize-none"
                      rows={3}
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      disabled={importingKey}
                      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2 text-sm font-medium text-white transition"
                    >
                      {importingKey ? "Importing…" : "Import"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Solana network</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  solanaRpcStatus === "CONNECTED"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : solanaRpcStatus === "NOT_CONNECTED"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-slate-600/30 text-slate-400"
                }`}
              >
                {solanaRpcStatus === "CONNECTED" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                {solanaRpcStatus === "CONNECTED" ? "CONNECTED" : solanaRpcStatus === "NOT_CONNECTED" ? "NOT CONNECTED" : "—"}
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-3">RPC endpoint for wallet and tools. Same keypair works on all networks.</p>
            <div className="flex flex-wrap gap-2 items-center">
              {["testnet", "devnet", "mainnet"].map((net) => {
                const isActive = (config?.solanaNetwork || "testnet") === net;
                return (
                  <button
                    key={net}
                    type="button"
                    onClick={() => handleSolanaNetworkChange(net)}
                    disabled={savingNetwork}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                      isActive
                        ? "bg-emerald-600 text-white"
                        : "bg-white/10 text-slate-300 hover:bg-white/15 hover:text-slate-200"
                    }`}
                  >
                    {net.charAt(0).toUpperCase() + net.slice(1)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleTestSolanaRpc}
                disabled={testingSolanaRpc}
                className="rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 hover:text-slate-200 py-1.5 px-3 text-sm font-medium transition disabled:opacity-50"
              >
                {testingSolanaRpc ? "Testing…" : "Test connection"}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Current: <span className="text-slate-400">{config?.solanaNetwork || "testnet"}</span>
            </p>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block mb-3">Environment (config table)</span>
            <p className="text-sm text-slate-500 mb-3">Stored in solagent.db; overrides .env. PORT/HOST apply after restart.</p>
            <form onSubmit={handleSaveEnv} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">PORT</label>
                <input
                  type="text"
                  value={envPort}
                  onChange={(e) => setEnvPort(e.target.value)}
                  placeholder="3333"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">HOST</label>
                <input
                  type="text"
                  value={envHost}
                  onChange={(e) => setEnvHost(e.target.value)}
                  placeholder="0.0.0.0"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">SOLANA_RPC_URL</label>
                <input
                  type="text"
                  value={envSolanaRpc}
                  onChange={(e) => setEnvSolanaRpc(e.target.value)}
                  placeholder="https://api.mainnet-beta.solana.com"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">HEARTBEAT_INTERVAL_MS</label>
                <input
                  type="text"
                  value={envHeartbeatMs}
                  onChange={(e) => setEnvHeartbeatMs(e.target.value)}
                  placeholder="30000 or leave empty to disable"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">WORKSPACE_DIR</label>
                <input
                  type="text"
                  value={envWorkspaceDir}
                  onChange={(e) => setEnvWorkspaceDir(e.target.value)}
                  placeholder="Path to workspace"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">DATA_DIR</label>
                <input
                  type="text"
                  value={envDataDir}
                  onChange={(e) => setEnvDataDir(e.target.value)}
                  placeholder="Path to data directory"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <button
                type="submit"
                disabled={savingEnv}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-1.5 text-sm font-medium text-white transition"
              >
                {savingEnv ? "Saving…" : "Save environment"}
              </button>
            </form>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block mb-3">Conversation history</span>
            <p className="text-sm text-slate-400 mb-3">Permanently delete all chats, messages, and saved sessions. This cannot be undone.</p>
            {confirmClear ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClearHistory}
                  disabled={clearingHistory}
                  className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 py-1.5 px-2 text-sm font-medium text-white transition"
                >
                  {clearingHistory ? "Clearing…" : "Yes, clear all"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg bg-white/5 text-slate-400 hover:text-white py-1.5 px-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white py-1.5 px-2 text-sm transition"
              >
                Clear all conversation history
              </button>
            )}
          </section>

          {message && (
            <div className={`rounded-lg px-4 py-2 text-sm ${message.type === "success" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
              {message.text}
            </div>
          )}
        </div>
      </div>

      {ackModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#1a1a1e] border border-[#2a2a30] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">Write down your private key</h3>
            <p className="text-sm text-slate-400 mb-4">
              Save this key in a safe place. You will need it to recover this wallet. The app will not show this again.
            </p>
            <textarea
              readOnly
              value={ackModal}
              className="w-full rounded-lg bg-[#0d0d0f] border border-[#2a2a30] px-3 py-2 text-xs text-slate-300 font-mono resize-none mb-4"
              rows={4}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAckConfirm}
                className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 py-1.5 text-sm font-medium text-white"
              >
                I have written it down
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(ackModal)}
                className="rounded-lg bg-white/5 text-slate-400 hover:text-white py-1.5 px-2 text-sm"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
