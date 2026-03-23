import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "../store/chatStore";

const PAGE_LIMIT = 100;

function formatIso(ts) {
  if (ts == null) return "—";
  const n = Number(ts);
  if (!Number.isFinite(n)) return "—";
  return new Date(n * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export default function NostrPage() {
  const setView = useChatStore((s) => s.setView);
  const apiBase = useChatStore((s) => s.apiBase);
  const base = apiBase || "";

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ npub: null, pubkey: null, relays: [] });
  const [posts, setPosts] = useState([]);
  const [nextUntil, setNextUntil] = useState(null);

  const fetchPage = useCallback(
    async ({ until, append }) => {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (until != null) params.set("until", String(until));
      const res = await fetch(`${base}/api/nostr/posts?${params}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || data.code || `Failed to load posts (${res.status})`);
        if (!append) {
          setPosts([]);
          setMeta({ npub: null, pubkey: null, relays: [] });
        }
        setNextUntil(null);
        return;
      }
      setError(null);
      setMeta({
        npub: data.npub || null,
        pubkey: data.pubkey || null,
        relays: Array.isArray(data.relays) ? data.relays : [],
      });
      const batch = Array.isArray(data.posts) ? data.posts : [];
      setPosts((prev) => {
        const merged = append ? [...prev, ...batch] : batch;
        const seen = new Set();
        return merged.filter((p) => {
          if (!p?.id || seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      });
      setNextUntil(data.next_until != null ? data.next_until : null);
    },
    [base]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchPage({ until: undefined, append: false });
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchPage({ until: undefined, append: false });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (nextUntil == null || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage({ until: nextUntil, append: true });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#0d0d0f]">
      <div className="shrink-0 px-4 py-3 border-b border-[#1e1e24] flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Nostr</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Kind <strong className="text-slate-400">1111</strong> posts from this agent’s identity (from{" "}
            <code className="text-emerald-400/90">NOSTR_NSEC</code> or <code className="text-emerald-400/90">NOSTR_NPUB</code>
            ). Relays may not retain full history—results are best-effort.
          </p>
          {meta.npub && (
            <p className="text-xs text-slate-500 mt-2 font-mono break-all">
              npub: <span className="text-slate-400">{meta.npub}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl text-sm bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setView("chat")}
            className="px-3 py-1.5 rounded-xl text-sm bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
          >
            Back to chat
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {error && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4">
            {error}
            {error.includes("NO_IDENTITY") || error.includes("NOSTR") ? (
              <p className="mt-2 text-amber-200/80">
                Add <code className="text-amber-100">NOSTR_NSEC</code> (or <code className="text-amber-100">NOSTR_NPUB</code>{" "}
                for read-only identity) in <code className="text-amber-100">.env</code> or Settings, then restart the server.
              </p>
            ) : null}
          </div>
        )}

        {loading && posts.length === 0 ? (
          <p className="text-slate-500 text-sm">Loading posts…</p>
        ) : posts.length === 0 && !error ? (
          <p className="text-slate-500 text-sm">No posts found for this identity on the configured relays.</p>
        ) : (
          <ul className="space-y-4">
            {posts.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-[#1e1e24] bg-[#121214] p-4 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mb-2">
                  <time>{formatIso(p.created_at)}</time>
                  <a
                    href={`https://nostr.band/e/${encodeURIComponent(p.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-emerald-400/90 hover:text-emerald-300 break-all"
                  >
                    {p.id}
                  </a>
                </div>
                <div className="text-slate-200 whitespace-pre-wrap break-words">{p.content || ""}</div>
              </li>
            ))}
          </ul>
        )}

        {nextUntil != null && posts.length > 0 && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-2 rounded-xl text-sm bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load older"}
            </button>
          </div>
        )}

        {meta.relays.length > 0 && (
          <p className="text-xs text-slate-600 mt-6">
            Relays queried: {meta.relays.join(", ")}
          </p>
        )}
      </div>
    </main>
  );
}
