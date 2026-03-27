import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../store/chatStore";

export default function QuickStartPage() {
  const setView = useChatStore((s) => s.setView);
  const md = useMemo(
    () => `## Quick start (agent owners) — V3

This page is for **owners/operators** of **Solana Agent V3** (not developers).

### Chat and workspace (V3)
- Ask file/workspace questions in **this app’s Chat** (connected to your \`node server.js\`). External assistants don’t have your \`workspace_read\` / wallet tools.
- The server **always** attaches **function tools** to each chat request. For a clear “content of **heartbeat.md**” question, the server may **read the file from disk** first—see root **README.md**.

### Start the app
- **Build UI + server + browser**: \`./build-and-run.sh\` (from the project folder)
- **Or**: \`npm run build:renderer && node server.js\` then open **http://127.0.0.1:3333** (port may differ if set in Settings).

### Open Settings and set your keys
- **Chat**: NanoGPT (default) / Inception / Venice — set the provider API key. For **NanoGPT**, save the key then **Refresh** the **chat model** list (loaded through your server at \`/api/nanogpt/models\`); the chosen model is saved as \`NANOGPT_MODEL\` in \`.env\`.
- **Swaps**: Set **JUPITER_API_KEY** (required for Jupiter swaps). Settings persist secrets/bootstrap in \`.env\` and policy values in \`data/app-settings.json\`.

### Create/import your Solana wallet
In **Settings → Solana Wallet**: generate or import a wallet, fund the address with SOL, and complete the backup steps.

### Pick your security tier
In **Settings → Security tier**: **Tier 4** is required for swap execution. Tier 1–3 block funds movement.

### Making swaps work (checklist)
1. **Settings → API keys**: Set **JUPITER_API_KEY**.
2. **Settings → Solana Wallet**: Fund the wallet with SOL.
3. **Settings → Security tier**: Set **Tier 4**.
4. **Settings → Swaps**: Turn **Enable swaps** ON (otherwise you get "Swaps are disabled").
5. To **broadcast** real swaps: turn **Execution** ON and **Dry-run** OFF. Use Dry-run ON to test without sending.
6. Optionally set **Max slippage (bps)** (e.g. 200 = 2%) and click **Save swap policy**.

In chat, say e.g. "swap $5 SOL to USDC". Use the **Execute** button in the swap card (or reply "confirm swap &lt;intent_id&gt;") to run the swap. If you see "Not found", start a **New chat** and try again.

### Prices & Hyperliquid (chat tools)
- **\`hyperliquid_price\`**: Hyperliquid **perp** mids by default (e.g. BTC, ETH). For **spot** mids on HL, use \`market: "spot"\` and symbols like \`HYPE\`, \`@107\`, or \`PURR/USDC\` — see root **TOOLS.md**.

### Nostr (pure direct relays)
- Use **\`nostr_action\`** for Nostr tasks in chat:
  - publish: \`nostr_action({ type: "publish", payload: { content: "..." } })\`
  - read feed/health/communities (default mode): \`nostr_action({ type: "read", payload: { mode: "feed", scope: "feed", ai_only: true } })\` (optional \`topic_labels\`; or \`public_feed\`, \`communities\`, \`health\`, \`public_health\`)
  - read one post by id: \`nostr_action({ type: "read", payload: { mode: "by_id", event_id: "<64-char hex>" } })\`
  - reply/react/profile are supported in direct mode.
- Configure signing with **\`NOSTR_NSEC\`** (optional **\`NOSTR_NPUB\`**) and optional **\`NOSTR_RELAYS\`** in \`.env\`.
- Use **Sidebar -> Nostr** to view this agent's own kind-1111 posts with paging.
- Legacy website-based posting flows are removed; Nostr is **direct relays** only.

### Swap settings reference (Settings → Swaps)
| Setting | What it does |
|--------|----------------|
| **Enable swaps** | Must be ON to prepare any swap (separate from Tier 4). |
| **Execution** | ON = may broadcast. OFF = no broadcast. |
| **Dry-run** | ON = simulate only. OFF = live broadcast. |
| **Max slippage (bps)** | Cap (200 = 2%, 50 = 0.5%). |
| **Max swap size (SOL)** / **Max % of balance** | Per-swap caps. |
| **Autopilot** | Auto-confirm (and optionally auto-execute) within limits. |
| **Cooldown, max/hour, max/day** | Rate limits. |

### Optional: Autopilot
In **Settings → Swaps → Autopilot**: turn ON to let the agent auto-confirm intents that pass limits. Use **Auto-execute OFF** until you’re comfortable. Save autopilot limits (cooldown, max/hour, max/day, max daily SOL).

### Where your data lives (backup)
- **This project (Node + browser):** from the repo root, back up **\`data/\`** — contains **\`solagent.db\`**, **\`.encryption-key\`**, **\`sessions/\`**, and other runtime files.
- **Workspace files:** **\`workspace/\`** (persona, **\`AGENTS.md\`**, skills, memory) — or whatever **\`WORKSPACE_DIR\`** points to in Settings → Environment.
- **Legacy:** If you ever used the old Mac desktop app, a copy may still exist under **\`~/Library/Application Support/solagent/\`** — not used once you run from the repo **\`data/\`** copy.

Back up **\`data/\`** + **\`workspace/\`** to preserve config, chats, and files.`,
    []
  );

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[#0d0d0f] overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto w-full space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView("chat")}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition"
            title="Back to chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-semibold text-slate-200">Quick start · V3</h1>
        </div>

        <div className="rounded-2xl border border-[#1e1e24] bg-[#121214] p-5">
          <div className="markdown-body text-slate-200 text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkBreaks, remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline">
                    {children}
                  </a>
                ),
                code: ({ className, children }) => {
                  const isBlock = className?.includes("language-");
                  return <code className={isBlock ? "text-sm" : "bg-slate-800 px-1.5 py-0.5 rounded text-slate-200 text-sm"}>{children}</code>;
                },
                pre: ({ children }) => (
                  <pre className="bg-[#0d0d0f] rounded-lg p-3 overflow-x-auto text-sm text-slate-300 border border-[#2a2a30] mb-2">
                    {children}
                  </pre>
                ),
                h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2 first:mt-0">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mt-4 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-2">{children}</h3>,
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-slate-600 pl-3 my-2 text-slate-300/90">{children}</blockquote>
                ),
              }}
            >
              {md}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </main>
  );
}

