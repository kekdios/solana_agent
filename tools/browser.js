/**
 * Web-browsing tool: live search + fetch first result page.
 * Returns JSON with title, url, snippet, excerpt (optional), timestamp.
 *
 * DuckDuckGo Instant Answer often returns nothing for full-sentence queries
 * ("find out more about nostr") while keyword queries work — we simplify the
 * query and fall back to Wikipedia opensearch (no API key; requires User-Agent).
 */

const SNIPPET_MAX = 500;   // max length for the short snippet (chars)
const EXCERPT_MAX = 2000; // max length for the longer excerpt (chars)

/** Identifies this client to Wikipedia and other HTTP endpoints (policy / blocks). */
const BROWSE_USER_AGENT = "SolanaAgent/3.0 (+https://solanaagent.app; browse-tool)";

/**
 * Main entry point – given a free-form query, it:
 * 1. Calls DuckDuckGo's Instant Answer API (no API key required).
 * 2. Pulls a title, URL and a short snippet from the API response.
 * 3. If the API didn't return a direct URL, falls back to the first
 *    related-topic entry that has a FirstURL.
 * 4. Fetches the target page (with a short timeout) and extracts a
 *    plain-text excerpt by stripping HTML.
 * 5. Returns a compact JSON payload.
 *
 * @param {string} query – user search term
 * @returns {Promise<Object>} { title, url, snippet, excerpt, timestamp }
 */
/** True if the query looks like a full URL we can fetch directly. */
function isUrl(s) {
  return /^https?:\/\/[^\s]+$/i.test(String(s).trim());
}

