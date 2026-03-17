/**
 * Sandboxed command execution in the workspace.
 * Runs a shell command with cwd set to the workspace (or a subdir). No env overrides from the agent.
 * Similar in spirit to OpenClaw's exec tool with host=sandbox; our "sandbox" is the workspace directory.
 */

import { spawnSync } from "child_process";
import { join, normalize, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || join(__dirname, "..", "workspace");

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MiB

/**
 * Resolve workdir relative to workspace; must stay inside workspace.
 */
function resolveWorkdir(workdir) {
  const raw = (workdir ?? ".").trim().replace(/\\/g, "/").replace(/^\/+/, "") || ".";
  const full = join(WORKSPACE_DIR, raw);
  const normalized = normalize(full);
  const rel = relative(WORKSPACE_DIR, normalized);
  if (rel.startsWith("..") || rel === "..") {
    throw new Error("workdir must be inside workspace");
  }
  return normalized;
}

/**
 * Run a shell command in the workspace sandbox.
 * @param {object} args - { command: string, workdir?: string, timeout?: number }
 * @returns {object} - { ok: boolean, stdout?: string, stderr?: string, code?: number, signal?: string, error?: string }
 */
export function runExec(args) {
  const command = (args.command ?? "").trim();
  if (!command) {
    return { ok: false, error: "command is required" };
  }

  let cwd;
  try {
    cwd = resolveWorkdir(args.workdir);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  let timeoutMs = Number(args.timeout);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutMs = Math.min(timeoutMs * 1000, MAX_TIMEOUT_MS);
  } else {
    timeoutMs = DEFAULT_TIMEOUT_MS;
  }

  const result = spawnSync(command, {
    shell: true,
    cwd,
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
    encoding: "utf8",
    env: { ...process.env, OPENCLAW_SHELL: "exec" }, // optional hint for scripts
  });

  const stdout = (result.stdout ?? "").trimEnd();
  const stderr = (result.stderr ?? "").trimEnd();
  const code = result.status;
  const signal = result.signal ?? null;

  if (result.error) {
    const msg = result.error.code === "ENOBUFS"
      ? "Command output exceeded max size (1 MiB)"
      : result.error.message;
    return {
      ok: false,
      error: msg,
      stdout: stdout || undefined,
      stderr: stderr || undefined,
      code: code ?? undefined,
      signal: signal ?? undefined,
    };
  }

  if (result.signal === "SIGTERM") {
    return {
      ok: false,
      error: "Command timed out",
      stdout: stdout || undefined,
      stderr: stderr || undefined,
      code: null,
      signal: "SIGTERM",
    };
  }

  return {
    ok: code === 0,
    stdout: stdout || undefined,
    stderr: stderr || undefined,
    code: code ?? undefined,
    signal: signal ?? undefined,
  };
}
