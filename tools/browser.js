/**
 * Web-browsing tool: live search + fetch first result page.
 * Returns JSON with title, url, snippet, excerpt (optional), timestamp.
 */

const SNIPPET_MAX = 500;   // max length for the short snippet (chars)
const EXCERPT_MAX = 2000; // max length for the longer excerpt (chars)

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
    headers: { "User-Agent": "Mozilla/5.0 (compatible; solagent/1.0)" },
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

  // -----------------------------------------------------------------
  // 2️⃣ DuckDuckGo Instant Answer API (public, no key)
  // -----------------------------------------------------------------
  const iaRes = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`,
    { signal: AbortSignal.timeout(8000) } // 8 s network timeout
  );
  if (!iaRes.ok) throw new Error(`Search failed: ${iaRes.status}`);
  const ia = await iaRes.json();

  // -----------------------------------------------------------------
  // 3️⃣ Pull title, URL and short snippet from the API response
  // -----------------------------------------------------------------
  // Prefer "Heading" (main result title); else fall back to abstract source.
  let title = ia.Heading || ia.AbstractSource || "Untitled";
  let url = ia.AbstractURL || "";
  let snippet = (ia.Abstract || ia.AbstractText || "").slice(0, SNIPPET_MAX);

  // -----------------------------------------------------------------
  // 4️⃣ Fallback: if still no URL, use first RelatedTopics entry with FirstURL
  // -----------------------------------------------------------------
  if (!url && ia.RelatedTopics?.length) {
    const first = ia.RelatedTopics.find(
      (t) => t && typeof t === "object" && t.FirstURL
    );
    if (first) {
      url = first.FirstURL;
      title = first.Text ? first.Text.slice(0, 120) : title;
      if (!snippet) snippet = first.Text?.slice(0, SNIPPET_MAX) || "";
    }
  }
  // 4b. If still no URL, try treating the query as mentioning a domain (e.g. "agentchainlab.com" or "find mcp page agentchainlab")
  if (!url) {
    const domainMatch = q.match(/\b([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)*\.(?:com|io|org|net|lab|ai|dev))\b/i);
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
  if (!url) throw new Error("No results found");

  // -----------------------------------------------------------------
  // 5️⃣ Fetch the target page and extract a longer excerpt
  // -----------------------------------------------------------------
  let excerpt = snippet;
  try {
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; solagent/1.0)" },
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
