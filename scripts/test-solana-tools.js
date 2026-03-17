#!/usr/bin/env node
/**
 * Test all agent Solana tools.
 * Usage: node scripts/test-solana-tools.js
 * Wallet: SOLANA_PRIVATE_KEY in .env, or app config (set DB_PATH to app's data/solagent.db or its dir to use app wallet).
 * Transfer test sends 0.001 SOL to the address below.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createDecipheriv } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Load .env into process.env
const envPath = process.env.ENV_PATH || join(projectRoot, ".env");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

// If no SOLANA_PRIVATE_KEY in env, try app config (same decrypt as server)
if (!process.env.SOLANA_PRIVATE_KEY) {
  const possibleDbPaths = [
    process.env.DB_PATH,
    join(projectRoot, "data", "solagent.db"),
    process.env.HOME && join(process.env.HOME, "Library", "Application Support", "solagent", "data", "solagent.db"),
  ].filter(Boolean);
  for (const dbPath of possibleDbPaths) {
    if (!existsSync(dbPath)) continue;
    const dbDir = dirname(dbPath);
    const keyPath = join(dbDir, ".encryption-key");
    if (!existsSync(keyPath)) continue;
    try {
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(dbPath);
      const row = db.prepare("SELECT value_encrypted FROM config WHERE key = ?").get("SOLANA_PRIVATE_KEY");
      db.close();
      if (!row || !row.value_encrypted) continue;
      const key = readFileSync(keyPath);
      const ALG = "aes-256-gcm";
      const IV_LEN = 12;
      const TAG_LEN = 16;
      const buf = Buffer.from(row.value_encrypted, "base64");
      if (buf.length < IV_LEN + TAG_LEN) continue;
      const iv = buf.subarray(0, IV_LEN);
      const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
      const enc = buf.subarray(IV_LEN + TAG_LEN);
      const decipher = createDecipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
      decipher.setAuthTag(tag);
      const dec = decipher.update(enc) + decipher.final("utf8");
      if (dec && dec.trim()) {
        process.env.SOLANA_PRIVATE_KEY = dec.trim();
        process.env.DB_PATH = dbPath;
        break;
      }
    } catch (_) {}
  }
}

const TRANSFER_TO = "Hqpo3iNYQNsmbiBZQrrnGy9YvSwjXrng4KCdkgexixFQ";
const TRANSFER_AMOUNT_SOL = 0.001;
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function run(name, fn) {
  try {
    const out = await fn();
    const ok = out && (out.ok === true || (out.ok !== false && !out.error));
    console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}`);
    if (!ok && out && (out.error || out.err)) console.log("    ", out.error || out.err);
    if (out && typeof out === "object" && (out.signature || out.address)) {
      if (out.signature) console.log("    signature:", out.signature.slice(0, 16) + "…");
      if (out.address && name.includes("address")) console.log("    address:", out.address.slice(0, 16) + "…");
    }
    return { name, ok, out };
  } catch (e) {
    console.log("  ✗", name, "-", e.message);
    return { name, ok: false, out: null };
  }
}

const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

async function main() {
  const solana = await import("../tools/solana.js");
  const env = {};

  console.log("\n--- Solana agent tools test ---");
  if (DRY_RUN) console.log("(DRY_RUN: transfer and SPL transfer skipped)\n");
  else console.log("");

  await run("solana_network", () => solana.solanaNetwork(env));

  const r1 = await run("solana_address", () => solana.solanaAddress(env));
  if (!r1.ok) {
    console.log("\nWallet not configured (no SOLANA_PRIVATE_KEY).");
    console.log("  - Add SOLANA_PRIVATE_KEY to .env (from Settings > Show private key in the app), or");
    console.log("  - Use app config: DB_PATH=/path/to/data/solagent.db node scripts/test-solana-tools.js");
    console.log("    (requires .encryption-key in the same directory as solagent.db)\n");
    process.exit(1);
  }

  await run("solana_balance", () => solana.solanaBalance({}, env));
  await run("solana_token_balance (USDC mint)", () => solana.solanaTokenBalance({ mint: USDC_MINT }, env));
  const history = await run("solana_tx_history", () => solana.solanaTxHistory({ limit: 5 }, env));

  let sigForStatus = null;
  if (history.out && history.out.signatures && history.out.signatures.length > 0) {
    sigForStatus = history.out.signatures[0].signature;
  }
  if (sigForStatus) {
    await run("solana_tx_status", () => solana.solanaTxStatus({ signature: sigForStatus }, env));
  } else {
    console.log("  ⊘ solana_tx_status (no history to use)");
  }

  if (!DRY_RUN) {
    const transferResult = await run(
      "solana_transfer (0.001 SOL to " + TRANSFER_TO.slice(0, 8) + "…)",
      () => solana.solanaTransfer({ to: TRANSFER_TO, amount_sol: TRANSFER_AMOUNT_SOL }, env)
    );

    if (transferResult.out && transferResult.out.signature) {
      await run("solana_tx_status (after transfer)", () =>
        solana.solanaTxStatus({ signature: transferResult.out.signature }, env)
      );
    }
  } else {
    console.log("  ⊘ solana_transfer (skipped in dry-run)");
  }

  console.log("\n  ⊘ solana_transfer_spl (skipped; use manually with mint/to/amount if needed)\n");
  console.log("Done.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
