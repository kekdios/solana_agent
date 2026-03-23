import { useEffect, useState } from "react";
import { useChatStore } from "./store/chatStore";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import QuickStartPage from "./components/QuickStartPage";
import WalletPage from "./components/WalletPage";
import AllMessagesPage from "./components/AllMessagesPage";
import NanoGptPage from "./components/NanoGptPage";
import NostrPage from "./components/NostrPage";
import Settings from "./components/Settings";

function formatTokens(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function App() {
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const setApiBase = useChatStore((s) => s.setApiBase);
  const fetchUsageTotal = useChatStore((s) => s.fetchUsageTotal);
  const fetchSolanaRpcStatus = useChatStore((s) => s.fetchSolanaRpcStatus);
  const fetchNanogptBalance = useChatStore((s) => s.fetchNanogptBalance);
  const usageTotal = useChatStore((s) => s.usageTotal);
  const sessionTokenTotal = useChatStore((s) => s.sessionTokenTotal);
  const nanogptBalance = useChatStore((s) => s.nanogptBalance);
  const solanaNetwork = useChatStore((s) => s.solanaNetwork);
  const solanaRpcConnected = useChatStore((s) => s.solanaRpcConnected);
  const view = useChatStore((s) => s.view);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.title = "Solana Agent V3";
    setApiBase("");
    fetchConversations();
    fetchUsageTotal();
    fetchSolanaRpcStatus();
    fetchNanogptBalance();
  }, [fetchConversations, setApiBase, fetchUsageTotal, fetchSolanaRpcStatus, fetchNanogptBalance]);

  const totalTokens = usageTotal?.total_tokens ?? 0;
  const hasTokens = totalTokens > 0 || sessionTokenTotal > 0;

  return (
    <div className="flex h-full flex-col bg-[#0d0d0f] text-slate-200">
      <header className="shrink-0 flex items-center justify-between h-14 px-4 border-b border-[#1e1e24] bg-[#121214]">
        <div className="flex items-center gap-3">
          <img
            src="/solanaagent_rec.png"
            alt="Solana Agent"
            className="h-8 w-auto max-w-[180px] object-contain"
          />
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-slate-400 bg-white/5"
            title={solanaRpcConnected === true ? "RPC connected" : solanaRpcConnected === false ? "RPC not connected" : "RPC status unknown"}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                solanaRpcConnected === true
                  ? "bg-emerald-400"
                  : solanaRpcConnected === false
                  ? "bg-red-400"
                  : "bg-slate-500"
              }`}
            />
            {solanaNetwork.charAt(0).toUpperCase() + solanaNetwork.slice(1)}
          </span>
        </div>
        <span className="text-sm text-slate-400 tabular-nums flex items-center gap-4" title="Token usage and NanoGPT balance">
          {hasTokens ? (
            <>
              Tokens: All-time <strong className="text-slate-200 font-semibold">{formatTokens(totalTokens)}</strong>
              {sessionTokenTotal > 0 && (
                <>
                  {" "}
                  · Session <strong className="text-slate-200 font-semibold">{formatTokens(sessionTokenTotal)}</strong>
                </>
              )}
            </>
          ) : (
            "Tokens: —"
          )}
          {nanogptBalance != null ? (
            <span className="text-slate-400" title="NanoGPT account balance (refreshed after each reply)">
              Balance: <strong className="text-slate-200 font-semibold">${Number(nanogptBalance.usd_balance ?? 0).toFixed(2)}</strong>
              {nanogptBalance.nano_balance != null && Number(nanogptBalance.nano_balance) > 0 && (
                <> · Nano <strong className="text-slate-200 font-semibold">{nanogptBalance.nano_balance}</strong></>
              )}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          aria-label="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        {view === "quickStart" ? (
          <QuickStartPage />
        ) : view === "wallet" ? (
          <WalletPage onOpenSettings={() => setSettingsOpen(true)} />
        ) : view === "nostr" ? (
          <NostrPage />
        ) : view === "allMessages" ? (
          <AllMessagesPage />
        ) : view === "nanogpt" ? (
          <NanoGptPage />
        ) : (
          <ChatArea />
        )}
      </div>
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default App;
