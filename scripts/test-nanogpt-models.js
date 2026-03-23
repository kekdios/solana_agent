#!/usr/bin/env node
/**
 * Integration check for NanoGPT /api/v1/models parsing (matches server.js logic).
 * Reads NANOGPT_API_KEY from .env if present; never prints the key.
 * Usage: node scripts/test-nanogpt-models.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function modelArrayFromBody(body) {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.models)) return body.models;
  return [];
}

function loadNanogptKey() {
  const envPath = path.join(root, ".env");
  try {
    const text = fs.readFileSync(envPath, "utf8");
    const m = text.match(/^NANOGPT_API_KEY=(.+)$/m);
    if (!m) return "";
    return m[1].trim().replace(/^['"]|['"]$/g, "");
  } catch {
    return "";
  }
}

const search = "?detailed=true";
const upstream = `https://nano-gpt.com/api/v1/models${search}`;

async function fetchModels(headers) {
  const r = await fetch(upstream, { headers });
  const payload = await r.json().catch(() => ({}));
  return { r, payload, list: modelArrayFromBody(payload) };
}

function summarize(list) {
  const valid = list.filter((m) => m && typeof m.id === "string" && m.id.length > 0);
  return { total: list.length, withId: valid.length, sample: valid.slice(0, 3).map((m) => m.id) };
}

let exit = 0;
console.log("--- Public catalog (no auth) ---");
const pub = await fetchModels({});
if (!pub.r.ok) {
  console.error("FAIL: public HTTP", pub.r.status);
  exit = 1;
} else {
  const s = summarize(pub.list);
  console.log("HTTP", pub.r.status, "models", s.withId, "sample", s.sample);
  if (s.withId < 10) {
    console.error("FAIL: expected many public models");
    exit = 1;
  }
}

const key = process.env.NANOGPT_API_KEY?.trim() || loadNanogptKey();
if (key) {
  console.log("--- With x-api-key (from env or .env) ---");
  let { r, payload, list } = await fetchModels({ "x-api-key": key });
  if (!r.ok) {
    console.error("FAIL: keyed HTTP", r.status, payload?.message || payload?.error || "");
    exit = 1;
  } else {
    if (list.length === 0) {
      const r2 = await fetch(upstream);
      const p2 = await r2.json().catch(() => ({}));
      if (r2.ok && modelArrayFromBody(p2).length > 0) {
        list = modelArrayFromBody(p2);
        console.log("(keyed list empty; using public fallback like server.js)");
      }
    }
    const s = summarize(list);
    console.log("HTTP", r.status, "models", s.withId, "sample", s.sample);
    if (s.withId < 1) {
      console.error("FAIL: no models after keyed + fallback");
      exit = 1;
    }
  }
} else {
  console.log("--- Skip keyed test (no NANOGPT_API_KEY) ---");
}

process.exit(exit);
