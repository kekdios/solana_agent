/**
 * Scheduled peg monitor: HL spot vs Orca treasury pool implied price, dry-run Orca swaps only,
 * balance / skew / cleanup, logs to workspace memory/*.json and memory/YYYY-MM-DD.md.
 * Live treasury_pool_swap is never executed here — use chat tools with explicit confirm only.
 */

import * as db from "../db.js";
import * as workspace from "./workspace.js";
import { hyperliquidPerpMids } from "./hyperliquid-price.js";
import { treasuryPoolInfo } from "./treasury-pool-info.js";
import { treasuryPoolSwap } from "./treasury-pool-swap.js";
import { solanaBalance, solanaTxHistory } from "./solana.js";
import { HL_SPOT_BTC_ETH_KEYS } from "./trading-snapshot.js";
import { DEFAULT_SA_AGENT_TOKEN_MINTS, loadSaAgentTokenMints } from "./sa-agent-mints.js";

const HEARTBEAT_STATE_PATH = "memory/heartbeat-state.json";
const PEG_STATE_PATH = "memory/peg-state.json";

/** Keys shown on Trading page / GET /api/trading/peg-monitor (defaults match numEnv fallbacks). */
export const PEG_MONITOR_ENV_KEYS = Object.freeze([
  "PEG_MONITOR_THRESHOLD_BPS",
  "PEG_MONITOR_SBTC_UI",
  "PEG_MONITOR_SAETH_UI",
  "PEG_MONITOR_MIN_SOL",
  "PEG_MONITOR_SKEW_PCT",
  "PEG_MONITOR_VERBOSE",
]);

export const PEG_MONITOR_DEFAULTS = Object.freeze({
  PEG_MONITOR_THRESHOLD_BPS: "100",
  PEG_MONITOR_SBTC_UI: "0.1",
  PEG_MONITOR_SAETH_UI: "1",
  PEG_MONITOR_MIN_SOL: "0.05",
  PEG_MONITOR_SKEW_PCT: "20",
  PEG_MONITOR_VERBOSE: "(unset)",
});

/** Effective env values for UI (empty .env → default string). */
export function getPegMonitorEnvResolved() {
  const out = {};
  for (const k of PEG_MONITOR_ENV_KEYS) {
    const raw = String(process.env[k] ?? "").trim();
    const def = PEG_MONITOR_DEFAULTS[k];
    if (k === "PEG_MONITOR_VERBOSE") {
      out[k] = raw === "1" || raw.toLowerCase() === "true" ? "1" : raw === "" ? "0 (off)" : raw;
      continue;
    }
    out[k] = raw === "" ? def ?? "" : raw;
  }
  return out;
}

function slimPegStateForMeta(peg) {
  if (!peg || typeof peg !== "object") return { note: "quick_tick_no_pool_snapshot" };
  const dryBit = (d) =>
    d == null ? null : { ok: d.ok === true, error: d.error ? String(d.error) : undefined };
  return {
    updated_at: peg.updated_at,
    hl: peg.hl,
    sbtc: {
      deviation_bps: peg.sbtc?.deviation_bps,
      suggested_action: peg.sbtc?.suggested_action,
      dry_run: dryBit(peg.sbtc?.dry_run),
    },
    saeth: {
      deviation_bps: peg.saeth?.deviation_bps,
      suggested_action: peg.saeth?.suggested_action,
      dry_run: dryBit(peg.saeth?.dry_run),
    },
  };
}

function persistPegMonitorRun({ mode, heartbeat_ok, summary, peg_state }) {
  try {
    const at = new Date().toISOString();
    db.setTradingMeta("peg_monitor_last_run_at", at);
    db.setTradingMeta("peg_monitor_last_summary", String(summary ?? ""));
    db.setTradingMeta("peg_monitor_last_heartbeat_ok", heartbeat_ok ? "1" : "0");
    db.setTradingMeta("peg_monitor_last_mode", String(mode ?? ""));
    db.setTradingMeta("peg_monitor_last_state_json", JSON.stringify(slimPegStateForMeta(peg_state)));
    db.setTradingMeta("peg_monitor_last_error", "");
  } catch (e) {
    console.error("persistPegMonitorRun:", e?.message || e);
  }
}

