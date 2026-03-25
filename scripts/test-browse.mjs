#!/usr/bin/env node
/**
 * Smoke-test browse tool: SerpApi (if SERPAPI_API_KEY) else DDG + Wikipedia (needs network).
 * Usage: node scripts/test-browse.mjs
 */
import { browse, simplifyBrowseQuery } from "../tools/browser.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cases = [
  ["nostr", true],
  ["find out more about nostr", true],
  ["what is nostr", true],
  ["find out more about Solana blockchain", true],
];

async function main() {
  console.log("simplifyBrowseQuery:");
  console.log('  "find out more about nostr" ->', JSON.stringify(simplifyBrowseQuery("find out more about nostr")));
  console.log('  "what is the Eiffel Tower" ->', JSON.stringify(simplifyBrowseQuery("what is the Eiffel Tower")));

  for (const [q, expectUrl] of cases) {
    process.stdout.write(`browse(${JSON.stringify(q)}) … `);
    const out = await browse(q);
    assert(out && out.url, "missing url");
    assert(out.title, "missing title");
    if (expectUrl) assert(/^https?:\/\//i.test(out.url), "url not http(s)");
    console.log("ok ->", out.url.slice(0, 72) + (out.url.length > 72 ? "…" : ""));
  }
  console.log("\nAll browse tests passed.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
