/**
 * Crawl a documentation site: fetch index, discover same-section links, fetch each page,
 * save content to workspace as markdown/text. Writes per-page metadata (.json) and TOC.md.
 * If the same save_to path already has crawled files, the folder is wiped first (only if inside workspace).
 */

import { rm } from "fs/promises";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import * as workspace from "./workspace.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(__dirname, "..", "workspace");

const MAX_PAGES_DEFAULT = 30;
const MAX_PAGES_MAX = 100;
const FETCH_TIMEOUT_MS = 12000;

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute path prefix for link discovery. If baseUrl is an "index" page (path is /
 * or ends with /index.html or index.htm), use the directory part so sibling sections
 * (e.g. /user/, /admin/) are included. Otherwise use the full pathname.
 */
function getLinkPathPrefix(baseUrl) {
  const base = new URL(baseUrl);
  let pathname = base.pathname.replace(/\/$/, "") || "/";
  const isIndex =
    pathname === "" ||
    pathname === "/" ||
    pathname.endsWith("/index.html") ||
    pathname.endsWith("/index.htm");
  if (isIndex) {
    const parts = pathname.split("/").filter(Boolean);
    parts.pop();
    pathname = parts.length ? "/" + parts.join("/") : "/";
  }
  return pathname || "/";
}

/** Extract same-origin links from HTML whose path starts with pathPrefix (directory-aware). */
function extractLinks(html, baseUrl, pathPrefix) {
  const base = new URL(baseUrl);
  const prefix = pathPrefix ?? getLinkPathPrefix(baseUrl);
  const seen = new Set();
  const links = [];
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1].trim().split("#")[0].split("?")[0];
    if (!raw) continue;
    try {
      const u = new URL(raw, base);
      if (u.origin !== base.origin) continue;
      const p = u.pathname.replace(/\/$/, "") || "/";
      if (prefix !== "/" && !u.pathname.startsWith(prefix)) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      links.push(u.href);
    } catch {
      continue;
    }
  }
  return links;
}

/** Slug for filename: pathname to safe path segment. */
function pathToSlug(pathname) {
  let p = pathname.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/") || "index";
  p = p.replace(/\.(md|html?)$/i, "").replace(/[^a-zA-Z0-9/_.-]/g, "_").replace(/_+/g, "_") || "index";
  return p;
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "solagent-doc-crawl/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (contentType.includes("application/json")) return { type: "json", text };
  return { type: "html", text };
}

/** Extract title from markdown (first # heading, single line only) or fallback to url. */
function extractTitle(plainText, url) {
  const s = String(plainText || "");
  for (const line of s.split("\n")) {
    const m = line.match(/^#\s+(.+)$/);
    if (m) return m[1].trim().slice(0, 200);
  }
  return url;
}

/** Write metadata JSON next to the .md file. */
async function writeMetaFile(mdPath, meta) {
  const metaPath = mdPath.replace(/\.md$/i, ".json");
  await workspace.workspaceWrite(metaPath, JSON.stringify(meta, null, 2));
}

/** Append one entry to TOC.md in the prefix folder. */
async function updateToc(prefix, { title, relPath }) {
  const tocPath = `${prefix}/TOC.md`;
  let toc = "# Table of Contents\n\n";
  try {
    const r = await workspace.workspaceRead(tocPath);
    if (r.ok && r.content) toc = r.content.trimEnd() + "\n";
  } catch (_) {}
  toc += `- [${title}](${relPath})\n`;
  await workspace.workspaceWrite(tocPath, toc);
}

/**
 * Crawl a doc site from base_url: fetch index, discover links, fetch each page, save to workspace.
 * @param {string} base_url - e.g. "https://docs.bebop.xyz/bebop"
 * @param {string} [save_to] - Workspace path prefix, e.g. "docs/bebop". Default: "docs/" + hostname + path segment
 * @param {number} [max_pages] - Max pages to fetch (default 30, max 100)
 */
export async function docCrawl(base_url, save_to, max_pages) {
  const url = String(base_url || "").trim();
  if (!url) return { ok: false, error: "base_url required" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid base_url" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Only http/https URLs allowed" };
  }

  const max = Math.min(
    Math.max(1, Number(max_pages) || MAX_PAGES_DEFAULT),
    MAX_PAGES_MAX
  );
  const defaultPrefix = "docs/" + (parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean).join("-") || parsed.hostname.replace(/\./g, "-"));
  const prefix = String(save_to || "").trim().replace(/^\/+/, "") || defaultPrefix;
  const saved = [];
  const errors = [];

  const fullDir = join(WORKSPACE_DIR, prefix);
  const relDir = relative(WORKSPACE_DIR, fullDir).replace(/\\/g, "/");
  if (relDir.startsWith("..") || relDir === "..") {
    return { ok: false, error: "save_to would escape workspace", path: prefix };
  }
  try {
    await rm(fullDir, { recursive: true, force: true });
  } catch (e) {
    if (e.code !== "ENOENT") {
      return { ok: false, error: `Failed to clear existing crawl: ${e.message}`, path: prefix };
    }
  }

  let indexContent;
  try {
    const first = await fetchPage(url);
    indexContent = first.text;
    if (first.type === "html") {
      const text = stripHtml(indexContent);
      const slug = pathToSlug(parsed.pathname);
      const relPath = `${prefix}/${slug}.md`;
      await workspace.workspaceWrite(relPath, `# ${url}\n\n${text}`);
      saved.push(relPath);
      const title = extractTitle(text, url);
      await writeMetaFile(relPath, { url, title, depth: 0, crawl_ts: Date.now() });
      await updateToc(prefix, { title, relPath: `${slug}.md` });
    }
  } catch (e) {
    return { ok: false, error: `Failed to fetch index: ${e.message}` };
  }

  const linkPathPrefix = getLinkPathPrefix(url);
  const links = extractLinks(indexContent, url, linkPathPrefix);
  const toFetch = links.slice(0, max - saved.length);

  for (const href of toFetch) {
    try {
      const page = await fetchPage(href);
      const u = new URL(href);
      const text = page.type === "html" ? stripHtml(page.text) : page.text;
      const slug = pathToSlug(u.pathname);
      const relPath = `${prefix}/${slug}.md`;
      await workspace.workspaceWrite(relPath, page.type === "html" ? `# ${href}\n\n${text}` : text);
      saved.push(relPath);
      const title = extractTitle(text, href);
      await writeMetaFile(relPath, { url: href, title, depth: 1, crawl_ts: Date.now() });
      await updateToc(prefix, { title, relPath: `${slug}.md` });
    } catch (e) {
      errors.push({ url: href, error: e.message });
    }
  }

  return {
    ok: true,
    base_url: url,
    save_to: prefix,
    saved,
    count: saved.length,
    ...(errors.length ? { errors: errors.slice(0, 10) } : {}),
  };
}