function numEnv(name, def) {
  const raw = String(process.env[name] ?? "").trim();
  if (raw === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

function buildEnv() {
  const saAgentTokenMap = loadSaAgentTokenMints();
  return {
    saAgentTokenMap,
    agentTokenBuiltInMints: DEFAULT_SA_AGENT_TOKEN_MINTS,
  };
}

function deviationBps(poolPx, hlPx) {
  if (poolPx == null || hlPx == null) return null;
  const p = Number(poolPx);
  const h = Number(hlPx);
  if (!Number.isFinite(p) || !Number.isFinite(h)) return null;
  if (p <= 0 || h <= 0) return null;
  return (p / h - 1) * 10000;
}

/** Pool `data.price` is token B per 1 token A — convert to USD per 1 base (SABTC or SAETH). */
function poolUsdPerBase(poolResult, baseSym) {
  if (!poolResult?.ok || !poolResult.data) return null;
  const d = poolResult.data;
  if (d.price == null) return null;
  const px = Number(d.price);
  if (!Number.isFinite(px) || px <= 0) return null;
  const symA = String(d.tokenA?.symbol || "").toUpperCase();
  const symB = String(d.tokenB?.symbol || "").toUpperCase();
  const base = String(baseSym).toUpperCase();
  if (symA === base) return px;
  if (symB === base) return 1 / px;
  return null;
}

async function readJsonWorkspace(path, fallback) {
  const r = await workspace.workspaceRead(path);
  const base = { ...fallback };
  if (!r.ok) return base;
  try {
    const j = JSON.parse(r.content || "{}");
    if (typeof j === "object" && j && !Array.isArray(j)) return { ...base, ...j };
  } catch {
    /* keep base */
  }
  return base;
}

async function writeJsonWorkspace(path, obj) {
  const body = JSON.stringify(obj, null, 2) + "\n";
  return workspace.workspaceWrite(path, body);
}

function uiForSymbol(bal, symbol, mintMap) {
  const mint = mintMap[symbol];
  if (!mint || !bal?.tokens) return 0;
  const row = bal.tokens.find((t) => t.mint === mint);
  return typeof row?.uiAmount === "number" && Number.isFinite(row.uiAmount) ? row.uiAmount : 0;
}

/** SAUSD uses 6 decimals on-chain; avoid float tails like 7195.539000000001 breaking parseSwapAmount. */
function amountUiSaUsd(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0.01;
  return Number(x.toFixed(6));
}

function skewPct(sbtc, saeth, sausd) {
  const sum = sbtc + saeth + sausd;
  if (sum <= 0) return 0;
  const p1 = sbtc / sum;
  const p2 = saeth / sum;
  const p3 = sausd / sum;
  const lo = Math.min(p1, p2, p3);
  const hi = Math.max(p1, p2, p3);
  return (hi - lo) * 100;
}

async function appendDailyMemoryLine(line) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const path = `memory/${y}-${m}-${day}.md`;
  const ts = d.toISOString();
  const entry = `- ${ts} ${line}\n`;
  const prev = await workspace.workspaceRead(path);
  const content = prev.ok ? prev.content + entry : `# Peg monitor\n\n${entry}`;
  return workspace.workspaceWrite(path, content);
}

/**
 * @param {object} opts
 * @param {boolean} [opts.forceFull]
 * @param {object} [opts.env] - saAgentTokenMap etc. (defaults to buildEnv())
 */
export async function runPegMonitorTick(opts = {}) {
  const env = opts.env && typeof opts.env === "object" ? opts.env : buildEnv();
  const forceFull = opts.forceFull === true;

  const thresholdBps = Math.max(1, numEnv("PEG_MONITOR_THRESHOLD_BPS", 100));
  const sbtcUi = Math.max(1e-6, numEnv("PEG_MONITOR_SBTC_UI", 0.1));
  const saethUi = Math.max(1e-6, numEnv("PEG_MONITOR_SAETH_UI", 1));
  const minSol = Math.max(0, numEnv("PEG_MONITOR_MIN_SOL", 0.05));
  const skewAlertPct = Math.max(0, numEnv("PEG_MONITOR_SKEW_PCT", 20));

  const nowIso = new Date().toISOString();
  const state = await readJsonWorkspace(HEARTBEAT_STATE_PATH, {
    nextTickFull: true,
    lastRunAt: null,
    lastChecks: {},
  });

  const useFull = forceFull || !!state.nextTickFull;

  const linesOut = [];
  const alerts = [];
  let heartbeatOk = true;

  const mintMap = env.saAgentTokenMap || loadSaAgentTokenMints();

  if (!useFull) {
    linesOut.push("[peg_monitor] mode=quick (alternating tick)");
    try {
      const bal = await solanaBalance({}, env);
      const solUi = bal?.ok && typeof bal.lamports === "number" ? bal.lamports / 1e9 : null;
      if (solUi != null && solUi < minSol) {
        heartbeatOk = false;
        const msg = `SOL low: ${solUi.toFixed(4)} < ${minSol}`;
        alerts.push(msg);
        linesOut.push(msg);
        await appendDailyMemoryLine(`ALERT ${msg}`);
      }
      const cleared = db.clearExpiredSwapIntents();
      linesOut.push(`clear_expired_swap_intents: ${JSON.stringify(cleared)}`);
      const txh = await solanaTxHistory({ limit: 5 }, env);
      if (txh?.signatures?.length) {
        const bad = txh.signatures.filter((s) => s.err != null);
        if (bad.length) {
          heartbeatOk = false;
          const msg = `Recent tx errors: ${bad.map((b) => b.signature?.slice(0, 12)).join(", ")}`;
          alerts.push(msg);
          linesOut.push(msg);
          await appendDailyMemoryLine(`ALERT ${msg}`);
        }
      }
    } catch (e) {
      heartbeatOk = false;
      linesOut.push(`quick scan error: ${e.message || e}`);
    }

    state.nextTickFull = true;
    state.lastRunAt = nowIso;
    await writeJsonWorkspace(HEARTBEAT_STATE_PATH, state);

    const summary = alerts.length ? alerts.join(" | ") : "HEARTBEAT_OK";
    persistPegMonitorRun({ mode: "quick", heartbeat_ok: heartbeatOk, summary, peg_state: null });
    return {
      ok: true,
      mode: "quick",
      heartbeat_ok: heartbeatOk,
      summary,
      lines: linesOut,
      reply: summary,
    };
  }

  linesOut.push("[peg_monitor] mode=full");

  let hlBtc = null;
  let hlEth = null;
  const hl = await hyperliquidPerpMids(
    {
      market: "spot",
      coins: [HL_SPOT_BTC_ETH_KEYS.btc, HL_SPOT_BTC_ETH_KEYS.eth],
    },
    env
  );
  if (hl?.ok && hl.mids_usd) {
    hlBtc = hl.mids_usd[HL_SPOT_BTC_ETH_KEYS.btc];
    hlEth = hl.mids_usd[HL_SPOT_BTC_ETH_KEYS.eth];
  } else {
    linesOut.push(`HL spot failed: ${hl?.error || "unknown"}`);
    heartbeatOk = false;
  }

  const poolSbtc = await treasuryPoolInfo({ pair: "SABTC_SAUSD" }, env);
  const poolSaeth = await treasuryPoolInfo({ pair: "SAETH_SAUSD" }, env);
  const poolPxBtc = poolUsdPerBase(poolSbtc, "SABTC");
  const poolPxEth = poolUsdPerBase(poolSaeth, "SAETH");

  const pegState = {
    updated_at: nowIso,
    hl: {
      btc_key: HL_SPOT_BTC_ETH_KEYS.btc,
      eth_key: HL_SPOT_BTC_ETH_KEYS.eth,
      btc_usd: hlBtc,
      eth_usd: hlEth,
    },
    sbtc: {},
    saeth: {},
  };

  async function runPair({ baseSym, hlPx, poolPx, sellUi, thresholdBps: th }) {
    const out = {
      deviation_bps: null,
      pool_usd_per_base: poolPx,
      hl_usd: hlPx,
      suggested_action: "none",
      dry_run: null,
    };
    if (hlPx == null || poolPx == null) {
      out.suggested_action = "skip_missing_price";
      return out;
    }
    const bps = deviationBps(poolPx, hlPx);
    out.deviation_bps = bps;
    if (bps == null) {
      out.suggested_action = "skip_bad_math";
      return out;
    }

    if (bps > th) {
      out.suggested_action = `premium_${baseSym}_sell_for_SAUSD`;
      const dry = await treasuryPoolSwap(
        {
          input_token_symbol: baseSym,
          output_token_symbol: "SAUSD",
          amount_ui: sellUi,
          dry_run: true,
          slippage_bps: 100,
        },
        env
      );
      out.dry_run = dry;
    } else if (bps < -th) {
      out.suggested_action = `discount_${baseSym}_buy_with_SAUSD`;
      const refPx = hlPx;
      const sausdInRaw = Math.max(0.01, sellUi * refPx * 1.02);
      const sausdIn = amountUiSaUsd(sausdInRaw);
      const dry = await treasuryPoolSwap(
        {
          input_token_symbol: "SAUSD",
          output_token_symbol: baseSym,
          amount_ui: sausdIn,
          dry_run: true,
          slippage_bps: 100,
        },
        env
      );
      out.dry_run = dry;
    }

    return out;
  }

  pegState.sbtc = await runPair({
    key: "sbtc",
    pair: "SABTC_SAUSD",
    baseSym: "SABTC",
    hlPx: hlBtc,
    poolPx: poolPxBtc,
    sellUi: sbtcUi,
    thresholdBps,
  });
  pegState.saeth = await runPair({
    key: "saeth",
    pair: "SAETH_SAUSD",
    baseSym: "SAETH",
    hlPx: hlEth,
    poolPx: poolPxEth,
    sellUi: saethUi,
    thresholdBps,
  });

  state.lastChecks.sbtc = nowIso;
  state.lastChecks.saeth = nowIso;

  for (const [label, block, sym] of [
    ["SABTC", pegState.sbtc, "SABTC"],
    ["SAETH", pegState.saeth, "SAETH"],
  ]) {
    const bps = block.deviation_bps;
    if (bps == null) {
      linesOut.push(`${label}: no deviation (missing data)`);
      continue;
    }
    linesOut.push(`${label}: deviation ${bps.toFixed(1)} bps vs HL (${block.suggested_action})`);
    if (Math.abs(bps) > thresholdBps) {
      heartbeatOk = false;
      const sign = bps > 0 ? "+" : "";
      const msg = `${sym} ${sign}${(bps / 100).toFixed(2)}% vs HL — ${block.suggested_action} (dry_run ${block.dry_run?.ok ? "ok" : "fail"})`;
      alerts.push(msg);
      await appendDailyMemoryLine(`ACTION ${msg}`);
    }
  }

  await writeJsonWorkspace(PEG_STATE_PATH, pegState);

  let bal;
  try {
    bal = await solanaBalance({}, env);
  } catch (e) {
    linesOut.push(`balance error: ${e.message || e}`);
    heartbeatOk = false;
  }

  if (bal?.ok) {
    const solUi = typeof bal.lamports === "number" ? bal.lamports / 1e9 : 0;
    linesOut.push(`SOL: ${solUi.toFixed(4)}`);
    if (solUi < minSol) {
      heartbeatOk = false;
      const msg = `SOL low: ${solUi.toFixed(4)} < ${minSol}`;
      alerts.push(msg);
      await appendDailyMemoryLine(`ALERT ${msg}`);
    }
    const uS = uiForSymbol(bal, "SABTC", mintMap);
    const uE = uiForSymbol(bal, "SAETH", mintMap);
    const uU = uiForSymbol(bal, "SAUSD", mintMap);
    const sk = skewPct(uS, uE, uU);
    linesOut.push(`Balances UI: SABTC=${uS} SAETH=${uE} SAUSD=${uU} skew_spread_pct=${sk.toFixed(1)}`);
    if (uS + uE + uU > 0 && sk > skewAlertPct) {
      heartbeatOk = false;
      const msg = `Token skew spread ${sk.toFixed(1)}% > ${skewAlertPct}% (SABTC/SAETH/SAUSD)`;
      alerts.push(msg);
      await appendDailyMemoryLine(`ALERT ${msg}`);
    }
  }

  try {
    const cleared = db.clearExpiredSwapIntents();
    linesOut.push(`clear_expired_swap_intents: ${JSON.stringify(cleared)}`);
  } catch (e) {
    linesOut.push(`clear_expired: ${e.message || e}`);
  }

  const txh = await solanaTxHistory({ limit: 5 }, env);
  if (txh?.signatures?.length) {
    const bad = txh.signatures.filter((s) => s.err != null);
    if (bad.length) {
      heartbeatOk = false;
      const msg = `Recent tx errors: ${bad.map((b) => b.signature?.slice(0, 16) + "…").join(", ")}`;
      alerts.push(msg);
      linesOut.push(msg);
      await appendDailyMemoryLine(`ALERT ${msg}`);
    }
  }

  state.nextTickFull = false;
  state.lastRunAt = nowIso;
  await writeJsonWorkspace(HEARTBEAT_STATE_PATH, state);

  const summary = alerts.length ? alerts.join(" | ") : "HEARTBEAT_OK";
  persistPegMonitorRun({ mode: "full", heartbeat_ok: heartbeatOk, summary, peg_state: pegState });
  return {
    ok: true,
    mode: "full",
    heartbeat_ok: heartbeatOk,
    summary,
    peg_state_path: PEG_STATE_PATH,
    heartbeat_state_path: HEARTBEAT_STATE_PATH,
    lines: linesOut,
    peg_state: pegState,
    reply: summary,
  };
}
