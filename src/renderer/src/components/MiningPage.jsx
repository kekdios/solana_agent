import { useCallback, useEffect, useMemo, useState } from "react";
import * as bip39 from "bip39";
import { HDNodeWallet, JsonRpcProvider, formatEther } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import BIP32Factory from "bip32";
import { Keypair } from "@solana/web3.js";
import { deriveSolanaSeedFromBip39Seed } from "../utils/solanaSlip0010.js";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useChatStore } from "../store/chatStore";

let bip32Singleton = null;
function getBip32() {
  if (!bip32Singleton) {
    initEccOnce();
    bip32Singleton = BIP32Factory(ecc);
  }
  return bip32Singleton;
}

const ETH_RPC = "https://eth.llamarpc.com";

const provider = new JsonRpcProvider(ETH_RPC);

const PIE_COLORS = ["#627eea", "#f7931a", "#9945ff"];

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

export default function MiningPage() {
  const setView = useChatStore((s) => s.setView);
  const apiBase = useChatStore((s) => s.apiBase) || "";

  const [mnemonic, setMnemonic] = useState("");
  const [addresses, setAddresses] = useState(null);
  const [balances, setBalances] = useState({});
  const [balanceErrors, setBalanceErrors] = useState({});
  const [history, setHistory] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [walletError, setWalletError] = useState(null);

  const generateWallet = useCallback(() => {
    setWalletError(null);
    try {
      const m = bip39.generateMnemonic();
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
        btc: btcAddress,
        sol: solKeypair.publicKey.toBase58(),
      });
      setBalances({});
      setBalanceErrors({});
      setHistory([]);
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
      const eth = await provider.getBalance(addresses.evm);
      next.ETH = Number(formatEther(eth));
    } catch (e) {
      errs.ETH = e?.message || "ETH fetch failed";
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

    const total = Object.values(next).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    setHistory((prev) => [...prev.slice(-40), { t: Date.now(), value: total }]);
    setFetching(false);
  }, [addresses, apiBase]);

  useEffect(() => {
    if (!addresses) return;
    fetchBalances();
  }, [addresses, fetchBalances]);

  const chartData = useMemo(
    () =>
      ["ETH", "BTC", "SOL"].map((name) => ({
        name,
        value: Number.isFinite(balances[name]) ? balances[name] : 0,
      })),
    [balances]
  );

  const lineData = useMemo(
    () =>
      history.map((row, i) => ({
        i,
        value: row.value,
        label: new Date(row.t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      })),
    [history]
  );

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
            This page generates a BIP39 mnemonic and derives addresses in your browser. Anything shown here can be read by scripts on this page —{" "}
            <strong className="text-amber-50 font-semibold">do not use real funds or production seeds.</strong>
          </p>
        </div>

        <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
          Live balances: ETH via public RPC ({ETH_RPC}), BTC via Blockstream, SOL via this app&apos;s server (
          <code className="text-slate-500">/api/mining/sol-balance</code>
          ) using mainnet-compatible RPC (avoids browser 403 on public Solana endpoints). Configure{" "}
          <code className="text-slate-500">MINING_SOL_RPC_URL</code> or set <code className="text-slate-500">SOLANA_RPC_URL</code> to mainnet. Charts use raw native units (not USD); the line
          series is the sum of ETH + BTC + SOL
          balances for demo tracking only.
        </p>

        {walletError && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {walletError}
          </div>
        )}

        {mnemonic && (
          <section className="space-y-3 rounded-xl border border-[#2a2a30] bg-[#121214] p-4">
            <h2 className="text-sm font-semibold text-slate-300">Mnemonic</h2>
            <p className="text-xs font-mono text-slate-400 break-words whitespace-pre-wrap">{mnemonic}</p>
            <h2 className="text-sm font-semibold text-slate-300 pt-2">Addresses</h2>
            <ul className="text-xs font-mono text-slate-400 space-y-1 break-all">
              <li>
                <span className="text-slate-500">EVM </span>
                {addresses?.evm}
              </li>
              <li>
                <span className="text-slate-500">BTC </span>
                {addresses?.btc}
              </li>
              <li>
                <span className="text-slate-500">SOL </span>
                {addresses?.sol}
              </li>
            </ul>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-[#2a2a30] bg-[#121214] p-3 min-h-[300px]">
            <h2 className="text-sm font-medium text-slate-300 mb-2">Allocation (native units)</h2>
            {chartData.every((d) => d.value === 0) ? (
              <p className="text-xs text-slate-500 py-8">No non-zero balances yet — generate a wallet with activity, or press Refresh now.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={100} stroke="#1e1e24" strokeWidth={1}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [Number(v).toLocaleString(undefined, { maximumFractionDigits: 8 }), ""]}
                    contentStyle={{ backgroundColor: "#0d0d0f", border: "1px solid #2a2a30", borderRadius: 10 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="rounded-xl border border-[#2a2a30] bg-[#121214] p-3 min-h-[300px]">
            <h2 className="text-sm font-medium text-slate-300 mb-2">Portfolio history (sum of native balances)</h2>
            {lineData.length === 0 ? (
              <p className="text-xs text-slate-500 py-8">History appears after the first balance fetch.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={lineData}>
                  <CartesianGrid stroke="#1e1e24" strokeDasharray="3 3" />
                  <XAxis dataKey="i" hide />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v) => Number(v).toFixed(4)} />
                  <Tooltip
                    labelFormatter={(_, p) => (p?.[0]?.payload?.label ? String(p[0].payload.label) : "")}
                    formatter={(v) => [Number(v).toFixed(6), "sum"]}
                    contentStyle={{ backgroundColor: "#0d0d0f", border: "1px solid #2a2a30", borderRadius: 10 }}
                  />
                  <Line type="monotone" dataKey="value" name="Σ native" stroke="#a78bfa" strokeWidth={1.8} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
