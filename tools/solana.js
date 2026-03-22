/**
 * Solana tools: balance, transfer (SOL). Agent wallet from env (SOLANA_PRIVATE_KEY or SOLANA_KEYPAIR_PATH).
 * RPC: SOLANA_RPC_URL (primary). Optional pacing: SOLANA_RPC_PACE_MS (min gap between paced tool calls, reduces 429 on public RPC).
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SPL_TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/** Canonical mainnet mints — labels for solana_balance only; do not guess other tickers in chat. */
const WELL_KNOWN_MAINNET_SPL_SYMBOL = Object.freeze({
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
});

/** Built-in Solana Agent SPL mints (same as server DEFAULT_SA_AGENT_TOKEN_MINTS). */
const BUILTIN_AGENT_MINT_SYMBOL = Object.freeze({
  "2kR1UKhrXq6Hef6EukLyzdD5ahcezRqwURKdtCJx2Ucy": "SABTC",
  AhyZRrDrN3apDzZqdRHtpxWmnqYDdL8VnJ66ip1KbiDS: "SAETH",
  CK9PodBifHymLBGeZujExFnpoLCsYxAw7t8c8LsDKLxG: "SAUSD",
});

/**
 * Single display symbol per balance row. Well-known SPL wins over configured agent map
 * so e.g. USDT mint is never labeled SABTC even if an operator override points SABTC at that mint.
 */
function tokenSymbolForBalanceMint(mint, env) {
  const m = String(mint || "").trim();
  if (!m) return null;
  const well = WELL_KNOWN_MAINNET_SPL_SYMBOL[m];
  if (well) return well;
  const built = BUILTIN_AGENT_MINT_SYMBOL[m];
  if (built) return built;
  const map = env.saAgentTokenMap;
  if (map && typeof map === "object") {
    for (const [sym, addr] of Object.entries(map)) {
      if (String(addr || "").trim() === m) return String(sym).toUpperCase();
    }
  }
  return null;
}

/** Normalize parsed token account for wallet list / balances (legacy + Token-2022). */
function parsedTokenAccountToEntry(a) {
  const info = a.account?.data?.parsed?.info;
  const ta = info?.tokenAmount;
  const mint = info?.mint;
  if (!mint || !ta) return null;
  const decimals = Number(ta.decimals) || 0;
  const raw = ta.amount != null ? String(ta.amount) : "0";
  let uiAmount = ta.uiAmount;
  if (typeof uiAmount !== "number" || Number.isNaN(uiAmount)) {
    const uis = ta.uiAmountString;
    if (uis != null && uis !== "") {
      const p = parseFloat(uis);
      if (Number.isFinite(p)) uiAmount = p;
    }
  }
  if (typeof uiAmount !== "number" || Number.isNaN(uiAmount)) {
    try {
      uiAmount = Number(BigInt(raw)) / 10 ** decimals;
    } catch {
      uiAmount = 0;
    }
  }
  return { mint, amount: raw, decimals, uiAmount };
}

/**
 * Merge legacy + Token-2022 RPC results without double-counting the same ATA.
 * Some RPCs return the same token account pubkey for both programId filters when `mint` is set.
 */
function dedupeParsedTokenAccountsByPubkey(rows) {
  const byPk = new Map();
  for (const a of rows || []) {
    if (!a?.pubkey) continue;
    try {
      const pk = a.pubkey.toBase58();
      if (!byPk.has(pk)) byPk.set(pk, a);
    } catch {
      /* skip malformed */
    }
  }
  return [...byPk.values()];
}

export function getRpcUrl(env = {}) {
  const url =
    env.SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com";
  return url;
}

export function getConnection(env = {}) {
  const url = getRpcUrl(env);
  return new Connection(url, { commitment: "confirmed" });
}

/** Parsed 0–5000 ms; 0 = disabled. */
function parseRpcPaceMs(env = {}) {
  const raw = String(env.SOLANA_RPC_PACE_MS ?? process.env.SOLANA_RPC_PACE_MS ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5000, Math.floor(n));
}

let paceChain = Promise.resolve();
let nextPaceSlot = 0;

