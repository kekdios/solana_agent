import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const defaultDbPath = join(__dirname, "data", "solagent.db");
let dbPath = process.env.DB_PATH || defaultDbPath;
if (!process.env.DB_PATH) {
  try {
    mkdirSync(dirname(defaultDbPath), { recursive: true });
  } catch (_) {}
  dbPath = defaultDbPath;
}
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    turns INTEGER NOT NULL DEFAULT 1,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
  CREATE INDEX IF NOT EXISTS idx_token_usage_conversation ON token_usage(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_token_usage_recorded_at ON token_usage(recorded_at);
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value_encrypted TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function hasColumn(table, column) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  return info.some((c) => c.name === column);
}

if (!hasColumn("messages", "server_id")) {
  db.exec(`
    ALTER TABLE messages ADD COLUMN server_id TEXT;
    ALTER TABLE messages ADD COLUMN server_ts INTEGER;
    ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'sent';
    ALTER TABLE messages ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE messages ADD COLUMN attachment_path TEXT;
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_server_id ON messages(server_id) WHERE server_id IS NOT NULL;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_server_ts ON messages(conversation_id, server_ts);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);`);
}

export function createConversation() {
  const stmt = db.prepare("INSERT INTO conversations DEFAULT VALUES");
  const result = stmt.run();
  return result.lastInsertRowid;
}

