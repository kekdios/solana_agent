/**
 * SA agent synthetic token mints (SABTC, SAETH, SAUSD) for wallet + treasury tools.
 * Shared by server.js and peg-monitor / other jobs.
 */

import * as db from "../db.js";

/** Keys like SABTC, SAETH (SA + alnum) mapping to mint base58. */
export const SA_AGENT_TOKEN_KEY_RE = /^SA[A-Z0-9]{2,20}$/;

/** Built-in defaults so Wallet + tools work without SA_AGENT_TOKENS; config/env overrides these. */
export const DEFAULT_SA_AGENT_TOKEN_MINTS = Object.freeze({
  SABTC: "2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy",
  SAETH: "AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS",
  SAUSD: "CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG",
});

export function looksLikeSolanaMintAddress(s) {
  const t = String(s).trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t);
}

/**
 * Mint map: SA_AGENT_TOKENS block, per-key SA* config/env, then defaults.
 * Uses db.getConfig (plaintext .env / app settings).
 */
export function loadSaAgentTokenMints() {
  const out = Object.create(null);

  const block = db.getConfig("SA_AGENT_TOKENS") ?? process.env.SA_AGENT_TOKENS;
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
    for (const row of db.listConfigKeys()) {
      const k = String(row.key || "");
      if (!SA_AGENT_TOKEN_KEY_RE.test(k) || k === "SA_AGENT_TOKENS") continue;
      const v = db.getConfig(k);
      if (v && looksLikeSolanaMintAddress(v)) out[k.toUpperCase()] = v.trim();
    }
  } catch (_) {}

  for (const [k, v] of Object.entries(process.env)) {
    if (!SA_AGENT_TOKEN_KEY_RE.test(k) || k === "SA_AGENT_TOKENS") continue;
    if (v && looksLikeSolanaMintAddress(String(v))) out[k.toUpperCase()] = String(v).trim();
  }

  for (const [sym, mint] of Object.entries(DEFAULT_SA_AGENT_TOKEN_MINTS)) {
    if (!out[sym]) out[sym] = mint;
  }

  return out;
}
