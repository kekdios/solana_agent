/**
 * Jupiter price and quote tools. SOL/USDC price; optional swap quote (no execution).
 * Price API: https://api.jup.ag/price/v3 (optional JUPITER_API_KEY in .env).
 */

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUPITER_PRICE_URL = "https://api.jup.ag/price/v3";
const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";

export async function jupiterPrice(args, env = {}) {
  const ids = (args?.ids || "SOL").toString().toUpperCase();
  const tokenIds = ids === "SOL" ? SOL_MINT : ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (tokenIds.length === 0) tokenIds.push(SOL_MINT);
  const url = `${JUPITER_PRICE_URL}?ids=${tokenIds.join(",")}`;
  const headers = {};
  const apiKey = env.JUPITER_API_KEY || process.env.JUPITER_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, error: `Jupiter price API ${res.status}` };
    const data = await res.json();
    const prices = data.data || data;
    const out = {};
    for (const id of tokenIds) {
      const p = prices[id];
      if (p) out[id === SOL_MINT ? "SOL" : id] = { usdPrice: p.usdPrice, priceChange24h: p.priceChange24h };
    }
    return { ok: true, prices: out };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function jupiterQuote(args, env = {}) {
  const { input_mint, output_mint, amount } = args || {};
  const inMint = (input_mint || SOL_MINT).trim();
  const outMint = (output_mint || USDC_MINT).trim();
  const amountLamports = String(amount || "1000000000");
  const url = `${JUPITER_QUOTE_URL}?inputMint=${inMint}&outputMint=${outMint}&amount=${amountLamports}&slippageBps=50`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, error: `Jupiter quote API ${res.status}` };
    const data = await res.json();
    const outAmount = data.outAmount || data.outputAmount;
    const inAmount = data.inAmount || data.inputAmount;
    return {
      ok: true,
      inputMint: inMint,
      outputMint: outMint,
      inAmount: inAmount || amountLamports,
      outAmount: outAmount || "0",
      priceImpact: data.priceImpactPct,
      routePlan: data.routePlan ? "present" : undefined,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
