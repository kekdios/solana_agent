import { useState, useEffect } from "react";
import { useChatStore } from "../store/chatStore";

export default function Sidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const newChat = useChatStore((s) => s.newChat);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const sessions = useChatStore((s) => s.sessions);
  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const loadSession = useChatStore((s) => s.loadSession);
  const saveSession = useChatStore((s) => s.saveSession);
  const showHelp = useChatStore((s) => s.showHelp);
  const restartServer = useChatStore((s) => s.restartServer);
  const setView = useChatStore((s) => s.setView);
  const view = useChatStore((s) => s.view);
  const sovereignTx = useChatStore((s) => s.sovereignTx);
  const latestSwapState = useChatStore((s) => s.latestSwapState);
  const executeLatestPreparedSwap = useChatStore((s) => s.executeLatestPreparedSwap);
  const solanaNetwork = useChatStore((s) => s.solanaNetwork);

  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (historyOpen) fetchSessions();
  }, [historyOpen, fetchSessions]);

  const handleLoadSession = (id) => {
    loadSession(id);
    setHistoryOpen(false);
  };

  const navItemClass =
    "w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm text-left transition text-slate-300 hover:bg-white/5 hover:text-slate-100";

  const iconClass = "shrink-0 w-[18px] h-[18px] text-current";

  const versionDate = (() => {
    const d = new Date();
    const day = d.getDate();
    const month = d.toLocaleString("en-US", { month: "short" });
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  })();
  const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0.0";

  return (
    <aside className="w-60 shrink-0 flex flex-col border-r border-[#1e1e24] bg-[#121214]">
      <nav className="p-2 space-y-0.5 border-b border-[#1e1e24]">
        <button
          type="button"
          onClick={() => setView("quickStart")}
          className={`${navItemClass} ${view === "quickStart" ? "bg-emerald-500/20 text-emerald-400" : ""}`}
          title="Quick start guide"
        >
          <span className={iconClass} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          Quick start
        </button>
        <button
          type="button"
          onClick={() => setView("chat")}
          className={`${navItemClass} ${view === "chat" ? "bg-emerald-500/20 text-emerald-400" : ""}`}
          title="Back to chat"
        >
          <span className={iconClass} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          Back To Chat
        </button>
        <button
          type="button"
          onClick={() => { newChat(); fetchConversations(); setView("chat"); }}
          className={navItemClass}
          title="New chat"
        >
          <span className={iconClass} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </span>
          New chat
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen(!historyOpen)}
          className={navItemClass}
          title="History"
        >
          <span className={iconClass} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
          History
        </button>
        <button
          type="button"
          onClick={() => setView("allMessages")}
          className={`${navItemClass} ${view === "allMessages" ? "bg-emerald-500/20 text-emerald-400" : ""}`}
          title="All messages (newest first)"
        >
          <span className={iconClass} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </span>
          All Messages
        </button>
        <button
          type="button"
          onClick={() => { saveSession(); }}
          className={navItemClass}
          title="Save session"
        >
          <span className={iconClass} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </span>
          Save
        </button>
        <button
          type="button"
          onClick={() => restartServer()}
          className={navItemClass}
          title="Restart server"
        >
          <span className={iconClass} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </span>
          Restart
        </button>
        <button
          type="button"
          onClick={() => setView("wallet")}
          className={`${navItemClass} ${view === "wallet" ? "bg-emerald-500/20 text-emerald-400" : ""}`}
          title="Wallet"
        >
          <span className={iconClass} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </span>
          Wallet
        </button>
        <button
          type="button"
          onClick={() => setView("nanogpt")}
          className={`${navItemClass} ${view === "nanogpt" ? "bg-emerald-500/20 text-emerald-400" : ""}`}
          title="Nano-GPT balance and deposits"
        >
          <span className={`${iconClass} flex items-center justify-center text-base font-bold`} aria-hidden>
            $
          </span>
          Nano-GPT
        </button>
        <button
          type="button"
          onClick={() => showHelp()}
          className={navItemClass}
          title="Help"
        >
          <span className={iconClass} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          Help
        </button>
      </nav>
      {historyOpen && (
        <div className="flex-1 overflow-y-auto p-2 border-b border-[#1e1e24]">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider px-2 mb-2">Saved sessions</p>
          {sessions.length === 0 ? (
            <p className="text-slate-500 text-xs px-2">No saved sessions</p>
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleLoadSession(s.id)}
                    className="w-full text-left px-2 py-1 rounded-lg text-sm text-slate-300 hover:bg-white/5 hover:text-slate-100 truncate"
                  >
                    {s.name || s.id}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider px-2 mb-2">Conversations</p>
        {conversations.length === 0 && !historyOpen && (
          <p className="text-slate-500 text-xs px-3 py-2">No conversations yet</p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => selectConversation(c.id)}
            className={`w-full text-left px-2 py-1.5 rounded-xl text-sm block mb-0.5 transition ${
              currentConversationId === c.id
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            Chat {c.id}
          </button>
        ))}
      </div>
      {sovereignTx && (
        <div className="shrink-0 px-3 py-2 border-t border-[#1e1e24] bg-black/30 space-y-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Sovereign transaction</p>
          <p className="text-[11px] text-slate-300 break-words">
            Stage: <span className="font-mono">{sovereignTx.stage || (sovereignTx.ok ? "execute" : "unknown")}</span>
          </p>
          {sovereignTx.intent_id && (
            <p className="text-[11px] text-slate-300 break-all">
              Intent: <span className="font-mono">{sovereignTx.intent_id}</span>
            </p>
          )}
          {sovereignTx.execute?.signature && (
            <p className="text-[11px] text-emerald-300 break-all">
              Sig: <span className="font-mono">{sovereignTx.execute.signature}</span>
            </p>
          )}
          {sovereignTx.execute?.SOLSCAN_URL && (
            <a
              href={sovereignTx.execute.SOLSCAN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-emerald-300 hover:text-emerald-200 underline"
            >
              View on Solscan
            </a>
          )}
          {!sovereignTx.ok && sovereignTx.error && (
            <p className="text-[11px] text-red-300 break-words">
              Error: {sovereignTx.error}
            </p>
          )}
          <button
            type="button"
            onClick={executeLatestPreparedSwap}
            disabled={latestSwapState.executing || latestSwapState.executed}
            className="mt-2 w-full px-2 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-xs font-medium transition"
          >
            {latestSwapState.executing ? "Executing…" : latestSwapState.executed ? "Executed" : "Execute Swap"}
          </button>
          {latestSwapState.signature && (
            <a
              href={`https://solscan.io/tx/${encodeURIComponent(latestSwapState.signature)}${
                solanaNetwork === "devnet" ? "?cluster=devnet" : solanaNetwork === "testnet" ? "?cluster=testnet" : ""
              }`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[11px] text-emerald-300 hover:text-emerald-200 underline mt-1"
            >
              View latest swap on Solscan
            </a>
          )}
          {latestSwapState.error && (
            <p className="text-[11px] text-red-300 break-words mt-1">
              Swap error: {latestSwapState.error}
            </p>
          )}
        </div>
      )}
      <div className="shrink-0 px-3 py-2 border-t border-[#1e1e24] space-y-1">
        <a
          href="https://solanaagent.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-500 hover:text-emerald-400 transition block"
          title="Solana Agent website"
        >
          solanaagent.app
        </a>
        <p className="text-xs text-slate-500 font-mono" title="App version">
          V {appVersion} - {versionDate}
        </p>
      </div>
    </aside>
  );
}
