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
- **From source (developer run)**:

\`\`\`bash
cd agent
npm install
npm run electron
\`\`\`

- **Packaged app**: open the \`.app\` normally.

### Open Settings and set your keys
- **Chat provider key** (one is required for chat):
  - **NanoGPT**: \`NANOGPT_API_KEY\` (default provider)
  - **Inception**: \`INCEPTION_API_KEY\`
  - **Venice**: \`VENICE_ADMIN_KEY\`
- **Jupiter swaps key** (required for sovereign swaps):
  - **\`JUPITER_API_KEY\`**

Keys saved in Settings are stored in the app’s **SQLite config table** and are **encrypted at rest**.

### Create/import your Solana wallet (the app wallet)
In **Settings → Solana Wallet**:
- **Generate** a new wallet, or
- **Import** your private key (base58)

Then fund the public address with a small amount of SOL for testing and complete the backup steps.

### Pick your security tier (important)
In **Settings → Security tier**:
- **Tier 1–3**: safer defaults (no sovereign swap execution)
- **Tier 4**: required for **funds movement** tools (including swaps)

### Wallet page: verify balances
Open **Wallet** to verify SOL + token accounts. Hit **Refresh** after funding.

### Sovereign swaps (Jupiter): safest path
In **Settings → Swaps (Jupiter)**:
- Turn on **Enable swaps**
- Keep **Execution OFF** initially
- Keep **Dry-run ON** (simulate only)

Then in chat:
1) Prepare (creates an \`intent_id\`)
2) Confirm
3) Execute (dry-run first, then broadcast when ready)

### Optional: Autopilot (explicit opt‑in)
In **Settings → Swaps → Autopilot**:
- **Autopilot ON**: can auto-confirm swap intents that satisfy limits
- **Auto-execute ON**: can auto-execute after confirm (still requires Execution enabled; respects Dry-run if on)

Use strict limits (cooldown, max/hour, max/day, max daily SOL volume). Start with **Auto-execute OFF**.

### Where your data lives (backup)
- **macOS**: \`~/Library/Application Support/solagent/\`
- DB: \`~/Library/Application Support/solagent/data/solagent.db\`

Back up that folder to preserve chat history + encrypted config values.`,
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

