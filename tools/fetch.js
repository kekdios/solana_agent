/**
 * Make HTTP GET or POST requests to external URLs. Use for APIs (e.g. AgentChain onboard).
 * Only HTTPS allowed (or http for localhost). Response body capped to avoid abuse.
 */

const MAX_RESPONSE_BYTES = 100_000; // 100 KB
const TIMEOUT_MS = 15_000;

function allowedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {string} method - GET or POST
 * @param {string} url - Full URL (HTTPS only, or localhost)
 * @param {string} [body] - Optional JSON string for POST body
 * @returns {Promise<{ ok: boolean, status?: number, data?: object|string, error?: string }>}
 */
export async function fetchUrl(method, url, body) {
  const u = String(url).trim();
  if (!u) return { ok: false, error: "URL required" };
  if (!allowedUrl(u)) return { ok: false, error: "Only HTTPS URLs allowed (or http://localhost)" };

  const m = String(method || "GET").toUpperCase();
  if (m !== "GET" && m !== "POST") return { ok: false, error: "Method must be GET or POST" };

  const options = {
    method: m,
    headers: { "User-Agent": "solagent/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (m === "POST") {
    options.headers["Content-Type"] = "application/json";
    options.body = body != null ? String(body).trim() || "{}" : "{}";
  }

  try {
    const res = await fetch(u, options);
    const contentType = res.headers.get("content-type") || "";
    let data = await res.text();
    if (data.length > MAX_RESPONSE_BYTES) data = data.slice(0, MAX_RESPONSE_BYTES) + "\n...[truncated]";

    let parsed = data;
    if (contentType.includes("application/json")) {
      try {
        parsed = JSON.parse(data);
      } catch {
        // keep as string
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      data: parsed,
    };
  } catch (e) {
    return { ok: false, error: e.message || "Request failed" };
  }
}
