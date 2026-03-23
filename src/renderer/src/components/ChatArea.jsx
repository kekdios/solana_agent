import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useChatStore, DEFAULT_HEARTBEAT_USER_PROMPT } from "../store/chatStore";

const isUser = (role) => role === "user";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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

function SwapIntentCard({ toolResults }) {
  const apiBase = useChatStore((s) => s.apiBase);
  const solanaNetwork = useChatStore((s) => s.solanaNetwork);
  const base = apiBase || "";
  const [stateByIntent, setStateByIntent] = useState({});
  const [autopilot, setAutopilot] = useState({ enabled: false, autoExecute: false });

  useEffect(() => {
    let cancelled = false;
    fetch(`${base}/api/config`)
      .then((r) => r.json())
      .then((data) => {
        const p = data?.config?.swapsPolicy;
        if (cancelled || !p) return;
        setAutopilot({ enabled: !!p.autopilotEnabled, autoExecute: !!p.autopilotAutoExecute });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [base]);

  const intents = (toolResults || [])
    .filter((tr) => tr?.tool === "jupiter_swap_prepare" && tr?.result && typeof tr.result === "object")
    .map((tr) => tr.result)
    .filter((r) => r?.ok && typeof r.intent_id === "string");

  if (intents.length === 0) return null;

  const confirm = async (intent_id) => {
    setStateByIntent((s) => ({ ...s, [intent_id]: { ...(s[intent_id] || {}), confirming: true, error: null } }));
    try {
      const res = await fetch(`${base}/api/jupiter/swap/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Confirm failed");
      setStateByIntent((s) => ({ ...s, [intent_id]: { confirming: false, confirmed: true, executing: false, executed: false, error: null, execResult: null } }));
    } catch (e) {
      setStateByIntent((s) => ({ ...s, [intent_id]: { confirming: false, confirmed: false, error: e.message || "Confirm failed" } }));
    }
  };

  /** One-click: confirm (if needed) then execute live. */
  const confirmAndExecute = async (intent_id) => {
    setStateByIntent((s) => ({ ...s, [intent_id]: { ...(s[intent_id] || {}), executing: true, error: null } }));
    try {
      const confRes = await fetch(`${base}/api/jupiter/swap/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id }),
      });
      const confData = await confRes.json();
      const alreadyConfirmed = !confData.ok && confData.error?.includes("not confirmable from status 'confirmed'");
      if (!confData.ok && !alreadyConfirmed) throw new Error(confData.error || "Confirm failed");
      const res = await fetch(`${base}/api/jupiter/swap/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Execute failed");
      // Fetch intent telemetry for audit.
      let telemetry = null;
      try {
        const ires = await fetch(`${base}/api/jupiter/swap/intent?intent_id=${encodeURIComponent(intent_id)}`);
        const idata = await ires.json();
        if (idata?.ok && idata.intent) telemetry = idata.intent;
      } catch (_) {}
      // Fetch post-swap balances for quick verification.
      let balances = null;
      try {
        const bres = await fetch(`${base}/api/solana-wallet/balance`);
        const bdata = await bres.json();
        if (bdata?.ok) balances = bdata;
      } catch (_) {}
      setStateByIntent((s) => ({
        ...s,
        [intent_id]: { ...(s[intent_id] || {}), executing: false, executed: true, error: null, execResult: data, telemetry },
      }));
      if (balances) {
        setStateByIntent((s) => ({
          ...s,
          [intent_id]: { ...(s[intent_id] || {}), balances },
        }));
      }
    } catch (e) {
      setStateByIntent((s) => ({ ...s, [intent_id]: { ...(s[intent_id] || {}), executing: false, executed: false, error: e.message || "Execute failed" } }));
    }
  };

  const mintLabel = (m) => (m === SOL_MINT ? "SOL" : m === USDC_MINT ? "USDC" : m);
  const solscanTxUrl = (sig) => {
    if (!sig) return null;
    const baseUrl = `https://solscan.io/tx/${encodeURIComponent(sig)}`;
    if (solanaNetwork === "devnet") return `${baseUrl}?cluster=devnet`;
    if (solanaNetwork === "testnet") return `${baseUrl}?cluster=testnet`;
    return baseUrl;
  };

  return (
    <div className="max-w-[80%] rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium uppercase tracking-wider text-amber-200/90">Swap intent requires confirmation</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            autopilot.enabled ? (autopilot.autoExecute ? "bg-amber-500/20 text-amber-200" : "bg-emerald-500/15 text-emerald-200") : "bg-white/5 text-slate-300"
          }`}
          title="Autopilot status"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              autopilot.enabled ? (autopilot.autoExecute ? "bg-amber-300" : "bg-emerald-300") : "bg-slate-500"
            }`}
          />
          {autopilot.enabled ? (autopilot.autoExecute ? "Autopilot: Auto-exec" : "Autopilot: Confirm") : "Autopilot: Off"}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {intents.map((it) => {
          const st = stateByIntent[it.intent_id] || {};
          return (
            <div key={it.intent_id} className="rounded-lg border border-amber-500/20 bg-black/20 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-amber-100 break-all">{it.intent_id}</div>
                  <div className="mt-1 text-amber-200/80">
                    {mintLabel(it.inputMint)} → {mintLabel(it.outputMint)} • in: <span className="font-mono">{it.inAmount}</span> • min out:{" "}
                    <span className="font-mono">{it.minOutAmount}</span> • slippage: <span className="font-mono">{it.slippageBps}</span> bps
                  </div>
                  <div className="mt-1 text-amber-200/70">
                    Expires: <span className="font-mono">{it.expires_at}</span>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={st.executing || st.executed}
                    onClick={() => confirmAndExecute(it.intent_id)}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition shadow-sm"
                    title="Confirm and execute this swap (confirm + broadcast in one click)"
                  >
                    {st.executed ? "Executed" : st.executing ? "Executing…" : "Execute"}
                  </button>
                </div>
              </div>
              {st.error && <div className="mt-2 text-xs text-red-200">Error: {st.error}</div>}
              {!st.executed && !st.executing && (
                <div className="mt-2 text-xs text-amber-200/70">
                  One click: confirm + broadcast (respects Settings → dry-run).
                </div>
              )}
              {st.execResult?.dry_run && st.execResult?.status === "simulated" && (
                <div className="mt-2 text-xs text-emerald-200/80">Dry-run OK: simulated successfully (no broadcast).</div>
              )}
              {st.telemetry && (
                <div className="mt-2 text-xs text-slate-200/80">
                  <div>
                    Telemetry:{" "}
                    {st.telemetry.fee_lamports != null ? (
                      <span className="font-mono">{st.telemetry.fee_lamports} lamports fee</span>
                    ) : (
                      <span className="font-mono">fee —</span>
                    )}
                    {" • "}
                    {st.telemetry.units_consumed != null ? (
                      <span className="font-mono">{st.telemetry.units_consumed} CU</span>
                    ) : (
                      <span className="font-mono">CU —</span>
                    )}
                  </div>
                  {Array.isArray(st.telemetry.program_ids) && st.telemetry.program_ids.length > 0 && (
                    <div className="mt-1">
                      Programs: <span className="font-mono break-all">{st.telemetry.program_ids.join(", ")}</span>
                    </div>
                  )}
                </div>
              )}
              {st.execResult?.signature && (
                <div className="mt-2 text-xs text-emerald-200/80">
                  Broadcast signature: <span className="font-mono break-all">{st.execResult.signature}</span>
                </div>
              )}
              {st.execResult?.signature && (
                <div className="mt-2 text-xs">
                  <a
                    href={solscanTxUrl(st.execResult.signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-300 hover:text-emerald-200 underline"
                  >
                    View on Solscan
                  </a>
                </div>
              )}
              {st.balances?.ok && (
                <div className="mt-2 text-xs text-amber-200/80">
                  Post-swap balances:{" "}
                  <span className="font-mono">{Number(st.balances.sol ?? 0).toFixed(6)} SOL</span>
                  {" • "}
                  <span className="font-mono">
                    {(() => {
                      const usdc = (st.balances.tokens || []).find((t) => t.mint === USDC_MINT);
                      const amt = usdc?.amount;
                      return amt == null ? "USDC: —" : `USDC: ${amt}`;
                    })()}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ChatArea() {
  const messages = useChatStore((s) => s.messages);
  const loading = useChatStore((s) => s.loading);
  const error = useChatStore((s) => s.error);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopChat = useChatStore((s) => s.stopChat);
  const apiBase = useChatStore((s) => s.apiBase);
  const solanaNetwork = useChatStore((s) => s.solanaNetwork);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const [latestSwapState, setLatestSwapState] = useState({
    executing: false,
    executed: false,
    error: null,
    signature: null,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * When Settings → HEARTBEAT_INTERVAL_SECONDS is set, periodically POST the default heartbeat
   * user prompt so the agent runs HEARTBEAT.md checks in this conversation (while Chat is open).
   * Server-side startHeartbeat still only logs memory to the console.
   * (V3: explicit “content of heartbeat.md” user messages are answered from disk in server.js before the LLM.)
   */
  useEffect(() => {
    // Match sendMessage: apiBase is often "" (App resets it); relative `/api/config` works on same origin.
    const base = apiBase || "";

    let cancelled = false;
    let intervalId = null;

    (async () => {
      try {
        const res = await fetch(`${base}/api/config`);
        const data = await res.json();
        if (cancelled) return;
        const raw = data?.config?.env?.HEARTBEAT_INTERVAL_SECONDS ?? data?.config?.env?.HEARTBEAT_INTERVAL_MS;
        const sec = Number(raw);
        const ms = sec * 1000;
        if (!Number.isFinite(ms) || ms <= 0) return;

        const safeMs = Math.max(ms, 10_000);

        const tick = () => {
          if (cancelled) return;
          if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
          const st = useChatStore.getState();
          if (st.loading) return;
          void st.sendMessage(DEFAULT_HEARTBEAT_USER_PROMPT);
        };

        intervalId = setInterval(tick, safeMs);
      } catch {
        // ignore — heartbeat is optional
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId != null) clearInterval(intervalId);
    };
  }, [apiBase]);

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

  const executeLatestSwap = useCallback(async () => {
    const base = apiBase || "";
    if (!base || latestSwapState.executing) return;

    const allPrepareResults = [];
    for (const m of messages) {
      if (m.role !== "assistant" || !Array.isArray(m.tool_results)) continue;
      for (const tr of m.tool_results) {
        if (tr?.tool === "jupiter_swap_prepare" && tr?.result && typeof tr.result === "object" && tr.result?.ok && typeof tr.result.intent_id === "string") {
          allPrepareResults.push(tr.result);
        }
      }
    }
    const latest = allPrepareResults.length > 0 ? allPrepareResults[allPrepareResults.length - 1] : null;
    if (!latest) {
      setLatestSwapState((s) => ({ ...s, error: "No prepared swap found in this chat." }));
      return;
    }

    const intentId = latest.intent_id;
    setLatestSwapState((s) => ({
      ...s,
      executing: true,
      executed: false,
      error: null,
      signature: null,
    }));

    try {
      const confRes = await fetch(`${base}/api/jupiter/swap/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: intentId }),
      });
      const confData = await confRes.json();
      const alreadyConfirmed = !confData.ok && confData.error?.includes("not confirmable from status 'confirmed'");
      if (!confData.ok && !alreadyConfirmed) throw new Error(confData.error || "Confirm failed");

      const execRes = await fetch(`${base}/api/jupiter/swap/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: intentId }),
      });
      const execData = await execRes.json();
      if (!execData.ok) throw new Error(execData.error || "Execute failed");

      const sig = execData.signature || execData.VERIFIED_SIGNATURE || null;

      setLatestSwapState((s) => ({
        ...s,
        executing: false,
        executed: true,
        error: null,
        signature: sig,
      }));
    } catch (e) {
      setLatestSwapState((s) => ({
        ...s,
        executing: false,
        executed: false,
        error: e.message || "Execute failed",
      }));
    }
  }, [apiBase, messages, latestSwapState.executing]);

  const solscanTxUrl = (sig) => {
    if (!sig) return null;
    const base = `https://solscan.io/tx/${encodeURIComponent(sig)}`;
    if (solanaNetwork === "devnet") return `${base}?cluster=devnet`;
    if (solanaNetwork === "testnet") return `${base}?cluster=testnet`;
    return base;
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
      <div className="px-4 pt-2 border-t border-[#1e1e24] space-y-3">
        {(() => {
          const allPrepareResults = [];
          for (const m of messages) {
            if (m.role !== "assistant" || !Array.isArray(m.tool_results)) continue;
            for (const tr of m.tool_results) {
              if (tr?.tool === "jupiter_swap_prepare" && tr?.result && typeof tr.result === "object" && tr.result?.ok && typeof tr.result.intent_id === "string") {
                allPrepareResults.push(tr.result);
              }
            }
          }
          const latest = allPrepareResults.length > 0 ? allPrepareResults[allPrepareResults.length - 1] : null;
          if (!latest) return null;
          return (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <div className="font-medium uppercase tracking-wider text-amber-200/90 mb-1">Latest prepared swap</div>
              <div className="font-mono break-all text-amber-100">{latest.intent_id}</div>
              <div className="mt-1 text-amber-200/80">
                SOL → USDC • in: <span className="font-mono">{latest.inAmount}</span> • min out:{" "}
                <span className="font-mono">{latest.minOutAmount}</span> • slippage: <span className="font-mono">{latest.slippageBps}</span> bps
              </div>
              <div className="mt-1 text-amber-200/70">
                Expires: <span className="font-mono">{latest.expires_at}</span>
              </div>
            </div>
          );
        })()}
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message… (Shift+Enter for new line) (/save, /history, /help)"
            rows={1}
            className="w-full min-h-[42px] max-h-32 resize-y rounded-xl bg-[#1a1a1e] border border-[#2a2a30] px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-sm"
            disabled={loading}
          />
          <div className="flex gap-2 items-center justify-end">
            {loading ? (
              <button
                type="button"
                onClick={stopChat}
                className="px-2 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-2 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
              >
                Send
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
