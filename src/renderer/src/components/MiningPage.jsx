import { useCallback, useEffect, useState } from "react";
import * as bip39 from "bip39";
import { HDNodeWallet, JsonRpcProvider, formatEther } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import BIP32Factory from "bip32";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { deriveSolanaSeedFromBip39Seed } from "../utils/solanaSlip0010.js";
import { useChatStore } from "../store/chatStore";

let bip32Singleton = null;
function getBip32() {
  if (!bip32Singleton) {
    initEccOnce();
    bip32Singleton = BIP32Factory(ecc);
  }
  return bip32Singleton;
}

/**
 * Public Ethereum HTTP RPCs (browser). Free tiers rate-limit; we rotate and retry on 429.
 * Override at build time: VITE_ETH_RPC_URL="https://..." or comma-separated list (tried first).
 */
const DEFAULT_ETH_RPCS = [
  "https://ethereum.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://cloudflare-eth.com",
  "https://eth.llamarpc.com",
];

function ethRpcCandidates() {
  const raw = typeof import.meta !== "undefined" && import.meta.env?.VITE_ETH_RPC_URL;
  const fromEnv = String(raw || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const u of [...fromEnv, ...DEFAULT_ETH_RPCS]) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitedEthError(e) {
  const msg = String(e?.message || e || "");
  const code = e?.code ?? e?.error?.code;
  if (code === 429) return true;
  if (/429|rate-?limit|too many requests/i.test(msg)) return true;
  try {
    const j = JSON.stringify(e?.error || e?.info || {});
    if (/429|rate-?limit/i.test(j)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Try several RPC URLs with short backoff on 429 (ethers v6 public endpoints are strict). */
async function getEthBalanceWei(address) {
  const urls = ethRpcCandidates();
  let lastErr = null;
  for (const url of urls) {
    const provider = new JsonRpcProvider(url);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await provider.getBalance(address);
      } catch (e) {
        lastErr = e;
        if (isRateLimitedEthError(e)) {
          await sleep(600 * (attempt + 1) + Math.floor(Math.random() * 200));
          continue;
        }
        break;
      }
    }
  }
  throw lastErr ?? new Error("ETH balance: all RPC endpoints failed");
}

function shortenEthFetchError(e) {
  if (isRateLimitedEthError(e)) {
    return "ETH RPC rate-limited. Wait a bit, click Refresh, or set VITE_ETH_RPC_URL to your own endpoint (see Mining page note).";
  }
  const m = String(e?.message || e || "ETH fetch failed");
  return m.length > 220 ? `${m.slice(0, 217)}…` : m;
}

let eccInited = false;
function initEccOnce() {
  if (eccInited) return;
  bitcoin.initEccLib(ecc);
  eccInited = true;
}

function fmtBal(k, v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (k === "ETH") return Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 });
  if (k === "BTC") return Number(v).toLocaleString(undefined, { maximumFractionDigits: 8 });
  if (k === "SOL") return Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 });
  return String(v);
}

function MnemonicGrid({ phrase }) {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  return (
    <ol className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 list-none m-0 p-0">
      {words.map((word, i) => (
        <li
          key={`${i}-${word}`}
          className="rounded-md border border-[#2a2a30] bg-[#0d0d0f]/60 px-2 py-1.5 text-xs font-mono text-slate-300"
        >
          <span className="text-slate-500 mr-1.5 tabular-nums">{i + 1}.</span>
          {word}
        </li>
      ))}
    </ol>
  );
}

