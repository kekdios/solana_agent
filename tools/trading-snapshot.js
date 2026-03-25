/**
 * Capture Hyperliquid spot mids for UBTC/USDC (@142) and UETH/USDC (@151) plus Orca treasury pool snapshots.
 * See docs/PLAN_TRADING_PAGE.md — HL spot keys are mainnet; labels shown as BTC/ETH reference (wrapped spot).
 */

import { hyperliquidPerpMids } from "./hyperliquid-price.js";
import { treasuryPoolInfo } from "./treasury-pool-info.js";

/** Hyperliquid mainnet spot pair keys (UBTC/USDC, UETH/USDC) in allMids — see spotMeta. */
export const HL_SPOT_BTC_ETH_KEYS = Object.freeze({
  btc: "@142",
  eth: "@151",
  btcLabel: "UBTC/USDC (HL spot)",
  ethLabel: "UETH/USDC (HL spot)",
});

/**
 * @param {object} [env] - passed to treasuryPoolInfo (RPC, etc.)
 * @returns {Promise<object>}
 */
export async function captureTradingSnapshot(env = {}) {
  const hl = await hyperliquidPerpMids(
    {
      market: "spot",
      coins: [HL_SPOT_BTC_ETH_KEYS.btc, HL_SPOT_BTC_ETH_KEYS.eth],
    },
    env
  );

  const pools = {};
  for (const pair of ["SABTC_SAUSD", "SAETH_SAUSD"]) {
    pools[pair] = await treasuryPoolInfo({ pair }, env);
  }

  const out = {
    ok: hl.ok && pools.SABTC_SAUSD?.ok && pools.SAETH_SAUSD?.ok,
    hyperliquid: hl,
    pools,
    keys: HL_SPOT_BTC_ETH_KEYS,
  };

  if (!hl.ok) {
    out.error = hl.error || "Hyperliquid snapshot failed";
    return out;
  }

  const mids = hl.mids_usd || {};
  const btcPx = mids[HL_SPOT_BTC_ETH_KEYS.btc];
  const ethPx = mids[HL_SPOT_BTC_ETH_KEYS.eth];

  out.summary = {
    hl_spot_btc_usd: btcPx,
    hl_spot_eth_usd: ethPx,
    pool_sabtc_ok: !!pools.SABTC_SAUSD?.ok,
    pool_saeth_ok: !!pools.SAETH_SAUSD?.ok,
  };

  return out;
}
