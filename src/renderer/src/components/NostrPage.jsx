import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../store/chatStore";

const PAGE_SIZE = 10;

function formatIso(ts) {
  if (ts == null) return "—";
  const n = Number(ts);
  if (!Number.isFinite(n)) return "—";
  return new Date(n * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function shortHex(hex, head = 8, tail = 6) {
  const s = String(hex || "");
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** Same markdown treatment as assistant bubbles in ChatArea — full text, readable. */
function NostrPostMarkdown({ content }) {
  const c = content ?? "";
  if (!c.trim()) {
    return <p className="text-slate-500 italic text-sm">(empty)</p>;
  }
  const base = "text-slate-200";
  const link = "text-emerald-400 hover:text-emerald-300 underline break-all";
  const code = "bg-slate-800 px-1.5 py-0.5 rounded text-slate-200 text-sm";
  const pre = "bg-[#0d0d0f] rounded-lg p-3 overflow-x-auto text-sm text-slate-300 border border-[#2a2a30]";
  return (
    <div className={`markdown-body ${base} text-sm leading-relaxed [&_.markdown-body]:text-inherit`}>
      <ReactMarkdown
        remarkPlugins={[remarkBreaks, remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
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
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-emerald-500/40 opacity-90 pl-3 my-2">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 max-w-full">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th className="border border-slate-600 px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-slate-600 px-2 py-1 break-words">{children}</td>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
              {children}
            </a>
          ),
        }}
      >
        {c}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Paginated relay-backed panel: page 0 = newest; page N+1 uses `until` from page N response.
 * Cache is kept in a ref so async fetches always read the latest cursors.
 */
function usePagedNostrTable(base, path, queryExtras = "") {
  const [page, setPage] = useState(0);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cacheRef = useRef({});

  const bump = () => setTick((t) => t + 1);

  const getRow = (i) => cacheRef.current[i];

  const fetchPage = useCallback(
    async (pageIndex, { force } = {}) => {
      if (!force && getRow(pageIndex)) return getRow(pageIndex);

      let until;
      if (pageIndex > 0) {
        const prev = getRow(pageIndex - 1);
        if (!prev || prev.next_until == null) {
          setError("Cannot load next page (no older cursor).");
          return null;
        }
        until = prev.next_until;
      }

      const params = new URLSearchParams(`limit=${PAGE_SIZE}`);
      if (queryExtras) {
        for (const [k, v] of new URLSearchParams(queryExtras)) params.set(k, v);
      }
      if (until != null) params.set("until", String(until));

      const res = await fetch(`${base}${path}?${params}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || data.code || `Request failed (${res.status})`);
        return null;
      }

      setError(null);
      const posts = Array.isArray(data.posts) ? data.posts : [];
      const row = {
        posts,
        next_until: data.next_until != null ? data.next_until : null,
      };
      cacheRef.current = { ...cacheRef.current, [pageIndex]: row };
      bump();
      return row;
    },
    [base, path, queryExtras]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPage(0);
    cacheRef.current = {};
    bump();
    try {
      await fetchPage(0, { force: true });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const goNext = useCallback(async () => {
    const next = page + 1;
    setLoading(true);
    try {
      const row = await fetchPage(next, { force: false });
      if (row) setPage(next);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchPage, page]);

  const goPrev = useCallback(() => {
    if (page <= 0) return;
    setPage((p) => Math.max(0, p - 1));
  }, [page]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      cacheRef.current = {};
      bump();
      try {
        await fetchPage(0, { force: true });
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, path, queryExtras, fetchPage]);

  const current = getRow(page);
  const rows = current?.posts || [];
  const canNext = !!(current && current.next_until != null);
  const canPrev = page > 0;

  return {
    page,
    rows,
    loading,
    error,
    refresh,
    goNext,
    goPrev,
    canNext,
    canPrev,
    tick,
  };
}

function PostsChatPanel({
  title,
  subtitle,
  rows,
  loading,
  error,
  page,
  onRefresh,
  onPrev,
  onNext,
  canPrev,
  canNext,
  variant,
}) {
  const bubble =
    variant === "agent"
      ? "bg-[#141a18] border-emerald-500/25"
      : "bg-[#1a1a1e] border-[#2a2a30]";

  return (
    <section className="rounded-xl border border-[#1e1e24] bg-[#121214] flex flex-col min-h-0 min-w-0 max-h-[calc(100vh-12rem)] xl:max-h-[calc(100vh-10rem)]">
      <div className="shrink-0 px-3 py-2 border-b border-[#1e1e24] flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="shrink-0 px-2.5 py-1 rounded-lg text-xs bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-50"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
        {loading && rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No posts.</p>
        ) : (
          rows.map((p, i) => {
            const n = page * PAGE_SIZE + i + 1;
            const authorLine =
              variant === "feed" && p.pubkey
                ? `Author ${shortHex(p.pubkey)}`
                : variant === "agent"
                  ? "Agent"
                  : "Post";

            return (
              <article
                key={p.id}
                className={`rounded-2xl border px-4 py-3 shadow-sm ${bubble}`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-400 tabular-nums">#{n}</span>
                  <time className="text-slate-500" dateTime={p.created_at ? new Date(Number(p.created_at) * 1000).toISOString() : undefined}>
                    {formatIso(p.created_at)}
                  </time>
                  <span className="text-slate-600">·</span>
                  <span className="font-mono text-[11px] text-slate-500 truncate max-w-[140px]" title={p.pubkey}>
                    {authorLine}
                  </span>
                  <a
                    href={`https://nostr.band/e/${encodeURIComponent(p.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto font-mono text-emerald-400/90 hover:text-emerald-300 shrink-0"
                    title={p.id}
                  >
                    {shortHex(p.id, 6, 4)}
                  </a>
                </div>
                <div className="break-words min-w-0">
                  <NostrPostMarkdown content={p.content} />
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="shrink-0 px-3 py-2 border-t border-[#1e1e24] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev || loading}
          className="px-2.5 py-1 rounded-lg text-xs bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-40"
        >
          Prev
        </button>
        <span className="text-xs text-slate-500">Page {page + 1}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext || loading}
          className="px-2.5 py-1 rounded-lg text-xs bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}

export default function NostrPage() {
  const setView = useChatStore((s) => s.setView);
  const apiBase = useChatStore((s) => s.apiBase);
  const base = apiBase || "";

  const [npub, setNpub] = useState(null);
  const [relays, setRelays] = useState([]);

  const feedExtras = useMemo(() => "ai_only=true", []);

  const agent = usePagedNostrTable(base, "/api/nostr/posts", "");
  const feed = usePagedNostrTable(base, "/api/nostr/feed", feedExtras);

  const probeIdentity = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/nostr/posts?limit=1`);
      const data = await res.json();
      if (data.ok && data.npub) setNpub(data.npub);
      else setNpub(null);
      if (data.ok && Array.isArray(data.relays)) setRelays(data.relays);
      else setRelays([]);
    } catch {
      setNpub(null);
      setRelays([]);
    }
  }, [base]);

  useEffect(() => {
    probeIdentity();
  }, [probeIdentity]);

  const wrapAgentRefresh = async () => {
    await agent.refresh();
    await probeIdentity();
  };

  return (
    <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#0d0d0f]">
      <div className="shrink-0 px-4 py-3 border-b border-[#1e1e24] flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Nostr</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-4xl">
            Two chat-style feeds: your agent’s kind <strong className="text-slate-400">1111</strong> timeline (author-filtered) and the
            global feed used for “what’s new on Nostr” in chat: kind <strong className="text-slate-400">1111</strong> notes whose{" "}
            <code className="text-emerald-400/90">l</code> label is any of{" "}
            <strong className="text-slate-400">ai</strong>, <strong className="text-slate-400">blockchain</strong>, or{" "}
            <strong className="text-slate-400">defi</strong> (OR — mixed topics in one list). Filter is{" "}
            <code className="text-emerald-400/90">ai_only=true</code> on the API (override list with{" "}
            <code className="text-emerald-400/90">topic_labels=…</code>). Each panel loads{" "}
            <strong className="text-slate-400">{PAGE_SIZE}</strong> events per request; <strong>Next</strong> fetches the next
            older page only when you click it. Full note text is shown in each bubble (markdown when applicable).
          </p>
          {npub && (
            <p className="text-xs text-slate-500 mt-2 font-mono break-all">
              Agent npub: <span className="text-slate-400">{npub}</span>
            </p>
          )}
          {relays.length > 0 && <p className="text-xs text-slate-600 mt-1 break-words">Relays: {relays.join(", ")}</p>}
        </div>
        <button
          type="button"
          onClick={() => setView("chat")}
          className="shrink-0 px-3 py-1.5 rounded-xl text-sm bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
        >
          Back to chat
        </button>
      </div>

      <div className="flex-1 overflow-hidden px-4 py-4 min-h-0 flex flex-col">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 flex-1 min-h-0">
          <PostsChatPanel
            title="Agent posts"
            subtitle="From NOSTR_NSEC / NOSTR_NPUB (kind 1111)."
            rows={agent.rows}
            loading={agent.loading}
            error={agent.error}
            page={agent.page}
            onRefresh={wrapAgentRefresh}
            onPrev={agent.goPrev}
            onNext={agent.goNext}
            canPrev={agent.canPrev}
            canNext={agent.canNext}
            variant="agent"
          />
          <PostsChatPanel
            title="Latest on Nostr (topic feed)"
            subtitle="Kind 1111 — label OR filter: ai | blockchain | defi."
            rows={feed.rows}
            loading={feed.loading}
            error={feed.error}
            page={feed.page}
            onRefresh={feed.refresh}
            onPrev={feed.goPrev}
            onNext={feed.goNext}
            canPrev={feed.canPrev}
            canNext={feed.canNext}
            variant="feed"
          />
        </div>

        {(agent.error || "").includes("NO_IDENTITY") || (agent.error || "").includes("NOSTR_NSEC") ? (
          <p className="text-xs text-slate-600 mt-4 shrink-0">
            Agent feed needs <code className="text-slate-400">NOSTR_NSEC</code> or <code className="text-slate-400">NOSTR_NPUB</code>{" "}
            in <code className="text-slate-400">.env</code> / Settings; restart the server after changes.
          </p>
        ) : null}
      </div>
    </main>
  );
}
