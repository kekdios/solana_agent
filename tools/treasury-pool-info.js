/**
 * Read-only Whirlpool pool snapshot for treasury pairs (and optional custom address).
 * Logic aligned with solanaagent.app: try Orca REST API, then decode pool + vaults on Solana RPC.
 * See website: lib/orca-whirlpool-onchain.cjs + api-server.cjs /api/orca/pool/{address}
 */

import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { getConnection, paceSolanaRpc } from "./solana.js";

const ORCA_POOLS_API = "https://api.orca.so/v2/solana/pools";

const DEFAULT_POOLS = Object.freeze({
  SABTC_SAUSD: "GSpVz4P5HKzVBccAFAdfWzXc1VYhGLKvzRNQZCw4KCoJ",
  SAETH_SAUSD: "BzwjX8hwMbkVdhGu2w9qTtokr5ExqSDSw9bNMxdkExRS",
});

const WHIRLPOOL_PROGRAM_ID = new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
const MPL_TOKEN_METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const DISC_LEN = 8;
const MIN_DATA_LEN = DISC_LEN + 261;

function formatWhirlpoolSwapFeePercent(feeRate, decimalPlaces = 4) {
  const n = Number(feeRate);
  if (!Number.isFinite(n) || n < 0) return "—";
  return ((n / 1_000_000) * 100).toFixed(decimalPlaces) + "%";
}

function readU128LE(buf, offset) {
  const lo = buf.readBigUInt64LE(offset);
  const hi = buf.readBigUInt64LE(offset + 8);
  return lo | (hi << 64n);
}

function readPubkey(buf, offset) {
  return new PublicKey(buf.subarray(offset, offset + 32));
}

function decodeMplTokenMetadataNameSymbol(data) {
  if (!data || !Buffer.isBuffer(data) || data.length < 100) return { name: null, symbol: null };
  try {
    let i = 1 + 32 + 32;
    const readStr = () => {
      const len = data.readUInt32LE(i);
      i += 4;
      const s = data.slice(i, i + len).toString("utf8").replace(/\0/g, "").trim();
      i += len;
      return s;
    };
    const name = readStr();
    const symbol = readStr();
    return { name, symbol };
  } catch {
    return { name: null, symbol: null };
  }
}

async function fetchMplTokenMetadataNameSymbol(connection, mintPk) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), MPL_TOKEN_METADATA.toBuffer(), mintPk.toBuffer()],
    MPL_TOKEN_METADATA
  );
  const acc = await connection.getAccountInfo(pda);
  if (!acc || !acc.data) return { name: null, symbol: null };
  return decodeMplTokenMetadataNameSymbol(Buffer.from(acc.data));
}

function decodeWhirlpoolAccount(dataBuf) {
  if (!Buffer.isBuffer(dataBuf) || dataBuf.length < MIN_DATA_LEN) return null;
  const b = dataBuf;
  let o = DISC_LEN;
  o += 32;
  o += 1;
  const tickSpacing = b.readUInt16LE(o);
  o += 2;
  o += 2;
  const feeRate = b.readUInt16LE(o);
  o += 2;
  const protocolFeeRate = b.readUInt16LE(o);
  o += 2;
  const liquidity = readU128LE(b, o);
  o += 16;
  const sqrtPrice = readU128LE(b, o);
  o += 16;
  const tickCurrentIndex = b.readInt32LE(o);
  o += 4;
  o += 8;
  o += 8;
  const tokenMintA = readPubkey(b, o);
  o += 32;
  const tokenVaultA = readPubkey(b, o);
  o += 32;
  o += 16;
  const tokenMintB = readPubkey(b, o);
  o += 32;
  const tokenVaultB = readPubkey(b, o);
  return {
    tickSpacing,
    feeRate,
    protocolFeeRate,
    liquidity,
    sqrtPrice,
    tickCurrentIndex,
    tokenMintA,
    tokenVaultA,
    tokenMintB,
    tokenVaultB,
  };
}

