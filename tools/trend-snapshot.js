/**
 * Persisted snapshot from the in-app Trend dashboard (see POST /api/trend/stats).
 * Agent reads via trend_snapshot_read for commentary / social draft context.
 */

import * as workspace from "./workspace.js";

export const TREND_SNAPSHOT_PATH = "memory/trend-latest.json";

export async function writeTrendSnapshotRecord(record) {
  const text = JSON.stringify(record, null, 2);
  return await workspace.workspaceWrite(TREND_SNAPSHOT_PATH, text);
}

export async function readTrendSnapshotForTool() {
  const r = await workspace.workspaceRead(TREND_SNAPSHOT_PATH);
  if (!r.ok) {
    return {
      ok: false,
      error: r.error,
      path: TREND_SNAPSHOT_PATH,
      hint: "No snapshot yet. Open the Trend page in the app and click Refresh.",
    };
  }
  let snapshot;
  try {
    snapshot = JSON.parse(r.content);
  } catch {
    return { ok: false, error: "Snapshot file is not valid JSON", path: r.path };
  }
  const client = snapshot?.client;
  const headline =
    client?.market_state != null
      ? `Trend snapshot: market_state=${client.market_state} (server_received_at=${snapshot?.server_received_at || "?"})`
      : "Trend snapshot loaded.";
  return {
    ok: true,
    path: r.path,
    snapshot,
    headline,
    /** Suggested bullets for a short social / Nostr comment; not financial advice. */
    social_comment_bullets: Array.isArray(client?.social_comment_bullets) ? client.social_comment_bullets : [],
  };
}
