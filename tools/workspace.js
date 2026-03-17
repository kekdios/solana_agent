/**
 * Workspace CRUD: read, write, delete, list files under workspace/.
 * Paths are relative to workspace; no traversal outside (.. is rejected).
 * Text/UTF-8 only; binary data is not supported and may be corrupted.
 */

import { readFile, writeFile, mkdir, readdir, unlink, stat, lstat, readlink, rename } from "fs/promises";
import { join, normalize, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(__dirname, "..", "workspace");

/** Max size for workspace_read (5 MiB) to avoid memory pressure. */
const MAX_READ_SIZE = 5 * 1024 * 1024;

/** Default max depth for workspace_tree; keep low for typical agent use. */
const DEFAULT_TREE_MAX_DEPTH = 10;

function resolvePath(relativePath) {
  const full = join(WORKSPACE_DIR, relativePath);
  const normalized = normalize(full);
  const rel = relative(WORKSPACE_DIR, normalized);
  if (rel.startsWith("..") || rel === "..") throw new Error("Path must stay inside workspace");
  return normalized;
}

/** Returns true if absolutePath is under WORKSPACE_DIR. */
function isInsideWorkspace(absolutePath) {
  const normalized = normalize(absolutePath);
  const rel = relative(WORKSPACE_DIR, normalized);
  return !rel.startsWith("..") && rel !== "..";
}

function sanitizePath(p) {
  const s = String(p).trim().normalize("NFC").replace(/\\/g, "/");
  if (s.includes("..") || s.startsWith("/")) throw new Error("Invalid path");
  return s || ".";
}

/**
 * Read a file from the workspace. Path is relative, e.g. "SOUL.md", "memory/notes.md".
 * Rejects symlinks whose target is outside the workspace. Enforces MAX_READ_SIZE.
 * UTF-8 only; binary data is not supported.
 */
export async function workspaceRead(path) {
  const rel = sanitizePath(path);
  const full = resolvePath(rel);
  try {
    const lst = await lstat(full);
    if (lst.isSymbolicLink()) {
      const target = await readlink(full);
      const resolvedTarget = normalize(join(dirname(full), target));
      if (!isInsideWorkspace(resolvedTarget)) {
        return { ok: false, error: "Symlink target outside workspace", path: rel };
      }
    }
    if (lst.isDirectory()) return { ok: false, error: "Path is a directory", path: rel };
    if (lst.size > MAX_READ_SIZE) {
      return { ok: false, error: `File exceeds max size (${MAX_READ_SIZE} bytes)`, path: rel };
    }
    const content = await readFile(full, "utf8");
    return { ok: true, path: rel, content };
  } catch (e) {
    if (e.code === "ENOENT") return { ok: false, error: "File not found", path: rel };
    if (e.code === "EISDIR") return { ok: false, error: "Path is a directory", path: rel };
    return { ok: false, error: e.message || "Read failed", path: rel };
  }
}

/**
 * Write a file in the workspace. Creates parent dirs if needed. Overwrites if exists.
 * Rejects if path already exists and is a directory. Uses temp file + rename for atomicity.
 * UTF-8 only.
 */
export async function workspaceWrite(path, content) {
  const rel = sanitizePath(path);
  const full = resolvePath(rel);
  const tmpPath = full + ".tmp." + process.pid;
  try {
    let st;
    try {
      st = await stat(full);
      if (st.isDirectory()) return { ok: false, error: "Path is a directory", path: rel };
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await mkdir(dirname(full), { recursive: true });
    await writeFile(tmpPath, String(content ?? ""), "utf8");
    await rename(tmpPath, full);
    return { ok: true, path: rel, message: "Written." };
  } catch (e) {
    try {
      await unlink(tmpPath);
    } catch (_) {}
    return { ok: false, error: e.message || "Write failed", path: rel };
  }
}

/**
 * Delete a file in the workspace. Fails if path is a directory.
 */
export async function workspaceDelete(path) {
  const rel = sanitizePath(path);
  const full = resolvePath(rel);
  try {
    const s = await stat(full);
    if (s.isDirectory()) return { ok: false, error: "Cannot delete directory", path: rel };
    await unlink(full);
    return { ok: true, path: rel, message: "Deleted." };
  } catch (e) {
    if (e.code === "ENOENT") return { ok: false, error: "File not found", path: rel };
    return { ok: false, error: e.message || "Delete failed", path: rel };
  }
}

/**
 * List files and subdirs in a workspace path. Path optional (default: root of workspace).
 * Returns entries sorted: files first, then dirs, alphabetically by name (deterministic).
 */
export async function workspaceList(path = ".") {
  const rel = sanitizePath(path);
  const full = resolvePath(rel);
  try {
    const s = await stat(full);
    if (!s.isDirectory()) return { ok: false, error: "Not a directory", path: rel };
    const entries = await readdir(full, { withFileTypes: true });
    const list = entries
      .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "file" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    return { ok: true, path: rel, entries: list };
  } catch (e) {
    if (e.code === "ENOENT") return { ok: false, error: "Path not found", path: rel };
    return { ok: false, error: e.message || "List failed", path: rel };
  }
}


/**
 * Recursively list the workspace (or a subpath) as a tree. Returns a readable tree string
 * and a flat list of all file paths so the agent can discover any file without hardcoding.
 * Path is relative to workspace root; use "." or omit for full workspace.
 */
export async function workspaceTree(path = ".", maxDepth = DEFAULT_TREE_MAX_DEPTH) {
  const rel = sanitizePath(path);
  const full = resolvePath(rel);
  const lines = [];
  const filePaths = [];

  async function walk(dirPath, prefix, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? 1 : -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    const last = entries.length - 1;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const isLast = i === last;
      const branch = isLast ? "└── " : "├── ";
      const name = e.name + (e.isDirectory() ? "/" : "");
      const relPath = relative(WORKSPACE_DIR, join(dirPath, e.name)).replace(/\\/g, "/");
      lines.push(prefix + branch + name);
      if (e.isDirectory()) {
        const nextPrefix = prefix + (isLast ? "    " : "│   ");
        await walk(join(dirPath, e.name), nextPrefix, depth + 1);
      } else {
        filePaths.push(relPath);
      }
    }
  }

  try {
    const s = await stat(full);
    if (!s.isDirectory()) return { ok: false, error: "Not a directory", path: rel };
    const label = rel === "." ? "./" : rel + "/";
    lines.push(label);
    await walk(full, "", 1);
    const tree = lines.join("\n");
    return { ok: true, path: rel, tree, file_paths: filePaths };
  } catch (e) {
    if (e.code === "ENOENT") return { ok: false, error: "Path not found", path: rel };
    return { ok: false, error: e.message || "Tree failed", path: rel };
  }
}
