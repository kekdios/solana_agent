import { createServer } from "http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from "crypto";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import yaml from "js-yaml";
import * as db from "./db.js";
import * as browser from "./tools/browser.js";
import * as files from "./tools/files.js";
import * as image from "./tools/image.js";
import * as vision from "./tools/vision.js";
import * as sessionStore from "./sessionStore.js";
import * as heartbeat from "./tools/heartbeat.js";
import * as cronjob from "./tools/cronjob.js";
import * as price from "./tools/price.js";
import * as workspace from "./tools/workspace.js";
import * as fetchModule from "./tools/fetch.js";
import * as docCrawlModule from "./tools/doc-crawl.js";
import * as docIndexModule from "./tools/doc-index.js";
import * as docSearchModule from "./tools/doc-search.js";
import * as readDocsFolderModule from "./tools/read-docs-folder.js";
import * as solana from "./tools/solana.js";
import * as jupiter from "./tools/jupiter.js";
import * as drift from "./tools/drift.js";
import * as kamino from "./tools/kamino.js";
import * as raydium from "./tools/raydium.js";
import * as bet from "./tools/bet.js";
import * as execModule from "./tools/exec.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const INCEPTION_API = "https://api.inceptionlabs.ai/v1/chat/completions";
const VENICE_API = "https://api.venice.ai/api/v1/chat/completions";
const NANOGPT_API = "https://nano-gpt.com/api/v1/chat/completions";
const WORKSPACE_FILES = ["SOUL.md", "AGENTS.md", "tools.md"];

/** Workspace root: config table > env > default. Defined after loadConfigKey. */
function getWorkspaceDir() {
  return process.env.WORKSPACE_DIR || join(__dirname, "workspace");
}

function loadWorkspace() {
  const workspaceDir = getWorkspaceDir();
  let out = "";
  for (const name of WORKSPACE_FILES) {
    const path = join(workspaceDir, name);
    try {
      if (existsSync(path)) out += readFileSync(path, "utf8").trim() + "\n\n";
    } catch (_) {}
  }
  return out.trim();
}

// Parameter schemas for OpenAI tool format (keyed by tool name)
const PARAM_SCHEMAS = {
  browse: {
    type: "object",
    properties: { query: { type: "string", description: "Search query or full URL to fetch" } },
    required: ["query"],
  },
  file_write: {
    type: "object",
    properties: { filename: { type: "string" }, content: { type: "string" } },
    required: ["filename", "content"],
  },
  file_read: {
    type: "object",
    properties: { id: { type: "string", description: "File id from file_write or file_list" } },
    required: ["id"],
  },
  file_list: { type: "object", properties: {} },
  generate_image: {
    type: "object",
    properties: { prompt: { type: "string", description: "Image description" } },
    required: ["prompt"],
  },
  analyze_image: {
    type: "object",
    properties: {
      file_id: { type: "string", description: "File id from file_write (the attached image)" },
      prompt: { type: "string", description: "Optional question for the image" },
    },
    required: ["file_id"],
  },
  heartbeat: { type: "object", properties: {} },
  cronjob: {
    type: "object",
    properties: {
      expression: { type: "string", description: "Cron expression, e.g. '0 * * * *' for hourly, '*/5 * * * *' for every 5 min" },
      task: { type: "string", description: "Task name: 'log', 'heartbeat', or 'check_btc' (hourly Bitcoin price; alert when below 65k)" },
    },
    required: ["expression", "task"],
  },
  get_btc_price: { type: "object", properties: {} },
  workspace_read: {
    type: "object",
    properties: { path: { type: "string", description: "File path from workspace_tree's file_paths (e.g. SOUL.md, memory/2026-03-11.md). Must be a file, not a directory. After reading, reply in natural language—never only raw JSON." } },
    required: ["path"],
  },
  workspace_write: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to workspace" },
      content: { type: "string", description: "File content to write" },
    },
    required: ["path", "content"],
  },
  workspace_delete: {
    type: "object",
    properties: { path: { type: "string", description: "Path relative to workspace (file only, not directory)" } },
    required: ["path"],
  },
  workspace_list: {
    type: "object",
    properties: { path: { type: "string", description: "Directory path relative to workspace; omit or '.' for workspace root" } },
    required: [],
  },
  workspace_tree: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory relative to workspace root; omit or '.' for full workspace" },
      max_depth: { type: "number", description: "Max directory depth (default 20, optional)" },
    },
    required: [],
  },
  exec: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run in the workspace sandbox (e.g. node script.js, npm run build). Required." },
      workdir: { type: "string", description: "Directory relative to workspace root (default .). Must stay inside workspace." },
      timeout: { type: "number", description: "Max run time in seconds (default 60, max 300)." },
    },
    required: ["command"],
  },
  fetch_url: {
    type: "object",
    properties: {
      method: { type: "string", description: "GET or POST" },
      url: { type: "string", description: "Full URL (HTTPS only)" },
      body: { type: "string", description: "Optional JSON body for POST, e.g. '{}' or '{\"agent_name\":\"my-bot\"}'" },
    },
    required: ["url"],
  },
  doc_crawl: {
    type: "object",
    properties: {
      base_url: { type: "string", description: "Root docs URL, e.g. https://docs.bebop.xyz/bebop" },
      save_to: { type: "string", description: "Workspace path prefix for saved files, e.g. docs/bebop (optional)" },
      max_pages: { type: "number", description: "Max pages to fetch, default 30, max 100 (optional)" },
    },
    required: ["base_url"],
  },
  doc_index: {
    type: "object",
    properties: {
      root: { type: "string", description: "Workspace-relative folder containing crawled .md files, e.g. docs/bebop" },
    },
    required: ["root"],
  },
  doc_search: {
    type: "object",
    properties: {
      query: { type: "string", description: "FTS5 search query, e.g. swap, oracle AND gas" },
      limit: { type: "number", description: "Max results (default 10, max 100)" },
    },
    required: ["query"],
  },
  read_docs_folder: {
    type: "object",
    properties: {
      path: { type: "string", description: "Workspace path to the docs folder, e.g. docs/bebop" },
      max_per_file: { type: "number", description: "Max chars per file in digest (default 2000, optional)" },
      max_total: { type: "number", description: "Max total chars in returned content (default 28000, optional)" },
      write_summary: { type: "boolean", description: "Write SUMMARY.md in the folder for 'tell me more about X' (default true, optional)" },
    },
    required: ["path"],
  },
  conversation_search: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text to search for in past conversation messages (e.g. 'Bebop API', 'balance')" },
      limit: { type: "number", description: "Max number of conversations to return (default 20, max 50)" },
    },
    required: ["query"],
  },
  solana_address: { type: "object", properties: {} },
  solana_balance: { type: "object", properties: {} },
  solana_transfer: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient Solana address (base58)" },
      amount_sol: { type: "number", description: "Amount in SOL" },
    },
    required: ["to", "amount_sol"],
  },
  solana_network: { type: "object", properties: {} },
  solana_token_balance: {
    type: "object",
    properties: {
      mint: { type: "string", description: "SPL token mint address (base58)" },
      owner: { type: "string", description: "Optional wallet address; omit for the app wallet" },
    },
    required: ["mint"],
  },
  solana_transfer_spl: {
    type: "object",
    properties: {
      mint: { type: "string", description: "SPL token mint address" },
      to: { type: "string", description: "Recipient Solana address (base58)" },
      amount: { type: "string", description: "Amount in smallest units (integer string)" },
      decimals: { type: "number", description: "Token decimals (optional, for display)" },
    },
    required: ["mint", "to", "amount"],
  },
  solana_tx_history: {
    type: "object",
    properties: { limit: { type: "number", description: "Max signatures to return (default 20, max 50)" } },
    required: [],
  },
  solana_tx_status: {
    type: "object",
    properties: { signature: { type: "string", description: "Transaction signature (base58)" } },
    required: ["signature"],
  },
  jupiter_price: {
    type: "object",
    properties: { ids: { type: "string", description: "Token id(s): SOL or comma-separated mint addresses (default SOL)" } },
    required: [],
  },
  jupiter_quote: {
    type: "object",
    properties: {
      input_mint: { type: "string", description: "Input token mint (default SOL)" },
      output_mint: { type: "string", description: "Output token mint (default USDC)" },
      amount: { type: "string", description: "Amount in smallest units (default 1e9 for 1 SOL)" },
    },
    required: [],
  },
  jupiter_swap_prepare: {
    type: "object",
    properties: {
      input_mint: { type: "string", description: "Input token mint (default SOL)" },
      output_mint: { type: "string", description: "Output token mint (default USDC)" },
      amount: { type: "string", description: "Amount in smallest units (integer string)" },
      slippage_bps: { type: "number", description: "Slippage in basis points (default 50)" },
    },
    required: ["amount"],
  },
  jupiter_swap_cancel: {
    type: "object",
    properties: {
      intent_id: { type: "string", description: "Prepared or confirmed swap intent id to cancel" },
    },
    required: ["intent_id"],
  },
  jupiter_swap_execute: {
    type: "object",
    properties: {
      intent_id: { type: "string", description: "Confirmed swap intent id to execute" },
    },
    required: ["intent_id"],
  },
  drift_perp_price: {
    type: "object",
    properties: { market_index: { type: "number", description: "Perp market index (default 0 = SOL)" } },
    required: [],
  },
  drift_positions: { type: "object", properties: {} },
  drift_place_order: {
    type: "object",
    properties: {
      market_index: { type: "number" },
      direction: { type: "string" },
      base_asset_amount: { type: "string" },
      price: { type: "number" },
    },
    required: [],
  },
  kamino_health: { type: "object", properties: {} },
  kamino_positions: { type: "object", properties: {} },
  kamino_deposit: {
    type: "object",
    properties: { amount: { type: "string" }, mint: { type: "string" } },
    required: [],
  },
  raydium_quote: {
    type: "object",
    properties: { input_mint: { type: "string" }, output_mint: { type: "string" }, amount: { type: "string" } },
    required: [],
  },
  raydium_market_detect: {
    type: "object",
    properties: { mint: { type: "string" } },
    required: [],
  },
  bet_markets: { type: "object", properties: {} },
  bet_positions: { type: "object", properties: {} },
};

function loadToolRegistry() {
  const registryPath = join(__dirname, "config", "tools.yaml");
  if (!existsSync(registryPath)) return null;
  const raw = readFileSync(registryPath, "utf8");
  return yaml.load(raw);
}

function buildToolsFromRegistry(registry) {
  if (!registry?.tools) return null;
  const enabled = registry.tools.filter((t) => t.enabled !== false);
  return enabled.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: (t.description || "").trim(),
      parameters: PARAM_SCHEMAS[t.name] ?? { type: "object", properties: {} },
    },
  }));
}

