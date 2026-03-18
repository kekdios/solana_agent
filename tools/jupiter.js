/**
 * Jupiter price and quote tools. SOL/USDC price; optional swap quote (no execution).
 * Price API: https://api.jup.ag/price/v3 (optional JUPITER_API_KEY in .env).
 */

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUPITER_PRICE_URL = "https://api.jup.ag/price/v3";
const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";
const JUPITER_METIS_QUOTE_URL = "https://api.jup.ag/swap/v1/quote";
const JUPITER_METIS_SWAP_URL = "https://api.jup.ag/swap/v1/swap";

function stableStringify(obj) {
  if (obj == null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

async function sha256Hex(text) {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

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

/**
 * Prepare a sovereign swap intent using Jupiter Metis quote API.
 * This does not execute a swap; it returns a quote snapshot suitable for intent storage.
 */
export async function jupiterSwapPrepare(args, env = {}) {
  const { input_mint, output_mint, amount, slippage_bps } = args || {};
  const inMint = (input_mint || SOL_MINT).trim();
  const outMint = (output_mint || USDC_MINT).trim();
  const amountIn = String(amount || "0").trim();
  const slippageBps = Math.max(1, Math.min(Number(slippage_bps ?? 50) || 50, 5000));
  if (!amountIn || amountIn === "0") return { ok: false, error: "amount (smallest units) is required" };

  const apiKey = env.JUPITER_API_KEY || process.env.JUPITER_API_KEY;
  const headers = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const url = `${JUPITER_METIS_QUOTE_URL}?inputMint=${encodeURIComponent(inMint)}&outputMint=${encodeURIComponent(outMint)}&amount=${encodeURIComponent(amountIn)}&slippageBps=${encodeURIComponent(String(slippageBps))}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const hint = res.status === 401 || res.status === 403 ? " (check JUPITER_API_KEY / x-api-key)" : "";
      return { ok: false, error: `Jupiter Metis quote ${res.status}${hint}${txt ? `: ${txt.slice(0, 200)}` : ""}` };
    }
    const quote = await res.json();
    const inAmount = quote.inAmount || quote.inputAmount || amountIn;
    const outAmount = quote.outAmount || quote.outputAmount;
    if (!outAmount) return { ok: false, error: "Quote missing outAmount" };

    // Compute min-out (string integers).
    const outBig = BigInt(String(outAmount));
    const minOut = (outBig * BigInt(10_000 - slippageBps)) / BigInt(10_000);

    const quoteCanonical = stableStringify(quote);
    const quoteHash = await sha256Hex(quoteCanonical);

    return {
      ok: true,
      inputMint: inMint,
      outputMint: outMint,
      inAmount: String(inAmount),
      outAmount: String(outAmount),
      minOutAmount: minOut.toString(),
      slippageBps,
      quote,
      quote_hash: quoteHash,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Build a swap transaction (base64) for a previously fetched quote response.
 * Returns swapTransaction (base64) and lastValidBlockHeight when provided by Jupiter.
 */
export async function jupiterSwapBuildTx(args, env = {}) {
  const { quote, userPublicKey, wrapUnwrapSOL } = args || {};
  if (!quote || typeof quote !== "object") return { ok: false, error: "quote is required" };
  const pub = String(userPublicKey || "").trim();
  if (!pub) return { ok: false, error: "userPublicKey is required" };

  const apiKey = env.JUPITER_API_KEY || process.env.JUPITER_API_KEY;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const body = {
    quoteResponse: quote,
    userPublicKey: pub,
    wrapAndUnwrapSol: wrapUnwrapSOL !== false,
    dynamicComputeUnitLimit: true,
  };

  try {
    const res = await fetch(JUPITER_METIS_SWAP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const hint = res.status === 401 || res.status === 403 ? " (check JUPITER_API_KEY / x-api-key)" : "";
      return { ok: false, error: `Jupiter swap ${res.status}${hint}${txt ? `: ${txt.slice(0, 200)}` : ""}` };
    }
    const data = await res.json();
    const swapTransaction = data.swapTransaction || data.swap_transaction;
    if (!swapTransaction) return { ok: false, error: "Swap response missing swapTransaction" };
    return { ok: true, swapTransaction, lastValidBlockHeight: data.lastValidBlockHeight };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