/** Token B per 1 token A from sqrt price Q64.64 (same as website). */
function sqrtPriceToApproxTokenBPerTokenA(sqrtPriceX64, decimalsA, decimalsB) {
  const sqrt = BigInt(String(sqrtPriceX64));
  if (sqrt <= 0n) return null;
  const q64 = 1n << 64n;
  const num = sqrt * sqrt;
  const den = q64 * q64;
  const decDiff = Number(decimalsA) - Number(decimalsB);
  let numerator = num;
  let denominator = den;
  try {
    if (decDiff >= 0) {
      const factor = 10n ** BigInt(Math.min(decDiff, 24));
      numerator = num * factor;
    } else {
      const factor = 10n ** BigInt(Math.min(-decDiff, 24));
      denominator = den * factor;
    }
    const intPart = numerator / denominator;
    const frac = numerator % denominator;
    if (frac === 0n) return intPart.toString();
    const fracDigits = 8n;
    const fracScaled = (frac * 10n ** fracDigits) / denominator;
    let fracStr = fracScaled.toString().padStart(8, "0").replace(/0+$/, "");
    return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
  } catch {
    return null;
  }
}

function uiFromRaw(raw, decimals) {
  const dec = Number(decimals);
  const r = BigInt(String(raw == null ? "0" : raw).split(".")[0] || "0");
  if (!Number.isFinite(dec) || dec < 0 || dec > 18) return String(raw);
  const neg = r < 0n;
  const x = neg ? -r : r;
  const whole = x / 10n ** BigInt(dec);
  const frac = x % 10n ** BigInt(dec);
  let fs = frac.toString().padStart(dec, "0").replace(/0+$/, "");
  if (fs.length) fs = "." + fs;
  return (neg ? "-" : "") + whole.toString() + fs;
}

async function fetchWhirlpoolPoolFromRpc(connection, poolAddressStr) {
  let poolPk;
  try {
    poolPk = new PublicKey(poolAddressStr);
  } catch {
    return { ok: false, error: "invalid_pool_pubkey" };
  }

  const acc = await connection.getAccountInfo(poolPk);
  if (!acc) return { ok: false, error: "pool_account_not_found" };
  if (!acc.owner.equals(WHIRLPOOL_PROGRAM_ID)) {
    return {
      ok: false,
      error: "not_whirlpool_account",
      message: `Owner is ${acc.owner.toBase58()}, expected Whirlpool program`,
    };
  }

  const raw = Buffer.from(acc.data);
  const wh = decodeWhirlpoolAccount(raw);
  if (!wh) return { ok: false, error: "invalid_whirlpool_data" };

  /** When SOLANA_RPC_STAGGER_MS > 0, space vault/mint/metadata RPCs (reduces burst 429 on public RPC). */
  const st = (() => {
    const n = Number(String(process.env.SOLANA_RPC_STAGGER_MS ?? "").trim());
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(500, Math.floor(n));
  })();
  const gap = () => (st > 0 ? new Promise((r) => setTimeout(r, st)) : Promise.resolve());

  let mintAInfo;
  let mintBInfo;
  let balARes;
  let balBRes;
  let metaA;
  let metaB;
  if (st > 0) {
    mintAInfo = await getMint(connection, wh.tokenMintA);
    await gap();
    mintBInfo = await getMint(connection, wh.tokenMintB);
    await gap();
    balARes = await connection.getTokenAccountBalance(wh.tokenVaultA).catch(() => null);
    await gap();
    balBRes = await connection.getTokenAccountBalance(wh.tokenVaultB).catch(() => null);
    await gap();
    metaA = await fetchMplTokenMetadataNameSymbol(connection, wh.tokenMintA);
    await gap();
    metaB = await fetchMplTokenMetadataNameSymbol(connection, wh.tokenMintB);
  } else {
    [mintAInfo, mintBInfo, balARes, balBRes, metaA, metaB] = await Promise.all([
      getMint(connection, wh.tokenMintA),
      getMint(connection, wh.tokenMintB),
      connection.getTokenAccountBalance(wh.tokenVaultA).catch(() => null),
      connection.getTokenAccountBalance(wh.tokenVaultB).catch(() => null),
      fetchMplTokenMetadataNameSymbol(connection, wh.tokenMintA),
      fetchMplTokenMetadataNameSymbol(connection, wh.tokenMintB),
    ]);
  }

  const decA = mintAInfo.decimals;
  const decB = mintBInfo.decimals;
  const priceApprox = sqrtPriceToApproxTokenBPerTokenA(wh.sqrtPrice, decA, decB);

  const tokenBalanceA = balARes?.value?.amount != null ? String(balARes.value.amount) : null;
  const tokenBalanceB = balBRes?.value?.amount != null ? String(balBRes.value.amount) : null;

  const data = {
    address: poolPk.toBase58(),
    tokenMintA: wh.tokenMintA.toBase58(),
    tokenMintB: wh.tokenMintB.toBase58(),
    tokenVaultA: wh.tokenVaultA.toBase58(),
    tokenVaultB: wh.tokenVaultB.toBase58(),
    tokenBalanceA,
    tokenBalanceB,
    tokenA: {
      address: wh.tokenMintA.toBase58(),
      decimals: decA,
      symbol: metaA.symbol || undefined,
    },
    tokenB: {
      address: wh.tokenMintB.toBase58(),
      decimals: decB,
      symbol: metaB.symbol || undefined,
    },
    feeRate: wh.feeRate,
    swapFeePercentDisplay: formatWhirlpoolSwapFeePercent(wh.feeRate),
    protocolFeeRate: wh.protocolFeeRate,
    tickSpacing: wh.tickSpacing,
    tickCurrentIndex: wh.tickCurrentIndex,
    liquidity: wh.liquidity.toString(),
    sqrtPrice: wh.sqrtPrice.toString(),
    poolType: "Whirlpool",
    poolDataSource: "solana_rpc",
    updatedAt: new Date().toISOString(),
    price: priceApprox != null ? priceApprox : undefined,
    tvlUsdc: undefined,
  };

  return { ok: true, data };
}