const registry = loadToolRegistry();
const TOOLS = buildToolsFromRegistry(registry) ?? [
  { type: "function", function: { name: "browse", description: "Search or fetch URL", parameters: PARAM_SCHEMAS.browse } },
  { type: "function", function: { name: "file_write", description: "Save file", parameters: PARAM_SCHEMAS.file_write } },
  { type: "function", function: { name: "file_read", description: "Read file by id", parameters: PARAM_SCHEMAS.file_read } },
  { type: "function", function: { name: "file_list", description: "List files", parameters: PARAM_SCHEMAS.file_list } },
  { type: "function", function: { name: "generate_image", description: "Generate image from prompt", parameters: PARAM_SCHEMAS.generate_image } },
  { type: "function", function: { name: "analyze_image", description: "Analyse image by file_id", parameters: PARAM_SCHEMAS.analyze_image } },
  { type: "function", function: { name: "heartbeat", description: "Health-check", parameters: PARAM_SCHEMAS.heartbeat } },
  { type: "function", function: { name: "cronjob", description: "Schedule cron task", parameters: PARAM_SCHEMAS.cronjob } },
];

const MAX_TOOL_TURNS = 5;

// Swap lock: when true, block other high-risk tools while a swap is executing.
let swapLock = { active: false, intent_id: null, started_at: 0 };

function toolAllowedByTier(tier, name, args) {
  const t = clampSecurityTier(tier);
  if (t >= 4) return true;

  // When swap lock is active, block high-risk tools even in operator tiers.
  if (swapLock.active) {
    if (name === "exec") return false;
    if (name === "fetch_url") {
      const m = String(args?.method || "GET").toUpperCase();
      if (m === "POST") return false;
    }
    if (name === "solana_transfer" || name === "solana_transfer_spl") return false;
  }

  // Always-OK: inspect/read-only tools (no writes, no external side effects).
  const alwaysAllow = new Set([
    "browse",
    "heartbeat",
    "get_btc_price",
    "conversation_search",
    "file_list",
    "file_read",
    "workspace_read",
    "workspace_list",
    "workspace_tree",
    "doc_search",
    "read_docs_folder",
    "solana_address",
    "solana_balance",
    "solana_network",
    "solana_token_balance",
    "solana_tx_history",
    "solana_tx_status",
    "jupiter_price",
    "jupiter_quote",
    "drift_perp_price",
    "drift_positions",
    "kamino_health",
    "kamino_positions",
    "raydium_quote",
    "raydium_market_detect",
    "bet_markets",
    "bet_positions",
  ]);
  if (alwaysAllow.has(name)) return true;

  // Swap execution flow is Tier 4 only (sovereign funds movement capability).
  if (name === "jupiter_swap_prepare" || name === "jupiter_swap_execute" || name === "jupiter_swap_cancel") return false;

  if (t === 1) {
    // Tier 1: safest defaults (no shell, no transfers, no mutation, no network POSTs, no background automation).
    return false;
  }

  if (t === 2) {
    // Tier 2: allow local content creation (workspace/docs/files) and limited HTTP fetch (GET only).
    if (["exec", "solana_transfer", "solana_transfer_spl", "workspace_delete"].includes(name)) return false;
    if (name === "fetch_url") {
      const m = String(args?.method || "GET").toUpperCase();
      if (m === "POST") return false;
    }
    return true;
  }

  if (t === 3) {
    // Tier 3: operator mode (exec + HTTP allowed), but still block funds movement.
    if (["solana_transfer", "solana_transfer_spl"].includes(name)) return false;
    return true;
  }

  return true;
}

async function runTool(name, args, env) {
  try {
    if (!toolAllowedByTier(securityTier, name, args)) {
      return { ok: false, error: `Tool '${name}' is disabled by security tier ${securityTier}.` };
    }
    switch (name) {
      case "browse":
        return await browser.browse(args.query ?? "");
      case "file_write":
        return await files.fileWrite(args.filename, args.content ?? "");
      case "file_read":
        return await files.fileRead(args.id);
      case "file_list":
        return await files.fileList();
      case "generate_image":
        return await image.generateImage(args.prompt ?? "", env);
      case "analyze_image":
        return await vision.analyzeImage(args.file_id ?? "", args.prompt ?? "", env);
      case "heartbeat":
        return await heartbeat.heartbeat();
      case "cronjob":
        return await cronjob.scheduleCron(args.expression ?? "", args.task ?? "", env);
      case "get_btc_price":
        return await price.getBtcPriceUsd();
      case "workspace_read":
        return await workspace.workspaceRead(args.path);
      case "workspace_write":
        return await workspace.workspaceWrite(args.path, args.content);
      case "workspace_delete":
        return await workspace.workspaceDelete(args.path);
      case "workspace_list":
        return await workspace.workspaceList(args.path ?? ".");
      case "workspace_tree":
        return await workspace.workspaceTree(args.path ?? ".", args.max_depth);
      case "exec":
        return execModule.runExec(args);
      case "fetch_url":
        return await fetchModule.fetchUrl(args.method ?? "GET", args.url, args.body);
      case "doc_crawl":
        return await docCrawlModule.docCrawl(args.base_url, args.save_to, args.max_pages);
      case "doc_index":
        return await docIndexModule.docIndex(args.root);
      case "doc_search":
        return docSearchModule.docSearch(args.query, args.limit);
      case "read_docs_folder":
        return await readDocsFolderModule.readDocsFolder(args.path, args.max_per_file, args.max_total, args.write_summary);
      case "conversation_search":
        return db.searchConversations(args.query, args.limit ?? 20);
      case "solana_address":
        return await solana.solanaAddress(env);
      case "solana_balance":
        return await solana.solanaBalance(args, env);
      case "solana_transfer":
        return await solana.solanaTransfer(args, env);
      case "solana_network":
        return solana.solanaNetwork(env);
      case "solana_token_balance":
        return await solana.solanaTokenBalance(args, env);
      case "solana_transfer_spl":
        return await solana.solanaTransferSpl(args, env);
      case "solana_tx_history":
        return await solana.solanaTxHistory(args, env);
      case "solana_tx_status":
        return await solana.solanaTxStatus(args, env);
      case "jupiter_price":
        return await jupiter.jupiterPrice(args, env);
      case "jupiter_quote":
        return await jupiter.jupiterQuote(args, env);
      case "jupiter_swap_prepare":
        return await prepareJupiterSwapIntent(args, env);
      case "jupiter_swap_cancel":
        return cancelJupiterSwapIntent(args);
      case "jupiter_swap_execute":
        return await executeJupiterSwapIntent(args, env);
      case "drift_perp_price":
        return await drift.driftPerpPrice(args, env);
      case "drift_positions":
        return await drift.driftPositions(args, env);
      case "drift_place_order":
        return await drift.driftPlaceOrder(args, env);
      case "kamino_health":
        return await kamino.kaminoHealth(args, env);
      case "kamino_positions":
        return await kamino.kaminoPositions(args, env);
      case "kamino_deposit":
        return await kamino.kaminoDeposit(args, env);
      case "raydium_quote":
        return await raydium.raydiumQuote(args, env);
      case "raydium_market_detect":
        return await raydium.raydiumMarketDetect(args, env);
      case "bet_markets":
        return await bet.betMarkets(args, env);
      case "bet_positions":
        return await bet.betPositions(args, env);
      // Redirect legacy EVM-style names to Solana (app is Solana-only)
      case "account_balance":
        return await solana.solanaBalance(args, env);
      case "account_address":
        return await solana.solanaAddress(env);
      default:
        return { error: `Unknown tool: ${name}. For wallet use solana_balance and solana_address.` };
    }
  } catch (e) {
    return { error: String(e.message) };
  }
}

async function prepareJupiterSwapIntent(args, env) {
  // Tier enforcement already handled in toolAllowedByTier.
  const pubKey = getSolanaPublicKeyFromConfig();
  if (!pubKey) return { ok: false, error: "Solana wallet not configured. Set/import wallet in Settings first." };

  const policy = loadSwapPolicy();
  if (!policy.enabled) {
    return { ok: false, error: "Swaps are disabled. Enable swaps in Settings (Tier 4) to prepare a swap intent." };
  }

  const prepared = await jupiter.jupiterSwapPrepare(args, env);
  if (!prepared?.ok) return prepared;

  // Enforce mint allowlists (v1: SOL input + USDC output by default).
  if (policy.allowedIn.length && !policy.allowedIn.includes(prepared.inputMint)) {
    return { ok: false, error: "Input mint is not allowed by swap policy." };
  }
  if (policy.allowedOut.length && !policy.allowedOut.includes(prepared.outputMint)) {
    return { ok: false, error: "Output mint is not allowed by swap policy." };
  }
  if (prepared.slippageBps > policy.maxSlippageBps) {
    return { ok: false, error: `Requested slippage (${prepared.slippageBps} bps) exceeds policy max (${policy.maxSlippageBps} bps).` };
  }

  // Enforce caps for SOL input (amount is in lamports).
  const SOL_MINT = "So11111111111111111111111111111111111111112";
  if (prepared.inputMint === SOL_MINT) {
    const amountLamports = BigInt(String(prepared.inAmount));
    const maxLamports = BigInt(Math.floor(policy.maxSwapSol * 1_000_000_000));
    if (amountLamports > maxLamports) {
      return { ok: false, error: `Amount exceeds max swap size (${policy.maxSwapSol} SOL).` };
    }
    // Percent-of-balance cap.
    const bal = await solana.solanaBalance({}, env);
    if (bal?.ok && typeof bal.lamports === "number") {
      const balanceLamports = BigInt(String(bal.lamports));
      const maxPctLamports = (balanceLamports * BigInt(policy.maxSwapPct)) / BigInt(100);
      if (amountLamports > maxPctLamports) {
        return { ok: false, error: `Amount exceeds max swap percent of balance (${policy.maxSwapPct}%).` };
      }
    }
  }

  const intent_id = randomUUID();
  const ttlMs = policy.intentTtlSeconds * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const policySnapshot = {
    // Snapshot so execution isn't affected by mid-flight config changes.
    enabled: policy.enabled,
    allowedIn: policy.allowedIn,
    allowedOut: policy.allowedOut,
    maxSlippageBps: policy.maxSlippageBps,
    maxSwapSol: policy.maxSwapSol,
    maxSwapPct: policy.maxSwapPct,
    intentTtlSeconds: policy.intentTtlSeconds,
    slippage_bps: prepared.slippageBps,
    created_by: "jupiter_swap_prepare",
    autopilotEnabled: policy.autopilotEnabled,
  };
  db.insertSwapIntent({
    intent_id,
    wallet_pubkey: pubKey,
    input_mint: prepared.inputMint,
    output_mint: prepared.outputMint,
    amount_in: prepared.inAmount,
    slippage_bps: prepared.slippageBps,
    expected_out_amount: prepared.outAmount,
    min_out_amount: prepared.minOutAmount,
    quote_json: JSON.stringify(prepared.quote),
    quote_hash: prepared.quote_hash,
    policy_json: JSON.stringify(policySnapshot),
    status: "prepared",
    expires_at: expiresAt,
  });

  // Autopilot: optional auto-confirm (still Tier 4 only; still policy-checked; execution remains separately gated).
  let autoConfirmed = false;
  if (policy.autopilotEnabled) {
    const upd = db.compareAndSetSwapIntentStatus(intent_id, "prepared", "confirmed");
    autoConfirmed = !!upd.ok;
  }

  const out = {
    ok: true,
    intent_id,
    wallet_pubkey: pubKey,
    inputMint: prepared.inputMint,
    outputMint: prepared.outputMint,
    inAmount: prepared.inAmount,
    outAmount: prepared.outAmount,
    minOutAmount: prepared.minOutAmount,
    slippageBps: prepared.slippageBps,
    expires_at: expiresAt,
    status: autoConfirmed ? "confirmed" : "prepared",
    auto_confirmed: autoConfirmed,
  };

  // Optional auto-execute if enabled and broadcast gate is on (still respects dry-run).
  if (autoConfirmed && policy.autopilotAutoExecute && policy.executionEnabled) {
    const exec = await executeJupiterSwapIntent({ intent_id }, env);
    return { ...out, auto_executed: !!exec.ok, execute_result: exec };
  }

  return out;
}

