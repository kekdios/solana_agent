/**
 * SLIP-0010 ed25519 path for Solana BIP44 (same as ed25519-hd-key) via @noble/hashes v1.
 */
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha2";

const ED25519_SEED = new TextEncoder().encode("ed25519 seed");
const HARDENED = 0x80000000;

function hmacSha512(key, data) {
  return hmac(sha512, key, data);
}

function getMasterKeyFromSeed(seedBytes) {
  const I = hmacSha512(ED25519_SEED, seedBytes);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function ckdPriv({ key, chainCode }, index) {
  const indexBuffer = new Uint8Array(4);
  new DataView(indexBuffer.buffer).setUint32(0, index >>> 0, false);
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0;
  data.set(key, 1);
  data.set(indexBuffer, 33);
  const I = hmacSha512(chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

export function deriveSolanaSeedFromBip39Seed(bip39Seed, path = "m/44'/501'/0'/0'") {
  const segments = path
    .trim()
    .replace(/^m\//i, "")
    .split("/")
    .filter(Boolean);
  let state = getMasterKeyFromSeed(bip39Seed);
  for (const seg of segments) {
    if (!seg.endsWith("'")) {
      throw new Error("Solana BIP44 path segments must be hardened (e.g. 44')");
    }
    const n = parseInt(seg.slice(0, -1), 10);
    if (!Number.isFinite(n)) throw new Error(`Invalid path segment: ${seg}`);
    state = ckdPriv(state, n + HARDENED);
  }
  return state.key;
}
