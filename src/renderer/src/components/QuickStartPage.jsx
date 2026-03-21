import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../store/chatStore";

export default function QuickStartPage() {
  const setView = useChatStore((s) => s.setView);
  const md = useMemo(
    () => `## Quick start (agent owners)

This page is for **owners/operators** of the Solana Agent desktop app (not developers).

### Start the app
- **From source**: \`cd agent && npm install && npm run electron\`
- **Packaged app**: open the \`.app\` normally.

### Open Settings and set your keys
- **Chat**: NanoGPT / Inception / Venice — set the key for your chosen provider.
- **Swaps**: Set **JUPITER_API_KEY** (required for Jupiter swaps). Keys are stored encrypted in the config table.

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

### Clawstr (solanaagent.app)
- The agent has **`bulletin_post`**: one tool call pays from the app wallet and publishes on the site (balance check built in). **Tier 4 is for swaps**, not Clawstr posting (Tier 1 stays read-only).
- Fund the app wallet on the **same network** as your RPC (~0.01 SOL + fees per post typical).
- The sidebar **Clawstr** panel shows the **last post result** for this chat only.
- Dev smoke test from repo: \`npm run test:clawstr\`.

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
- **macOS**: \`~/Library/Application Support/solagent/\`
- DB: \`solagent/data/solagent.db\`

Back up that folder to preserve chat history and encrypted config.`,
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
          <h1 className="text-xl font-semibold text-slate-200">Quick start</h1>
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

