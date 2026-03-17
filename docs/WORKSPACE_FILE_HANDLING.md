# Workspace File Handling — Technical Description

This document describes the workspace file-handling implementation in `tools/workspace.js` so a second reviewer can assess security, correctness, and edge cases.

---

## 1. Purpose and context

- **Location:** `tools/workspace.js` (Node.js ESM module).
- **Role:** CRUD and discovery for files under a single **workspace** directory. Used by the chat agent via HTTP API tool calls (`workspace_read`, `workspace_write`, `workspace_delete`, `workspace_list`, `workspace_tree`). The **exec** tool (`tools/exec.js`) runs shell commands with this same workspace as the current working directory (sandbox).
- **Invoker:** `server.js` calls these functions with arguments from the LLM; results are JSON-serialized and sent back in the chat flow. The agent (and thus the user) can only access paths under the workspace root.

---

## 2. Workspace root

```js
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(__dirname, "..", "workspace");
```

- **Default:** Directory named `workspace` one level above the `tools/` folder (i.e. project root `workspace/` when running from repo).
- **Override:** Set `WORKSPACE_DIR` to an absolute path (e.g. in Electron packaged app, often a path under `userData` or inside the .app bundle).
- **No trailing slash** in the variable; paths are built with `path.join()`.

---

## 3. Path handling and security

### 3.1 `sanitizePath(p)`

- **Input:** Any string (path from the agent/user).
- **Behavior:**
  - `String(p).trim()`.
  - Backslashes replaced with forward slashes.
  - **Rejects** (throws):
    - Any path containing the substring `".."` (directory traversal).
    - Any path that starts with `"/"` (absolute-style path).
  - Empty or whitespace-only becomes `"."`.
- **Returns:** A single path segment or path with forward slashes, no leading slash, no `..`.

**Intent:** Prevent obvious traversal and absolute paths before they are resolved. Note: a path like `a/../b` is rejected because it *contains* `..`, not because it resolves outside the workspace (that is caught later).

### 3.2 `resolvePath(relativePath)`

- **Input:** Output of `sanitizePath` (or any path that passed sanitization).
- **Behavior:**
  1. `full = join(WORKSPACE_DIR, relativePath)`.
  2. `normalized = normalize(full)` — resolves `.`, `..`, and redundant slashes on the *resolved* path.
  3. `rel = relative(WORKSPACE_DIR, normalized)` — path from workspace root to the resolved target.
  4. If `rel.startsWith("..")` or `rel === ".."`, **throws** "Path must stay inside workspace".
  5. Returns `normalized` (absolute path on disk).
- **Intent:** Ensure the final absolute path is under `WORKSPACE_DIR`. This catches traversal that might slip through if `sanitizePath` were ever relaxed (e.g. encoded or Unicode `..`).

**Defense in depth:** Both `sanitizePath` (reject `..` in input) and `resolvePath` (reject result outside workspace) are used on every operation.

---

## 4. Exported functions

### 4.1 `workspaceRead(path)`

- **Parameters:** `path` — workspace-relative file path (e.g. `SOUL.md`, `memory/2026-03-11.md`).
- **Flow:**
  1. `rel = sanitizePath(path)`; `full = resolvePath(rel)`.
  2. `readFile(full, "utf8")`.
- **Success:** `{ ok: true, path: rel, content }` — `content` is the file body as a UTF-8 string.
- **Errors:**
  - `ENOENT` → `{ ok: false, error: "File not found", path: rel }`.
  - `EISDIR` → `{ ok: false, error: "Path is a directory", path: rel }`.
  - Other → `{ ok: false, error: e.message || "Read failed", path: rel }`.
- **Encoding:** UTF-8 only. Binary or other encodings are not supported; invalid UTF-8 may throw or produce replacement characters.
- **Symlinks:** Followed by `readFile`; the target must still resolve inside the workspace via `resolvePath` (the path passed in is resolved once, so the symlink target is not re-checked for being inside workspace).

### 4.2 `workspaceWrite(path, content)`

