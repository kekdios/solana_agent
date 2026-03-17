import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../store/chatStore";

const isUser = (role) => role === "user";

/** For display only: hide the embedded tool-results block so the bubble stays readable; full content is still sent to the API. */
function getDisplayContent(content, role) {
  if (!content || role !== "assistant") return content;
  const marker = "\n---\nTool results";
  const idx = content.indexOf(marker);
  if (idx === -1) return content;
  const main = content.slice(0, idx).trim();
  return main ? `${main}\n\n_Results from the tools above are available for follow-up questions (e.g. “summarize”)._` : content;
}

function MessageContent({ content, role }) {
  const displayContent = getDisplayContent(content, role);
  if (!displayContent) return null;
  const user = isUser(role);
  const base = user ? "text-white" : "text-slate-200";
  const link = user ? "text-white underline" : "text-emerald-400 hover:text-emerald-300 underline";
  const code = user ? "bg-white/20 px-1 rounded text-sm" : "bg-slate-800 px-1.5 py-0.5 rounded text-slate-200 text-sm";
  const pre = user ? "bg-white/15 rounded-lg p-3 overflow-x-auto text-sm" : "bg-[#0d0d0f] rounded-lg p-3 overflow-x-auto text-sm text-slate-300 border border-[#2a2a30]";
  const th = user ? "border-white/30" : "border-slate-600";
  const td = user ? "border-white/30" : "border-slate-600";
  return (
    <div className={`markdown-body ${base} text-sm [&_.markdown-body]:text-inherit`}>
      <ReactMarkdown
        remarkPlugins={[remarkBreaks, remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-1 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h3>,
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            return <code className={isBlock ? "text-sm" : code}>{children}</code>;
          },
          pre: ({ children }) => <pre className={`${pre} mb-2`}>{children}</pre>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-current opacity-80 pl-3 my-2">{children}</blockquote>,
          table: ({ children }) => <div className="overflow-x-auto my-2"><table className="min-w-full border-collapse">{children}</table></div>,
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th className={`border ${th} px-2 py-1 text-left font-semibold`}>{children}</th>,
          td: ({ children }) => <td className={`border ${td} px-2 py-1`}>{children}</td>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className={link}>{children}</a>,
        }}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  );
}

export default function ChatArea() {
  const messages = useChatStore((s) => s.messages);
  const loading = useChatStore((s) => s.loading);
  const error = useChatStore((s) => s.error);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    sendMessage(text);
  };

  const [copiedId, setCopiedId] = useState(null);
  const copyMessage = (content, id) => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(
      () => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      },
      () => {}
    );
  };

  const handleKeyDown = (e) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey) {
      // Shift+Enter: allow default (insert newline)
      return;
    }
    // Enter without Shift: submit
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    if (text === "/save" || text === "/history" || text === "/help") {
      sendMessage(text);
      setInput("");
      return;
    }
    handleSubmit(e);
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[#0d0d0f]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 py-12">
            <p className="text-sm">Send a message or use /save, /history, /help</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            {m.role === "assistant" && m.tool_results && m.tool_results.length > 0 && (
              <div
                className="max-w-[80%] rounded-xl border border-[#2a2a30] bg-[#0d0d0f]/80 px-3 py-2 text-xs text-slate-500"
                aria-label="Agent steps"
              >
                <span className="font-medium text-slate-400 uppercase tracking-wider">What the agent did</span>
                <ul className="mt-1.5 space-y-1">
                  {m.tool_results.map((tr, j) => (
                    <li key={j} className="flex items-center gap-2">
                      <span className="text-emerald-500/80" aria-hidden>✓</span>
                      <span className="font-mono text-slate-400">{tr.tool}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} w-full max-w-[80%]`}>
              <div
                className={`group relative rounded-2xl px-4 py-2.5 text-sm w-full ${
                  m.role === "user"
                    ? "bg-emerald-600/80 text-white"
                    : "bg-[#1a1a1e] border border-[#2a2a30] text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-xs opacity-80">
                    {m.role === "user" ? "You" : "Agent"}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyMessage(m.content || "", `msg-${i}`)}
                    className="p-1 rounded-md opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/50"
                    title="Copy message"
                    aria-label="Copy message"
                  >
                    {copiedId === `msg-${i}` ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m8 0h2a2 2 0 012 2v2m2 4a2 2 0 01-2 2h-2m-6-12h2a2 2 0 012 2v6a2 2 0 01-2 2h-2z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="break-words">
                  <MessageContent content={m.content} role={m.role} />
                </div>
              </div>
            </div>
          </div>
        ))}
        {error && (
          <div className="rounded-xl px-4 py-2.5 bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}
        {loading && (
          <div className="flex justify-start" aria-live="polite">
            <div className="thinking-indicator">
              <img src="/loading-animation.gif" alt="" width={24} height={24} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t border-[#1e1e24]">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message… (Shift+Enter for new line) (/save, /history, /help)"
            rows={1}
            className="flex-1 min-h-[42px] max-h-32 resize-y rounded-xl bg-[#1a1a1e] border border-[#2a2a30] px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-2 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
          >
            Send
          </button>
        </div>
      </form>
    </main>
  );
}
