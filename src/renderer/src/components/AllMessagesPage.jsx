import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chatStore";

const PAGE_SIZE = 50;
const CONTENT_PREVIEW_LEN = 120;

function formatTime(serverTs) {
  if (serverTs == null) return "—";
  const ms = Number(serverTs);
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function truncate(str, maxLen) {
  if (typeof str !== "string") return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

export default function AllMessagesPage() {
  const apiBase = useChatStore((s) => s.apiBase) || "";
  const setView = useChatStore((s) => s.setView);
  const selectConversation = useChatStore((s) => s.selectConversation);

  const [messages, setMessages] = useState([]);
  const [oldestId, setOldestId] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [summarizeN, setSummarizeN] = useState(20);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryModalText, setSummaryModalText] = useState(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/history?limit=${PAGE_SIZE}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load messages");
        setMessages([]);
        return;
      }
      setMessages(data.messages || []);
      setOldestId(data.oldest_id ?? null);
      setHasMore(!!data.has_more);
    } catch (e) {
      setError(e.message || "Request failed");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const loadMore = useCallback(async () => {
    if (!oldestId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`${apiBase}/api/history?before_id=${oldestId}&limit=${PAGE_SIZE}`);
      const data = await res.json();
      if (!res.ok) return;
      const list = data.messages || [];
      if (list.length) {
        setMessages((prev) => [...prev, ...list]);
        setOldestId(data.oldest_id ?? null);
        setHasMore(!!data.has_more);
      } else {
        setHasMore(false);
      }
    } catch (_) {}
    finally {
      setLoadingMore(false);
    }
  }, [apiBase, oldestId, hasMore, loadingMore]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const handleOpenConversation = (conversationId) => {
    selectConversation(conversationId);
    setView("chat");
  };

  const handleSummarize = async () => {
    const n = Math.min(200, Math.max(1, Number(summarizeN) || 20));
    setSummarizing(true);
    try {
      const res = await fetch(`${apiBase}/api/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last_n: n, global: true }),
      });
      const data = await res.json().catch(() => ({}));
      const text = data.error ? "Error: " + data.error : (data.summary || "(No summary.)");
      setSummaryModalText(text);
    } catch (e) {
      setSummaryModalText("Error: " + e.message);
    } finally {
      setSummarizing(false);
    }
  };

  const handleCopySummary = async () => {
    if (!summaryModalText) return;
    try {
      await navigator.clipboard.writeText(summaryModalText);
    } catch (_) {}
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d0d0f]">
      <div className="shrink-0 flex flex-col gap-3 px-4 py-3 border-b border-[#1e1e24]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setView("chat")}
              className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-white/5 transition"
              title="Back to chat"
            >
              ← Back to chat
            </button>
            <h2 className="text-base font-semibold text-slate-200">All messages</h2>
          </div>
          <p className="text-xs text-slate-500">Newest first. Scroll to load more.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="browse-summarize-n" className="text-sm text-slate-400">
            Summarize last
          </label>
          <input
            id="browse-summarize-n"
            type="number"
            min={1}
            max={200}
            value={summarizeN}
            onChange={(e) => setSummarizeN(Number(e.target.value) || 20)}
            className="w-16 rounded-lg border border-[#2a2a30] bg-[#121214] px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
          <span className="text-sm text-slate-400">messages</span>
          <button
            type="button"
            onClick={handleSummarize}
            disabled={summarizing}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/15 disabled:opacity-50 transition"
          >
            {summarizing ? "…" : "Summarize"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#2a2a30] bg-[#121214]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#2a2a30]">
                  <th className="text-left py-2 px-3 font-semibold text-slate-400">Convo</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-400">Role</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-400">Time</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-400">Content</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-[#1e1e24] hover:bg-white/[0.03] transition"
                  >
                    <td className="py-2 px-3 align-top">
                      <button
                        type="button"
                        onClick={() => handleOpenConversation(m.conversation_id)}
                        className="rounded px-1.5 py-0.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition"
                        title={`Open conversation ${m.conversation_id}`}
                      >
                        Convo {m.conversation_id}
                      </button>
                    </td>
                    <td className="py-2 px-3 align-top text-slate-300 whitespace-nowrap">
                      {m.role}
                    </td>
                    <td className="py-2 px-3 align-top text-slate-500 whitespace-nowrap text-xs">
                      {formatTime(m.server_ts)}
                    </td>
                    <td className="py-2 px-3 align-top text-slate-300 max-w-md">
                      <span title={m.content || ""}>
                        {truncate((m.content || "").replace(/\s+/g, " "), CONTENT_PREVIEW_LEN)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div className="p-3 border-t border-[#2a2a30]">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full rounded-lg py-2 text-sm font-medium text-slate-300 bg-white/5 hover:bg-white/10 disabled:opacity-50 transition"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {summaryModalText != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSummaryModalText(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-modal-title"
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-[#1a1a1e] border border-[#2a2a30] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a30]">
              <h2 id="summary-modal-title" className="text-lg font-semibold text-white">
                Session summary
              </h2>
              <button
                type="button"
                onClick={() => setSummaryModalText(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-500 mb-2">Copy and paste into the chat as context.</p>
              <textarea
                readOnly
                rows={12}
                value={summaryModalText}
                className="w-full rounded-lg border border-[#2a2a30] bg-[#0d0d0f] px-3 py-2 text-sm text-slate-300 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryModalText(null)}
                  className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-sm font-medium text-slate-200 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