function cancelJupiterSwapIntent(args) {
  const intentId = (args?.intent_id || args?.intentId || "").trim();
  if (!intentId) return { ok: false, error: "intent_id is required" };
  const intent = db.getSwapIntent(intentId);
  if (!intent) return { ok: false, error: "Not found" };
  if (intent.status !== "prepared" && intent.status !== "confirmed") {
    return { ok: false, error: `Intent not cancellable from status '${intent.status}'` };
  }
  const upd = db.setSwapIntentStatus(intentId, "cancelled");
  if (!upd.ok) return { ok: false, error: "Cancel failed" };
  return { ok: true, intent_id: intentId, status: "cancelled" };
}

async function executeJupiterSwapIntent(args, env) {
  const intentId = (args?.intent_id || args?.intentId || "").trim();
  if (!intentId) return { ok: false, error: "intent_id is required" };

  const policy = loadSwapPolicy();
  if (!policy.executionEnabled) {
    return { ok: false, error: "Swap execution is disabled. Set SWAPS_EXECUTION_ENABLED=true in Settings (Tier 4) to allow sending transactions." };
  }

  const intent = db.getSwapIntent(intentId);
  if (!intent) return { ok: false, error: "Not found" };
  if (intent.status !== "confirmed") return { ok: false, error: `Intent not executable from status '${intent.status}'` };

  // Autopilot limits (also apply to manual execution for safety).
  if (policy.cooldownSeconds > 0) {
    const lastAt = db.getLastSwapCreatedAt(intent.wallet_pubkey);
    if (lastAt) {
      const lastMs = Date.parse(lastAt.endsWith("Z") ? lastAt : lastAt.replace(" ", "T") + "Z");
      if (Number.isFinite(lastMs)) {
        const elapsed = Math.floor((Date.now() - lastMs) / 1000);
        if (elapsed >= 0 && elapsed < policy.cooldownSeconds) {
          return { ok: false, error: `Cooldown active: wait ${policy.cooldownSeconds - elapsed}s` };
        }
      }
    }
  }
  const stats = db.getSwapAutopilotStats(intent.wallet_pubkey);
  if (stats?.ok) {
    if (policy.maxSwapsPerHour > 0 && stats.swaps_last_hour >= policy.maxSwapsPerHour) {
      return { ok: false, error: `Swap rate limit: max ${policy.maxSwapsPerHour}/hour` };
    }
    if (policy.maxSwapsPerDay > 0 && stats.swaps_last_day >= policy.maxSwapsPerDay) {
      return { ok: false, error: `Swap rate limit: max ${policy.maxSwapsPerDay}/day` };
    }
    const SOL_LAMPORTS_PER = 1_000_000_000;
    const maxDailyLamports = BigInt(Math.floor(policy.maxDailySwapSolVolume * SOL_LAMPORTS_PER));
    if (maxDailyLamports > 0n && BigInt(String(stats.sol_in_lamports_last_day || 0)) >= maxDailyLamports) {
      return { ok: false, error: `Daily SOL swap volume cap reached (${policy.maxDailySwapSolVolume} SOL)` };
    }
  }

  const expiresMs = Date.parse(intent.expires_at);
  if (Number.isFinite(expiresMs) && Date.now() > expiresMs) {
    db.setSwapIntentStatus(intentId, "expired");
    return { ok: false, error: "Intent expired" };
  }

  // One-at-a-time: mark executing if still confirmed.
  const locked = db.compareAndSetSwapIntentStatus(intentId, "confirmed", "executing");
  if (!locked.ok) return { ok: false, error: "Intent is not in a confirmable state (possibly already executing)." };

  try {
    if (swapLock.active) throw new Error("Another swap is currently executing");
    swapLock = { active: true, intent_id: intentId, started_at: Date.now() };

    const pubKey = getSolanaPublicKeyFromConfig();
    const kp = getSolanaKeypairFromConfig();
    if (!pubKey || !kp?.privateKeyBase58) throw new Error("Solana wallet not configured");

    // Re-quote check (same mints, amount, slippage) to detect large moves.
    const rq = await jupiter.jupiterSwapPrepare(
      {
        input_mint: intent.input_mint,
        output_mint: intent.output_mint,
        amount: intent.amount_in,
        slippage_bps: intent.slippage_bps,
      },
      env
    );
    if (!rq?.ok) throw new Error(rq?.error || "Re-quote failed");
    const expectedOutNow = BigInt(String(rq.outAmount));
    const expectedOutOld = BigInt(String(intent.expected_out_amount));
    if (expectedOutOld > 0n) {
      const diff = expectedOutOld > expectedOutNow ? expectedOutOld - expectedOutNow : expectedOutNow - expectedOutOld;
      const diffBps = Number((diff * 10_000n) / expectedOutOld);
      if (diffBps > policy.maxRequoteDeviationBps) {
        throw new Error(`Re-quote deviation too high (${diffBps} bps > ${policy.maxRequoteDeviationBps} bps). Prepare a new intent.`);
      }
    }

    const quote = JSON.parse(intent.quote_json);
    const built = await jupiter.jupiterSwapBuildTx({ quote, userPublicKey: pubKey }, env);
    if (!built?.ok) throw new Error(built?.error || "Swap tx build failed");

    const { Connection, Keypair, VersionedTransaction } = await import("@solana/web3.js");
    const conn = new Connection(process.env.SOLANA_RPC_URL || env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", {
      commitment: "confirmed",
    });

    const raw = Buffer.from(String(built.swapTransaction), "base64");
    const tx = VersionedTransaction.deserialize(raw);

    const resolveAccountKeys = async () => {
      const lookups = tx.message.addressTableLookups || [];
      if (!lookups.length) {
        // Legacy/static-only keys.
        return tx.message.getAccountKeys();
      }
      const { AddressLookupTableAccount } = await import("@solana/web3.js");
      const tables = [];
      for (const l of lookups) {
        try {
          const r = await conn.getAddressLookupTable(l.accountKey);
          const alt = r?.value;
          if (alt) tables.push(alt instanceof AddressLookupTableAccount ? alt : alt);
        } catch (_) {}
      }
      return tx.message.getAccountKeys({ addressLookupTableAccounts: tables });
    };

    const keys = await resolveAccountKeys();
    const compiled = tx.message.compiledInstructions || tx.message.instructions || [];
    const programIds = (() => {
      const out = new Set();
      for (const ix of compiled) {
        const idx = Number(ix.programIdIndex);
        const k = Number.isFinite(idx) ? keys.get(idx) : null;
        if (k) out.add(k.toBase58());
      }
      return Array.from(out);
    })();
    const programIdsDebug = {
      programIds,
      compiledInstructionCount: Array.isArray(compiled) ? compiled.length : 0,
      staticKeysLen: (tx.message.staticAccountKeys || keys.staticAccountKeys || []).length,
      lookupCount: (tx.message.addressTableLookups || []).length,
    };

    if (policy.allowedProgramIds?.length) {
      const allowed = new Set(policy.allowedProgramIds);
      const unknown = programIds.filter((p) => !allowed.has(p));
      if (unknown.length) {
        throw new Error(`Swap tx contains disallowed program(s): ${unknown.join(", ")}`);
      }
    }
    const signer = Keypair.fromSecretKey(bs58.decode(kp.privateKeyBase58));
    tx.sign([signer]);

    // Bound fee + compute before any send.
    const feeInfo = await conn.getFeeForMessage(tx.message).catch(() => null);
    const feeLamports = feeInfo?.value != null ? Number(feeInfo.value) : null;
    if (feeLamports != null && Number.isFinite(feeLamports) && feeLamports > policy.maxTxFeeLamports) {
      throw new Error(`Fee too high (${feeLamports} lamports > ${policy.maxTxFeeLamports})`);
    }

    // Mandatory simulation + min-out enforcement (output token delta).
    let outAta = null;
    let outPre = 0n;
    try {
      const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
      outAta = getAssociatedTokenAddressSync(new PublicKey(intent.output_mint), new PublicKey(pubKey));
      const bal = await conn.getTokenAccountBalance(outAta).catch(() => null);
      if (bal?.value?.amount != null) outPre = BigInt(String(bal.value.amount));
    } catch (_) {}

    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const inIsSol = intent.input_mint === SOL_MINT;
    const inAmount = BigInt(String(intent.amount_in));
    const solPre = inIsSol ? BigInt(String(await conn.getBalance(new PublicKey(pubKey)).catch(() => 0))) : null;

    const sim = await conn.simulateTransaction(tx, {
      sigVerify: true,
      commitment: "processed",
      accounts: outAta
        ? { addresses: [outAta.toBase58(), pubKey], encoding: "base64" }
        : undefined,
    });
    if (sim.value?.err) {
      throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
    }
    const units = sim.value?.unitsConsumed != null ? Number(sim.value.unitsConsumed) : null;
    if (units != null && Number.isFinite(units) && units > policy.maxComputeUnits) {
      throw new Error(`Compute too high (${units} > ${policy.maxComputeUnits})`);
    }

    // Input-side spend bounds for SOL input: post SOL must not decrease beyond amount_in + fee + extra buffer.
    if (inIsSol && solPre != null) {
      const accounts = Array.isArray(sim.value?.accounts) ? sim.value.accounts : null;
      const payerAcct = accounts && accounts.length >= 2 ? accounts[1] : null;
      const postLamports = payerAcct?.lamports != null ? BigInt(String(payerAcct.lamports)) : null;
      if (postLamports == null) throw new Error("Simulation did not return payer account lamports");
      const spent = solPre > postLamports ? solPre - postLamports : 0n;
      const fee = BigInt(String(feeLamports || 0));
      const extra = BigInt(String(policy.maxExtraSolLamports || 0));
      const maxSpend = inAmount + fee + extra;
      if (spent > maxSpend) throw new Error(`SOL spend too high in simulation (${spent} > ${maxSpend})`);
      if (spent < inAmount) throw new Error(`SOL spend too low in simulation (${spent} < ${inAmount})`);
    }

    if (outAta) {
      const acct = Array.isArray(sim.value?.accounts) ? sim.value.accounts[0] : null;
      const dataArr = acct?.data;
      const b64 = Array.isArray(dataArr) ? dataArr[0] : null;
      if (typeof b64 !== "string" || !b64) throw new Error("Simulation did not return output token account data");
      const buf = Buffer.from(b64, "base64");
      // SPL token account layout: amount at offset 64 (u64 LE).
      if (buf.length < 72) throw new Error("Output token account data too short");
      const post = buf.readBigUInt64LE(64);
      const delta = post > outPre ? post - outPre : 0n;
      const minOut = BigInt(String(intent.min_out_amount));
      if (delta < minOut) throw new Error(`Min-out not satisfied in simulation (delta ${delta} < min ${minOut})`);
    }

    if (policy.executionDryRun) {
      db.setSwapIntentResult(intentId, {
        status: "simulated",
        signature: "",
        fee_lamports: feeLamports ?? null,
        units_consumed: units ?? null,
        program_ids_json: JSON.stringify(programIdsDebug.programIds || []),
        error_code: "",
        error_message: "",
      });
      return {
        ok: true,
        intent_id: intentId,
        status: "simulated",
        dry_run: true,
        feeLamports,
        unitsConsumed: units,
        programIds: programIdsDebug.programIds,
        debug: { compiledInstructionCount: programIdsDebug.compiledInstructionCount, staticKeysLen: programIdsDebug.staticKeysLen },
      };
    }

    const sig = await conn.sendTransaction(tx, { skipPreflight: true, maxRetries: 3 });
    const conf = await conn.confirmTransaction(sig, "confirmed");
    if (conf.value?.err) throw new Error(`Transaction failed: ${JSON.stringify(conf.value.err)}`);

    db.setSwapIntentResult(intentId, {
      status: "succeeded",
      signature: sig,
      fee_lamports: feeLamports ?? null,
      units_consumed: units ?? null,
      program_ids_json: JSON.stringify(programIdsDebug.programIds || []),
      error_code: "",
      error_message: "",
    });
    return { ok: true, intent_id: intentId, status: "succeeded", signature: sig };
  } catch (e) {
    db.setSwapIntentResult(intentId, { status: "failed", error_code: "EXECUTION_FAILED", error_message: e.message || String(e) });
    return { ok: false, intent_id: intentId, status: "failed", error: e.message || String(e) };
  } finally {
    if (swapLock.intent_id === intentId) swapLock = { active: false, intent_id: null, started_at: 0 };
  }
}

