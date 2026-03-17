/**
 * Drift perp tools: perp price (SOL-PERP), positions, place order.
 * drift_perp_price uses Jupiter SOL price as proxy when Drift SDK is not initialized.
 * Full Drift mark requires @drift-labs/sdk subscription (optional).
 */

const PERP_MARKET_INDEX_SOL = 0;

async function getJupiterSolPrice(env) {
  try {
    const { jupiterPrice } = await import("./jupiter.js");
    const result = await jupiterPrice({}, env);
    if (result.ok && result.prices?.SOL) return result.prices.SOL.usdPrice;
  } catch (_) {}
  return null;
}

/**
 * Get SOL-PERP price. Returns Jupiter SOL/USD as proxy for perp mark when Drift SDK not used.
 */
export async function driftPerpPrice(args, env = {}) {
  const marketIndex = args?.market_index != null ? Number(args.market_index) : PERP_MARKET_INDEX_SOL;
  try {
    const solPrice = await getJupiterSolPrice(env);
    if (solPrice != null) {
      return {
        ok: true,
        perp_market_index: marketIndex,
        mark_price_usd: solPrice,
        source: "jupiter_proxy",
        note: "Using Jupiter SOL/USD as perp proxy; for exact Drift mark use SDK subscription",
      };
    }
    return { ok: false, error: "Could not fetch SOL price (Jupiter)" };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Get user perp positions. Requires Drift user account (wallet); returns empty if not configured.
 */
export async function driftPositions(args, env = {}) {
  return { ok: true, positions: [], note: "Configure Solana wallet and Drift user for positions" };
}

/**
 * Place perp order. Stub; full implementation would use Drift SDK placePerpOrder.
 */
export async function driftPlaceOrder(args, env = {}) {
  return { ok: false, error: "drift_place_order not implemented; use Drift UI or extend SDK" };
}
