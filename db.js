import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { createDecipheriv } from "crypto";

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
`);

// Config table is deprecated in favor of .env-backed config.
// Drop it to enforce single source of truth and avoid drift.
try {
  db.exec(`DROP TABLE IF EXISTS config;`);
} catch (_) {}

// Swap intents for sovereign Jupiter execution (Tier 4 only). Created here to keep schema centralized.
db.exec(`
  CREATE TABLE IF NOT EXISTS swap_intents (
    intent_id TEXT PRIMARY KEY,
    wallet_pubkey TEXT NOT NULL,
    input_mint TEXT NOT NULL,
    output_mint TEXT NOT NULL,
    amount_in TEXT NOT NULL,
    slippage_bps INTEGER NOT NULL,
    expected_out_amount TEXT NOT NULL,
    min_out_amount TEXT NOT NULL,
    quote_json TEXT NOT NULL,
    quote_hash TEXT NOT NULL,
    policy_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'prepared',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    signature TEXT,
    fee_lamports INTEGER,
    units_consumed INTEGER,
    program_ids_json TEXT,
    error_code TEXT,
    error_message TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_swap_intents_status_created ON swap_intents(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_swap_intents_wallet_created ON swap_intents(wallet_pubkey, created_at);
`);

// Backfill columns for existing DBs.
if (!hasColumn("swap_intents", "fee_lamports")) {
  db.exec(`ALTER TABLE swap_intents ADD COLUMN fee_lamports INTEGER;`);
}
if (!hasColumn("swap_intents", "units_consumed")) {
  db.exec(`ALTER TABLE swap_intents ADD COLUMN units_consumed INTEGER;`);
}
if (!hasColumn("swap_intents", "program_ids_json")) {
  db.exec(`ALTER TABLE swap_intents ADD COLUMN program_ids_json TEXT;`);
}

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
if (!hasColumn("messages", "tool_results")) {
  db.exec(`ALTER TABLE messages ADD COLUMN tool_results TEXT;`);
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
  const toolResultsJson =
    opts.tool_results != null && Array.isArray(opts.tool_results)
      ? JSON.stringify(opts.tool_results)
      : null;
  const stmt = db.prepare(
    `INSERT INTO messages (conversation_id, server_id, role, content, server_ts, status, tool_results)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(conversationId, serverId, role, content, serverTs, status, toolResultsJson);
  return { server_id: serverId, server_ts: serverTs };
}

const PAGE_SIZE = 20;

function parseToolResults(row) {
  if (row.tool_results == null || row.tool_results === "") return row;
  try {
    const arr = JSON.parse(row.tool_results);
    if (Array.isArray(arr)) row.tool_results = arr;
  } catch (_) {}
  return row;
}

export function getMessages(conversationId, opts = {}) {
  const limit = Math.min(Number(opts.limit) || PAGE_SIZE, 200);
  const beforeId = opts.before_id != null ? Number(opts.before_id) : null;
  if (beforeId == null) {
    const stmt = db.prepare(
      `SELECT id, role, content, server_ts, status, tool_results
       FROM messages
       WHERE conversation_id = ? AND is_deleted = 0
       ORDER BY id DESC LIMIT ?`
    );
    const rows = stmt.all(conversationId, limit).reverse().map(parseToolResults);
    const oldestId = rows.length ? rows[0].id : null;
    return { messages: rows, oldest_id: oldestId, has_more: rows.length === limit };
  }
  const stmt = db.prepare(
    `SELECT id, role, content, server_ts, status, tool_results
     FROM messages
     WHERE conversation_id = ? AND is_deleted = 0 AND id < ?
     ORDER BY id DESC LIMIT ?`
  );
  const rows = stmt.all(conversationId, beforeId, limit).reverse().map(parseToolResults);
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

export function insertSwapIntent(intent) {
  const stmt = db.prepare(
    `INSERT INTO swap_intents (
      intent_id, wallet_pubkey, input_mint, output_mint, amount_in, slippage_bps,
      expected_out_amount, min_out_amount, quote_json, quote_hash, policy_json,
      status, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    intent.intent_id,
    intent.wallet_pubkey,
    intent.input_mint,
    intent.output_mint,
    String(intent.amount_in),
    Number(intent.slippage_bps),
    String(intent.expected_out_amount),
    String(intent.min_out_amount),
    String(intent.quote_json),
    String(intent.quote_hash),
    String(intent.policy_json),
    intent.status || "prepared",
    String(intent.expires_at)
  );
  return { ok: true, intent_id: intent.intent_id };
}

export function getSwapIntent(intentId) {
  const row = db.prepare(
    `SELECT
      intent_id, wallet_pubkey, input_mint, output_mint, amount_in, slippage_bps,
      expected_out_amount, min_out_amount, quote_json, quote_hash, policy_json,
      status, created_at, expires_at, signature, fee_lamports, units_consumed, program_ids_json, error_code, error_message
     FROM swap_intents WHERE intent_id = ?`
  ).get(String(intentId));
  return row || null;
}

export function setSwapIntentStatus(intentId, status) {
  const s = String(status || "").trim();
  if (!s) return { ok: false, error: "status required" };
  const info = db
    .prepare(`UPDATE swap_intents SET status = ? WHERE intent_id = ?`)
    .run(s, String(intentId));
  return { ok: info.changes === 1 };
}

export function setSwapIntentResult(intentId, patch = {}) {
  const fields = [];
  const values = [];
  if (patch.status != null) {
    fields.push("status = ?");
    values.push(String(patch.status));
  }
  if (patch.signature != null) {
    fields.push("signature = ?");
    values.push(String(patch.signature));
  }
  if (patch.fee_lamports != null) {
    fields.push("fee_lamports = ?");
    values.push(Number(patch.fee_lamports));
  }
  if (patch.units_consumed != null) {
    fields.push("units_consumed = ?");
    values.push(Number(patch.units_consumed));
  }
  if (patch.program_ids_json != null) {
    fields.push("program_ids_json = ?");
    values.push(String(patch.program_ids_json));
  }
  if (patch.error_code != null) {
    fields.push("error_code = ?");
    values.push(String(patch.error_code));
  }
  if (patch.error_message != null) {
    fields.push("error_message = ?");
    values.push(String(patch.error_message));
  }
  if (fields.length === 0) return { ok: false, error: "no fields" };
  values.push(String(intentId));
  const info = db.prepare(`UPDATE swap_intents SET ${fields.join(", ")} WHERE intent_id = ?`).run(...values);
  return { ok: info.changes === 1 };
}

export function compareAndSetSwapIntentStatus(intentId, fromStatus, toStatus) {
  const info = db
    .prepare(`UPDATE swap_intents SET status = ? WHERE intent_id = ? AND status = ?`)
    .run(String(toStatus), String(intentId), String(fromStatus));
  return { ok: info.changes === 1 };
}

export function getSwapAutopilotStats(walletPubkey) {
  const wallet = String(walletPubkey || "").trim();
  if (!wallet) return { ok: false, error: "wallet_pubkey required" };
  const hour = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM swap_intents
       WHERE wallet_pubkey = ? AND created_at >= datetime('now','-1 hour')
         AND status IN ('executing','simulated','succeeded','failed')`
    )
    .get(wallet)?.n;
  const day = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM swap_intents
       WHERE wallet_pubkey = ? AND created_at >= datetime('now','-1 day')
         AND status IN ('executing','simulated','succeeded','failed')`
    )
    .get(wallet)?.n;
  // Daily SOL input volume (sum amount_in lamports for SOL input, succeeded/simulated/executing).
  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const volLamports = db
    .prepare(
      `SELECT COALESCE(SUM(CAST(amount_in AS INTEGER)), 0) AS lamports
       FROM swap_intents
       WHERE wallet_pubkey = ? AND created_at >= datetime('now','-1 day')
         AND input_mint = ?
         AND status IN ('executing','simulated','succeeded')`
    )
    .get(wallet, SOL_MINT)?.lamports;
  return {
    ok: true,
    swaps_last_hour: Number(hour) || 0,
    swaps_last_day: Number(day) || 0,
    sol_in_lamports_last_day: Number(volLamports) || 0,
  };
}

export function getLastSwapCreatedAt(walletPubkey) {
  const wallet = String(walletPubkey || "").trim();
  if (!wallet) return null;
  const row = db
    .prepare(
      `SELECT created_at
       FROM swap_intents
       WHERE wallet_pubkey = ?
         AND status IN ('executing','simulated','succeeded','failed')
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(wallet);
  return row?.created_at || null;
}

/** Signatures of swaps executed by this agent (jupiter_swap_execute + treasury_pool_swap; swap_intents status succeeded). Used to flag "Agent" on wallet UI. */
export function getAgentExecutedSignatures(walletPubkey) {
  const wallet = String(walletPubkey || "").trim();
  if (!wallet) return [];
  const rows = db
    .prepare(
      `SELECT signature FROM swap_intents
       WHERE wallet_pubkey = ? AND status = 'succeeded' AND signature IS NOT NULL AND signature != ''`
    )
    .all(wallet);
  return rows.map((r) => String(r.signature));
}

/** Map of signature -> { input_mint, output_mint, amount_in, expected_out_amount, min_out_amount } for succeeded swaps. */
export function getAgentSwapMetadataBySignatures(signatures) {
  if (!Array.isArray(signatures) || signatures.length === 0) return {};
  const uniq = Array.from(new Set(signatures.map((s) => String(s).trim()).filter(Boolean)));
  if (uniq.length === 0) return {};
  const placeholders = uniq.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT signature, input_mint, output_mint, amount_in, expected_out_amount, min_out_amount
       FROM swap_intents
       WHERE status = 'succeeded' AND signature IN (${placeholders})`
    )
    .all(...uniq);
  const out = {};
  for (const r of rows) {
    const sig = String(r.signature || "").trim();
    if (!sig) continue;
    out[sig] = {
      input_mint: String(r.input_mint),
      output_mint: String(r.output_mint),
      amount_in: String(r.amount_in),
      expected_out_amount: String(r.expected_out_amount),
      min_out_amount: String(r.min_out_amount),
    };
  }
  return out;
}

/** Clear expired and stale swap intents (prepared/confirmed/expired/cancelled with expires_at in the past). Keeps succeeded/failed for audit and Agent badge. */
export function clearExpiredSwapIntents() {
  db.prepare(
    `UPDATE swap_intents SET status = 'expired'
     WHERE status IN ('prepared','confirmed') AND expires_at < datetime('now')`
  ).run();
  const del = db
    .prepare(
      `DELETE FROM swap_intents
       WHERE status IN ('prepared','confirmed','expired','cancelled') AND expires_at < datetime('now')`
    )
    .run();
  return { ok: true, deleted: del.changes };
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

const ENV_PATH = process.env.ENV_PATH || join(__dirname, ".env");
const CONFIG_KEY_PATH = join(dirname(dbPath), ".encryption-key");
const APP_SETTINGS_PATH = process.env.APP_SETTINGS_PATH || join(dirname(dbPath), "app-settings.json");
const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const ENV_MANAGED_KEYS = new Set([
  "INCEPTION_API_KEY",
  "VENICE_ADMIN_KEY",
  "NANOGPT_API_KEY",
  "NANOGPT_MODEL",
  "JUPITER_API_KEY",
  "NOSTR_NPUB",
  "NOSTR_NSEC",
  "NOSTR_RELAYS",
  "SOLANA_PRIVATE_KEY",
  "SOLANA_PUBLIC_KEY",
  "PORT",
  "HOST",
  "SOLANA_RPC_URL",
  "HEARTBEAT_INTERVAL_SECONDS",
  "HEARTBEAT_INTERVAL_MS",
  "WORKSPACE_DIR",
  "DATA_DIR",
  "SOLANA_RPC_PACE_MS",
  "SOLANA_RPC_STAGGER_MS",
  "HELIUS_API_KEY",
  "TEST_PRIV_KEY",
  "TEST_ADDRESS",
]);

/** Keys allowed for POST /api/config generic encrypted store (excludes handled branches like API keys). */
const SA_AGENT_SYMBOL_KEY_RE = /^SA[A-Z0-9]{2,20}$/;
export function isAllowedEncryptedConfigPostKey(key) {
  if (!key || typeof key !== "string") return false;
  if (ENV_MANAGED_KEYS.has(key)) return true;
  if (key.startsWith("SWAPS_")) return true;
  if (key === "SA_AGENT_TOKENS") return true;
  if (SA_AGENT_SYMBOL_KEY_RE.test(key)) return true;
  return false;
}

function readEnvMap() {
  const out = new Map();
  if (!existsSync(ENV_PATH)) return out;
  const txt = readFileSync(ENV_PATH, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
      if (m[2].startsWith('"')) {
        v = v.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      } else {
        v = v.replace(/'\"'\"'/g, "'");
      }
    }
    out.set(m[1], v);
  }
  return out;
}

function writeEnvMap(map) {
  const encode = (input) => {
    const s = String(input ?? "");
    if (s === "") return '""';
    if (/^[A-Za-z0-9_./:@,+\-]+$/.test(s)) return s;
    if (!s.includes("'") && !s.includes("\n")) return `'${s}'`;
    const escaped = s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
    return `"${escaped}"`;
  };
  const lines = [];
  for (const [k, v] of Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${k}=${encode(v)}`);
  }
  writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf8");
}

