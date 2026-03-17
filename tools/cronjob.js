/**
 * Cronjob tool: schedule recurring tasks via cron expressions (node-cron).
 * Only predefined task names are allowed for safety (no arbitrary shell execution).
 */

import cron from "node-cron";
import * as heartbeatModule from "./heartbeat.js";
import * as priceModule from "./price.js";

const DEFAULT_TASKS = {
  log: () => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] cron(task=log): tick`);
  },
  heartbeat: async () => {
    const result = await heartbeatModule.heartbeat();
    console.log("[cron heartbeat]", result.payload);
  },
  check_btc: async () => {
    const threshold = Number(process.env.BTC_ALERT_BELOW) || 65000;
    const result = await priceModule.checkBtcAndAlert(threshold);
    if (result.alerted) {
      console.log(`[cron check_btc] ALERT: BTC $${result.price} below $${threshold}`);
    } else if (result.ok) {
      console.log(`[cron check_btc] BTC $${result.price} (above $${threshold})`);
    } else {
      console.warn("[cron check_btc]", result.error);
    }
  },
};

let scheduled = new Map(); // expression -> { task, taskName, ref }

/**
 * Validates a cron expression (node-cron format: sec min hour day month weekday).
 * We use 5-field format: min hour day month weekday (no seconds).
 */
function isValidCron(expression) {
  if (typeof expression !== "string" || !expression.trim()) return false;
  const parts = expression.trim().split(/\s+/);
  return parts.length >= 5;
}

/**
 * Schedules a recurring job. Task must be a predefined name (e.g. "log", "heartbeat").
 *
 * @param {string} expression – cron expression, 5 fields (e.g. every 5 min)
 * @param {string} taskName – one of: "log", "heartbeat", "check_btc"
 * @param {Object} [context]
 * @returns {Promise<Object>} { ok, message, schedule }
 */
export async function scheduleCron(expression, taskName, context = {}) {
  const tasks = { ...DEFAULT_TASKS };
  const task = tasks[taskName];
  if (!task) {
    return {
      ok: false,
      message: `Unknown task: "${taskName}". Allowed: ${Object.keys(tasks).join(", ")}`,
    };
  }
  if (!isValidCron(expression)) {
    return { ok: false, message: "Invalid cron expression (need 5 fields: min hour day month weekday)." };
  }
  const key = `${expression}:${taskName}`;
  if (scheduled.has(key)) {
    return { ok: true, message: "Already scheduled.", schedule: key };
  }
  try {
    const ref = cron.schedule(expression, () => task(), { scheduled: true });
    scheduled.set(key, { task: taskName, expression, ref });
    return {
      ok: true,
      message: `Scheduled "${taskName}" with cron: ${expression}`,
      schedule: key,
    };
  } catch (e) {
    return { ok: false, message: e.message || "Failed to schedule." };
  }
}

/**
 * Lists currently scheduled cron jobs.
 * @returns {{ ok: boolean, jobs: string[] }}
 */
export function listCronJobs() {
  const jobs = Array.from(scheduled.keys());
  return { ok: true, jobs };
}

/**
 * Stops a scheduled job by key (expression:taskName).
 * @param {string} key
 * @returns {{ ok: boolean, message: string }}
 */
export function stopCronJob(key) {
  const entry = scheduled.get(key);
  if (!entry) {
    return { ok: false, message: "Job not found." };
  }
  entry.ref.stop();
  scheduled.delete(key);
  return { ok: true, message: `Stopped: ${key}` };
}
