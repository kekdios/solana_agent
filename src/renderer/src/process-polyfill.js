/**
 * Browser shims for Node globals expected by crypto deps (bip39, bip32, bitcoinjs-lib, etc.).
 */
import process from "process";
import { Buffer } from "buffer";

if (typeof globalThis !== "undefined") {
  globalThis.process = process;
  if (typeof globalThis.Buffer === "undefined") {
    globalThis.Buffer = Buffer;
  }
  // Node-style `global` (do not use Vite `define: { global: ... }` — it can break TDZ / minified bundles).
  if (typeof globalThis.global === "undefined") {
    globalThis.global = globalThis;
  }
}
