/**
 * Solana tools: balance, transfer (SOL). Agent wallet from env (SOLANA_PRIVATE_KEY or SOLANA_KEYPAIR_PATH).
 * RPC: SOLANA_RPC_URL (primary), SOLANA_RPC_FALLBACK.
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function getRpcUrl(env = {}) {
  const url =
    env.SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com";
  return url;
}

function getConnection(env = {}) {
  const url = getRpcUrl(env);
  return new Connection(url, { commitment: "confirmed" });
}

async function getKeypair(env = {}) {
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
  const keypair = await getKeypair(env);
  if (!keypair) {
    return { ok: false, error: "Solana wallet not configured. Set SOLANA_PRIVATE_KEY or SOLANA_KEYPAIR_PATH in .env" };
  }
  try {
    const conn = getConnection(env);
    const pubkey = keypair.publicKey;
    const lamports = await conn.getBalance(pubkey);
    const sol = lamports / LAMPORTS_PER_SOL;
    const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pubkey, { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") });
    const tokens = (tokenAccounts.value || []).map((a) => ({
      mint: a.account.data.parsed?.info?.mint,
      symbol: a.account.data.parsed?.info?.tokenAmount?.decimals != null ? "token" : undefined,
      amount: a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? a.account.data.parsed?.info?.tokenAmount?.amount,
      decimals: a.account.data.parsed?.info?.tokenAmount?.decimals,
    }));
    return {
      ok: true,
      address: pubkey.toBase58(),
      sol,
      lamports,
      tokens: tokens.length ? tokens : undefined,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function solanaTransfer(args, env = {}) {
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
  const { mint, owner } = args || {};
  if (!mint || typeof mint !== "string" || !mint.trim()) {
    return { ok: false, error: "mint (token mint address) required" };
  }
  const keypair = await getKeypair(env);
  if (!keypair) {
    return { ok: false, error: "Solana wallet not configured" };
  }
  try {
    const conn = getConnection(env);
    const mintPubkey = new PublicKey(mint.trim());
    const ownerPubkey = owner && owner.trim()
      ? new PublicKey(owner.trim())
      : keypair.publicKey;
    const tokenAccounts = await conn.getParsedTokenAccountsByOwner(ownerPubkey, {
      mint: mintPubkey,
    });
    const accounts = (tokenAccounts.value || []).map((a) => {
      const info = a.account.data?.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      return {
        mint: info?.mint,
        amount: tokenAmount?.amount ?? "0",
        uiAmount: tokenAmount?.uiAmount ?? 0,
        decimals: tokenAmount?.decimals ?? 0,
      };
    });
    const total = accounts.reduce((sum, a) => sum + Number(a.amount || 0), 0);
    const decimals = accounts[0]?.decimals ?? 0;
    return {
      ok: true,
      address: ownerPubkey.toBase58(),
      mint: mint.trim(),
      balance: String(total),
      uiAmount: decimals ? total / Math.pow(10, decimals) : total,
      decimals,
      accounts: accounts.length > 1 ? accounts : undefined,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/** Transfer SPL tokens. Creates recipient ATA if needed. */
export async function solanaTransferSpl(args, env = {}) {
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
