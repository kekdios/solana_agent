import { useState, useEffect, useCallback, useMemo } from "react";
import { useChatStore } from "../store/chatStore";

const setSolanaNetwork = (n) => useChatStore.getState().setSolanaNetwork(n);
const setSolanaRpcConnected = (c) => useChatStore.getState().setSolanaRpcConnected(c);
const ENV_MANAGED_KEYS = new Set([
  "INCEPTION_API_KEY",
  "VENICE_ADMIN_KEY",
  "NANOGPT_API_KEY",
  "NANOGPT_MODEL",
  "JUPITER_API_KEY",
  "NOSTR_NPUB",
  "NOSTR_NSEC",
  "NOSTR_RELAYS",
  "SOLANA_PRIVATE_KEY",
  "SOLANA_PUBLIC_KEY",
  "PORT",
  "HOST",
  "SOLANA_RPC_URL",
  "HEARTBEAT_INTERVAL_SECONDS",
  "HEARTBEAT_INTERVAL_MS",
  "WORKSPACE_DIR",
  "DATA_DIR",
  "SOLANA_RPC_PACE_MS",
  "SOLANA_RPC_STAGGER_MS",
  "HELIUS_API_KEY",
  "TEST_PRIV_KEY",
  "TEST_ADDRESS",
]);
const settingsStoreFor = (key) => (ENV_MANAGED_KEYS.has(key) ? ".env" : "app-settings.json");
const DEFAULT_NANOGPT_MODEL = "x-ai/grok-4-fast";

const SettingsStoreBadge = ({ settingKey }) => (
  <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] leading-none bg-slate-700/60 text-slate-300">
    {settingsStoreFor(settingKey)}
  </span>
);

