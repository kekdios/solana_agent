#!/usr/bin/env node
/**
 * Check whether Jupiter v6 quote returns a route for treasury mint pairs (no swap, no keys).
 * Run: node scripts/check-treasury-jupiter-routes.js
 *
 * If ok for both directions, the agent can trade via existing Jupiter swap flow without Orca APIs.
 */
/** Prefer api.jup.ag (same family as tools/jupiter.js Metis); v6 host may differ by region. */
const JUPITER_QUOTE = "https://api.jup.ag/swap/v1/quote";

const SAUSD = "CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG";
const SABTC = "2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy";
const SAETH = "AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS";

const SLIPPAGE_BPS = 50;

async function quote(inMint, outMint, amount) {
  const u = `${JUPITER_QUOTE}?inputMint=${inMint}&outputMint=${outMint}&amount=${amount}&slippageBps=${SLIPPAGE_BPS}`;
  const headers = {};
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;
  const res = await fetch(u, { headers, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, error: text.slice(0, 200) };
  }
  if (!res.ok) return { ok: false, status: res.status, error: data.error || text.slice(0, 200) };
  const out = data.outAmount || data.outputAmount;
  if (!out) return { ok: false, status: res.status, error: "no outAmount", raw: data };
  return { ok: true, inAmount: data.inAmount || amount, outAmount: String(out), routePlan: !!data.routePlan };
}

async function main() {
  const tests = [
    ["SABTC→SAUSD", SABTC, SAUSD, "1000000"],
    ["SAUSD→SABTC", SAUSD, SABTC, "1000000"],
    ["SAETH→SAUSD", SAETH, SAUSD, "1000000"],
    ["SAUSD→SAETH", SAUSD, SAETH, "1000000"],
  ];
  console.log("Jupiter v6 quote check (treasury mints, tiny amounts)\n");
  let allOk = true;
  for (const [label, a, b, amt] of tests) {
    const r = await quote(a, b, amt);
    if (r.ok) {
      console.log(`OK  ${label}  outAmount=${r.outAmount}  routePlan=${r.routePlan}`);
    } else {
      allOk = false;
      console.log(`FAIL ${label}`, r);
    }
  }
  console.log(allOk ? "\nAll quotes OK — Jupiter routing likely sufficient for trades." : "\nSome quotes failed — need custom Whirlpool swap fallback or different amounts.");
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
