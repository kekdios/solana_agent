/**
 * Full-text search over the indexed docs. Returns path, title, snippet, and
 * a workspace-readable url so the agent can workspace_read(path) for full content.
 */

import { join } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(__dirname, "..", "workspace");
const DB_PATH = join(WORKSPACE_DIR, "doc.db");

/**
 * Search the FTS index. Query is FTS5 syntax (e.g. "swap", "oracle AND gas").
 * @param {string} query - FTS5 search query
 * @param {number} [limit=10] - Max results
 * @returns {{ ok: boolean, query: string, results?: Array<{path, title, snippet, url}> }}
 */
export function docSearch(query, limit = 10) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, error: "query required" };

  const lim = Math.min(Math.max(1, Number(limit) || 10), 100);

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (e) {
    return { ok: false, error: "Index not found; run doc_index first" };
  }

  try {
    const rows = db
      .prepare(
        `SELECT p.path, p.title,
         snippet(page_fts, 0, '<b>', '</b>', '…', 10) AS snippet
         FROM page_fts
         JOIN pages p ON p.id = page_fts.rowid
         WHERE page_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(q, lim);

    const results = rows.map((r) => ({
      path: r.path,
      title: r.title || r.path,
      snippet: r.snippet || "",
      url: `workspace://${r.path}`,
    }));

    return { ok: true, query: q, results };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    db.close();
  }
}
