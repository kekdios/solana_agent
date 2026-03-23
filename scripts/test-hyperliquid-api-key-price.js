#!/usr/bin/env node
/**
 * Smoke test: require HYPERLIQUID_API_KEY and fetch realtime perp mids from Hyperliquid.
 *
 * Hyperliquid `POST https://api.hyperliquid.xyz/info` with `{ "type": "allMids" }` is **public**
 * (official docs: `Content-Type: application/json` only). Trading uses **wallet signing**, not
 * a bearer token on this endpoint.
 *
 * If `HYPERLIQUID_API_KEY` looks like an EVM **private key** (`0x` + 64 hex), we **do not** send
 * it in HTTP headers (avoid leaking it to logs/proxies). We only assert it is configured and then
 * fetch mids the same way as `tools/hyperliquid-price.js`.
 *
 * If it looks like a short opaque token, we try `Authorization: Bearer` then `X-API-Key` in case
 * your stack expects one of those.
 *
 * Usage:
 *   HYPERLIQUID_API_KEY=... node scripts/test-hyperliquid-api-key-price.js
 *   npm run test:hyperliquid-api-key-price
 *
 * Key is read from `process.env` or project-root `.env` (never printed).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const HL_INFO = "https://api.hyperliquid.xyz/info";

/** Looks like secp256k1 private key material — must not go in Authorization headers. */
function looksLikeEvmPrivateKey(s) {
  const t = String(s || "").trim();
  return /^0x[0-9a-fA-F]{64}$/.test(t);
}

function loadHyperliquidKey() {
  const fromEnv = process.env.HYPERLIQUID_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const envPath = path.join(root, ".env");
  try {
    const text = fs.readFileSync(envPath, "utf8");
    const m = text.match(/^HYPERLIQUID_API_KEY=(.+)$/m);
    if (!m) return "";
    return m[1].trim().replace(/^['"]|['"]$/g, "");
  } catch {
    return "";
  }
}

function midsFromBody(parsed) {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  return {};
}

async function fetchAllMids(extraHeaders = {}) {
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({ type: "allMids" }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { res, ok: false, mids: {}, error: "non-JSON body", textPreview: text.slice(0, 120) };
  }
  return { res, ok: res.ok, parsed, mids: midsFromBody(parsed) };
}

async function main() {
  const key = loadHyperliquidKey();
  if (!key) {
    console.error("FAIL: set HYPERLIQUID_API_KEY (env or project .env)");
    process.exit(1);
  }

  let out;
  let mode = "public (no secret in headers)";

  if (looksLikeEvmPrivateKey(key)) {
    // Same as hyperliquid-price.js — realtime mids, no auth header.
    out = await fetchAllMids({});
    mode = "public allMids (HYPERLIQUID_API_KEY is present but looks like a private key; not sent over HTTP)";
  } else {
    out = await fetchAllMids({ Authorization: `Bearer ${key}` });
    if (!out.res?.ok) {
      out = await fetchAllMids({ "X-API-Key": key });
      mode = "with X-API-Key header";
    } else {
      mode = "with Authorization: Bearer";
    }
  }

  if (!out.res?.ok) {
    console.error("FAIL: HTTP", out.res?.status, out.error || JSON.stringify(out.parsed).slice(0, 200));
    process.exit(1);
  }

  const mids = out.mids || {};
  const eth = mids.ETH;
  const btc = mids.BTC;

  if (eth == null && btc == null) {
    console.error("FAIL: no ETH/BTC in allMids; sample keys:", Object.keys(mids).slice(0, 15).join(", "));
    process.exit(1);
  }

  const pick = (sym, v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? `${sym}=${n} USD (mid)` : `${sym}=${String(v)} (raw)`;
  };

  const parts = [pick("ETH", eth), pick("BTC", btc)].filter(Boolean);
  console.log("PASS:", mode);
  console.log(HL_INFO, '{ "type": "allMids" }');
  console.log(parts.join(" | "));
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e?.message || e);
  process.exit(1);
});