export default function Settings({ onClose }) {
  const apiBase = useChatStore((s) => s.apiBase) || "";
  const [config, setConfig] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [veniceKeyInput, setVeniceKeyInput] = useState("");
  const [nanogptKeyInput, setNanogptKeyInput] = useState("");
  const [jupiterKeyInput, setJupiterKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingVenice, setSavingVenice] = useState(false);
  const [savingNanogpt, setSavingNanogpt] = useState(false);
  const [nanogptModels, setNanogptModels] = useState([]);
  const [nanogptModelsLoading, setNanogptModelsLoading] = useState(false);
  const [nanogptModelsError, setNanogptModelsError] = useState(null);
  const [savingJupiter, setSavingJupiter] = useState(false);
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
  const [envSolanaRpcPaceMs, setEnvSolanaRpcPaceMs] = useState("");
  const [envSolanaRpcStaggerMs, setEnvSolanaRpcStaggerMs] = useState("");
  const [savingEnv, setSavingEnv] = useState(false);
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [testingSolanaRpc, setTestingSolanaRpc] = useState(false);
  const [solanaRpcStatus, setSolanaRpcStatus] = useState(null); // "CONNECTED" | "NOT_CONNECTED" | null
  const [savingTier, setSavingTier] = useState(false);
  const [savingSwaps, setSavingSwaps] = useState(false);
  const [swapsEnabled, setSwapsEnabled] = useState(false);
  const [swapsMaxSlippageBps, setSwapsMaxSlippageBps] = useState("50");
  const [swapsMaxSwapSol, setSwapsMaxSwapSol] = useState("0.05");
  const [swapsMaxSwapPct, setSwapsMaxSwapPct] = useState("20");
  const [swapsExecutionEnabled, setSwapsExecutionEnabled] = useState(false);
  const [swapsExecutionDryRun, setSwapsExecutionDryRun] = useState(true);
  const [swapsMaxRequoteDevBps, setSwapsMaxRequoteDevBps] = useState("150");
  const [swapsAutopilotEnabled, setSwapsAutopilotEnabled] = useState(false);
  const [swapsAutopilotAutoExecute, setSwapsAutopilotAutoExecute] = useState(false);
  const [swapsCooldownSeconds, setSwapsCooldownSeconds] = useState("60");
  const [swapsMaxPerHour, setSwapsMaxPerHour] = useState("3");
  const [swapsMaxPerDay, setSwapsMaxPerDay] = useState("10");
  const [swapsMaxDailySol, setSwapsMaxDailySol] = useState("0.2");

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
      setEnvHeartbeatMs(env.HEARTBEAT_INTERVAL_SECONDS ?? env.HEARTBEAT_INTERVAL_MS ?? "");
      setEnvWorkspaceDir(env.WORKSPACE_DIR ?? "");
      setEnvDataDir(env.DATA_DIR ?? "");
      setEnvSolanaRpcPaceMs(env.SOLANA_RPC_PACE_MS ?? "");
      setEnvSolanaRpcStaggerMs(env.SOLANA_RPC_STAGGER_MS ?? "");
    }
  }, [config?.env]);

  useEffect(() => {
    const p = config?.swapsPolicy;
    if (p) {
      setSwapsEnabled(!!p.enabled);
      setSwapsMaxSlippageBps(String(p.maxSlippageBps ?? "50"));
      setSwapsMaxSwapSol(String(p.maxSwapSol ?? "0.05"));
      setSwapsMaxSwapPct(String(p.maxSwapPctBalance ?? "20"));
      setSwapsExecutionEnabled(!!p.executionEnabled);
      setSwapsExecutionDryRun(p.executionDryRun !== false);
      setSwapsMaxRequoteDevBps(String(p.maxRequoteDeviationBps ?? "150"));
      setSwapsAutopilotEnabled(!!p.autopilotEnabled);
      setSwapsAutopilotAutoExecute(!!p.autopilotAutoExecute);
      setSwapsCooldownSeconds(String(p.cooldownSeconds ?? "60"));
      setSwapsMaxPerHour(String(p.maxSwapsPerHour ?? "3"));
      setSwapsMaxPerDay(String(p.maxSwapsPerDay ?? "10"));
      setSwapsMaxDailySol(String(p.maxDailySwapSolVolume ?? "0.2"));
    }
  }, [config?.swapsPolicy]);

  const refetchConfig = () => {
    fetch(`${apiBase}/api/config`)
      .then((r) => r.json())
      .then((data) => data.config && setConfig(data.config))
      .catch(() => {});
  };

  const fetchNanogptModels = useCallback(async () => {
    if (!apiBase) return;
    setNanogptModelsLoading(true);
    setNanogptModelsError(null);
    try {
      const res = await fetch(`${apiBase}/api/nanogpt/models?detailed=true`);
      const data = await res.json();
      const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
      if (data.ok && rawList.length > 0) {
        setNanogptModels(
          rawList
            .filter((m) => m && typeof m.id === "string" && m.id.length > 0)
            .map((m) => ({
              id: m.id,
              name: m.name || m.id,
              owned_by: m.owned_by,
            }))
        );
        setNanogptModelsError(null);
      } else if (data.ok && rawList.length === 0) {
        setNanogptModels([]);
        setNanogptModelsError("API returned no models. Try Refresh or check your NanoGPT account.");
      } else {
        setNanogptModels([]);
        setNanogptModelsError(data.error || "Could not load model list");
      }
    } catch (e) {
      setNanogptModels([]);
      setNanogptModelsError(e.message || "Request failed");
    } finally {
      setNanogptModelsLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (apiBase && config?.NANOGPT_API_KEY?.status === "CONNECTED") {
      fetchNanogptModels();
    }
  }, [apiBase, config?.NANOGPT_API_KEY?.status, fetchNanogptModels]);

  const currentNanogptModel = config?.nanogptModel || DEFAULT_NANOGPT_MODEL;
  const nanogptModelOptions = useMemo(() => {
    const ids = new Set(nanogptModels.map((m) => m.id));
    const list = [...nanogptModels];
    if (!ids.has(currentNanogptModel)) {
      list.unshift({ id: currentNanogptModel, name: `${currentNanogptModel} (saved)` });
    }
    return list;
  }, [nanogptModels, currentNanogptModel]);

  const handleSaveNanogptModel = async (modelId) => {
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "NANOGPT_MODEL", value: modelId }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig((c) => ({ ...c, nanogptModel: modelId }));
        setMessage({ type: "success", text: "NanoGPT model saved." });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save model" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    }
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
        if (nanogptKeyInput.trim()) {
          fetchNanogptModels();
        }
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

  const handleSaveJupiterKey = async (e) => {
    e.preventDefault();
    setSavingJupiter(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "JUPITER_API_KEY", value: jupiterKeyInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "Jupiter API key saved." });
        setConfig((c) => ({
          ...c,
          JUPITER_API_KEY: {
            status: jupiterKeyInput.trim() ? "CONNECTED" : "NOT_CONFIGURED",
            masked: jupiterKeyInput.trim() && jupiterKeyInput.length > 8 ? jupiterKeyInput.slice(0, 4) + "…" + jupiterKeyInput.slice(-4) : null,
          },
        }));
        setJupiterKeyInput("");
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setSavingJupiter(false);
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
        const name = value === "venice" ? "Venice" : value === "nanogpt" ? "NanoGPT" : "Inception";
        setMessage({ type: "success", text: `Chat provider set to ${name}.` });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    }
  };

  const handleSecurityTierChange = async (e) => {
    const value = String(e.target.value || "").trim();
    if (!["1", "2", "3", "4"].includes(value)) return;
    setMessage(null);
    setSavingTier(true);
    try {
      const res = await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "SECURITY_TIER", value }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig((c) => ({ ...(c || {}), securityTier: Number(value) }));
        setMessage({ type: "success", text: `Security tier set to Tier ${value}.` });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setSavingTier(false);
    }
  };

  const saveSwapPolicy = async (patch) => {
    setMessage(null);
    setSavingSwaps(true);
    try {
      // Persist policy keys in app-settings.json through /api/config.
      for (const [key, value] of Object.entries(patch)) {
        const res = await fetch(`${apiBase}/api/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Failed to save");
      }
      setMessage({ type: "success", text: "Swap policy saved." });
      refetchConfig();
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Request failed" });
    } finally {
      setSavingSwaps(false);
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
      { key: "HEARTBEAT_INTERVAL_SECONDS", value: envHeartbeatMs.trim() },
      { key: "WORKSPACE_DIR", value: envWorkspaceDir.trim() },
      { key: "DATA_DIR", value: envDataDir.trim() },
      { key: "SOLANA_RPC_PACE_MS", value: envSolanaRpcPaceMs.trim() },
      { key: "SOLANA_RPC_STAGGER_MS", value: envSolanaRpcStaggerMs.trim() },
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
  const securityTier = Number(config?.securityTier) || 1;
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
              <option value="nanogpt">NanoGPT (model below)</option>
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

            <div className="mt-4 pt-4 border-t border-[#2a2a30] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="nanogpt-model" className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  NanoGPT chat model
                </label>
                <SettingsStoreBadge settingKey="NANOGPT_MODEL" />
              </div>
              <p className="text-xs text-slate-500">
                List from this app:{" "}
                <code className="text-slate-400">GET /api/nanogpt/models</code> (proxies NanoGPT’s{" "}
                <a
                  href="https://docs.nano-gpt.com/api-reference/endpoint/models"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400/90 hover:text-emerald-300 underline"
                >
                  /api/v1/models
                </a>
                ). Save your API key first, then Refresh.
              </p>
              {!nanogptConnected ? (
                <p className="text-sm text-slate-500">Configure a NanoGPT API key above to load models.</p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <select
                      id="nanogpt-model"
                      value={currentNanogptModel}
                      onChange={(e) => handleSaveNanogptModel(e.target.value)}
                      disabled={nanogptModelsLoading && nanogptModelOptions.length === 0}
                      className="flex-1 min-w-0 rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    >
                      {nanogptModelOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.owned_by ? ` — ${m.owned_by}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => fetchNanogptModels()}
                      disabled={nanogptModelsLoading}
                      className="shrink-0 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 px-3 py-1.5 text-xs text-slate-200"
                    >
                      {nanogptModelsLoading ? "…" : "Refresh"}
                    </button>
                  </div>
                  {nanogptModelsError && <p className="text-xs text-amber-200/90">{nanogptModelsError}</p>}
                  <p className="text-xs text-slate-600 font-mono truncate" title={currentNanogptModel}>
                    Active: {currentNanogptModel}
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Jupiter API key</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  config?.JUPITER_API_KEY?.status === "CONNECTED" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-600/30 text-slate-400"
                }`}
              >
                {config?.JUPITER_API_KEY?.status === "CONNECTED" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                {config?.JUPITER_API_KEY?.status === "CONNECTED" ? "CONNECTED" : "NOT CONFIGURED"}
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-2">Required for Metis quote/swap API (used by sovereign swaps).</p>
            {config?.JUPITER_API_KEY?.masked && <p className="text-sm text-slate-500 mb-3">Current: {config.JUPITER_API_KEY.masked}</p>}
            <form onSubmit={handleSaveJupiterKey} className="space-y-3">
              <input
                type="password"
                value={jupiterKeyInput}
                onChange={(e) => setJupiterKeyInput(e.target.value)}
                placeholder="JUPITER_API_KEY"
                className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={savingJupiter}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-1.5 text-sm font-medium text-white transition"
              >
                {savingJupiter ? "Saving…" : "Save Jupiter key"}
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
            <p className="text-xs text-slate-500 mt-2 border-t border-[#2a2a30] pt-2">
              <span className="text-slate-400">Custom RPC URL</span> (e.g. PublicNode, Helius): use{" "}
              <span className="text-slate-300 font-medium">Environment (.env)</span> below →{" "}
              <span className="font-mono text-slate-400">SOLANA_RPC_URL</span> → Save environment.
            </p>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block mb-3">Security tier</span>
            <p className="text-sm text-slate-500 mb-3">
              Controls how autonomous and sovereign the agent is allowed to be. Tier 1 is the default.
            </p>
            <label className="text-xs text-slate-500 block mb-1">Active tier</label>
            <select
              value={String(securityTier)}
              onChange={handleSecurityTierChange}
              disabled={savingTier}
              className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
            >
              <option value="1">Tier 1 — Read-only (safest)</option>
              <option value="2">Tier 2 — Local authoring (files/docs), limited network</option>
              <option value="3">Tier 3 — Operator (exec + network), no funds movement</option>
              <option value="4">Tier 4 — Sovereign (full tools, including transfers)</option>
            </select>
            <div className="mt-3 space-y-2 text-xs text-slate-500">
              <p><span className="text-slate-400 font-medium">Tier 1:</span> Browse + read tools only. No exec, no writes, no cron, no HTTP POST, no transfers.</p>
              <p><span className="text-slate-400 font-medium">Tier 2:</span> Can write local files/docs and use cron. HTTP requests limited to GET. No exec, no transfers.</p>
              <p><span className="text-slate-400 font-medium">Tier 3:</span> Can run exec and make HTTP requests. Still blocks SOL/SPL transfers.</p>
              <p><span className="text-slate-400 font-medium">Tier 4:</span> Full tool access. Use only if you intend the agent to act autonomously with the wallet.</p>
            </div>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block mb-3">Swaps (Jupiter)</span>
            <p className="text-sm text-slate-500 mb-3">
              Sovereign swaps are locally signed with your app wallet. Preparing swap intents requires Tier 4 and swaps enabled.
            </p>

            <div className="flex items-center justify-between gap-3 mb-3">
              <label className="text-sm text-slate-300">Enable swaps</label>
              <button
                type="button"
                disabled={savingSwaps}
                onClick={() => {
                  const next = !swapsEnabled;
                  setSwapsEnabled(next);
                  saveSwapPolicy({ SWAPS_ENABLED: String(next) });
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                  swapsEnabled ? "bg-emerald-600 text-white" : "bg-white/10 text-slate-300 hover:bg-white/15 hover:text-slate-200"
                }`}
                title="SWAPS_ENABLED"
              >
                {swapsEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-amber-100 font-medium">Execution (sends transactions)</div>
                    <div className="text-xs text-amber-200/70 mt-0.5">
                      Keep disabled unless you intend to broadcast swaps. Use dry-run to test simulate/sign without sending.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingSwaps}
                    onClick={() => {
                      const next = !swapsExecutionEnabled;
                      setSwapsExecutionEnabled(next);
                      saveSwapPolicy({ SWAPS_EXECUTION_ENABLED: String(next) });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                      swapsExecutionEnabled ? "bg-amber-500 text-black" : "bg-white/10 text-slate-300 hover:bg-white/15 hover:text-slate-200"
                    }`}
                    title="SWAPS_EXECUTION_ENABLED"
                  >
                    {swapsExecutionEnabled ? "Execution ON" : "Execution OFF"}
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="text-sm text-slate-200">Dry-run (simulate only)</label>
                  <button
                    type="button"
                    disabled={savingSwaps}
                    onClick={() => {
                      const next = !swapsExecutionDryRun;
                      setSwapsExecutionDryRun(next);
                      saveSwapPolicy({ SWAPS_EXECUTION_DRY_RUN: String(next) });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                      swapsExecutionDryRun ? "bg-emerald-600 text-white" : "bg-white/10 text-slate-300 hover:bg-white/15 hover:text-slate-200"
                    }`}
                    title="SWAPS_EXECUTION_DRY_RUN"
                  >
                    {swapsExecutionDryRun ? "Dry-run ON" : "Dry-run OFF"}
                  </button>
                </div>
                <div className="mt-3">
                  <label className="text-xs text-slate-500 block mb-1">Max re-quote deviation (bps)</label>
                  <input
                    type="text"
                    value={swapsMaxRequoteDevBps}
                    onChange={(e) => setSwapsMaxRequoteDevBps(e.target.value)}
                    className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <button
                  type="button"
                  disabled={savingSwaps}
                  onClick={() =>
                    saveSwapPolicy({
                      SWAPS_MAX_REQUOTE_DEVIATION_BPS: String(swapsMaxRequoteDevBps || "150"),
                    })
                  }
                  className="mt-3 w-full rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 py-2 text-sm font-medium text-slate-200 transition"
                >
                  {savingSwaps ? "Saving…" : "Save execution checks"}
                </button>
              </div>
              <div className="rounded-lg border border-[#2a2a30] bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-100 font-medium">Autopilot (optional)</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      When enabled, the agent can auto-confirm swap intents that meet these limits. Auto-execute is a separate toggle.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingSwaps}
                    onClick={() => {
                      const next = !swapsAutopilotEnabled;
                      setSwapsAutopilotEnabled(next);
                      saveSwapPolicy({ SWAPS_AUTOPILOT_ENABLED: String(next) });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                      swapsAutopilotEnabled ? "bg-emerald-600 text-white" : "bg-white/10 text-slate-300 hover:bg-white/15 hover:text-slate-200"
                    }`}
                    title="SWAPS_AUTOPILOT_ENABLED"
                  >
                    {swapsAutopilotEnabled ? "Autopilot ON" : "Autopilot OFF"}
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="text-sm text-slate-200">Auto-execute (after auto-confirm)</label>
                  <button
                    type="button"
                    disabled={savingSwaps || !swapsAutopilotEnabled}
                    onClick={() => {
                      const next = !swapsAutopilotAutoExecute;
                      setSwapsAutopilotAutoExecute(next);
                      saveSwapPolicy({ SWAPS_AUTOPILOT_AUTO_EXECUTE: String(next) });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                      swapsAutopilotAutoExecute ? "bg-amber-500 text-black" : "bg-white/10 text-slate-300 hover:bg-white/15 hover:text-slate-200"
                    }`}
                    title="SWAPS_AUTOPILOT_AUTO_EXECUTE"
                  >
                    {swapsAutopilotAutoExecute ? "Auto-execute ON" : "Auto-execute OFF"}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Cooldown (seconds) <SettingsStoreBadge settingKey="SWAPS_COOLDOWN_SECONDS" />
                    </label>
                    <input
                      type="text"
                      value={swapsCooldownSeconds}
                      onChange={(e) => setSwapsCooldownSeconds(e.target.value)}
                      className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        Max swaps / hour <SettingsStoreBadge settingKey="SWAPS_MAX_SWAPS_PER_HOUR" />
                      </label>
                      <input
                        type="text"
                        value={swapsMaxPerHour}
                        onChange={(e) => setSwapsMaxPerHour(e.target.value)}
                        className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">
                        Max swaps / day <SettingsStoreBadge settingKey="SWAPS_MAX_SWAPS_PER_DAY" />
                      </label>
                      <input
                        type="text"
                        value={swapsMaxPerDay}
                        onChange={(e) => setSwapsMaxPerDay(e.target.value)}
                        className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Max daily SOL swap volume <SettingsStoreBadge settingKey="SWAPS_MAX_DAILY_SWAP_SOL_VOLUME" />
                    </label>
                    <input
                      type="text"
                      value={swapsMaxDailySol}
                      onChange={(e) => setSwapsMaxDailySol(e.target.value)}
                      className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={savingSwaps}
                  onClick={() =>
                    saveSwapPolicy({
                      SWAPS_COOLDOWN_SECONDS: String(swapsCooldownSeconds || "60"),
                      SWAPS_MAX_SWAPS_PER_HOUR: String(swapsMaxPerHour || "3"),
                      SWAPS_MAX_SWAPS_PER_DAY: String(swapsMaxPerDay || "10"),
                      SWAPS_MAX_DAILY_SWAP_SOL_VOLUME: String(swapsMaxDailySol || "0.2"),
                    })
                  }
                  className="mt-3 w-full rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 py-2 text-sm font-medium text-slate-200 transition"
                >
                  {savingSwaps ? "Saving…" : "Save autopilot limits"}
                </button>

                <p className="text-xs text-slate-500 mt-2">
                  Autopilot still respects allowlists, caps, re-quote checks, simulation, fee/compute bounds, and the execution kill-switch.
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  Max slippage (bps; 200 = 2%, 50 = 0.5%) <SettingsStoreBadge settingKey="SWAPS_MAX_SLIPPAGE_BPS" />
                </label>
                <input
                  type="text"
                  value={swapsMaxSlippageBps}
                  onChange={(e) => setSwapsMaxSlippageBps(e.target.value)}
                  placeholder="200"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  Max swap size (SOL) <SettingsStoreBadge settingKey="SWAPS_MAX_SWAP_SOL" />
                </label>
                <input
                  type="text"
                  value={swapsMaxSwapSol}
                  onChange={(e) => setSwapsMaxSwapSol(e.target.value)}
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  Max swap % of balance <SettingsStoreBadge settingKey="SWAPS_MAX_SWAP_PCT_BALANCE" />
                </label>
                <input
                  type="text"
                  value={swapsMaxSwapPct}
                  onChange={(e) => setSwapsMaxSwapPct(e.target.value)}
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <button
                type="button"
                disabled={savingSwaps}
                onClick={() =>
                  saveSwapPolicy({
                    SWAPS_MAX_SLIPPAGE_BPS: String(swapsMaxSlippageBps || "50"),
                    SWAPS_MAX_SWAP_SOL: String(swapsMaxSwapSol || "0.05"),
                    SWAPS_MAX_SWAP_PCT_BALANCE: String(swapsMaxSwapPct || "20"),
                  })
                }
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2 text-sm font-medium text-white transition"
              >
                {savingSwaps ? "Saving…" : "Save swap policy"}
              </button>
              <p className="text-xs text-slate-500">
                Defaults: input SOL and output USDC allowlisted. Execution is Tier 4 and gated by an explicit kill-switch.
              </p>
            </div>
          </section>

          <section className="rounded-xl bg-[#222228] border border-[#2a2a30] p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block mb-3">Environment</span>
            <p className="text-sm text-slate-500 mb-3">These keys are managed in <span className="font-mono text-slate-400">.env</span>. PORT/HOST apply after restart.</p>
            <p className="text-xs text-slate-500 mb-3">
              Policy/tuning keys like <span className="font-mono text-slate-400">SWAPS_*</span>,{" "}
              <span className="font-mono text-slate-400">SECURITY_TIER</span>, and{" "}
              <span className="font-mono text-slate-400">PASSPHRASE_BACKUP_ACKNOWLEDGED</span> are managed in{" "}
              <span className="font-mono text-slate-400">app-settings.json</span>.
            </p>
            <form onSubmit={handleSaveEnv} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  PORT <SettingsStoreBadge settingKey="PORT" />
                </label>
                <input
                  type="text"
                  value={envPort}
                  onChange={(e) => setEnvPort(e.target.value)}
                  placeholder="3333"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  HOST <SettingsStoreBadge settingKey="HOST" />
                </label>
                <input
                  type="text"
                  value={envHost}
                  onChange={(e) => setEnvHost(e.target.value)}
                  placeholder="0.0.0.0"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  SOLANA_RPC_URL <SettingsStoreBadge settingKey="SOLANA_RPC_URL" />
                </label>
                <input
                  type="text"
                  value={envSolanaRpc}
                  onChange={(e) => setEnvSolanaRpc(e.target.value)}
                  placeholder="https://api.mainnet-beta.solana.com"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  SOLANA_RPC_PACE_MS <SettingsStoreBadge settingKey="SOLANA_RPC_PACE_MS" />
                </label>
                <input
                  type="text"
                  value={envSolanaRpcPaceMs}
                  onChange={(e) => setEnvSolanaRpcPaceMs(e.target.value)}
                  placeholder="0 = off; try 150–300 on public RPC"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Min milliseconds between Solana-heavy tools (balances, treasury pool read/swap). Reduces 429 bursts.
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  SOLANA_RPC_STAGGER_MS <SettingsStoreBadge settingKey="SOLANA_RPC_STAGGER_MS" />
                </label>
                <input
                  type="text"
                  value={envSolanaRpcStaggerMs}
                  onChange={(e) => setEnvSolanaRpcStaggerMs(e.target.value)}
                  placeholder="0 = off; try 40–80 for treasury_pool_info on-chain path"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Delay between each RPC inside <span className="font-mono text-slate-400">treasury_pool_info</span> pool decode (max 500 ms capped).
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  HEARTBEAT_INTERVAL_SECONDS <SettingsStoreBadge settingKey="HEARTBEAT_INTERVAL_SECONDS" />
                </label>
                <input
                  type="text"
                  value={envHeartbeatMs}
                  onChange={(e) => setEnvHeartbeatMs(e.target.value)}
                  placeholder="1800 (30m) or leave empty to disable"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <p className="text-xs text-slate-500 mt-1">
                  While the Chat view is open, the app sends the default heartbeat user message on this interval so the agent follows <span className="font-mono text-slate-400">HEARTBEAT.md</span> (min 10s). Empty = off. Server still logs heap stats on the same interval when enabled. After changing this, switch to another screen (e.g. Wallet) and back to Chat to pick up a new interval without reloading.
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  WORKSPACE_DIR <SettingsStoreBadge settingKey="WORKSPACE_DIR" />
                </label>
                <input
                  type="text"
                  value={envWorkspaceDir}
                  onChange={(e) => setEnvWorkspaceDir(e.target.value)}
                  placeholder="Path to workspace"
                  className="w-full rounded-lg bg-[#1a1a1e] border border-[#2a2a30] px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  DATA_DIR <SettingsStoreBadge settingKey="DATA_DIR" />
                </label>
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
