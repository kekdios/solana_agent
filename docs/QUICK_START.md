# Quick start (agent owners)

This guide is for **owners/operators** of **Solana Agent V3** (not developers). It assumes you’re running locally on your machine.

**V3 reminders**

- Use the **in-app Chat** (same origin as your server, e.g. `http://127.0.0.1:3333`) for questions that need **workspace files** or **wallet tools**. Other chat UIs do not call your `POST /api/chat`.
- The server **always** sends **function tools** to the model on each turn. For a direct question like “what is the content of **heartbeat.md**?”, the server may **read `HEARTBEAT.md` from disk** and answer without the LLM—see root **README.md**.

---

## 1) Start the app

- **From source (recommended):**

```bash
cd agent
npm install
./build-and-run.sh
```

This builds the web UI, starts **`node server.js`**, and opens your browser (default **http://127.0.0.1:3333**).

- **Manual:** `npm run build:renderer && node server.js`, then open the URL printed in the terminal.

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

In **Settings → Solana Wallet**: generate or import a wallet, fund it with SOL, and complete backup steps.

Then continue from the root **README.md** and **TOOLS.md**: security **tier** (Tier 4 for swap execution), **Swaps** toggles, **Clawstr** (`CLAWSTR_AGENT_CODE`), optional **`HEARTBEAT_INTERVAL_MS`** for periodic checklist messages in Chat.

---

## Reload vs restart

- **Sidebar → Reload** refreshes the **browser page** only.
- To **stop** the API server, go to the terminal where **`node server.js`** is running and press **Ctrl+C**. Start again with `./build-and-run.sh` or `node server.js`.