export function insertMessage(conversationId, role, content, opts = {}) {
  const serverId = opts.server_id ?? randomUUID();
  const serverTs = opts.server_ts ?? Date.now();
  const status = opts.status ?? "sent";
  const stmt = db.prepare(
    `INSERT INTO messages (conversation_id, server_id, role, content, server_ts, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  stmt.run(conversationId, serverId, role, content, serverTs, status);
  return { server_id: serverId, server_ts: serverTs };
}

const PAGE_SIZE = 20;

export function getMessages(conversationId, opts = {}) {
  const limit = Math.min(Number(opts.limit) || PAGE_SIZE, 200);
  const beforeId = opts.before_id != null ? Number(opts.before_id) : null;
  if (beforeId == null) {
    const stmt = db.prepare(
      `SELECT id, role, content, server_ts, status
       FROM messages
       WHERE conversation_id = ? AND is_deleted = 0
       ORDER BY id DESC LIMIT ?`
    );
    const rows = stmt.all(conversationId, limit).reverse();
    const oldestId = rows.length ? rows[0].id : null;
    return { messages: rows, oldest_id: oldestId, has_more: rows.length === limit };
  }
  const stmt = db.prepare(
    `SELECT id, role, content, server_ts, status
     FROM messages
     WHERE conversation_id = ? AND is_deleted = 0 AND id < ?
     ORDER BY id DESC LIMIT ?`
  );
  const rows = stmt.all(conversationId, beforeId, limit).reverse();
  const oldestId = rows.length ? rows[0].id : null;
  return { messages: rows, oldest_id: oldestId, has_more: rows.length === limit };
}

export function listConversations(limit = 50) {
  const stmt = db.prepare(
    `SELECT id, created_at FROM conversations ORDER BY id DESC LIMIT ?`
  );
  return stmt.all(limit);
}

/** Delete all conversations and their messages and token_usage. */
export function clearAllConversations() {
  const run = db.transaction(() => {
    db.prepare("DELETE FROM token_usage").run();
    db.prepare("DELETE FROM messages").run();
    db.prepare("DELETE FROM conversations").run();
  });
  run();
}

const EXCERPT_LEN = 300;

/** Search messages by text; return up to `limit` conversations that contain the query, with excerpt and date. */
export function searchConversations(query, limit = 20) {
  const q = (query || "").trim();
  if (!q) return { ok: true, conversations: [], count: 0 };
  const maxConvs = Math.min(Number(limit) || 20, 50);
  const stmt = db.prepare(
    `SELECT id, conversation_id, content, created_at
     FROM messages
     WHERE is_deleted = 0 AND INSTR(content, ?) > 0
     ORDER BY created_at DESC`
  );
  const rows = stmt.all(q);
  const byConv = new Map();
  for (const r of rows) {
    if (byConv.size >= maxConvs) break;
    if (!byConv.has(r.conversation_id)) {
      const excerpt = (r.content || "").length > EXCERPT_LEN
        ? (r.content || "").slice(0, EXCERPT_LEN) + "…"
        : (r.content || "");
      byConv.set(r.conversation_id, {
        conversation_id: r.conversation_id,
        excerpt,
        created_at: r.created_at,
      });
    }
  }
  const conversations = Array.from(byConv.values());
  return { ok: true, conversations, count: conversations.length };
}

/** Get a single message by id (for copy-from-DB). Returns { content } or null. */
export function getMessageById(id) {
  const row = db.prepare("SELECT content FROM messages WHERE id = ? AND is_deleted = 0").get(Number(id));
  return row ? { content: row.content } : null;
}

/** Record token usage for a chat completion (one row per request; turns = API calls in that request). */
export function insertTokenUsage(conversationId, usage, turns = 1) {
  const prompt = Number(usage?.prompt_tokens) || 0;
  const completion = Number(usage?.completion_tokens) || 0;
  const total = Number(usage?.total_tokens) || prompt + completion;
  if (prompt === 0 && completion === 0 && total === 0) return;
  const stmt = db.prepare(
    `INSERT INTO token_usage (conversation_id, prompt_tokens, completion_tokens, total_tokens, turns)
     VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(conversationId, prompt, completion, total, turns);
}

/** Get token usage aggregates. Options: conversation_id, from_date (YYYY-MM-DD), to_date, limit. */
export function getTokenUsage(opts = {}) {
  const convId = opts.conversation_id != null ? Number(opts.conversation_id) : null;
  const from = opts.from_date || null;
  const to = opts.to_date || null;
  const limit = Math.min(Number(opts.limit) || 100, 1000);
  let sql = `SELECT id, conversation_id, prompt_tokens, completion_tokens, total_tokens, turns, recorded_at FROM token_usage WHERE 1=1`;
  const params = [];
  if (convId != null) {
    sql += ` AND conversation_id = ?`;
    params.push(convId);
  }
  if (from) {
    sql += ` AND date(recorded_at) >= date(?)`;
    params.push(from);
  }
  if (to) {
    sql += ` AND date(recorded_at) <= date(?)`;
    params.push(to);
  }
  sql += ` ORDER BY id DESC LIMIT ?`;
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  const sum = rows.reduce(
    (acc, r) => ({
      prompt_tokens: acc.prompt_tokens + (r.prompt_tokens || 0),
      completion_tokens: acc.completion_tokens + (r.completion_tokens || 0),
      total_tokens: acc.total_tokens + (r.total_tokens || 0),
      requests: acc.requests + 1,
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, requests: 0 }
  );
  return { rows, summary: sum };
}

/** All-time token usage totals (single row SUM). */
export function getTokenUsageTotal() {
  const row = db.prepare(
    `SELECT
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens
     FROM token_usage`
  ).get();
  return {
    prompt_tokens: Number(row?.prompt_tokens) || 0,
    completion_tokens: Number(row?.completion_tokens) || 0,
    total_tokens: Number(row?.total_tokens) || 0,
  };
}

/** All messages across all conversations; supports pagination (last N first, then before_id). */
export function getAllMessages(opts = {}) {
  const limit = Math.min(Number(opts.limit) || PAGE_SIZE, 200);
  const beforeId = opts.before_id != null ? Number(opts.before_id) : null;
  if (beforeId == null) {
    const stmt = db.prepare(
      `SELECT id, conversation_id, role, content, server_ts, status
       FROM messages WHERE is_deleted = 0
       ORDER BY id DESC LIMIT ?`
    );
    const rows = stmt.all(limit).reverse();
    const oldestId = rows.length ? rows[0].id : null;
    return { messages: rows, oldest_id: oldestId, has_more: rows.length === limit };
  }
  const stmt = db.prepare(
    `SELECT id, conversation_id, role, content, server_ts, status
     FROM messages WHERE is_deleted = 0 AND id < ?
     ORDER BY id DESC LIMIT ?`
  );
  const rows = stmt.all(beforeId, limit).reverse();
  const oldestId = rows.length ? rows[0].id : null;
  return { messages: rows, oldest_id: oldestId, has_more: rows.length === limit };
}

/** Get a single config value (encrypted blob); returns null if not set. */
export function getConfig(key) {
  const row = db.prepare("SELECT value_encrypted FROM config WHERE key = ?").get(String(key));
  return row ? row.value_encrypted : null;
}

/** Set a config value (store encrypted blob). */
export function setConfig(key, valueEncrypted) {
  db.prepare(
    "INSERT INTO config (key, value_encrypted, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value_encrypted = excluded.value_encrypted, updated_at = datetime('now')"
  ).run(String(key), valueEncrypted);
}

/** List all config keys (and updated_at) for UI; does not return secret values. */
export function listConfigKeys() {
  const rows = db.prepare("SELECT key, updated_at FROM config ORDER BY key").all();
  return rows;
}
