/**
 * Build or refresh the SQLite FTS index for a workspace docs folder.
 * Reads every .md under root, optional sibling .json metadata, and upserts into
 * doc.db (pages + page_fts). FTS5 updates are delete-then-insert.
 */

import { readdir } from "fs/promises";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import * as workspace from "./workspace.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(__dirname, "..", "workspace");
const DB_PATH = join(WORKSPACE_DIR, "doc.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  title TEXT,
  crawl_ts INTEGER NOT NULL,
  depth INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS page_fts USING fts5(
  content,
  path UNINDEXED,
  title UNINDEXED,
  tokenize = 'porter'
);
`;

/** Recursively collect workspace-relative paths of all .md files under root. */
async function walkMd(root) {
  const fullRoot = join(WORKSPACE_DIR, root);
  const relRoot = relative(WORKSPACE_DIR, fullRoot).replace(/\\/g, "/");
  if (relRoot.startsWith("..") || relRoot === "..") {
    throw new Error("root would escape workspace");
  }
  const files = [];
  const stack = [fullRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return files;
      throw e;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".md") && e.name !== "TOC.md") {
        const rel = relative(WORKSPACE_DIR, full).replace(/\\/g, "/");
        if (!rel.startsWith("..")) files.push(rel);
      }
    }
  }
  return files;
}

/**
 * Index all .md files under the given workspace-relative root (e.g. "docs/bebop").
 * @param {string} root - Workspace-relative folder containing crawled .md files
 * @returns {{ ok: boolean, indexed?: number, error?: string }}
 */
export async function docIndex(root) {
  const r = String(root || "").trim().replace(/\\/g, "/").replace(/^\/+/, "") || ".";
  if (r.includes("..") || r.startsWith("/")) {
    return { ok: false, error: "Invalid root" };
  }

  let mdPaths;
  try {
    mdPaths = await walkMd(r);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const db = new Database(DB_PATH);
  try {
    db.exec(SCHEMA);

    const prefix = r.endsWith("/") ? r : r + "/";
    db.prepare("DELETE FROM page_fts WHERE rowid IN (SELECT id FROM pages WHERE path LIKE ? OR path = ?)").run(prefix + "%", r);
    db.prepare("DELETE FROM pages WHERE path LIKE ? OR path = ?").run(prefix + "%", r);

    const insertPage = db.prepare(
      "INSERT INTO pages (path, url, title, crawl_ts, depth) VALUES (?, ?, ?, ?, ?)"
    );
    const updatePage = db.prepare(
      "UPDATE pages SET url = ?, title = ?, crawl_ts = ?, depth = ? WHERE path = ?"
    );
    const getByPath = db.prepare("SELECT id FROM pages WHERE path = ?");
    const deleteFts = db.prepare("DELETE FROM page_fts WHERE rowid = ?");
    const insertFts = db.prepare(
      "INSERT INTO page_fts (rowid, content, path, title) VALUES (?, ?, ?, ?)"
    );

    for (const relPath of mdPaths) {
      let content = "";
      try {
        const res = await workspace.workspaceRead(relPath);
        if (res.ok && res.content != null) content = res.content;
      } catch (_) {}

      const metaPath = relPath.replace(/\.md$/i, ".json");
      let meta = {};
      try {
        const res = await workspace.workspaceRead(metaPath);
        if (res.ok && res.content) meta = JSON.parse(res.content);
      } catch (_) {}

      const url = meta.url || "";
      const title = meta.title != null ? String(meta.title) : content.split("\n")[0].replace(/^#\s+/, "") || "";
      const crawl_ts = Number(meta.crawl_ts) || Date.now();
      const depth = Number(meta.depth) || 0;

      const existing = getByPath.get(relPath);
      if (existing) {
        const id = existing.id;
        deleteFts.run(id);
        updatePage.run(url, title, crawl_ts, depth, relPath);
        insertFts.run(id, content, relPath, title);
      } else {
        const result = insertPage.run(relPath, url, title, crawl_ts, depth);
        const id = result.lastInsertRowid;
        insertFts.run(id, content, relPath, title);
      }
    }

    db.exec("VACUUM");
  } finally {
    db.close();
  }

  return { ok: true, indexed: mdPaths.length };
}
