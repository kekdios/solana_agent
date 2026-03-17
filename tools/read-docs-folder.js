/**
 * Read an entire docs folder (e.g. from doc_crawl): list all .md files recursively,
 * return content as a single digest with truncated per-file chunks so context stays reasonable.
 * Optionally write SUMMARY.md in that folder so the user can say "tell me more about X" and
 * the model can workspace_read the referenced file.
 */

import { readdir } from "fs/promises";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import * as workspace from "./workspace.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(__dirname, "..", "workspace");

const DEFAULT_MAX_PER_FILE = 2000;
const DEFAULT_MAX_TOTAL = 28000;
const MAX_FILES = 200;

function sanitizePath(p) {
  const s = String(p).trim().replace(/\\/g, "/");
  if (s.includes("..") || s.startsWith("/")) throw new Error("Invalid path");
  return s || ".";
}

/**
 * Recursively list all .md files under workspace/basePath. Returns paths relative to workspace.
 */
async function listMdFiles(basePath) {
  const full = join(WORKSPACE_DIR, basePath);
  const entries = await readdir(full, { recursive: true, withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const fullPath = join(e.parentPath || full, e.name);
    const rel = relative(WORKSPACE_DIR, fullPath).replace(/\\/g, "/");
    if (rel.startsWith("..")) continue;
    if (rel === "SUMMARY.md" || rel.endsWith("/SUMMARY.md")) continue;
    out.push(rel);
  }
  return out.sort();
}

/**
 * Read a docs folder and return digestible content plus optional SUMMARY.md.
 * @param {string} path - Workspace path to the folder (e.g. "docs/bebop")
 * @param {number} [max_per_file] - Max chars per file in the digest (default 2000)
 * @param {number} [max_total] - Max total chars in returned content (default 28000)
 * @param {boolean} [write_summary] - If true, write SUMMARY.md in the folder (default true)
 */
export async function readDocsFolder(path, max_per_file, max_total, write_summary) {
  const base = sanitizePath(path);
  const maxPerFile = Math.min(Number(max_per_file) || DEFAULT_MAX_PER_FILE, 8000);
  const maxTotal = Math.min(Number(max_total) || DEFAULT_MAX_TOTAL, 60000);
  const doSummary = write_summary !== false;

  let files;
  try {
    files = await listMdFiles(base);
  } catch (e) {
    if (e.code === "ENOENT") return { ok: false, error: "Folder not found", path: base };
    return { ok: false, error: e.message || "List failed", path: base };
  }

  if (files.length === 0) return { ok: true, path: base, files: [], content: "", summary_path: null };
  if (files.length > MAX_FILES) files = files.slice(0, MAX_FILES);

  const fileMeta = [];
  const chunks = [];
  let total = 0;
  const summaryLines = [];

  for (const rel of files) {
    if (total >= maxTotal) break;
    let content;
    try {
      const r = await workspace.workspaceRead(rel);
      content = r.ok ? r.content : "";
    } catch {
      content = "";
    }
    const fullLen = content.length;
    const preview = content.slice(0, maxPerFile);
    const truncated = fullLen > maxPerFile;
    const chunk = truncated ? preview + "\n\n[... truncated. Use workspace_read(\"" + rel + "\") for full content.]" : preview;
    const heading = "\n\n---\n## " + rel + "\n\n";
    const segment = heading + chunk;
    if (total + segment.length > maxTotal && chunks.length > 0) break;
    chunks.push(segment);
    total += segment.length;

    const firstLine = content.split(/\n/).find((l) => l.trim())?.trim().slice(0, 120) || "(no content)";
    fileMeta.push({ path: rel, full_length: fullLen, truncated });
    summaryLines.push(`- **${rel}** — ${firstLine}`);
  }

  const content = chunks.length ? "# Docs digest: " + base + chunks.join("") : "# Docs digest: " + base + "\n\n(No .md files or all skipped.)";

  let summaryPath = null;
  if (doSummary && fileMeta.length > 0) {
    summaryPath = base + "/SUMMARY.md";
    const summaryContent = "# Summary – " + base + "\n\nUse these paths with `workspace_read(path)` for full content. Say \"tell me more about X\" to load a specific file.\n\n" + summaryLines.join("\n");
    try {
      await workspace.workspaceWrite(summaryPath, summaryContent);
    } catch (e) {
      summaryPath = null;
    }
  }

  return {
    ok: true,
    path: base,
    files: fileMeta,
    content,
    summary_path: summaryPath,
    total_chars: total,
  };
}
