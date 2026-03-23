#!/usr/bin/env node
/**
 * Integration: hyperliquid_price-style perp mids for BTC and ETH.
 * Usage: node scripts/test-hyperliquid-btc-eth.js
 *        npm run test:hyperliquid-btc-eth
 */
import { hyperliquidPerpMids } from "../tools/hyperliquid-price.js";

async function main() {
  const r = await hyperliquidPerpMids({ coins: ["BTC", "ETH"], market: "perp" }, {});
  if (!r.ok) {
    console.error("FAIL:", r.error || r);
    process.exit(1);
  }
  const btc = r.mids_usd?.BTC;
  const eth = r.mids_usd?.ETH;
  if (!Number.isFinite(btc) || btc <= 0) {
    console.error("FAIL: invalid BTC mid", btc);
    process.exit(1);
  }
  if (!Number.isFinite(eth) || eth <= 0) {
    console.error("FAIL: invalid ETH mid", eth);
    process.exit(1);
  }
  console.log("PASS: Hyperliquid perp mids");
  console.log(`  BTC = ${btc} USD`);
  console.log(`  ETH = ${eth} USD`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e?.message || e);
  process.exit(1);
});
