/**
 * Saved sessions: timestamp-named snapshots of conversations (JSON files).
 * Used by /save, /history slash-commands.
 */

import { join } from "path";
import { writeFile, readFile, readdir, unlink, mkdir } from "fs/promises";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SESSIONS_DIR = process.env.DATA_DIR
  ? join(process.env.DATA_DIR, "sessions")
  : join(__dirname, "data", "sessions");

function formatTimestamp(date = new Date()) {
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  let hour = date.getHours();
  const minute = date.getMinutes().toString().padStart(2, "0");
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${day}-${month}-${year} ${hour}:${minute} ${ampm}`;
}

/** Sanitize display name for use as filename (no colons/spaces). */
function toSessionId(displayName) {
  return String(displayName).replace(/\s+/g, "_").replace(/:/g, "-");
}

export async function ensureSessionsDir() {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

/** Save messages (array of { role, content }) under a timestamped name. Returns { id, name }. */
export async function saveSession(messages) {
  await ensureSessionsDir();
  const name = formatTimestamp();
  const id = toSessionId(name);
  const path = join(SESSIONS_DIR, `${id}.json`);
  const payload = { displayName: name, messages };
  await writeFile(path, JSON.stringify(payload, null, 2), "utf8");
  return { id, name };
}

/** Load a session by id (sanitized name). Returns { displayName, messages }. */
export async function loadSession(id) {
  const path = join(SESSIONS_DIR, `${id}.json`);
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

/** List all saved sessions newest first. Returns [{ id, name }]. */
export async function listSessions() {
  await ensureSessionsDir();
  const files = await readdir(SESSIONS_DIR);
  const sessions = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const id = f.replace(".json", "");
    try {
      const raw = await readFile(join(SESSIONS_DIR, f), "utf8");
      const { displayName } = JSON.parse(raw);
      sessions.push({ id, name: displayName || id });
    } catch {
      sessions.push({ id, name: id });
    }
  }
  sessions.sort((a, b) => (a.id < b.id ? 1 : -1));
  return sessions;
}

export async function deleteSession(id) {
  const path = join(SESSIONS_DIR, `${id}.json`);
  await unlink(path);
}

/** Remove all saved session files. */
export async function clearAllSessions() {
  await ensureSessionsDir();
  const files = await readdir(SESSIONS_DIR);
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    await unlink(join(SESSIONS_DIR, f));
  }
}