/**
 * Enforce a minimum interval between successive Solana tool calls (global per process).
 * Set SOLANA_RPC_PACE_MS in Settings → Environment (e.g. 150–300) when using strict public RPC.
 */
export async function paceSolanaRpc(env = {}) {
  const gap = parseRpcPaceMs(env);
  if (gap <= 0) return;
  paceChain = paceChain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, nextPaceSlot - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nextPaceSlot = Date.now() + gap;
  });
  await paceChain;
}

/** Strip whitespace, ZWSP, NBSP, line separators — models often paste broken mints. */
export function sanitizeSolanaBase58Input(s) {
  if (s == null) return "";
  let t = String(s)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/[\u2028\u2029]/g, "")
    .replace(/[\u2018\u2019\u201C\u201D\u00AB\u00BB]/g, "")
    .replace(/\s+/g, "");
  // Trailing junk from copy-paste (e.g. mint; from "SABTC xxx; SAETH …" in descriptions)
  t = t.replace(/^[`"'([\]]+/, "").replace(/[`"'),.;:\]]+$/g, "");
  return t;
}

/** Max network fee (lamports) for auto-send without extra human approval — 0.001 SOL. */
const MAX_AUTO_NETWORK_FEE_LAMPORTS = 1_000_000;

function looksLikeBase58Mint(s) {
  const t = String(s).trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t);
}

/**
 * Parse SPL amount: prefer `amount` (raw integer string), else `amount_ui` decimal string/number.
 */
function parseTokenSendAmount(amountRaw, amountUi, decimals) {
  if (typeof amountRaw === "number" && Number.isFinite(amountRaw) && amountRaw > 0) {
    if (!Number.isInteger(amountRaw)) {
      return { ok: false, error: "amount as number must be a positive integer (smallest token units)" };
    }
    amountRaw = String(amountRaw);
  }
  if (amountRaw != null && String(amountRaw).trim() !== "") {
    const s = String(amountRaw).trim();
    if (!/^\d+$/.test(s) || BigInt(s) <= 0n) {
      return { ok: false, error: "amount must be a positive integer string (smallest token units)" };
    }
    return { ok: true, raw: BigInt(s) };
  }
  if (amountUi == null || amountUi === "") {
    return { ok: false, error: "Provide amount (smallest units as string) or amount_ui (decimal token amount)" };
  }
  const uiStr = String(amountUi).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(uiStr);
  if (!m) return { ok: false, error: "Invalid amount_ui; use e.g. 1.5 or 100" };
  const intPart = m[1] || "0";
  let frac = m[2] || "";
  if (frac.length > decimals) {
    return { ok: false, error: `amount_ui exceeds token decimals (${decimals})` };
  }
  frac = frac.padEnd(decimals, "0");
  const combined = intPart + frac;
  const raw = BigInt(combined);
  if (raw <= 0n) return { ok: false, error: "amount_ui must be positive" };
  return { ok: true, raw };
}

/**
 * Send a **native** Solana Agent SPL token by symbol (**SABTC**, **SAETH**, **SAUSD**).
 * Canonical mints are supplied by the server via env.saAgentTokenMap (built-in defaults; Settings can override).
 * Rejects if estimated base network fee exceeds 0.001 SOL. Checks token + SOL (fee + optional ATA rent) before sending.
 */