function hasOrcaPoolPayload(parsed) {
  return (
    parsed &&
    parsed.data &&
    typeof parsed.data === "object" &&
    (parsed.data.address || parsed.data.tokenMintA)
  );
}

function enrichOrcaData(d) {
  if (!d || typeof d !== "object") return d;
  const copy = { ...d };
  if (copy.swapFeePercentDisplay == null && copy.feeRate != null) {
    copy.swapFeePercentDisplay = formatWhirlpoolSwapFeePercent(copy.feeRate);
  }
  if (!copy.poolDataSource) copy.poolDataSource = "orca_api";
  return copy;
}

async function tryFetchJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: r.status, text, parsed: null };
  }
  return { ok: r.ok, status: r.status, text, parsed };
}

/**
 * @param {object} args
 * @param {string} [args.pair] - SABTC_SAUSD | SAETH_SAUSD
 * @param {string} [args.pool_address] - Whirlpool address (overrides pair)
 * @param {string} [args.orca_proxy_base_url] - e.g. https://www.solanaagent.app/api — try GET .../orca/pool/{addr} first
 * @param {object} env
 */
export async function treasuryPoolInfo(args, env = {}) {
  await paceSolanaRpc(env);
  const pair = String(args?.pair ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  let poolAddr = String(args?.pool_address ?? "").trim();

  if (!poolAddr) {
    if (pair === "SAETH_SAUSD" || pair === "SAETH-SAUSD") {
      poolAddr = (process.env.TREASURY_POOL_SAETH_SAUSD || "").trim() || DEFAULT_POOLS.SAETH_SAUSD;
    } else {
      poolAddr =
        pair === "SABTC_SAUSD" || pair === "SABTC-SAUSD" || pair === ""
          ? (process.env.TREASURY_POOL_SABTC_SAUSD || "").trim() || DEFAULT_POOLS.SABTC_SAUSD
          : "";
    }
  }

  if (!poolAddr || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(poolAddr)) {
    return {
      ok: false,
      error:
        "Provide pool_address (base58 Whirlpool) or pair: SABTC_SAUSD | SAETH_SAUSD (default SABTC_SAUSD).",
    };
  }

  const proxyBase = String(
    args?.orca_proxy_base_url ?? process.env.SOLANAAGENT_ORCA_API_BASE ?? ""
  ).replace(/\/$/, "");

  const conn = getConnection(env);

  const tryRpc = async () => {
    const out = await fetchWhirlpoolPoolFromRpc(conn, poolAddr);
    if (!out.ok) return out;
    return { ok: true, data: out.data, source: "solana_rpc" };
  };

  if (proxyBase) {
    try {
      const url = `${proxyBase}/orca/pool/${encodeURIComponent(poolAddr)}`;
      const fr = await tryFetchJson(url);
      if (fr.parsed && hasOrcaPoolPayload(fr.parsed)) {
        const d = enrichOrcaData(fr.parsed.data);
        return {
          ok: true,
          pool_address: poolAddr,
          pool_data_source: d.poolDataSource || "orca_proxy",
          data: d,
          agent_report: buildAgentReport(poolAddr, d),
        };
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const orcaUrl = `${ORCA_POOLS_API}/${encodeURIComponent(poolAddr)}`;
    const fr = await tryFetchJson(orcaUrl);
    if (fr.parsed && hasOrcaPoolPayload(fr.parsed)) {
      const d = enrichOrcaData(fr.parsed.data);
      return {
        ok: true,
        pool_address: poolAddr,
        pool_data_source: d.poolDataSource || "orca_api",
        data: d,
        agent_report: buildAgentReport(poolAddr, d),
      };
    }
  } catch {
    /* fall through */
  }

  const rpc = await tryRpc();
  if (!rpc.ok) {
    return {
      ok: false,
      pool_address: poolAddr,
      error: rpc.error || "Could not load pool from Orca API or Solana RPC",
      message: rpc.message,
    };
  }

  return {
    ok: true,
    pool_address: poolAddr,
    pool_data_source: "solana_rpc",
    data: rpc.data,
    agent_report: buildAgentReport(poolAddr, rpc.data),
  };
}

function buildAgentReport(poolAddr, d) {
  const ta = d.tokenA || {};
  const tb = d.tokenB || {};
  const symA = ta.symbol || "A";
  const symB = tb.symbol || "B";
  const balA = d.tokenBalanceA != null ? uiFromRaw(d.tokenBalanceA, ta.decimals) : "—";
  const balB = d.tokenBalanceB != null ? uiFromRaw(d.tokenBalanceB, tb.decimals) : "—";
  const fee =
    d.swapFeePercentDisplay != null && String(d.swapFeePercentDisplay).trim() !== ""
      ? String(d.swapFeePercentDisplay)
      : formatWhirlpoolSwapFeePercent(d.feeRate);

  const lines = [
    `Orca Whirlpool — pool ${poolAddr}`,
    `Token A (${symA}): ${balA} (UI from raw vault) | mint ${d.tokenMintA || ta.address}`,
    `Token B (${symB}): ${balB} (UI from raw vault) | mint ${d.tokenMintB || tb.address}`,
    d.price != null ? `Price (~token B per 1 token A, spot sqrt): ${d.price}` : null,
    d.tvlUsdc != null ? `TVL (USDC): ${d.tvlUsdc}` : null,
    `Swap fee (approx.): ${fee}`,
    d.protocolFeeRate != null ? `Protocol fee rate (raw): ${d.protocolFeeRate}` : null,
    d.tickSpacing != null ? `Tick spacing: ${d.tickSpacing}` : null,
    d.tickCurrentIndex != null ? `Current tick: ${d.tickCurrentIndex}` : null,
    d.liquidity != null ? `Liquidity (raw): ${d.liquidity}` : null,
    d.poolType ? `Pool type: ${d.poolType}` : null,
    d.updatedAt ? `Updated: ${d.updatedAt}` : null,
    d.poolDataSource === "solana_rpc"
      ? "Source: Solana RPC on-chain decode (Orca indexer omitted this pool or API empty). Not a trade quote — use treasury_pool_swap (+ dry_run) for executable size."
      : d.poolDataSource === "orca_api" || d.poolDataSource === "orca_proxy"
        ? "Source: Orca API / proxy JSON. Spot price is indicative; use treasury_pool_swap (+ dry_run) before sizing real trades."
        : `Source: ${d.poolDataSource || "unknown"}`,
  ].filter(Boolean);

  return lines.join("\n");
}