- **Parameters:** `path` — workspace-relative path; `content` — string (or coerced with `String(content ?? "")`).
- **Flow:**
  1. `rel = sanitizePath(path)`; `full = resolvePath(rel)`.
  2. `mkdir(join(full, ".."), { recursive: true })` — create parent directories.
  3. `writeFile(full, content, "utf8")` — overwrites if file exists.
- **Success:** `{ ok: true, path: rel, message: "Written." }`.
- **Errors:** Any exception → `{ ok: false, error: e.message || "Write failed", path: rel }`.
- **Encoding:** UTF-8 only. No binary write.
- **Directories:** If `path` looks like a directory (e.g. `memory/`), `writeFile` would create a *file* named `memory` in the workspace root (with a trailing path segment). Writing to a path that is an existing directory would result in trying to write a file with that name and may fail on some filesystems or overwrite a file of the same name; the code does not special-case directories.

### 4.3 `workspaceDelete(path)`

- **Parameters:** `path` — workspace-relative path.
- **Flow:**
  1. `rel = sanitizePath(path)`; `full = resolvePath(rel)`.
  2. `stat(full)` — if directory, return `{ ok: false, error: "Cannot delete directory", path: rel }`.
  3. `unlink(full)`.
- **Success:** `{ ok: true, path: rel, message: "Deleted." }`.
- **Errors:**
  - `ENOENT` → `{ ok: false, error: "File not found", path: rel }`.
  - Directory → see above.
  - Other → `{ ok: false, error: e.message || "Delete failed", path: rel }`.
- **Symlinks:** `unlink` removes the symlink, not the target. The target’s path is not validated again.

### 4.4 `workspaceList(path = ".")`

- **Parameters:** `path` — directory path relative to workspace; default `"."` (root).
- **Flow:**
  1. `rel = sanitizePath(path)`; `full = resolvePath(rel)`.
  2. `stat(full)` — if not a directory, return `{ ok: false, error: "Not a directory", path: rel }`.
  3. `readdir(full, { withFileTypes: true })`.
  4. Map to `{ name, type: "file" | "dir" }`, return `{ ok: true, path: rel, entries: list }`.
- **Success:** One level only; no recursion. Order is filesystem-dependent (not explicitly sorted in this function).
- **Errors:** `ENOENT` → "Path not found"; non-directory → "Not a directory".

### 4.5 `workspaceTree(path = ".", maxDepth = 20)`

- **Parameters:** `path` — directory under workspace; `maxDepth` — maximum recursion depth (default 20).
- **Flow:**
  1. `rel = sanitizePath(path)`; `full = resolvePath(rel)`.
  2. If not a directory, return `{ ok: false, error: "Not a directory", path: rel }`.
  3. Recursive `walk(dirPath, prefix, depth)`:
     - Skips recursion when `depth > maxDepth`.
     - `readdir(dirPath, { withFileTypes: true })`.
     - Sort: directories last, then alphabetical by name (case-insensitive base).
     - For each entry: append a line to `lines` (tree visualization: `├── name` / `└── name`, dirs get `/`).
     - For files: push workspace-relative path (using `relative(WORKSPACE_DIR, join(dirPath, e.name))`) into `filePaths`.
     - For directories: recurse with `walk(join(dirPath, e.name), nextPrefix, depth + 1)`.
  4. Build `tree` string (root label `./` or `rel/` then the lines); return `{ ok: true, path: rel, tree, file_paths }`.
- **Output:** `tree` is a human-readable ASCII tree; `file_paths` is a flat array of workspace-relative file paths (no directories). Paths use forward slashes (Windows backslashes replaced).
- **Intent:** Let the agent discover every file in one call and then use `workspace_read` with a path from `file_paths`.
- **Edge:** `walk` uses absolute `dirPath`; `relPath` for each file is computed from `WORKSPACE_DIR`, so `file_paths` are correct even for nested dirs. Directories are not included in `file_paths`.

---

## 5. Error handling summary

- **Sanitization/resolution:** Invalid path or escape attempt → thrown Error (caught by server and surfaced as 500 or tool error).
- **Missing file/dir:** `ENOENT` mapped to "File not found" or "Path not found" in the returned object.
- **Wrong type:** Directory when file expected (read/delete) or file when directory expected (list/tree) → structured error in response.
- **Other I/O errors:** Message from exception (or generic "Read failed" etc.) in the `error` field; no stack or sensitive data in the JSON returned to the client.