/** Fetch a URL directly and return title + excerpt (no search). */
async function fetchUrlDirect(url) {
  const pageRes = await fetch(url, {
    headers: { "User-Agent": BROWSE_USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  if (!pageRes.ok) throw new Error(`Page failed: ${pageRes.status}`);
  const html = await pageRes.text();
  const excerpt = stripHtml(html).slice(0, EXCERPT_MAX);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = (titleMatch && titleMatch[1].trim()) || url;
  return {
    title: title.slice(0, 200),
    url,
    snippet: excerpt.slice(0, SNIPPET_MAX),
    excerpt: excerpt.slice(0, EXCERPT_MAX),
    timestamp: new Date().toISOString(),
  };
}

/** Strip conversational prefixes so DDG / Wikipedia get a keyword-style query. */
export function simplifyBrowseQuery(q) {
  let s = String(q).trim().replace(/\s+/g, " ");
  if (!s) return s;
  const patterns = [
    /^(please\s+)?(can you\s+)?(find out|tell me|learn more|give me|i want to know|want to know|i'?d like to know)\s+(more\s+)?(about|on)\s+/i,
    /^(what|who|where|when|why|how)\s+(is|are|was|were)\s+(a\s+|an\s+|the\s+)?/i,
    /^(search|look up|lookup|google)\s+(for\s+)?/i,
    /^(information|info|details?)\s+(on|about)\s+/i,
    /^(more\s+)?(details?|info)\s+about\s+/i,
    /^explain\s+/i,
    /^describe\s+/i,
    /^overview\s+of\s+/i,
    /^everything\s+(about|on)\s+/i,
  ];
  let prev;
  let guard = 0;
  do {
    prev = s;
    for (const p of patterns) {
      s = s.replace(p, "").trim();
    }
    guard++;
  } while (s !== prev && s.length > 0 && guard < 10);
  s = s.replace(/[\s?.!,;:]+$/g, "").trim();
  return s || String(q).trim();
}

/**
 * Wikipedia opensearch: returns first title + URL or null.
 * @see https://www.mediawiki.org/wiki/API:Opensearch
 */
async function wikipediaOpenSearch(searchTerm) {
  const term = String(searchTerm).trim();
  if (!term) return null;
  const apiUrl =
    "https://en.wikipedia.org/w/api.php?action=opensearch&search=" +
    encodeURIComponent(term) +
    "&limit=5&namespace=0&format=json";
  const res = await fetch(apiUrl, {
    headers: { "User-Agent": BROWSE_USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const titles = data[1] || [];
  const descriptions = data[2] || [];
  const urls = data[3] || [];
  if (!urls.length || !urls[0]) return null;
  return {
    title: titles[0] || term,
    url: urls[0],
    snippet: (descriptions[0] || "").slice(0, SNIPPET_MAX),
  };
}

/** Try DDG Instant Answer for a single query string; returns { title, url, snippet } or null. */
async function duckDuckGoInstantAnswer(q) {
  const iaRes = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`,
    {
      headers: { "User-Agent": BROWSE_USER_AGENT },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!iaRes.ok) return null;
  const ia = await iaRes.json();
  let title = ia.Heading || ia.AbstractSource || "";
  let url = ia.AbstractURL || "";
  let snippet = (ia.Abstract || ia.AbstractText || "").slice(0, SNIPPET_MAX);
  if (!url && ia.RelatedTopics?.length) {
    const first = ia.RelatedTopics.find((t) => t && typeof t === "object" && t.FirstURL);
    if (first) {
      url = first.FirstURL;
      title = first.Text ? first.Text.slice(0, 200) : title || "Result";
      if (!snippet) snippet = first.Text?.slice(0, SNIPPET_MAX) || "";
    }
    // Nested Topics (DDG sometimes returns { Topics: [...] })
    if (!url) {
      for (const t of ia.RelatedTopics) {
        if (t?.Topics?.length) {
          const sub = t.Topics.find((x) => x?.FirstURL);
          if (sub) {
            url = sub.FirstURL;
            title = sub.Text?.slice(0, 200) || title || "Result";
            if (!snippet) snippet = sub.Text?.slice(0, SNIPPET_MAX) || "";
            break;
          }
        }
      }
    }
  }
  if (!url) return null;
  return { title: title || "Result", url, snippet };
}

export async function browse(query) {
  // -----------------------------------------------------------------
  // 1️⃣ Normalise the query string
  // -----------------------------------------------------------------
  const q = String(query).trim();
  if (!q) throw new Error("browse: empty query");

  // -----------------------------------------------------------------
  // 1b. If the query is a URL, fetch it directly (no search)
  // -----------------------------------------------------------------
  if (isUrl(q)) return await fetchUrlDirect(q);

  const simplified = simplifyBrowseQuery(q);
  const queries = [...new Set([q, simplified].filter((s) => s && s.length > 0))];

  // -----------------------------------------------------------------
  // 2️⃣ DuckDuckGo Instant Answer (try original + simplified query)
  // -----------------------------------------------------------------
  let title = "Untitled";
  let url = "";
  let snippet = "";
  for (const qq of queries) {
    try {
      const hit = await duckDuckGoInstantAnswer(qq);
      if (hit) {
        title = hit.title;
        url = hit.url;
        snippet = hit.snippet;
        break;
      }
    } catch {
      /* try next query */
    }
  }

  // -----------------------------------------------------------------
  // 3️⃣ Wikipedia opensearch (works when DDG IA is empty for long queries)
  // -----------------------------------------------------------------
  if (!url) {
    for (const qq of queries) {
      try {
        const wiki = await wikipediaOpenSearch(qq);
        if (wiki) {
          title = wiki.title;
          url = wiki.url;
          snippet = wiki.snippet;
          break;
        }
      } catch {
        /* continue */
      }
    }
  }

  // -----------------------------------------------------------------
  // 4️⃣ Domain heuristic (e.g. "check agentchainlab.com")
  // -----------------------------------------------------------------
  if (!url) {
    const domainMatch = q.match(
      /\b([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)*\.(?:com|io|org|net|lab|ai|dev))\b/i
    );
    if (domainMatch) {
      const domain = domainMatch[1].toLowerCase();
      const tryUrls = [`https://${domain}`, `https://www.${domain}`];
      for (const u of tryUrls) {
        try {
          return await fetchUrlDirect(u);
        } catch {
          continue;
        }
      }
    }
  }

  if (!url) {
    throw new Error(
      "No results found. Try a shorter keyword (e.g. “nostr” instead of a full sentence), or paste a full https:// URL."
    );
  }

  // -----------------------------------------------------------------
  // 5️⃣ Fetch the target page and extract a longer excerpt
  // -----------------------------------------------------------------
  let excerpt = snippet;
  try {
    const pageRes = await fetch(url, {
      headers: { "User-Agent": BROWSE_USER_AGENT },
      signal: AbortSignal.timeout(6000), // 6 s for page fetch
    });
    if (pageRes.ok) {
      const text = await pageRes.text();
      const extracted = stripHtml(text).slice(0, EXCERPT_MAX);
      if (extracted.length > excerpt.length) excerpt = extracted;
    }
  } catch {
    // keep snippet only
  }

  return {
    title,
    url,
    snippet: snippet.slice(0, SNIPPET_MAX),
    excerpt: excerpt.slice(0, EXCERPT_MAX),
    timestamp: new Date().toISOString(),
  };
}

/** Strip scripts, styles, tags and common HTML entities to get plain text. */
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
