/**
 * Web-browsing tool: live search + fetch first result page.
 * Returns JSON with title, url, snippet, excerpt (optional), timestamp.
 *
 * When SERPAPI_API_KEY is set (see .env / db.getConfig), uses SerpApi Google
 * organic results, then fetches the best matching page. Otherwise: DuckDuckGo
 * Instant Answer (often empty for long queries), Wikipedia opensearch, domain
 * heuristic — with simplified query variants where helpful.
 */

import { getConfig } from "../db.js";

const SNIPPET_MAX = 500;   // max length for the short snippet (chars)
const EXCERPT_MAX = 2000; // max length for the longer excerpt (chars)

/** Identifies this client to Wikipedia and other HTTP endpoints (policy / blocks). */
const BROWSE_USER_AGENT = "SolanaAgent/3.0 (browse-tool)";

/**
 * @param {string} query – search phrase or full https URL
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

function getSerpApiKey() {
  try {
    const v = getConfig("SERPAPI_API_KEY");
    const s = v != null ? String(v).trim() : "";
    if (s) return s;
  } catch {
    /* ignore */
  }
  return String(process.env.SERPAPI_API_KEY || "").trim();
}

/** SerpApi Google search — returns organic_results entries or empty. */
async function serpGoogleOrganicResults(searchQuery, apiKey) {
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google");
  u.searchParams.set("q", searchQuery);
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("num", "8");
  const r = await fetch(u.toString(), {
    headers: { "User-Agent": BROWSE_USER_AGENT },
    signal: AbortSignal.timeout(20000),
  });
  let j;
  try {
    j = await r.json();
  } catch {
    return { organic: [], serpError: "invalid JSON" };
  }
  if (j && j.error) return { organic: [], serpError: String(j.error) };
  const organic = Array.isArray(j.organic_results) ? j.organic_results : [];
  return { organic };
}

async function enrichBrowseResult(title, url, snippet) {
  let excerpt = String(snippet || "").trim();
  try {
    const pageRes = await fetch(url, {
      headers: { "User-Agent": BROWSE_USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (pageRes.ok) {
      const text = await pageRes.text();
      const extracted = stripHtml(text).slice(0, EXCERPT_MAX);
      if (extracted.length > excerpt.length) excerpt = extracted;
    }
  } catch {
    /* keep snippet */
  }
  const sn = String(snippet || "").trim().slice(0, SNIPPET_MAX);
  return {
    title: (title || url).slice(0, 200),
    url,
    snippet: sn || excerpt.slice(0, SNIPPET_MAX),
    excerpt: excerpt.slice(0, EXCERPT_MAX),
    timestamp: new Date().toISOString(),
  };
}

/** Try SerpApi for each query variant; fetch first usable organic link. */
async function browseViaSerpApi(queries, apiKey) {
  for (const qq of queries) {
    if (!qq) continue;
    try {
      const { organic, serpError } = await serpGoogleOrganicResults(qq, apiKey);
      if (serpError && (!organic || !organic.length)) continue;
      const items = (organic || []).filter(
        (o) => o && typeof o.link === "string" && /^https?:\/\//i.test(o.link.trim())
      );
      for (const item of items.slice(0, 5)) {
        const link = item.link.trim();
        if (/^https?:\/\/(www\.)?google\./i.test(link)) continue;
        return await enrichBrowseResult(item.title || qq, link, item.snippet || "");
      }
    } catch {
      /* next query or fall through */
    }
  }
  return null;
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
  // 2️⃣ SerpApi Google (when API key configured)
  // -----------------------------------------------------------------
  const serpKey = getSerpApiKey();
  if (serpKey) {
    try {
      const serpHit = await browseViaSerpApi(queries, serpKey);
      if (serpHit) return serpHit;
    } catch {
      /* fall back to DDG / Wikipedia */
    }
  }

  // -----------------------------------------------------------------
  // 3️⃣ DuckDuckGo Instant Answer (try original + simplified query)
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
  // 4️⃣ Wikipedia opensearch (works when DDG IA is empty for long queries)
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
  // 5️⃣ Domain heuristic (e.g. "check agentchainlab.com")
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
  // 6️⃣ Fetch the target page and extract a longer excerpt
  // -----------------------------------------------------------------
  return await enrichBrowseResult(title, url, snippet);
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