---

## 6. Integration with the server

- **Registration:** In `server.js`, `workspace_read`, `workspace_write`, `workspace_delete`, `workspace_list`, `workspace_tree` are in `PARAM_SCHEMAS` and in the `runTool` switch. Arguments come from the LLM (e.g. `args.path`, `args.content`, `args.max_depth`).
- **Invocation:** `runTool(name, args, env)` calls the corresponding function; return value is JSON-stringified and pushed into the conversation as a tool message, so the model sees the exact `{ ok, path, content }` (or error) for reads.
- **No extra auth:** Within the app, whoever can send chat messages can trigger these tools; there is no per-user or per-request workspace isolation in this module (single shared `WORKSPACE_DIR`).

---

## 7. Points for a second opinion

1. **Symlinks:** Read follows symlinks; delete removes the link. A symlink that points outside the workspace could be created by something else; `resolvePath` only checks the *requested* path, not the symlink target. If the workspace is ever populated by untrusted input, consider `readlink` + resolve and re-check, or using options that do not follow symlinks where available.
2. **Encoding:** Only UTF-8. Binary or other encodings will not work correctly; consider documenting or restricting to text files.
3. **Very large files:** `workspaceRead` reads the whole file into memory. Very large files could cause high memory use or timeouts; consider a size cap or streaming if needed.
4. **Concurrent writes:** No file locking. Two writes to the same path can race; last write wins.
5. **Directory write:** Writing to a path that is currently a directory (e.g. after a race) may fail or behave in a platform-dependent way; the code does not check “path exists and is directory” before `writeFile`.
6. **`workspace_tree` depth:** Default 20 may be high for very deep trees (many syscalls); could be made configurable or capped lower for agent use.
7. **Path normalization:** `normalize` and `relative` are used; Unicode normalization (NFC/NFD) is not applied, so names that differ only by normalization could be treated as different paths.
8. **Single workspace:** One `WORKSPACE_DIR` for the whole process; no per-conversation or per-user workspace. If the product gains multi-tenant or multi-workspace support, this module would need to accept a workspace root per call or similar.

### 7a. Implemented after review (feedback)

| Recommendation | Status |
|----------------|--------|
| **Symlink escape** | Implemented. `workspaceRead` uses `lstat`; if path is a symlink, `readlink` + resolve target and `isInsideWorkspace(target)`; reject with "Symlink target outside workspace" if outside. |
| **Write to existing directory** | Implemented. `workspaceWrite` calls `stat(full)` first; if it exists and is a directory, returns `{ ok: false, error: "Path is a directory", path }`. |
| **Large file reads** | Implemented. `MAX_READ_SIZE = 5 * 1024 * 1024` (5 MiB). Before `readFile`, `lstat` for size; if over limit, return error. |
| **Atomic write** | Implemented. Write to `full + ".tmp." + process.pid`, then `rename(tmp, full)`. On failure, attempt to `unlink` the temp file. |
| **Unicode path normalization** | Implemented. In `sanitizePath`, after `trim()`, apply `String.prototype.normalize("NFC")` before the rest. |
| **Deterministic sort in workspaceList** | Implemented. Entries sorted: files first, then dirs, then alphabetically by name. |
| **Tree depth** | Default reduced from 20 to 10 (`DEFAULT_TREE_MAX_DEPTH = 10`). Caller can still pass higher `max_depth` if needed. |
| **Binary/MIME documentation** | Documented in module comment and in `workspaceRead`/`workspaceWrite`: text/UTF-8 only; binary not supported. |

**Deferred:** Optional `root` argument for multi-tenant; unit tests; error messages still include user-supplied relative path (no absolute paths exposed).

---

## 8. File reference

- **Implementation:** `tools/workspace.js`
- **Server wiring:** `server.js` (import, `runTool` cases for `workspace_read`, `workspace_write`, `workspace_delete`, `workspace_list`, `workspace_tree`)

This description reflects the implementation as of the last review and is intended to support a security and design review by a second party.
