# Quick start (agent owners)

This guide is for **owners/operators** of the Solana Agent desktop app (not developers). It assumes you’re running locally on your machine.

---

## 1) Start the app

- **From source (developer run)**:

```bash
cd agent
npm install
npm run electron
```

- **Packaged app**: open the `.app` normally.

The UI will load locally (usually `http://127.0.0.1:3333`).

---

## 2) Open Settings and set your keys

Click the **gear icon** (top right) → configure:

- **Chat provider key** (one is required for chat):
  - **NanoGPT**: `NANOGPT_API_KEY` (default provider)
  - **Inception**: `INCEPTION_API_KEY`
  - **Venice**: `VENICE_ADMIN_KEY`

- **Jupiter swaps key** (required for sovereign swaps):
  - **`JUPITER_API_KEY`**

All keys saved in Settings are stored in the app’s **SQLite config table** and are **encrypted at rest**.

---

## 3) Create/import your Solana wallet (the app wallet)

In **Settings → Solana Wallet**:

- **Generate** a new wallet, or
- **Import** your private key (base58)

Then:

- Copy the **public address** and fund it with a small amount of SOL for testing.
- **Back up** the wallet as instructed (don’t skip this).

---

## 4) Pick your security tier (important)

In **Settings → Security tier**:

- **Tier 1–3**: safer defaults (no sovereign swaps execution)
- **Tier 4**: required for **funds movement** tools (including swaps)

Recommendation: use **Tier 4 only when you intend to use the wallet actively**.

---

## 5) Wallet page: verify balances

Open **Wallet** (sidebar) to verify:

- SOL balance (and explorer link)
- Token accounts (paginated table)

If you just funded the wallet, hit **Refresh**.

---

## 6) Sovereign swaps (Jupiter): safest path

In **Settings → Swaps (Jupiter)**:

- Turn on **SWAPS_ENABLED** (Enable swaps)
- Keep **Execution OFF** initially
- Keep **Dry-run ON** (simulate only)

In chat, a typical safe flow is:

1. **Prepare** (creates an `intent_id`)
2. **Confirm** (binds execution to that intent)
3. **Execute** (dry-run first, then broadcast when ready)

The app enforces guardrails server-side (caps, allowlists, re-quote checks, simulation, fee/compute bounds).

---

## 7) Optional: Autopilot (explicit opt‑in)

Autopilot is **off by default**.

In **Settings → Swaps → Autopilot**:

- **Autopilot ON**: the agent can **auto-confirm** swap intents that satisfy limits
- **Auto-execute ON**: additionally allows auto-execution (still requires Execution enabled; still respects Dry-run if enabled)

Use strict limits:

- Cooldown seconds
- Max swaps/hour and swaps/day
- Max daily SOL volume

Recommendation: start with **Autopilot ON + Auto-execute OFF**, and only enable auto-execute after you’re satisfied with dry-run behavior and limits.

---

## 8) Where your data lives (so you can back it up)

The app stores chats, settings, and swap intents in **`solagent.db`**.

- **Electron app** data directory (macOS):
  - `~/Library/Application Support/solagent/`
  - DB: `~/Library/Application Support/solagent/data/solagent.db`

Back up that folder if you want to preserve your:

- chat history
- encrypted config values (API keys, wallet private key)
- swap intent history

---

## 9) If something looks wrong

- **Swaps not working**: confirm `JUPITER_API_KEY` is set in Settings and you are in **Tier 4**.
- **Execution blocked**: check **Execution ON/OFF**, **Dry-run**, cooldown/rate limits, and fee/compute caps in Settings → Swaps.
- **Token icons missing**: ensure you’re on the latest build; the app fetches token logos via a local `/api/logos` proxy.

