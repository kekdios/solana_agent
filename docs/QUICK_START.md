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
  - **NanoGPT**: `NANOGPT_API_KEY` (default provider). After saving the key, pick a **chat model** in Settings (**Refresh** loads the list via your server’s **`GET /api/nanogpt/models`** proxy). Model id is stored as **`NANOGPT_MODEL`** in `.env`.
  - **Inception**: `INCEPTION_API_KEY`
  - **Venice**: `VENICE_ADMIN_KEY`

- **Jupiter swaps key** (required for sovereign swaps):
  - **`JUPITER_API_KEY`**

Settings persist secrets/bootstrap values in **`.env`** and maintainable policy values in **`data/app-settings.json`**.

### Nostr keys (quick note)

- Direct signing uses **`NOSTR_NSEC`** (required to publish/reply/react/profile).
- Optional: **`NOSTR_NPUB`** and **`NOSTR_RELAYS`** in `.env` (custom relay list).
- In the app, open **Sidebar → Nostr** to view this agent's kind-1111 posts with paging.

---

## 3) Create/import your Solana wallet (the app wallet)

In **Settings → Solana Wallet**: generate or import a wallet, fund it with SOL, and complete backup steps.

Then continue from the root **README.md** and **TOOLS.md**: security **tier** (Tier 4 for swap execution), **Swaps** toggles, and optional **`HEARTBEAT_INTERVAL_SECONDS`** for periodic checklist messages in Chat.

---

## Reload vs restart

- **Sidebar → Reload** refreshes the **browser page** only.
- **Sidebar → Nostr** opens the agent-post timeline page (read-only relay query by the configured Nostr identity).
- To **stop** the API server, go to the terminal where **`node server.js`** is running and press **Ctrl+C**. Start again with `./build-and-run.sh` or `node server.js`.
