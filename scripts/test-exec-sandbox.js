#!/usr/bin/env node
/**
 * Full test for the exec (sandbox) feature.
 * Usage: node scripts/test-exec-sandbox.js
 * Uses a temp directory as workspace; then runs exec module and server runTool.
 */
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..");

// Create temp workspace and set before loading exec module (it reads WORKSPACE_DIR at load time)
const tempWorkspace = mkdtempSync(join(tmpdir(), "solana-agent-exec-test-"));
process.env.WORKSPACE_DIR = tempWorkspace;

let passed = 0;
let failed = 0;

function ok(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` ${detail}` : ""}`);
  }
}

async function main() {
  console.log("Exec sandbox tests (WORKSPACE_DIR = temp)\n");

  // Load exec module after env is set
  const { runExec } = await import("../tools/exec.js");

  // --- 1. Missing command
  console.log("1. Missing command");
  const r1 = runExec({});
  ok("returns ok: false", r1.ok === false);
  ok("error message", r1.error && r1.error.includes("command is required"));
  console.log("");

  // --- 2. Empty command
  console.log("2. Empty command");
  const r2 = runExec({ command: "   " });
  ok("returns ok: false", r2.ok === false);
  ok("error message", r2.error && r2.error.includes("command is required"));
  console.log("");

  // --- 3. Simple echo (default workdir)
  console.log("3. Simple echo (workdir default)");
  const r3 = runExec({ command: "echo hello" });
  ok("returns ok: true", r3.ok === true);
  ok("stdout contains hello", r3.stdout && r3.stdout.trim() === "hello");
  ok("code 0", r3.code === 0);
  console.log("");

  // --- 4. cwd is workspace (write file in cwd, check it lands in temp workspace)
  console.log("4. cwd is workspace");
  const r4 = runExec({ command: "node -e \"require('fs').writeFileSync('exec-cwd-marker', process.cwd())\"" });
  ok("returns ok: true", r4.ok === true);
  const markerPath = join(tempWorkspace, "exec-cwd-marker");
  ok("file written to workspace", existsSync(markerPath));
  const writtenCwd = readFileSync(markerPath, "utf8").trim();
  ok("written cwd is workspace (or resolved path)", writtenCwd === tempWorkspace || writtenCwd.startsWith(tempWorkspace) || tempWorkspace.startsWith(writtenCwd) || writtenCwd.includes("solana-agent-exec-test"));
  console.log("");

  // --- 5. workdir subdirectory
  console.log("5. workdir subdirectory");
  const subDir = join(tempWorkspace, "sandbox");
  mkdirSync(subDir, { recursive: true });
  const r5 = runExec({ command: "node -e \"require('fs').writeFileSync('subdir-marker', 'ok')\"", workdir: "sandbox" });
  ok("returns ok: true", r5.ok === true);
  ok("file in sandbox subdir", existsSync(join(subDir, "subdir-marker")));
  console.log("");

  // --- 6. Invalid workdir (escape)
  console.log("6. Invalid workdir (.. escape)");
  const r6 = runExec({ command: "echo x", workdir: ".." });
  ok("returns ok: false", r6.ok === false);
  ok("error about inside workspace", r6.error && r6.error.includes("inside workspace"));
  console.log("");

  // --- 7. Non-zero exit
  console.log("7. Non-zero exit code");
  const r7 = runExec({ command: "exit 42" });
  ok("returns ok: false", r7.ok === false);
  ok("code 42", r7.code === 42);
  console.log("");

  // --- 8. Timeout (node spin 2s with timeout 1s)
  console.log("8. Timeout (node spin 2s with timeout 1s)");
  const r8 = runExec({ command: "node -e \"setTimeout(()=>{}, 2500)\"", timeout: 1 });
  ok("returns ok: false", r8.ok === false);
  ok("timeout error or SIGTERM", (r8.error && r8.error.includes("timed out")) || r8.signal === "SIGTERM");
  console.log("");

  // --- 9. Create and run a Node script
  console.log("9. Create script and run with node");
  const scriptPath = join(subDir, "hello.js");
  writeFileSync(scriptPath, 'console.log("world");\n', "utf8");
  const r9 = runExec({ command: "node hello.js", workdir: "sandbox" });
  ok("returns ok: true", r9.ok === true);
  ok("stdout is world", (r9.stdout || "").trim() === "world");
  console.log("");

  // --- 10. Timeout parameter in seconds
  console.log("10. Timeout parameter (seconds)");
  const r10 = runExec({ command: "echo ok", timeout: 120 });
  ok("returns ok: true", r10.ok === true);
  ok("command completes", (r10.stdout || "").trim() === "ok");
  console.log("");

  // --- 11. Exec tool registered (config has exec entry)
  console.log("11. Exec in tools.yaml");
  const toolsYaml = readFileSync(join(projectRoot, "config", "tools.yaml"), "utf8");
  const hasExec = /name:\s*exec/.test(toolsYaml) && /runExec/.test(toolsYaml);
  ok("exec tool in config", hasExec);
  console.log("");

  // --- 12. Server buildToolsFromRegistry includes exec (load registry only)
  console.log("12. Exec in server tool list");
  let toolsIncludeExec = false;
  try {
    const yamlModule = await import("js-yaml");
    const yaml = yamlModule.default || yamlModule;
    const registryPath = join(projectRoot, "config", "tools.yaml");
    const registryContent = readFileSync(registryPath, "utf8");
    const registry = yaml.load(registryContent);
    const execTool = registry?.tools?.find((t) => t.name === "exec" && t.enabled !== false);
    toolsIncludeExec = !!execTool;
  } catch (_) {
    toolsIncludeExec = false;
  }
  ok("exec in registry and enabled", toolsIncludeExec);
  console.log("");

  // Summary
  console.log("---");
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("All exec sandbox tests passed.");
  console.log("\nManual test: Start the app, then in chat ask the agent to run a command in the sandbox (e.g. \"Create sandbox/hello.js that prints Hello and run it with node\").");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
