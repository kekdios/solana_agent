/**
 * Shared: open solagent.db, decrypt config, mirror server.js Solana env + SA agent mint map.
 * Used by run-agent-solana-balance.mjs and run-agent-treasury-swap.mjs.
 */
import { createDecipheriv } from "crypto";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const AGENT_SCRIPTS_ROOT = join(__dirname, "..");

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export const DEFAULT_SA_AGENT_TOKEN_MINTS = Object.freeze({
  SABTC: "2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy",
  SAETH: "AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS",
  SAUSD: "CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG",
});

const SA_AGENT_TOKEN_KEY_RE = /^SA[A-Z0-9]{2,20}$/;

function looksLikeSolanaMintAddress(s) {
  const t = String(s).trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t);
}

export function getEncryptionKey(dbDir) {
  const p = join(dbDir, ".encryption-key");
  if (!existsSync(p)) return null;
  const key = readFileSync(p);
  return key.length === KEY_LEN ? key : null;
}

export function decrypt(ciphertextB64, key) {
  if (!key) return null;
  const buf = Buffer.from(ciphertextB64, "base64");
  if (buf.length < IV_LEN + TAG_LEN) return null;
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final("utf8");
}

export function resolveDbPath(projectRoot = AGENT_SCRIPTS_ROOT) {
  const fromEnv = process.env.DB_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  // Prefer repo ./data/ (current web workflow) over legacy macOS Electron userData.
  const repoData = join(projectRoot, "data", "solagent.db");
  if (existsSync(repoData)) return repoData;
  const macLegacy = join(homedir(), "Library", "Application Support", "solagent", "data", "solagent.db");
  if (existsSync(macLegacy)) return macLegacy;
  return null;
}

export function loadConfigKey(dbMod, key, encKey, envFallback) {
  const stored = dbMod.getConfig(key);
  if (stored) {
    try {
      const dec = decrypt(stored, encKey);
      if (dec != null && dec.trim() !== "") return dec.trim();
    } catch (_) {}
  }
  return envFallback ?? null;
}

export function loadSaAgentTokenMints(dbMod, encKey) {
  const out = Object.create(null);

  const block = loadConfigKey(dbMod, "SA_AGENT_TOKENS", encKey, process.env.SA_AGENT_TOKENS);
  if (block && String(block).trim()) {
    for (const line of String(block).split(/[\r\n]+/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      const col = trimmed.indexOf(":");
      let sep = -1;
      if (eq >= 0 && (col < 0 || eq < col)) sep = eq;
      else if (col >= 0) sep = col;
      if (sep < 0) continue;
      const sym = trimmed.slice(0, sep).trim().toUpperCase();
      const mint = trimmed.slice(sep + 1).trim();
      if (sym && looksLikeSolanaMintAddress(mint)) out[sym] = mint;
    }
  }

  try {
    for (const row of dbMod.listConfigKeys()) {
      const k = String(row.key || "");
      if (!SA_AGENT_TOKEN_KEY_RE.test(k) || k === "SA_AGENT_TOKENS") continue;
      const v = loadConfigKey(dbMod, k, encKey);
      if (v && looksLikeSolanaMintAddress(v)) out[k.toUpperCase()] = v.trim();
    }
  } catch (_) {}

  for (const [k, v] of Object.entries(process.env)) {
    if (!SA_AGENT_TOKEN_KEY_RE.test(k) || k === "SA_AGENT_TOKENS") continue;
    if (v && looksLikeSolanaMintAddress(v)) out[k.toUpperCase()] = v.trim();
  }

  for (const [sym, mint] of Object.entries(DEFAULT_SA_AGENT_TOKEN_MINTS)) {
    if (!out[sym]) out[sym] = mint;
  }

  return out;
}

/** Sync process.env from DB like server.js (returns encryption key for mint map). */
export function applyServerStyleSolanaEnv(dbMod, dbPath) {
  const dbDir = dirname(dbPath);
  const encKey = getEncryptionKey(dbDir);
  if (!encKey) {
    throw new Error(
      "Missing or invalid .encryption-key next to solagent.db: " + join(dbDir, ".encryption-key")
    );
  }

  const rpc = loadConfigKey(dbMod, "SOLANA_RPC_URL", encKey, process.env.SOLANA_RPC_URL);
  if (rpc) process.env.SOLANA_RPC_URL = rpc;

  const pace = loadConfigKey(dbMod, "SOLANA_RPC_PACE_MS", encKey, process.env.SOLANA_RPC_PACE_MS) ?? "";
  const stagger = loadConfigKey(dbMod, "SOLANA_RPC_STAGGER_MS", encKey, process.env.SOLANA_RPC_STAGGER_MS) ?? "";
  process.env.SOLANA_RPC_PACE_MS = String(pace).trim();
  process.env.SOLANA_RPC_STAGGER_MS = String(stagger).trim();

  const privEnc = dbMod.getConfig("SOLANA_PRIVATE_KEY");
  if (privEnc) {
    try {
      const dec = decrypt(privEnc, encKey);
      if (dec?.trim()) process.env.SOLANA_PRIVATE_KEY = dec.trim();
    } catch (_) {}
  }
  return encKey;
}

export function parseBool(s, defaultValue = false) {
  if (s == null) return defaultValue;
  const v = String(s).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return defaultValue;
}

/** Subset of server.js loadSwapPolicy() for CLI gates. */
export function loadSwapPolicyFromConfig(dbMod, encKey) {
  return {
    enabled: parseBool(loadConfigKey(dbMod, "SWAPS_ENABLED", encKey) ?? "false", false),
    executionEnabled: parseBool(loadConfigKey(dbMod, "SWAPS_EXECUTION_ENABLED", encKey) ?? "false", false),
    executionDryRun: parseBool(loadConfigKey(dbMod, "SWAPS_EXECUTION_DRY_RUN", encKey) ?? "true", true),
  };
}

/**
 * @returns {Promise<{ dbPath: string, dbMod: object, encKey: Buffer, mintMap: object }>}
 */
export async function initAgentDatabase() {
  const dbPath = resolveDbPath();
  if (!dbPath) {
    throw new Error(
      "No solagent.db found. Set DB_PATH, e.g.\n" +
        "  DB_PATH=\"/path/to/agent/data/solagent.db\"\n" +
        "(Legacy Electron copy, if you still have it: ~/Library/Application Support/solagent/data/solagent.db)"
    );
  }
  process.env.DB_PATH = dbPath;
  const dbMod = await import("../db.js");
  const encKey = applyServerStyleSolanaEnv(dbMod, dbPath);
  const mintMap = loadSaAgentTokenMints(dbMod, encKey);
  return { dbPath, dbMod, encKey, mintMap };
}
