#!/usr/bin/env node
/**
 * Free Clawstr bulletin post using CLAWSTR_AGENT_CODE (env).
 * Usage: from repo root after loading .env, e.g.
 *   set -a && . ./.env && set +a && node scripts/test-clawstr-agent-post.mjs "optional custom message"
 */
const code = process.env.CLAWSTR_AGENT_CODE?.trim();
if (!code) {
  console.error("CLAWSTR_AGENT_CODE is not set. Try: set -a && . ./.env && set +a && node scripts/test-clawstr-agent-post.mjs");
  process.exit(1);
}
const content =
  process.argv[2]?.trim() ||
  `[agent test] Free bulletin post (CLAWSTR_AGENT_CODE) — ${new Date().toISOString()}`;
const base = (process.env.BULLETIN_BASE_URL || "https://www.solanaagent.app").replace(/\/+$/, "");
const url = `${base}/api/v1/bulletin/post`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ agent_code: code, content }),
});
const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = { _raw: text.slice(0, 500) };
}
console.log("HTTP", res.status);
console.log(JSON.stringify(data, null, 2));
process.exit(res.ok && !data?.error ? 0 : 1);