export async function solanaAgentTokenSend(args, env = {}) {
  await paceSolanaRpc(env);
  const tokenSymbol = String(args?.token_symbol ?? args?.token ?? "")
    .trim()
    .toUpperCase();
  const to = String(args?.to ?? "").trim();
  if (!tokenSymbol) {
    return { ok: false, error: "token_symbol required (e.g. SABTC, SAETH, SAUSD)" };
  }
  if (!to) {
    return { ok: false, error: "to (recipient Solana address) required" };
  }

  const map = env.saAgentTokenMap;
  if (!map || typeof map !== "object" || Object.keys(map).length === 0) {
    return {
      ok: false,
      error:
        "No token symbol map (unexpected in app: native SABTC/SAETH/SAUSD should always be present). If you are calling this standalone, pass saAgentTokenMap with those symbols.",
    };
  }

  const mintStr = map[tokenSymbol];
  if (!mintStr || !looksLikeBase58Mint(mintStr)) {
    const keys = Object.keys(map).sort().join(", ");
    return {
      ok: false,
      error: `Unknown or invalid mint for '${tokenSymbol}'. Configured symbols: ${keys || "(none)"}`,
    };
  }

  const keypair = await getKeypair(env);
  if (!keypair) {
    return { ok: false, error: "Solana wallet not configured" };
  }

  let toPubkey;
  let mintPubkey;
  try {
    toPubkey = new PublicKey(to);
    mintPubkey = new PublicKey(mintStr);
  } catch (e) {
    return { ok: false, error: `Invalid address or mint: ${e.message || String(e)}` };
  }

  try {
    const {
      getAssociatedTokenAddressSync,
      createTransferInstruction,
      createAssociatedTokenAccountIdempotentInstruction,
      TOKEN_PROGRAM_ID,
      getMint,
    } = await import("@solana/spl-token");
    const conn = getConnection(env);

    let decimals;
    try {
      const mintInfo = await getMint(conn, mintPubkey);
      decimals = mintInfo.decimals;
    } catch (e) {
      return { ok: false, error: `Failed to read mint metadata: ${e.message || String(e)}` };
    }

    const parsed = parseTokenSendAmount(args?.amount, args?.amount_ui, decimals);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const sendRaw = parsed.raw;

    const sourceAta = getAssociatedTokenAddressSync(mintPubkey, keypair.publicKey);
    const destAta = getAssociatedTokenAddressSync(mintPubkey, toPubkey);

    let sourceBal = 0n;
    try {
      const sb = await conn.getTokenAccountBalance(sourceAta);
      sourceBal = BigInt(sb.value.amount);
    } catch (_) {
      return {
        ok: false,
        error: "No token account for this mint on the app wallet (zero balance or missing ATA).",
        token_symbol: tokenSymbol,
        mint: mintStr,
      };
    }

    if (sourceBal < sendRaw) {
      return {
        ok: false,
        error: `Insufficient token balance: need ${sendRaw.toString()} smallest units, have ${sourceBal.toString()}`,
        token_symbol: tokenSymbol,
        mint: mintStr,
        decimals,
      };
    }

    const destInfo = await conn.getAccountInfo(destAta);
    const needsDestAta = !destInfo;
    const tokenAccRent = await conn.getMinimumBalanceForRentExemption(165);

    const tx = new Transaction();
    if (needsDestAta) {
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          keypair.publicKey,
          destAta,
          toPubkey,
          mintPubkey
        )
      );
    }
    tx.add(
      createTransferInstruction(
        sourceAta,
        destAta,
        keypair.publicKey,
        sendRaw,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("finalized");
    tx.feePayer = keypair.publicKey;
    tx.recentBlockhash = blockhash;
    const message = tx.compileMessage();
    const feeResp = await conn.getFeeForMessage(message);
    const networkFeeLamports = feeResp.value != null ? feeResp.value : 50_000;

    if (networkFeeLamports > MAX_AUTO_NETWORK_FEE_LAMPORTS) {
      return {
        ok: false,
        error: `Estimated network fee ${networkFeeLamports} lamports exceeds automatic limit of ${MAX_AUTO_NETWORK_FEE_LAMPORTS} lamports (0.001 SOL).`,
        estimated_network_fee_lamports: networkFeeLamports,
        max_auto_fee_lamports: MAX_AUTO_NETWORK_FEE_LAMPORTS,
      };
    }

    const solBalance = await conn.getBalance(keypair.publicKey);
    const ataRentLamports = needsDestAta ? tokenAccRent : 0;
    const bufferLamports = 5_000;
    const solRequired = networkFeeLamports + ataRentLamports + bufferLamports;
    if (solBalance < solRequired) {
      return {
        ok: false,
        error: `Insufficient SOL: need at least ${solRequired} lamports (network fee + ${needsDestAta ? "new ATA rent + " : ""}buffer), have ${solBalance}`,
        estimated_network_fee_lamports: networkFeeLamports,
        ata_rent_lamports: ataRentLamports,
        sol_balance_lamports: solBalance,
      };
    }

    const sig = await conn.sendTransaction(tx, [keypair], {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
    const conf = await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    if (conf.value?.err) {
      return {
        ok: false,
        error: `Transaction failed: ${JSON.stringify(conf.value.err)}`,
        signature: sig,
      };
    }

    const uiAmount = decimals ? Number(sendRaw) / 10 ** decimals : Number(sendRaw);
    return {
      ok: true,
      signature: sig,
      token_symbol: tokenSymbol,
      mint: mintStr,
      to,
      amount: sendRaw.toString(),
      amount_ui: uiAmount,
      decimals,
      estimated_network_fee_lamports: networkFeeLamports,
      created_recipient_ata: needsDestAta,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function getKeypair(env = {}) {
  const keyPath = env.SOLANA_KEYPAIR_PATH || process.env.SOLANA_KEYPAIR_PATH;
  if (keyPath && existsSync(keyPath)) {
    const data = JSON.parse(readFileSync(keyPath, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(data));
  }
  const secret = env.SOLANA_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY;
  if (!secret || typeof secret !== "string") return null;
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  try {
    const bs58 = await import("bs58");
    const bytes = bs58.default.decode(trimmed);
    return Keypair.fromSecretKey(bytes);
  } catch (_) {}
  return null;
}

export async function solanaBalance(args, env = {}) {
  await paceSolanaRpc(env);
  const keypair = await getKeypair(env);
  if (!keypair) {
    return { ok: false, error: "Solana wallet not configured. Set SOLANA_PRIVATE_KEY or SOLANA_KEYPAIR_PATH in .env" };
  }
  try {
    const conn = getConnection(env);
    const pubkey = keypair.publicKey;
    const lamports = await conn.getBalance(pubkey);
    const sol = lamports / LAMPORTS_PER_SOL;
    const [legacyRes, t22Res] = await Promise.all([
      conn.getParsedTokenAccountsByOwner(pubkey, { programId: SPL_TOKEN_PROGRAM_ID }),
      conn.getParsedTokenAccountsByOwner(pubkey, { programId: SPL_TOKEN_2022_PROGRAM_ID }),
    ]);
    const combined = dedupeParsedTokenAccountsByPubkey([
      ...(legacyRes.value || []),
      ...(t22Res.value || []),
    ]);
    const tokens = combined
      .map(parsedTokenAccountToEntry)
      .filter(Boolean)
      .map((t) => {
        const token_symbol = tokenSymbolForBalanceMint(t.mint, env);
        return token_symbol ? { ...t, token_symbol } : t;
      });
    return {
      ok: true,
      address: pubkey.toBase58(),
      sol,
      lamports,
      tokens: tokens.length ? tokens : undefined,
      balance_symbol_note:
        "Each SPL row may include token_symbol only for well-known mints (e.g. USDC, USDT) or built-in agent mints (SABTC, SAETH, SAUSD). Otherwise use mint + decimals + uiAmount only—do not invent tickers.",
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function solanaTransfer(args, env = {}) {
  await paceSolanaRpc(env);
  const { to, amount_sol } = args || {};
  if (!to || typeof to !== "string" || !to.trim()) {
    return { ok: false, error: "to (recipient address) required" };
  }
  const amount = typeof amount_sol === "number" ? amount_sol : parseFloat(amount_sol);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount_sol must be a positive number" };
  }
  const keypair = await getKeypair(env);
  if (!keypair) {
    return { ok: false, error: "Solana wallet not configured. Set SOLANA_PRIVATE_KEY or SOLANA_KEYPAIR_PATH in .env" };
  }
  try {
    const { Transaction, SystemProgram } = await import("@solana/web3.js");
    const conn = getConnection(env);
    const toPubkey = new PublicKey(to.trim());
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey,
        lamports,
      })
    );
    const sig = await conn.sendTransaction(tx, [keypair], { skipPreflight: false, preflightCommitment: "confirmed" });
    const conf = await conn.confirmTransaction(sig, "confirmed");
    if (conf.value?.err) {
      return { ok: false, error: `Transaction failed: ${JSON.stringify(conf.value.err)}`, signature: sig };
    }
    return { ok: true, signature: sig, amount_sol: amount, to: to.trim() };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export function solanaAddress(env = {}) {
  return getKeypair(env).then((kp) => (kp ? { ok: true, address: kp.publicKey.toBase58() } : { ok: false, error: "Solana wallet not configured" }));
}

/** Like account_chains: return current RPC and cluster (mainnet-beta, devnet, testnet). */
export function solanaNetwork(env = {}) {
  const url = getRpcUrl(env);
  let cluster = "mainnet-beta";
  if (/devnet|dev\.solana/.test(url)) cluster = "devnet";
  else if (/testnet|test\.solana/.test(url)) cluster = "testnet";
  return { ok: true, rpcUrl: url, cluster };
}

/** SPL token balance for a mint (for the wallet, or optional owner address). */
export async function solanaTokenBalance(args, env = {}) {
  await paceSolanaRpc(env);
  const ownerRaw = args?.owner;
  const sym = String(args?.token_symbol ?? "")
    .trim()
    .toUpperCase();
  const map = env.saAgentTokenMap && typeof env.saAgentTokenMap === "object" ? env.saAgentTokenMap : null;
  const mintFromSymbol = sym && map && map[sym] ? String(map[sym]).trim() : "";
  const mintFromArg = sanitizeSolanaBase58Input(args?.mint);
  // Prefer server-resolved mint for native symbols so bad pastes cannot override.
  const mint = mintFromSymbol || mintFromArg;
  const owner = ownerRaw != null ? sanitizeSolanaBase58Input(ownerRaw) : "";
  if (!mint) {
    return {
      ok: false,
      error:
        "Provide mint (full base58 SPL mint) or token_symbol (SABTC, SAETH, or SAUSD — server resolves mint; preferred for those three).",
    };
  }
  const keypair = await getKeypair(env);
  if (!keypair) {
    return { ok: false, error: "Solana wallet not configured" };
  }
  try {
    const conn = getConnection(env);
    let mintPubkey;
    let ownerPubkey;
    try {
      mintPubkey = new PublicKey(mint);
      ownerPubkey = owner ? new PublicKey(owner) : keypair.publicKey;
    } catch (e) {
      return {
        ok: false,
        error: `Invalid base58 mint or owner: ${e.message || String(e)}. For SAUSD/SABTC/SAETH pass token_symbol only (e.g. "SABTC") so the server uses the canonical mint; otherwise use the full mint — see docs/SA_AGENT_TOKENS.md.`,
      };
    }
    const [legacyRes, t22Res] = await Promise.all([
      conn.getParsedTokenAccountsByOwner(ownerPubkey, {
        mint: mintPubkey,
        programId: SPL_TOKEN_PROGRAM_ID,
      }),
      conn.getParsedTokenAccountsByOwner(ownerPubkey, {
        mint: mintPubkey,
        programId: SPL_TOKEN_2022_PROGRAM_ID,
      }),
    ]);
    const rawRows = dedupeParsedTokenAccountsByPubkey([
      ...(legacyRes.value || []),
      ...(t22Res.value || []),
    ]);
    const accounts = rawRows.map((a) => {
      const entry = parsedTokenAccountToEntry(a);
      if (!entry) {
        return { mint, amount: "0", uiAmount: 0, decimals: 0 };
      }
      return {
        mint: entry.mint,
        amount: entry.amount,
        uiAmount: entry.uiAmount,
        decimals: entry.decimals,
      };
    });
    const totalBn = accounts.reduce((sum, a) => {
      try {
        return sum + BigInt(String(a.amount || "0"));
      } catch {
        return sum;
      }
    }, 0n);
    const decimals = accounts[0]?.decimals ?? 0;
    const totalStr = totalBn.toString();
    let uiAmount = 0;
    try {
      uiAmount = decimals ? Number(totalBn) / 10 ** decimals : Number(totalBn);
    } catch {
      uiAmount = 0;
    }
    const builtInMint =
      sym && env.agentTokenBuiltInMints && env.agentTokenBuiltInMints[sym]
        ? String(env.agentTokenBuiltInMints[sym]).trim()
        : null;
    const mintMatchesBuiltIn = Boolean(builtInMint && mint === builtInMint);
    return {
      ok: true,
      address: ownerPubkey.toBase58(),
      mint,
      ...(sym ? { token_symbol: sym } : {}),
      ...(builtInMint
        ? {
            built_in_mint: builtInMint,
            mint_matches_built_in: mintMatchesBuiltIn,
          }
        : {}),
      balance: totalStr,
      uiAmount,
      decimals,
      accounts: accounts.length > 1 ? accounts : undefined,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Transfer SPL tokens. Creates recipient ATA if needed. */
export async function solanaTransferSpl(args, env = {}) {
  await paceSolanaRpc(env);
  const { mint, to, amount, decimals } = args || {};
  if (!mint || !to || amount == null) {
    return { ok: false, error: "mint, to, and amount are required" };
  }
  const keypair = await getKeypair(env);
  if (!keypair) {
    return { ok: false, error: "Solana wallet not configured" };
  }
  const dec = decimals != null ? Number(decimals) : null;
  const amt = typeof amount === "string" ? amount : String(amount);
  if (!/^\d+$/.test(amt) || BigInt(amt) <= 0n) {
    return { ok: false, error: "amount must be a positive integer (smallest units)" };
  }
  try {
    const { Transaction } = await import("@solana/web3.js");
    const {
      getAssociatedTokenAddressSync,
      createTransferInstruction,
      createAssociatedTokenAccountIdempotentInstruction,
      TOKEN_PROGRAM_ID,
    } = await import("@solana/spl-token");
    const conn = getConnection(env);
    const mintPubkey = new PublicKey(mint.trim());
    const toPubkey = new PublicKey(to.trim());
    const sourceAta = getAssociatedTokenAddressSync(mintPubkey, keypair.publicKey);
    const destAta = getAssociatedTokenAddressSync(mintPubkey, toPubkey);
    const tx = new Transaction();
    const destInfo = await conn.getAccountInfo(destAta);
    if (!destInfo) {
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          keypair.publicKey,
          destAta,
          toPubkey,
          mintPubkey
        )
      );
    }
    tx.add(
      createTransferInstruction(
        sourceAta,
        destAta,
        keypair.publicKey,
        BigInt(amt),
        [],
        TOKEN_PROGRAM_ID
      )
    );
    const sig = await conn.sendTransaction(tx, [keypair], { skipPreflight: false, preflightCommitment: "confirmed" });
    const conf = await conn.confirmTransaction(sig, "confirmed");
    if (conf.value?.err) {
      return { ok: false, error: `Transaction failed: ${JSON.stringify(conf.value.err)}`, signature: sig };
    }
    const uiAmount = dec != null && Number.isFinite(dec) ? Number(amt) / Math.pow(10, dec) : null;
    return {
      ok: true,
      signature: sig,
      mint: mint.trim(),
      to: to.trim(),
      amount,
      uiAmount,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Recent transaction signatures for the wallet (like account_tx_history). */
export async function solanaTxHistory(args, env = {}) {
  await paceSolanaRpc(env);
  const keypair = await getKeypair(env);
  if (!keypair) {
    return { ok: false, error: "Solana wallet not configured", signatures: [] };
  }
  const limit = Math.min(Math.max(1, parseInt(args?.limit, 10) || 20), 50);
  try {
    const conn = getConnection(env);
    const sigs = await conn.getSignaturesForAddress(keypair.publicKey, { limit });
    return {
      ok: true,
      address: keypair.publicKey.toBase58(),
      signatures: sigs.map((s) => ({
        signature: s.signature,
        blockTime: s.blockTime,
        err: s.err,
        slot: s.slot,
      })),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), signatures: [] };
  }
}

/** Transaction status by signature (like account_tx_status). */
export async function solanaTxStatus(args, env = {}) {
  await paceSolanaRpc(env);
  const { signature } = args || {};
  if (!signature || typeof signature !== "string" || !signature.trim()) {
    return { ok: false, error: "signature (transaction signature) required" };
  }
  try {
    const conn = getConnection(env);
    const status = await conn.getSignatureStatus(signature.trim());
    if (!status) {
      return { ok: true, signature: signature.trim(), status: "not_found", confirmationStatus: null };
    }
    const conf = status.confirmationStatus || (status.err ? "finalized" : null);
    return {
      ok: true,
      signature: signature.trim(),
      status: status.err ? "failed" : "success",
      confirmationStatus: conf,
      err: status.err ?? undefined,
      slot: status.slot,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
