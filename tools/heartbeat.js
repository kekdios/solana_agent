/**
 * Heartbeat tool: lightweight health-check for the bot.
 * Can be invoked by the LLM or used by a background interval (startHeartbeat).
 */

const DEFAULT_PAYLOAD = { status: "alive" };

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

/**
 * Returns a health-check payload (timestamp, status, memory, pid).
 * Called when the LLM invokes the heartbeat tool.
 *
 * @param {Object} [context] – optional context from the chat session (unused here)
 * @returns {Promise<Object>} { ok, payload }
 */
export async function heartbeat(context) {
  const payload = {
    timestamp: new Date().toISOString(),
    ...DEFAULT_PAYLOAD,
    memory_heap_used: process.memoryUsage().heapUsed,
    pid: process.pid,
  };
  return { ok: true, payload };
}

/**
 * Starts a repeating heartbeat that runs on a fixed interval (e.g. for ops/monitoring).
 * Call the returned function to stop the timer (e.g. on graceful shutdown).
 *
 * @param {Object} [opts]
 * @param {number} [opts.intervalMs] – interval in ms (default 30_000, or HEARTBEAT_INTERVAL_MS env)
 * @param {Object} [opts.payload] – extra fields to include in each tick
 * @param {Function} [opts.onTick] – optional callback(payload) each tick; default logs to console
 * @returns {Function} stop() – call to clear the interval
 */
export function startHeartbeat({
  intervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS) || 30_000,
  payload: extraPayload = {},
  onTick = (p) => log("Heartbeat:", p),
} = {}) {
  const run = async () => {
    const result = await heartbeat();
    const payload = { ...result.payload, ...extraPayload };
    onTick(payload);
  };
  const id = setInterval(run, intervalMs);
  run(); // run once immediately
  return () => clearInterval(id);
}