export default function MiningPage() {
  const setView = useChatStore((s) => s.setView);
  const apiBase = useChatStore((s) => s.apiBase) || "";

  const [mnemonic, setMnemonic] = useState("");
  const [addresses, setAddresses] = useState(null);
  const [balances, setBalances] = useState({});
  const [balanceErrors, setBalanceErrors] = useState({});
  const [fetching, setFetching] = useState(false);
  const [walletError, setWalletError] = useState(null);

  const generateWallet = useCallback(() => {
    setWalletError(null);
    try {
      const m = bip39.generateMnemonic(128);
      const seed = bip39.mnemonicToSeedSync(m);

      const ethWallet = HDNodeWallet.fromSeed(new Uint8Array(seed)).derivePath("m/44'/60'/0'/0/0");

      const root = getBip32().fromSeed(seed);
      const btcChild = root.derivePath("m/84'/0'/0'/0/0");
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: btcChild.publicKey,
        network: bitcoin.networks.bitcoin,
      });
      const btcAddress = p2wpkh.address;
      if (!btcAddress) throw new Error("BTC address derivation failed");

      const solSeed = deriveSolanaSeedFromBip39Seed(new Uint8Array(seed));
      const solKeypair = Keypair.fromSeed(solSeed);

      setMnemonic(m);
      setAddresses({
        evm: ethWallet.address,
        evmPrivateKey: ethWallet.privateKey,
        btc: btcAddress,
        btcPrivateKeyWif: btcChild.toWIF(),
        sol: solKeypair.publicKey.toBase58(),
        solSecretKeyBase58: bs58.encode(solKeypair.secretKey),
      });
      setBalances({});
      setBalanceErrors({});
    } catch (e) {
      setWalletError(e?.message || "Wallet generation failed");
      setMnemonic("");
      setAddresses(null);
    }
  }, []);

  const fetchBalances = useCallback(async () => {
    if (!addresses) return;
    setFetching(true);
    const next = {};
    const errs = {};

    try {
      const eth = await getEthBalanceWei(addresses.evm);
      next.ETH = Number(formatEther(eth));
    } catch (e) {
      errs.ETH = shortenEthFetchError(e);
    }

    try {
      const btcRes = await fetch(`https://blockstream.info/api/address/${encodeURIComponent(addresses.btc)}`);
      if (!btcRes.ok) throw new Error(`HTTP ${btcRes.status}`);
      const btcJson = await btcRes.json();
      const funded = btcJson?.chain_stats?.funded_txo_sum ?? 0;
      const spent = btcJson?.chain_stats?.spent_txo_sum ?? 0;
      next.BTC = (funded - spent) / 1e8;
    } catch (e) {
      errs.BTC = e?.message || "BTC fetch failed (CORS or network)";
    }

    try {
      const base = apiBase || "";
      const solRes = await fetch(`${base}/api/mining/sol-balance?address=${encodeURIComponent(addresses.sol)}`);
      const solJson = await solRes.json().catch(() => ({}));
      if (!solJson.ok) throw new Error(solJson.error || `SOL balance HTTP ${solRes.status}`);
      next.SOL = Number(solJson.lamports) / 1e9;
    } catch (e) {
      errs.SOL = e?.message || "SOL fetch failed";
    }

    setBalances(next);
    setBalanceErrors(errs);
    setFetching(false);
  }, [addresses, apiBase]);

  useEffect(() => {
    if (!addresses) return;
    fetchBalances();
  }, [addresses, fetchBalances]);

  return (
    <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#0d0d0f] overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setView("chat")} className="text-sm text-slate-400 hover:text-white transition">
              ← Back to chat
            </button>
            <h1 className="text-xl font-semibold text-slate-200">Mining</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateWallet}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition"
            >
              Generate wallet
            </button>
            <button
              type="button"
              onClick={() => fetchBalances()}
              disabled={!addresses || fetching}
              className="rounded-lg border border-[#2a2a30] bg-[#121214] px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {fetching ? "Refreshing…" : "Refresh now"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95 space-y-1">
          <p className="font-medium text-amber-200">Prototype — in-browser secrets</p>
          <p className="text-xs text-amber-100/85 leading-relaxed">
            This page generates a BIP39 mnemonic and derives <strong className="text-amber-100">addresses and private keys</strong> in your browser. Anything shown here can be read by scripts on this page —{" "}
            <strong className="text-amber-50 font-semibold">do not use real funds or production seeds.</strong>
          </p>
        </div>

        <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
          Live balances: ETH via rotating public RPCs (with retry on 429). For stable demos, set{" "}
          <code className="text-slate-500">VITE_ETH_RPC_URL</code> in <code className="text-slate-500">.env</code> before{" "}
          <code className="text-slate-500">npm run build:renderer</code> (single URL or comma-separated list). BTC via Blockstream; SOL via this app&apos;s server (
          <code className="text-slate-500">/api/mining/sol-balance</code>
          ) using mainnet-compatible RPC. Configure <code className="text-slate-500">MINING_SOL_RPC_URL</code> or{" "}
          <code className="text-slate-500">SOLANA_RPC_URL</code> to mainnet. Balances are raw native units (not USD).
        </p>

        {walletError && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {walletError}
          </div>
        )}

        {mnemonic && (
          <section className="space-y-4 rounded-xl border border-[#2a2a30] bg-[#121214] p-4">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300">12-word recovery phrase</h2>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                All EVM, BTC, and SOL keys below are derived from this BIP39 passphrase. Import this phrase (not the individual private keys) into wallets that support standard derivation paths.
              </p>
              <MnemonicGrid phrase={mnemonic} />
              <p className="text-[11px] font-mono text-slate-500 break-words">{mnemonic}</p>
            </div>
            <div className="space-y-2 pt-2 border-t border-[#2a2a30]">
              <h2 className="text-sm font-semibold text-slate-300">Derived addresses &amp; private keys</h2>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              EVM: secp256k1 private key hex (same encoding as MetaMask export). BTC: WIF compressed (mainnet). SOL: base58-encoded 64-byte secret key (Phantom &quot;import private key&quot; style).
            </p>
            <div className="mt-3 space-y-4 text-xs font-mono text-slate-400">
              <div className="rounded-lg border border-[#2a2a30] bg-[#0d0d0f]/60 p-3 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">EVM (Ethereum / BIP44 m/44&apos;/60&apos;/0&apos;/0/0)</div>
                <div>
                  <span className="text-slate-500">Public </span>
                  <span className="break-all text-slate-300">{addresses?.evm}</span>
                </div>
                <div>
                  <span className="text-slate-500">Private </span>
                  <span className="break-all text-amber-200/90">{addresses?.evmPrivateKey}</span>
                </div>
              </div>
              <div className="rounded-lg border border-[#2a2a30] bg-[#0d0d0f]/60 p-3 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">BTC (Native SegWit m/84&apos;/0&apos;/0&apos;/0/0)</div>
                <div>
                  <span className="text-slate-500">Public </span>
                  <span className="break-all text-slate-300">{addresses?.btc}</span>
                </div>
                <div>
                  <span className="text-slate-500">Private (WIF) </span>
                  <span className="break-all text-amber-200/90">{addresses?.btcPrivateKeyWif}</span>
                </div>
              </div>
              <div className="rounded-lg border border-[#2a2a30] bg-[#0d0d0f]/60 p-3 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">SOL (ed25519 from BIP39 seed)</div>
                <div>
                  <span className="text-slate-500">Public </span>
                  <span className="break-all text-slate-300">{addresses?.sol}</span>
                </div>
                <div>
                  <span className="text-slate-500">Private (base58) </span>
                  <span className="break-all text-amber-200/90">{addresses?.solSecretKeyBase58}</span>
                </div>
              </div>
            </div>
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-300">Balances</h2>
          {Object.keys(balances).length === 0 && addresses && <p className="text-sm text-slate-500">Fetching…</p>}
          <ul className="text-sm text-slate-300 space-y-1 tabular-nums">
            {["ETH", "BTC", "SOL"].map((k) => (
              <li key={k} className="flex flex-wrap gap-x-2">
                <span className="text-slate-500 w-10">{k}</span>
                <span>{fmtBal(k, balances[k])}</span>
                {balanceErrors[k] && <span className="text-xs text-red-400">({balanceErrors[k]})</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