function readAppSettingsMap() {
  try {
    if (!existsSync(APP_SETTINGS_PATH)) return new Map();
    const raw = readFileSync(APP_SETTINGS_PATH, "utf8").trim();
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    const out = new Map();
    for (const [k, v] of Object.entries(parsed)) out.set(String(k), v == null ? "" : String(v));
    return out;
  } catch {
    return new Map();
  }
}

function writeAppSettingsMap(map) {
  try {
    mkdirSync(dirname(APP_SETTINGS_PATH), { recursive: true });
  } catch (_) {}
  const obj = {};
  for (const [k, v] of Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    obj[k] = String(v ?? "");
  }
  writeFileSync(APP_SETTINGS_PATH, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function maybeMigrateNonSecretEnvToJson() {
  const appMap = readAppSettingsMap();
  if (appMap.size > 0) return;
  const envMap = readEnvMap();
  let moved = 0;
  for (const [k, v] of envMap.entries()) {
    if (ENV_MANAGED_KEYS.has(k)) continue;
    appMap.set(k, String(v ?? ""));
    moved++;
  }
  if (moved > 0) writeAppSettingsMap(appMap);
}

function maybeDecryptLegacyValue(input) {
  const val = String(input ?? "");
  if (!val) return "";
  if (!existsSync(CONFIG_KEY_PATH)) return val;
  let key;
  try {
    key = readFileSync(CONFIG_KEY_PATH);
  } catch {
    return val;
  }
  if (!key || key.length !== KEY_LEN) return val;
  try {
    const buf = Buffer.from(val, "base64");
    if (buf.length < IV_LEN + TAG_LEN) return val;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
    decipher.setAuthTag(tag);
    const dec = decipher.update(enc) + decipher.final("utf8");
    return dec;
  } catch {
    return val;
  }
}

/** Get a single config value (plaintext from .env); returns null if not set. */
export function getConfig(key) {
  const k = String(key || "").trim();
  if (!k) return null;
  if (ENV_MANAGED_KEYS.has(k)) {
    const map = readEnvMap();
    if (map.has(k)) return map.get(k);
    return process.env[k] ?? null;
  }
  const appMap = readAppSettingsMap();
  if (appMap.has(k)) return appMap.get(k);
  const envMap = readEnvMap();
  if (envMap.has(k)) return envMap.get(k);
  return process.env[k] ?? null;
}

/** Set a config value in .env (accepts legacy encrypted payloads and auto-decrypts). */
export function setConfig(key, valueEncrypted) {
  const k = String(key || "").trim();
  if (!k) return;
  const plain = maybeDecryptLegacyValue(valueEncrypted);
  if (ENV_MANAGED_KEYS.has(k)) {
    const envMap = readEnvMap();
    envMap.set(k, plain);
    writeEnvMap(envMap);
  } else {
    const appMap = readAppSettingsMap();
    appMap.set(k, plain);
    writeAppSettingsMap(appMap);
  }
  process.env[k] = plain;
}

/** List all config keys from .env for UI compatibility. */
export function listConfigKeys() {
  const keys = new Set();
  for (const k of readEnvMap().keys()) keys.add(k);
  for (const k of readAppSettingsMap().keys()) keys.add(k);
  const nowIso = new Date().toISOString();
  return Array.from(keys)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, updated_at: nowIso }));
}

maybeMigrateNonSecretEnvToJson();