function loadEnv() {
  const envPath = process.env.ENV_PATH || join(__dirname, ".env");
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

function looksLikeToolArgs(s) {
  if (typeof s !== "string" || s.length > 500) return false;
  const t = s.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

const env = loadEnv();
const ENV_PATH = process.env.ENV_PATH || join(__dirname, ".env");

const DB_DIR = process.env.DB_PATH ? dirname(process.env.DB_PATH) : join(__dirname, "data");
const ENCRYPTION_KEY_PATH = join(DB_DIR, ".encryption-key");
const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function getEncryptionKey() {
  if (!existsSync(ENCRYPTION_KEY_PATH)) {
    const key = randomBytes(KEY_LEN);
    try {
      mkdirSync(DB_DIR, { recursive: true });
      writeFileSync(ENCRYPTION_KEY_PATH, key, { mode: 0o600 });
    } catch (e) {
      console.error("Failed to write encryption key:", e.message);
      return null;
    }
    return key;
  }
  return readFileSync(ENCRYPTION_KEY_PATH);
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  if (!key || key.length !== KEY_LEN) return null;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(ciphertextB64) {
  const key = getEncryptionKey();
  if (!key || key.length !== KEY_LEN) return null;
  const buf = Buffer.from(ciphertextB64, "base64");
  if (buf.length < IV_LEN + TAG_LEN) return null;
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final("utf8");
}

/** Load a config value: config table (solagent.db) is sole source of truth; env is fallback only when not in DB. */
function loadConfigKey(key, envFallback) {
  const stored = db.getConfig(key);
  if (stored) {
    try {
      const dec = decrypt(stored);
      if (dec != null && dec.trim() !== "") return dec.trim();
    } catch (_) {}
  }
  return envFallback ?? null;
}

function clampSecurityTier(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  if (n < 1) return 1;
  if (n > 4) return 4;
  return Math.floor(n);
}

function ensureDefaultConfigKey(key, plaintextValue) {
  try {
    const stored = db.getConfig(key);
    if (stored) return;
    const enc = encrypt(String(plaintextValue));
    if (!enc) return;
    db.setConfig(key, enc);
  } catch (_) {}
}

// Sole source of truth: config table in solagent.db. API keys and secrets stored encrypted; env used only as fallback.
let apiKey = loadConfigKey("INCEPTION_API_KEY") || process.env.INCEPTION_API_KEY || env.INCEPTION_API_KEY || null;
let veniceApiKey = loadConfigKey("VENICE_ADMIN_KEY") || process.env.VENICE_ADMIN_KEY || env.VENICE_ADMIN_KEY || null;
let nanogptApiKey = loadConfigKey("NANOGPT_API_KEY") || process.env.NANOGPT_API_KEY || env.NANOGPT_API_KEY || null;
let jupiterApiKey = loadConfigKey("JUPITER_API_KEY") || process.env.JUPITER_API_KEY || env.JUPITER_API_KEY || null;
let chatBackend = (loadConfigKey("CHAT_BACKEND") || process.env.CHAT_BACKEND || env.CHAT_BACKEND || "").toLowerCase();
if (chatBackend !== "venice" && chatBackend !== "nanogpt" && chatBackend !== "inception") chatBackend = "nanogpt";

// Hardening tier (1..4). Stored in config table; defaults to tier 1.
ensureDefaultConfigKey("SECURITY_TIER", "1");
let securityTier = clampSecurityTier(loadConfigKey("SECURITY_TIER") ?? "1");

// Swap policy defaults (stored in config table; values are plaintext before encryption).
ensureDefaultConfigKey("SWAPS_ENABLED", "false");
ensureDefaultConfigKey("SWAPS_ALLOWED_OUTPUT_MINTS", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC
ensureDefaultConfigKey("SWAPS_ALLOWED_INPUT_MINTS", "So11111111111111111111111111111111111111112"); // SOL
ensureDefaultConfigKey("SWAPS_MAX_SLIPPAGE_BPS", "50");
ensureDefaultConfigKey("SWAPS_MAX_SWAP_SOL", "0.05");
ensureDefaultConfigKey("SWAPS_MAX_SWAP_PCT_BALANCE", "20");
ensureDefaultConfigKey("SWAPS_INTENT_TTL_SECONDS", "180");
ensureDefaultConfigKey("SWAPS_EXECUTION_ENABLED", "false");
ensureDefaultConfigKey("SWAPS_MAX_REQUOTE_DEVIATION_BPS", "150");
ensureDefaultConfigKey("SWAPS_EXECUTION_DRY_RUN", "true");
ensureDefaultConfigKey("SWAPS_MAX_TX_FEE_LAMPORTS", "50000");
ensureDefaultConfigKey("SWAPS_MAX_COMPUTE_UNITS", "1400000");
ensureDefaultConfigKey("SWAPS_MAX_EXTRA_SOL_LAMPORTS", "3000000");
ensureDefaultConfigKey(
  "SWAPS_ALLOWED_PROGRAM_IDS",
  [
    "ComputeBudget111111111111111111111111111111",
    "11111111111111111111111111111111",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  ].join(",")
);

// Autopilot (explicit opt-in). Still enforced by deterministic server-side limits.
ensureDefaultConfigKey("SWAPS_AUTOPILOT_ENABLED", "false");
ensureDefaultConfigKey("SWAPS_AUTOPILOT_AUTO_EXECUTE", "false");
ensureDefaultConfigKey("SWAPS_COOLDOWN_SECONDS", "60");
ensureDefaultConfigKey("SWAPS_MAX_SWAPS_PER_HOUR", "3");
ensureDefaultConfigKey("SWAPS_MAX_SWAPS_PER_DAY", "10");
ensureDefaultConfigKey("SWAPS_MAX_DAILY_SWAP_SOL_VOLUME", "0.2");

function parseBool(s, defaultValue = false) {
  if (s == null) return defaultValue;
  const v = String(s).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return defaultValue;
}

function parseCsv(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function loadSwapPolicy() {
  const enabled = parseBool(loadConfigKey("SWAPS_ENABLED") ?? "false", false);
  const allowedOut = parseCsv(loadConfigKey("SWAPS_ALLOWED_OUTPUT_MINTS") ?? "");
  const allowedIn = parseCsv(loadConfigKey("SWAPS_ALLOWED_INPUT_MINTS") ?? "");
  const maxSlippageBps = Math.max(1, Math.min(Number(loadConfigKey("SWAPS_MAX_SLIPPAGE_BPS") ?? "50") || 50, 5000));
  const maxSwapSol = Number(loadConfigKey("SWAPS_MAX_SWAP_SOL") ?? "0.05") || 0.05;
  const maxSwapPct = Math.max(1, Math.min(Number(loadConfigKey("SWAPS_MAX_SWAP_PCT_BALANCE") ?? "20") || 20, 100));
  const intentTtlSeconds = Math.max(30, Math.min(Number(loadConfigKey("SWAPS_INTENT_TTL_SECONDS") ?? "180") || 180, 3600));
  const executionEnabled = parseBool(loadConfigKey("SWAPS_EXECUTION_ENABLED") ?? "false", false);
  const maxRequoteDeviationBps = Math.max(1, Math.min(Number(loadConfigKey("SWAPS_MAX_REQUOTE_DEVIATION_BPS") ?? "150") || 150, 5000));
  const executionDryRun = parseBool(loadConfigKey("SWAPS_EXECUTION_DRY_RUN") ?? "true", true);
  const maxTxFeeLamports = Math.max(1_000, Math.min(Number(loadConfigKey("SWAPS_MAX_TX_FEE_LAMPORTS") ?? "10000") || 10000, 1_000_000));
  const maxComputeUnits = Math.max(200_000, Math.min(Number(loadConfigKey("SWAPS_MAX_COMPUTE_UNITS") ?? "1400000") || 1_400_000, 3_000_000));
  const maxExtraSolLamports = Math.max(0, Math.min(Number(loadConfigKey("SWAPS_MAX_EXTRA_SOL_LAMPORTS") ?? "3000000") || 3_000_000, 50_000_000));
  const allowedProgramIds = parseCsv(loadConfigKey("SWAPS_ALLOWED_PROGRAM_IDS") ?? "");
  const autopilotEnabled = parseBool(loadConfigKey("SWAPS_AUTOPILOT_ENABLED") ?? "false", false);
  const autopilotAutoExecute = parseBool(loadConfigKey("SWAPS_AUTOPILOT_AUTO_EXECUTE") ?? "false", false);
  const cooldownSeconds = Math.max(0, Math.min(Number(loadConfigKey("SWAPS_COOLDOWN_SECONDS") ?? "60") || 60, 86400));
  const maxSwapsPerHour = Math.max(0, Math.min(Number(loadConfigKey("SWAPS_MAX_SWAPS_PER_HOUR") ?? "3") || 3, 1000));
  const maxSwapsPerDay = Math.max(0, Math.min(Number(loadConfigKey("SWAPS_MAX_SWAPS_PER_DAY") ?? "10") || 10, 1000));
  const maxDailySwapSolVolume = Math.max(0, Number(loadConfigKey("SWAPS_MAX_DAILY_SWAP_SOL_VOLUME") ?? "0.2") || 0.2);
  return {
    enabled,
    allowedOut,
    allowedIn,
    maxSlippageBps,
    maxSwapSol,
    maxSwapPct,
    intentTtlSeconds,
    executionEnabled,
    maxRequoteDeviationBps,
    executionDryRun,
    maxTxFeeLamports,
    maxComputeUnits,
    maxExtraSolLamports,
    allowedProgramIds,
    autopilotEnabled,
    autopilotAutoExecute,
    cooldownSeconds,
    maxSwapsPerHour,
    maxSwapsPerDay,
    maxDailySwapSolVolume,
  };
}

// Solana network RPC URLs (default: testnet)
const SOLANA_NETWORK_URLS = {
  testnet: "https://api.testnet.solana.com",
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};
const DEFAULT_SOLANA_RPC = SOLANA_NETWORK_URLS.testnet;

function getSolanaNetworkFromRpc(url) {
  if (!url || typeof url !== "string") return "testnet";
  const u = url.trim().toLowerCase();
  if (u.includes("testnet")) return "testnet";
  if (u.includes("devnet")) return "devnet";
  if (u.includes("mainnet")) return "mainnet";
  return "custom";
}

// Env-style vars: config table overrides .env. Apply to process.env so tools see them at runtime.
// Use let so POST /api/config can update them; GET then returns current values without restart.
let configPort = loadConfigKey("PORT") ?? process.env.PORT ?? env.PORT;
let configHost = loadConfigKey("HOST") ?? process.env.HOST ?? env.HOST;
let configSolanaRpc = loadConfigKey("SOLANA_RPC_URL") ?? process.env.SOLANA_RPC_URL ?? env.SOLANA_RPC_URL;
if (!configSolanaRpc || !configSolanaRpc.trim()) configSolanaRpc = DEFAULT_SOLANA_RPC;
let configHeartbeatMs = loadConfigKey("HEARTBEAT_INTERVAL_MS") ?? process.env.HEARTBEAT_INTERVAL_MS ?? env.HEARTBEAT_INTERVAL_MS;
let configWorkspaceDir = loadConfigKey("WORKSPACE_DIR") ?? process.env.WORKSPACE_DIR ?? env.WORKSPACE_DIR;
let configDataDir = loadConfigKey("DATA_DIR") ?? process.env.DATA_DIR ?? env.DATA_DIR;
if (configSolanaRpc) process.env.SOLANA_RPC_URL = configSolanaRpc;
if (configWorkspaceDir) process.env.WORKSPACE_DIR = configWorkspaceDir;
if (configDataDir) process.env.DATA_DIR = configDataDir;
if (jupiterApiKey) process.env.JUPITER_API_KEY = jupiterApiKey;

/** Resolved server port (config > env > default). */
let port = Number(configPort) || 3333;
/** Resolved server host (config > env > default). */
let host = (configHost && String(configHost).trim()) || "0.0.0.0";
/** Resolved heartbeat interval ms (config > env; 0 = disabled). */
let heartbeatIntervalMs = configHeartbeatMs ? Number(configHeartbeatMs) : 0;

/** Returns { url, model, apiKey } for the current chat backend. */
function getChatBackendConfig() {
  if (chatBackend === "venice") {
    return { url: VENICE_API, model: "venice-uncensored", apiKey: veniceApiKey };
  }
  if (chatBackend === "nanogpt") {
    return { url: NANOGPT_API, model: "x-ai/grok-4-fast", apiKey: nanogptApiKey };
  }
  return { url: INCEPTION_API, model: "mercury-2", apiKey };
}

function getSolanaKeypairFromConfig() {
  const privStored = db.getConfig("SOLANA_PRIVATE_KEY");
  if (!privStored) return null;
  try {
    const dec = decrypt(privStored);
    if (!dec || !dec.trim()) return null;
    return { privateKeyBase58: dec.trim() };
  } catch (_) {}
  return null;
}

function getSolanaPublicKeyFromConfig() {
  const stored = db.getConfig("SOLANA_PUBLIC_KEY");
  if (!stored) return null;
  try {
    const dec = decrypt(stored);
    if (dec && dec.trim()) return dec.trim();
  } catch (_) {}
  return null;
}

const solanaFromConfig = getSolanaKeypairFromConfig();
if (solanaFromConfig) {
  process.env.SOLANA_PRIVATE_KEY = solanaFromConfig.privateKeyBase58;
}

const INCEPTION_ERRORS = {
  401: {
    message: "Incorrect API key. Check your key in .env, clear cache, or generate a new key.",
    retryable: false,
  },
  429: {
    message: "Rate limit reached. Please wait a moment and try again.",
    retryable: true,
  },
  500: {
    message: "Server error. Please try again in a moment.",
    retryable: true,
  },
  503: {
    message: "The chat provider (Inception API) is overloaded. Wait a moment and try sending your message again.",
    retryable: true,
  },
};

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname === "/" ? "/index.html" : url.pathname;

  if (path === "/api/env-path" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ envPath: ENV_PATH }));
    return;
  }
  if (path === "/api/solana-rpc/test" && (req.method === "GET" || req.method === "POST")) {
    const rpcUrl = configSolanaRpc || process.env.SOLANA_RPC_URL || DEFAULT_SOLANA_RPC;
    try {
      const conn = new Connection(rpcUrl, { commitment: "confirmed" });
      await conn.getSlot();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, network: getSolanaNetworkFromRpc(rpcUrl) }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    }
    return;
  }
  if (path === "/api/nanogpt/balance" && req.method === "GET") {
    const key = loadConfigKey("NANOGPT_API_KEY") || nanogptApiKey;
    if (!key || !key.trim()) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "NANOGPT_API_KEY not set" }));
      return;
    }
    try {
      const r = await fetch("https://nano-gpt.com/api/check-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: data.message || data.error || `HTTP ${r.status}` }));
        return;
      }
      const usd = data.usd_balance != null ? String(data.usd_balance) : null;
      const nano = data.nano_balance != null ? String(data.nano_balance) : null;
      const nanoDepositAddress = data.nanoDepositAddress != null ? String(data.nanoDepositAddress) : null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, usd_balance: usd, nano_balance: nano, nano_deposit_address: nanoDepositAddress }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    }
    return;
  }
  /** NanoGPT API key for proxy endpoints (from config/DB). */
  function getNanogptKey() {
    return loadConfigKey("NANOGPT_API_KEY") || nanogptApiKey || "";
  }
  function nanogptFetch(path, opts = {}) {
    const key = getNanogptKey();
    if (!key || !key.trim()) return Promise.resolve({ ok: false, error: "NANOGPT_API_KEY not set" });
    const url = `https://nano-gpt.com${path}`;
    const headers = { "Content-Type": "application/json", "x-api-key": key, ...opts.headers };
    return fetch(url, { ...opts, headers }).then((r) => r.json().catch(() => ({})));
  }
  // GET /api/nanogpt/limits/:ticker
  const limitsMatch = path.match(/^\/api\/nanogpt\/limits\/([^/]+)$/);
  if (limitsMatch && req.method === "GET") {
    const ticker = limitsMatch[1];
    try {
      const data = await nanogptFetch(`/api/transaction/limits/${encodeURIComponent(ticker)}`);
      if (data.error || data.message) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: data.error || data.message }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...data }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    }
    return;
  }
  // POST /api/nanogpt/transaction/create/:ticker  body: { amount }
  const createMatch = path.match(/^\/api\/nanogpt\/transaction\/create\/([^/]+)$/);
  if (createMatch && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const key = getNanogptKey();
    if (!key || !key.trim()) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "NANOGPT_API_KEY not set" }));
      return;
    }
    const ticker = createMatch[1];
    try {
      const payload = JSON.parse(body || "{}");
      const amount = payload.amount;
      const r = await fetch(`https://nano-gpt.com/api/transaction/create/${encodeURIComponent(ticker)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: data.message || data.error || `HTTP ${r.status}` }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...data }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    }
    return;
  }
  // GET /api/nanogpt/transaction/status/:ticker/:txId
  const statusMatch = path.match(/^\/api\/nanogpt\/transaction\/status\/([^/]+)\/([^/]+)$/);
  if (statusMatch && req.method === "GET") {
    const [, ticker, txId] = statusMatch;
    try {
      const data = await nanogptFetch(`/api/transaction/status/${encodeURIComponent(ticker)}/${encodeURIComponent(txId)}`);
      if (data.error || data.message) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: data.error || data.message }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...data }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    }
    return;
  }
  // POST /api/nanogpt/transaction/create/daimo/:ticker  body: { amount }
  const daimoMatch = path.match(/^\/api\/nanogpt\/transaction\/create\/daimo\/([^/]+)$/);
  if (daimoMatch && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const key = getNanogptKey();
    if (!key || !key.trim()) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "NANOGPT_API_KEY not set" }));
      return;
    }
    const ticker = daimoMatch[1];
    try {
      const payload = JSON.parse(body || "{}");
      const amount = payload.amount;
      const r = await fetch(`https://nano-gpt.com/api/transaction/create/daimo/${encodeURIComponent(ticker)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: data.message || data.error || `HTTP ${r.status}` }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...data }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    }
    return;
  }
  // POST /api/nanogpt/transaction/create/usd  body: { amount }
  if (path === "/api/nanogpt/transaction/create/usd" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const key = getNanogptKey();
    if (!key || !key.trim()) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "NANOGPT_API_KEY not set" }));
      return;
    }
    try {
      const payload = JSON.parse(body || "{}");
      const amount = payload.amount;
      const r = await fetch("https://nano-gpt.com/api/transaction/create/usd", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: data.message || data.error || `HTTP ${r.status}` }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...data }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    }
    return;
  }
  // GET /api/nanogpt/prices/nano
  if (path === "/api/nanogpt/prices/nano" && req.method === "GET") {
    try {
      const r = await fetch("https://nano-gpt.com/api/get-nano-price");
      const data = await r.json().catch(() => ({}));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e?.message || String(e) }));
    }
    return;
  }
  // GET /api/nanogpt/prices/fiat
  if (path === "/api/nanogpt/prices/fiat" && req.method === "GET") {
    try {
      const r = await fetch("https://nano-gpt.com/api/get-fiat-prices");
      const data = await r.json().catch(() => ({}));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e?.message || String(e) }));
    }
    return;
  }
  if (path === "/api/config" && req.method === "GET") {
    const masked = (s) => (s && s.length > 8 ? s.slice(0, 4) + "…" + s.slice(-4) : null);
    const pubKey = getSolanaPublicKeyFromConfig();
    const hasKeypair = !!(pubKey || getSolanaKeypairFromConfig());
    let passphraseAcknowledged = false;
    try {
      const ack = db.getConfig("PASSPHRASE_BACKUP_ACKNOWLEDGED");
      if (ack) {
        const dec = decrypt(ack);
        passphraseAcknowledged = dec === "true";
      }
    } catch (_) {}
    let veniceStatus = "NOT_CONFIGURED";
    let veniceMasked = null;
    if (veniceApiKey) {
      veniceStatus = "CONNECTED";
      veniceMasked = masked(veniceApiKey);
    }
    let nanogptStatus = "NOT_CONFIGURED";
    let nanogptMasked = null;
    if (nanogptApiKey) {
      nanogptStatus = "CONNECTED";
      nanogptMasked = masked(nanogptApiKey);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        config: {
          securityTier,
          swapsPolicy: {
            enabled: loadSwapPolicy().enabled,
            allowedInputMints: loadSwapPolicy().allowedIn,
            allowedOutputMints: loadSwapPolicy().allowedOut,
            maxSlippageBps: loadSwapPolicy().maxSlippageBps,
            maxSwapSol: loadSwapPolicy().maxSwapSol,
            maxSwapPctBalance: loadSwapPolicy().maxSwapPct,
            intentTtlSeconds: loadSwapPolicy().intentTtlSeconds,
            executionEnabled: loadSwapPolicy().executionEnabled,
            executionDryRun: loadSwapPolicy().executionDryRun,
            maxRequoteDeviationBps: loadSwapPolicy().maxRequoteDeviationBps,
            maxTxFeeLamports: loadSwapPolicy().maxTxFeeLamports,
            maxComputeUnits: loadSwapPolicy().maxComputeUnits,
            maxExtraSolLamports: loadSwapPolicy().maxExtraSolLamports,
            allowedProgramIds: loadSwapPolicy().allowedProgramIds,
            autopilotEnabled: loadSwapPolicy().autopilotEnabled,
            autopilotAutoExecute: loadSwapPolicy().autopilotAutoExecute,
            cooldownSeconds: loadSwapPolicy().cooldownSeconds,
            maxSwapsPerHour: loadSwapPolicy().maxSwapsPerHour,
            maxSwapsPerDay: loadSwapPolicy().maxSwapsPerDay,
            maxDailySwapSolVolume: loadSwapPolicy().maxDailySwapSolVolume,
          },
          chatBackend,
          INCEPTION_API_KEY: {
            status: apiKey ? "CONNECTED" : "NOT_CONFIGURED",
            masked: apiKey ? masked(apiKey) : null,
          },
          VENICE_ADMIN_KEY: {
            status: veniceStatus,
            masked: veniceMasked,
          },
          NANOGPT_API_KEY: {
            status: nanogptStatus,
            masked: nanogptMasked,
          },
          JUPITER_API_KEY: {
            status: jupiterApiKey ? "CONNECTED" : "NOT_CONFIGURED",
            masked: jupiterApiKey ? masked(jupiterApiKey) : null,
          },
          solanaWallet: {
            hasKeypair,
            publicKey: pubKey || null,
            passphraseAcknowledged,
          },
          solanaNetwork: getSolanaNetworkFromRpc(configSolanaRpc),
          solanaNetworkUrls: SOLANA_NETWORK_URLS,
          env: {
            PORT: String(port),
            HOST: host,
            SOLANA_RPC_URL: configSolanaRpc || "",
            HEARTBEAT_INTERVAL_MS: heartbeatIntervalMs > 0 ? String(heartbeatIntervalMs) : "",
            WORKSPACE_DIR: configWorkspaceDir || "",
            DATA_DIR: configDataDir || "",
          },
        },
      })
    );
    return;
  }
  if (path === "/api/solana-wallet/ensure" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    const existing = getSolanaKeypairFromConfig();
    if (existing) {
      const pubKey = getSolanaPublicKeyFromConfig();
      let passphraseAcknowledged = false;
      try {
        const ack = db.getConfig("PASSPHRASE_BACKUP_ACKNOWLEDGED");
        if (ack) passphraseAcknowledged = decrypt(ack) === "true";
      } catch (_) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ publicKey: pubKey, privateKeyOneTime: null, passphraseAcknowledged }));
      return;
    }
    const keypair = Keypair.generate();
    const publicKeyBase58 = keypair.publicKey.toBase58();
    const privateKeyBase58 = bs58.encode(keypair.secretKey);
    const encPub = encrypt(publicKeyBase58);
    const encPriv = encrypt(privateKeyBase58);
    if (!encPub || !encPriv) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Encryption failed" }));
      return;
    }
    db.setConfig("SOLANA_PUBLIC_KEY", encPub);
    db.setConfig("SOLANA_PRIVATE_KEY", encPriv);
    process.env.SOLANA_PRIVATE_KEY = privateKeyBase58;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ publicKey: publicKeyBase58, privateKeyOneTime: privateKeyBase58, passphraseAcknowledged: false }));
    return;
  }
  if (path === "/api/solana-wallet/import" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let data;
    try {
      data = JSON.parse(body || "{}");
    } catch (_) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    const privateKeyInput = (data.privateKey || data.private_key || "").trim();
    if (!privateKeyInput) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "privateKey is required (base58 Solana private key)" }));
      return;
    }
    let keypair;
    try {
      const decoded = bs58.decode(privateKeyInput);
      if (decoded.length === 64) {
        keypair = Keypair.fromSecretKey(decoded);
      } else if (decoded.length === 32) {
        keypair = Keypair.fromSeed(decoded);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid key: must be 32 or 64 bytes (base58)" }));
        return;
      }
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid private key: " + (e.message || "decode failed") }));
      return;
    }
    const publicKeyBase58 = keypair.publicKey.toBase58();
    const privateKeyBase58 = bs58.encode(keypair.secretKey);
    const encPub = encrypt(publicKeyBase58);
    const encPriv = encrypt(privateKeyBase58);
    if (!encPub || !encPriv) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Encryption failed" }));
      return;
    }
    db.setConfig("SOLANA_PUBLIC_KEY", encPub);
    db.setConfig("SOLANA_PRIVATE_KEY", encPriv);
    process.env.SOLANA_PRIVATE_KEY = privateKeyBase58;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ publicKey: publicKeyBase58, passphraseAcknowledged: false }));
    return;
  }
  if (path === "/api/solana-wallet/private-key" && req.method === "GET") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    const kp = getSolanaKeypairFromConfig();
    if (!kp) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No wallet" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ privateKey: kp.privateKeyBase58 }));
    return;
  }
  if (path === "/api/solana-wallet/balance" && req.method === "GET") {
    try {
      const out = await solana.solanaBalance({}, {});
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
    }
    return;
  }
  if (path === "/api/solana-wallet/signatures" && req.method === "GET") {
    try {
      const pubKeyB58 = getSolanaPublicKeyFromConfig();
      if (!pubKeyB58) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "No wallet", signatures: [] }));
        return;
      }
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "15", 10) || 15, 30);
      const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const conn = new Connection(rpcUrl, { commitment: "confirmed" });
      const pk = new PublicKey(pubKeyB58);
      const sigs = await conn.getSignaturesForAddress(pk, { limit });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          address: pubKeyB58,
          signatures: sigs.map((s) => ({ signature: s.signature, blockTime: s.blockTime, err: s.err })),
        })
      );
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message || String(e), signatures: [] }));
    }
    return;
  }
  if (path === "/api/solana-wallet/send" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Forbidden" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body || "{}");
      const out = await solana.solanaTransfer({ to: data.to, amount_sol: data.amount_sol }, {});
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
    }
    return;
  }
  if (path === "/api/jupiter/swap/prepare" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Forbidden" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body || "{}");
      const out = await prepareJupiterSwapIntent(data, loadEnv());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
    }
    return;
  }
  if (path === "/api/jupiter/swap/intent" && req.method === "GET") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Forbidden" }));
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const intentId = (url.searchParams.get("intent_id") || "").trim();
    if (!intentId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "intent_id is required" }));
      return;
    }
    const intent = db.getSwapIntent(intentId);
    if (!intent) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
      return;
    }
    // Return a safe subset; quote_json can be large and is not needed for UX.
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        intent: {
          intent_id: intent.intent_id,
          wallet_pubkey: intent.wallet_pubkey,
          input_mint: intent.input_mint,
          output_mint: intent.output_mint,
          amount_in: intent.amount_in,
          slippage_bps: intent.slippage_bps,
          expected_out_amount: intent.expected_out_amount,
          min_out_amount: intent.min_out_amount,
          quote_hash: intent.quote_hash,
          policy_json: intent.policy_json,
          status: intent.status,
          created_at: intent.created_at,
          expires_at: intent.expires_at,
          signature: intent.signature || null,
          fee_lamports: intent.fee_lamports ?? null,
          units_consumed: intent.units_consumed ?? null,
          program_ids: (() => {
            try {
              return intent.program_ids_json ? JSON.parse(intent.program_ids_json) : null;
            } catch (_) {
              return null;
            }
          })(),
        },
      })
    );
    return;
  }
  if (path === "/api/jupiter/swap/confirm" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Forbidden" }));
      return;
    }
    if (clampSecurityTier(securityTier) < 4) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Requires security tier 4" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let data;
    try {
      data = JSON.parse(body || "{}");
    } catch (_) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      return;
    }
    const intentId = (data.intent_id || data.intentId || "").trim();
    if (!intentId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "intent_id is required" }));
      return;
    }
    const intent = db.getSwapIntent(intentId);
    if (!intent) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
      return;
    }
    if (intent.status !== "prepared") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `Intent not confirmable from status '${intent.status}'` }));
      return;
    }
    const expiresMs = Date.parse(intent.expires_at);
    if (Number.isFinite(expiresMs) && Date.now() > expiresMs) {
      db.setSwapIntentStatus(intentId, "expired");
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Intent expired" }));
      return;
    }
    const upd = db.setSwapIntentStatus(intentId, "confirmed");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: !!upd.ok, intent_id: intentId, status: "confirmed" }));
    return;
  }
  if (path === "/api/jupiter/swap/cancel" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Forbidden" }));
      return;
    }
    if (clampSecurityTier(securityTier) < 4) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Requires security tier 4" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let data;
    try {
      data = JSON.parse(body || "{}");
    } catch (_) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      return;
    }
    const out = cancelJupiterSwapIntent(data);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out));
    return;
  }
  if (path === "/api/jupiter/swap/execute" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Forbidden" }));
      return;
    }
    if (clampSecurityTier(securityTier) < 4) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Requires security tier 4" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let data;
    try {
      data = JSON.parse(body || "{}");
    } catch (_) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      return;
    }
    try {
      const out = await executeJupiterSwapIntent(data, loadEnv());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
    }
    return;
  }
  if (path === "/api/config" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body || "{}");
      const key = (data.key || "").trim();
      const value = typeof data.value === "string" ? data.value.trim() : "";
      if (!key) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "key required" }));
        return;
      }
      if (key === "INCEPTION_API_KEY") {
        if (value) {
          const enc = encrypt(value);
          if (!enc) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Encryption failed" }));
            return;
          }
          db.setConfig(key, enc);
        } else {
          db.setConfig(key, encrypt(""));
        }
        apiKey = value || null;
      } else if (key === "VENICE_ADMIN_KEY") {
        if (value) {
          const enc = encrypt(value);
          if (!enc) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Encryption failed" }));
            return;
          }
          db.setConfig(key, enc);
        } else {
          db.setConfig(key, encrypt(""));
        }
        veniceApiKey = value || null;
      } else if (key === "NANOGPT_API_KEY") {
        if (value) {
          const enc = encrypt(value);
          if (!enc) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Encryption failed" }));
            return;
          }
          db.setConfig(key, enc);
        } else {
          db.setConfig(key, encrypt(""));
        }
        nanogptApiKey = value || null;
      } else if (key === "JUPITER_API_KEY") {
        if (value) {
          const enc = encrypt(value);
          if (!enc) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Encryption failed" }));
            return;
          }
          db.setConfig(key, enc);
        } else {
          db.setConfig(key, encrypt(""));
        }
        jupiterApiKey = value || null;
        if (jupiterApiKey) process.env.JUPITER_API_KEY = jupiterApiKey;
      } else if (key === "CHAT_BACKEND") {
        const v = (value || "").toLowerCase();
        if (v === "venice" || v === "inception" || v === "nanogpt") {
          const enc = encrypt(v);
          if (enc) {
            db.setConfig(key, enc);
            chatBackend = v;
          }
        }
      } else if (key === "SECURITY_TIER") {
        const t = clampSecurityTier(value || "1");
        const enc = encrypt(String(t));
        if (!enc) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Encryption failed" }));
          return;
        }
        db.setConfig(key, enc);
        securityTier = t;
      } else if (key === "PASSPHRASE_BACKUP_ACKNOWLEDGED") {
        const enc = encrypt(value ? "true" : "false");
        if (!enc) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Encryption failed" }));
          return;
        }
        db.setConfig(key, enc);
      } else if (["PORT", "HOST", "SOLANA_RPC_URL", "HEARTBEAT_INTERVAL_MS", "WORKSPACE_DIR", "DATA_DIR"].includes(key)) {
        const enc = encrypt(value);
        if (!enc) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Encryption failed" }));
          return;
        }
        db.setConfig(key, enc);
        if (key === "PORT") {
          configPort = value;
          port = Number(configPort) || 3333;
        } else if (key === "HOST") {
          configHost = value;
          host = (configHost && String(configHost).trim()) || "0.0.0.0";
        } else if (key === "SOLANA_RPC_URL") {
          configSolanaRpc = value;
          if (value) process.env.SOLANA_RPC_URL = value;
        } else if (key === "HEARTBEAT_INTERVAL_MS") {
          configHeartbeatMs = value;
          heartbeatIntervalMs = configHeartbeatMs ? Number(configHeartbeatMs) : 0;
        } else if (key === "WORKSPACE_DIR") {
          configWorkspaceDir = value;
          if (value) process.env.WORKSPACE_DIR = value;
        } else if (key === "DATA_DIR") {
          configDataDir = value;
          if (value) process.env.DATA_DIR = value;
        }
      } else {
        const enc = encrypt(value);
        if (!enc) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Encryption failed" }));
          return;
        }
        db.setConfig(key, enc);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, message: "Saved" }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }
  if (path === "/api/chat/test" && (req.method === "GET" || req.method === "POST")) {
    const backendConfig = getChatBackendConfig();
    if (!backendConfig.apiKey) {
      const msg = chatBackend === "venice"
        ? "Venice API key not set. Set VENICE_ADMIN_KEY in .env or use Settings."
        : chatBackend === "nanogpt"
        ? "NanoGPT API key not set. Set NANOGPT_API_KEY in .env or use Settings."
        : "INCEPTION_API_KEY not set. Add it in .env or use Settings to set API key.";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: msg, provider: chatBackend }));
      return;
    }
    try {
      const r = await fetch(backendConfig.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${backendConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: backendConfig.model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 10,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, provider: chatBackend, model: backendConfig.model }));
      } else {
        const errMsg = data.error?.message || data.error || (typeof data === "string" ? data : null) || r.statusText || `HTTP ${r.status}`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: errMsg, provider: chatBackend, code: r.status }));
      }
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message || "Request failed", provider: chatBackend }));
    }
    return;
  }
  if (path === "/api/chat" && req.method === "POST") {
    const backendConfig = getChatBackendConfig();
    if (!backendConfig.apiKey) {
      const msg = chatBackend === "venice"
        ? "Venice API key not set. Set VENICE_ADMIN_KEY in .env or use Settings."
        : chatBackend === "nanogpt"
        ? "NanoGPT API key not set. Set NANOGPT_API_KEY in .env or use Settings."
        : "INCEPTION_API_KEY not set. Add it in .env or use Settings to set API key.";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg, envPath: ENV_PATH }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { messages, conversation_id: clientConvId } = JSON.parse(body);
      const conversationId =
        clientConvId != null ? clientConvId : db.createConversation();
      const lastUser = messages.filter((m) => m.role === "user").pop();
      if (lastUser) db.insertMessage(conversationId, "user", lastUser.content);

      let currentMessages = [...messages];
      const toolResultsForFrontend = [];
      let turns = 0;
      let lastData = null;
      const accumulatedUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      // Send tools on first message, or when the latest user message suggests browsing or account/wallet actions
      const lastUserContent = (messages.filter((m) => m.role === "user").pop()?.content ?? "").toLowerCase();
      const suggestsBrowse = /\b(visit|browse|check the site|go to|look up|what'?s on|fetch|open this link|get .* from the web|agentchainlab|onboard|crawl|documentation|doc set|pull .* docs|read .* folder|digest|summary|tell me more|\.com|\.io|https?:\/\/)/i.test(lastUserContent);
      const suggestsAccount = /\b(account|balance|wallet|address|transfer|send .* (eth|matic|pol|token)|tx history|transaction history|my balance|check balance|provide .* balance)/i.test(lastUserContent);
      const suggestsSolana = /\b(solana|SOL)\b|sol balance|solana (balance|address|transfer|wallet)/i.test(lastUserContent);
      const suggestsMemory = /\b(what did we discuss|past conversation|search .* conversation|find .* conversation|conversation about|we talked about|remember when|previous chat|old conversation|search (past |our )?conversations)/i.test(lastUserContent);
      const suggestsExec = /\b(run|execute|script|node\s|python3?\s|npm\s|npx\s|sandbox)\b/i.test(lastUserContent);
      const sendTools = messages.length === 1 || suggestsBrowse || suggestsAccount || suggestsSolana || suggestsMemory || suggestsExec;
      if (sendTools) {
        const workspaceText = loadWorkspace();
        const walletRule = "Wallet: use solana_balance and solana_address only. There are no account_balance or account_address tools—call solana_balance for balance, solana_address for address.\n\n";
        if (workspaceText) {
          currentMessages = [
            { role: "system", content: walletRule + "Your workspace (read and follow):\n\n" + workspaceText },
            ...currentMessages,
          ];
        } else {
          currentMessages = [
            { role: "system", content: walletRule },
            ...currentMessages,
          ];
        }
      }

      while (turns < MAX_TOOL_TURNS) {
        turns++;
        const { url, model, apiKey: activeKey } = getChatBackendConfig();
        const body = {
          model,
          messages: currentMessages,
          max_tokens: 8192,
          ...(sendTools && { tools: TOOLS, tool_choice: "auto" }),
          ...(chatBackend === "venice" && {
            venice_parameters: { include_venice_system_prompt: false },
            prompt_cache_key: String(conversationId),
          }),
        };
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${activeKey}`,
          },
          body: JSON.stringify(body),
        });
        if (chatBackend === "venice" && r.headers) {
          const cfRay = r.headers.get("cf-ray") || r.headers.get("CF-RAY");
          if (cfRay) console.log("[Venice] CF-RAY:", cfRay);
        }
        let data;
        try {
          data = await r.json();
        } catch {
          data = {};
        }
        if (!r.ok) {
          const known = INCEPTION_ERRORS[r.status];
          const payload = {
            error: known
              ? known.message
              : data.error?.message || data.error || "Request failed",
            code: r.status,
            ...(known?.retryable != null && { retryable: known.retryable }),
          };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
          return;
        }

        lastData = data;
        if (data.usage) {
          accumulatedUsage.prompt_tokens += Number(data.usage.prompt_tokens) || 0;
          accumulatedUsage.completion_tokens += Number(data.usage.completion_tokens) || 0;
          accumulatedUsage.total_tokens += Number(data.usage.total_tokens) || 0;
        }
        const choice = data.choices?.[0];
        const msg = choice?.message;
        if (!msg) {
          db.insertTokenUsage(conversationId, accumulatedUsage, turns);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ...data, conversation_id: conversationId, tool_results: toolResultsForFrontend, usage: accumulatedUsage }));
          return;
        }

        currentMessages.push({
          role: "assistant",
          content: msg.content ?? null,
          tool_calls: msg.tool_calls,
        });

        const toolCalls = msg.tool_calls;
        if (!toolCalls?.length) {
          let assistantContent = (msg.content ?? "").trim();
          if (toolResultsForFrontend.length > 0 && looksLikeToolArgs(assistantContent)) {
            assistantContent = "I ran the requested tools. See the results above.";
          }
          if (assistantContent)
            db.insertMessage(conversationId, "assistant", assistantContent);
          db.insertTokenUsage(conversationId, accumulatedUsage, turns);
          const payload = {
            ...data,
            conversation_id: conversationId,
            tool_results: toolResultsForFrontend.length ? toolResultsForFrontend : undefined,
            usage: accumulatedUsage,
          };
          if (assistantContent && payload.choices?.[0]?.message)
            payload.choices[0].message.content = assistantContent;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
          return;
        }

        for (const tc of toolCalls) {
          const name = tc.function?.name;
          let args = {};
          try {
            args = JSON.parse(tc.function?.arguments ?? "{}");
          } catch {}
          const result = await runTool(name, args, env);
          const resultStr = typeof result === "string" ? result : JSON.stringify(result);
          currentMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: resultStr,
          });
          toolResultsForFrontend.push({ tool: name, id: tc.id, result });
        }
      }

      const lastChoice = lastData?.choices?.[0];
      let lastContent = (lastChoice?.message?.content ?? "").trim() || "(Tool loop limit reached.)";
      if (toolResultsForFrontend.length > 0 && lastContent === "(Tool loop limit reached.)") {
        const toolList = toolResultsForFrontend.map((tr) => tr.tool).join(", ");
        lastContent = `I ran: ${toolList}. Ask me to summarize what I found or what to do next.`;
      }
      db.insertMessage(conversationId, "assistant", lastContent);
      db.insertTokenUsage(conversationId, accumulatedUsage, turns);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { role: "assistant", content: lastContent } }],
        conversation_id: conversationId,
        tool_results: toolResultsForFrontend,
        usage: accumulatedUsage,
      }));
    } catch (e) {
      const msg = e.message || "Request failed";
      const isFetchFail = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(String(msg));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: isFetchFail
            ? `Chat API request failed. Check your ${chatBackend === "venice" ? "Venice" : chatBackend === "nanogpt" ? "NanoGPT" : "Inception"} API key in Settings and your network.`
            : msg,
          code: 500,
          retryable: true,
        })
      );
    }
    return;
  }

  if (path.startsWith("/api/files") && req.method === "GET") {
    const id = path.slice("/api/files/".length).replace(/^\/+/, "").split("/")[0];
    if (!id) {
      try {
        const list = await files.fileList();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ files: list }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e.message) }));
      }
      return;
    }
    try {
      const fp = files.getFilePath(id);
      if (!existsSync(fp)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const metaPath = fp + ".meta.json";
      let filename = id;
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        filename = meta.filename || id;
      }
      const buf = readFileSync(fp);
      res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "%22")}"`);
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(buf);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path === "/api/files" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { filename, content } = JSON.parse(body);
      if (!content) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "content (base64) required" }));
        return;
      }
      const buf = Buffer.from(content, "base64");
      const result = await files.fileWrite(filename || "upload", buf);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path === "/api/conversations" && req.method === "GET") {
    try {
      const list = db.listConversations(20);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ conversations: list }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path === "/api/conversations/clear" && req.method === "POST") {
    try {
      db.clearAllConversations();
      await sessionStore.clearAllSessions();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, message: "All conversation history and saved sessions cleared." }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path === "/api/help" && req.method === "GET") {
    try {
      const payload = registry
        ? { tools: registry.tools.filter((t) => t.enabled !== false).map((t) => ({ name: t.name, description: (t.description || "").trim(), options: t.options })) }
        : { tools: TOOLS.map((t) => ({ name: t.function.name, description: t.function.description })) };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path === "/api/usage/total" && req.method === "GET") {
    try {
      const out = db.getTokenUsageTotal();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }));
    }
    return;
  }
  if (path === "/api/usage" && req.method === "GET") {
    try {
      const from = url.searchParams.get("from_date") || undefined;
      const to = url.searchParams.get("to_date") || undefined;
      const convId = url.searchParams.get("conversation_id");
      const limit = url.searchParams.get("limit");
      const out = db.getTokenUsage({
        ...(from && { from_date: from }),
        ...(to && { to_date: to }),
        ...(convId != null && convId !== "" && { conversation_id: Number(convId) }),
        ...(limit != null && limit !== "" && { limit: Number(limit) }),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message), rows: [], summary: {} }));
    }
    return;
  }

  if (path === "/api/alerts" && req.method === "GET") {
    try {
      const out = await price.getRecentAlerts();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message), alerts: [] }));
    }
    return;
  }

  if (path === "/api/history" && req.method === "GET") {
    try {
      const beforeId = url.searchParams.get("before_id");
      const limit = url.searchParams.get("limit");
      const out = db.getAllMessages({
        ...(beforeId != null && { before_id: beforeId }),
        ...(limit != null && { limit }),
      });
      const list = db.listConversations(1);
      const latestConversationId = list.length ? list[0].id : null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        messages: out.messages,
        oldest_id: out.oldest_id,
        has_more: out.has_more,
        latest_conversation_id: latestConversationId,
      }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path === "/api/summarize" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body || "{}");
      const lastN = Math.min(Math.max(1, Number(data.last_n) || 20), 200);
      const global = !!data.global;
      const conversationId = data.conversation_id != null ? Number(data.conversation_id) : null;
      let messages;
      if (global) {
        const out = db.getAllMessages({ limit: lastN });
        messages = out.messages || [];
      } else if (conversationId != null) {
        const out = db.getMessages(conversationId, { limit: lastN });
        messages = out.messages || [];
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "conversation_id or global required" }));
        return;
      }
      if (!messages.length) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ summary: "(No messages to summarize.)" }));
        return;
      }
      const backendConfig = getChatBackendConfig();
      if (!backendConfig.apiKey) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "LLM not configured. Set API key in Settings." }));
        return;
      }
      const transcript = messages
        .map((m) => `${m.role}: ${(m.content || "").trim()}`)
        .filter((s) => s.length > 0)
        .join("\n\n");
      const systemPrompt =
        "Summarize the following conversation concisely. Preserve key facts, decisions, numbers, and context. Output only the summary text, no preamble or labels.";
      const userPrompt = `Conversation to summarize:\n\n${transcript}`;
      const r = await fetch(backendConfig.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${backendConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: backendConfig.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 2048,
        }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: result.error?.message || result.message || `HTTP ${r.status}`,
          summary: null,
        }));
        return;
      }
      const summary = result.choices?.[0]?.message?.content?.trim() || "(Summary unavailable.)";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ summary }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message), summary: null }));
    }
    return;
  }

  if (path === "/api/session/save" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body || "{}");
      let messages;
      if (data.messages && Array.isArray(data.messages)) {
        messages = data.messages.map((m) => ({ role: m.role, content: m.content }));
      } else if (data.conversation_id != null) {
        const out = db.getMessages(Number(data.conversation_id), { limit: 2000 });
        messages = (out.messages || []).map((m) => ({ role: m.role, content: m.content }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "conversation_id or messages required" }));
        return;
      }
      const { id, name } = await sessionStore.saveSession(messages);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id, name }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path === "/api/set-api-key" && req.method === "POST") {
    const remote = req.socket.remoteAddress || "";
    if (remote !== "127.0.0.1" && remote !== "::1" && !remote.endsWith("127.0.0.1")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = JSON.parse(body || "{}");
      const key = (data.api_key || data.INCEPTION_API_KEY || "").trim();
      if (!key) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "api_key or INCEPTION_API_KEY required" }));
        return;
      }
      apiKey = key;
      const enc = encrypt(key);
      if (enc) db.setConfig("INCEPTION_API_KEY", enc);
      const dir = join(ENV_PATH, "..");
      try {
        mkdirSync(dir, { recursive: true });
      } catch (_) {}
      let content = "";
      if (existsSync(ENV_PATH)) {
        content = readFileSync(ENV_PATH, "utf8");
        if (/^\s*INCEPTION_API_KEY\s*=/m.test(content)) {
          content = content.replace(/^\s*INCEPTION_API_KEY\s*=.*$/m, `INCEPTION_API_KEY=${key}`);
        } else {
          content = content.trimEnd() + (content ? "\n" : "") + `INCEPTION_API_KEY=${key}\n`;
        }
      } else {
        content = `INCEPTION_API_KEY=${key}\n`;
      }
      writeFileSync(ENV_PATH, content, "utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, message: "API key saved" }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path === "/api/agent/price" && req.method === "GET") {
    try {
      const result = await jupiter.jupiterPrice({}, env);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }
  if (path === "/api/agent/drift-price" && req.method === "GET") {
    try {
      const result = await drift.driftPerpPrice({}, env);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path === "/api/restart" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, message: "Restarting..." }));
    setTimeout(() => process.exit(0), 300);
    return;
  }

  if (path === "/api/sessions" && req.method === "GET") {
    try {
      const sessions = await sessionStore.listSessions();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessions }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  if (path.startsWith("/api/sessions/") && req.method === "GET") {
    const id = decodeURIComponent(path.slice("/api/sessions/".length).replace(/\/+$/, ""));
    if (!id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "session id required" }));
      return;
    }
    try {
      const { messages } = await sessionStore.loadSession(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ messages: messages || [] }));
    } catch (e) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.code === "ENOENT" ? "Session not found" : String(e.message) }));
    }
    return;
  }

  if (path === "/api/chat" && req.method === "GET") {
    const conversationId = url.searchParams.get("conversation_id");
    if (!conversationId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "conversation_id required" }));
      return;
    }
    try {
      const beforeId = url.searchParams.get("before_id");
      const limit = url.searchParams.get("limit");
      const out = db.getMessages(Number(conversationId), {
        ...(beforeId != null && { before_id: beforeId }),
        ...(limit != null && { limit }),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        messages: out.messages,
        oldest_id: out.oldest_id,
        has_more: out.has_more,
      }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  const msgIdMatch = path.match(/^\/api\/messages\/(\d+)$/);
  if (msgIdMatch && req.method === "GET") {
    const id = msgIdMatch[1];
    try {
      const row = db.getMessageById(id);
      if (!row) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Message not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content: row.content }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }

  const DIST_RENDERER = join(__dirname, "dist-renderer");
  if (existsSync(DIST_RENDERER)) {
    const filePath = path === "/" || path === "/index.html" ? join(DIST_RENDERER, "index.html") : join(DIST_RENDERER, path.slice(1));
    if (existsSync(filePath)) {
      const ext = extname(filePath);
      const contentType = MIME[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(readFileSync(filePath));
      return;
    }
    if (!path.startsWith("/api")) {
      const indexHtml = join(DIST_RENDERER, "index.html");
      if (existsSync(indexHtml)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(readFileSync(indexHtml));
        return;
      }
    }
  }
  if (path === "/" || path === "/index.html") {
    const indexHtml = join(__dirname, "index.html");
    if (existsSync(indexHtml)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(readFileSync(indexHtml));
      return;
    }
  }
  const filePath = join(__dirname, path.slice(1));
  if (!filePath.startsWith(__dirname) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const stat = require("fs").statSync(filePath);
    if (stat.isDirectory()) {
      const indexInDir = join(filePath, "index.html");
      if (existsSync(indexInDir)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(readFileSync(indexInDir));
        return;
      }
      res.writeHead(404);
      res.end("Not found");
      return;
    }
  } catch (_) {}
  const ext = extname(path);
  const contentType = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  res.end(readFileSync(filePath));
});

server.listen(port, host, () => {
  console.log(`Solana Agent: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  if (heartbeatIntervalMs > 0) {
    heartbeat.startHeartbeat({
      intervalMs: heartbeatIntervalMs,
      onTick: (p) => console.log("[heartbeat]", p.timestamp, "heap:", p.memory_heap_used),
    });
  }
});

export { server };
