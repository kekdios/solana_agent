/**
 * Persisted snapshot from the BTC Liquidity Regime panel (GET /api/liquidity/btc-regime).
 * Agent reads via liquidity_regime_read.
 */

import * as workspace from "./workspace.js";

export const BTC_LIQUIDITY_SNAPSHOT_PATH = "memory/btc-liquidity-latest.json";

export async function writeBtcLiquiditySnapshot(record) {
  const text = JSON.stringify(record, null, 2);
  return await workspace.workspaceWrite(BTC_LIQUIDITY_SNAPSHOT_PATH, text);
}

export async function readBtcLiquiditySnapshotForTool() {
  const r = await workspace.workspaceRead(BTC_LIQUIDITY_SNAPSHOT_PATH);
  if (!r.ok) {
    return {
      ok: false,
      error: r.error,
      path: BTC_LIQUIDITY_SNAPSHOT_PATH,
      hint: "No snapshot yet. Open Liquidity in the app and click Refresh.",
    };
  }
  let snapshot;
  try {
    snapshot = JSON.parse(r.content);
  } catch {
    return { ok: false, error: "Snapshot file is not valid JSON", path: r.path };
  }
  const regime = snapshot?.regime ?? snapshot?.client?.regime;
  const headline = regime
    ? `BTC liquidity regime: ${regime} (updated ${snapshot?.updated_at || snapshot?.server_received_at || "?"})`
    : "BTC liquidity snapshot loaded.";
  const bullets = Array.isArray(snapshot?.watch_bullets)
    ? snapshot.watch_bullets
    : Array.isArray(snapshot?.client?.watch_bullets)
      ? snapshot.client.watch_bullets
      : [];
  return {
    ok: true,
    path: r.path,
    snapshot,
    headline,
    watch_bullets: bullets,
  };
}
