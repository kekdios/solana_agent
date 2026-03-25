import { create } from "zustand";

/** Injected as a user message when the app chat heartbeat fires (see workspace/AGENTS.md). */
export const DEFAULT_HEARTBEAT_USER_PROMPT =
  "[Heartbeat] Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.";

export const SLASH_HELP = `Slash commands:
• /save – Save the current session with an automatic timestamp.
• /history – Show saved conversations and let you load a previous one.
• /help – Show this help text.`;

const LAST_CONVERSATION_KEY = "solagent:lastConversationId";

function loadLastConversationId() {
  try {
    const v = window?.localStorage?.getItem(LAST_CONVERSATION_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function saveLastConversationId(id) {
  try {
    if (id == null) {
      window?.localStorage?.removeItem(LAST_CONVERSATION_KEY);
      return;
    }
    window?.localStorage?.setItem(LAST_CONVERSATION_KEY, String(id));
  } catch {
    // ignore storage errors
  }
}

export const useChatStore = create((set, get) => ({
  conversations: [],
  currentConversationId: loadLastConversationId(),
  messages: [],
  loading: false,
  /** AbortController for the in-flight chat request, if any. */
  currentRequestController: null,
  error: null,
  apiBase: "",
  sessions: [],
  /** All-time token totals from DB (null until fetched). */
  usageTotal: null,
  /** Session token total (current app session only). */
  sessionTokenTotal: 0,
  /** Main content view: "chat" | "quickStart" | "wallet" | "trading" | "nostr" | "allMessages" | "nanogpt". */
  view: "chat",
  /** Solana network from config: "testnet" | "devnet" | "mainnet". */
  solanaNetwork: "testnet",
  /** Solana RPC connection: true | false | null (null = not yet tested). */
  solanaRpcConnected: null,
  /** NanoGPT account balance: { usd_balance, nano_balance, nano_deposit_address } or null if not fetched / no key. */
  nanogptBalance: null,
  /** Last sovereign_transaction tool result (for sidebar panel). */
  sovereignTx: null,
  /** Local state for latest prepared swap execution (for Execute Swap button). */
  latestSwapState: { executing: false, executed: false, error: null, signature: null },
  setApiBase: (base) => set({ apiBase: base || "" }),

  setSolanaNetwork: (network) => set({ solanaNetwork: network || "testnet" }),
  setSolanaRpcConnected: (connected) => set({ solanaRpcConnected: connected }),

  fetchSolanaRpcStatus: async () => {
    const { apiBase } = get();
    const base = apiBase || "";
    try {
      const configRes = await fetch(`${base}/api/config`);
      const configData = await configRes.json();
      const network = configData?.config?.solanaNetwork || "testnet";
      set({ solanaNetwork: network });
      const testRes = await fetch(`${base}/api/solana-rpc/test`, { method: "POST" });
      const testData = await testRes.json();
      set({ solanaRpcConnected: !!testData?.ok });
    } catch (_) {
      set({ solanaRpcConnected: false });
    }
  },

  fetchNanogptBalance: async () => {
    const { apiBase } = get();
    const base = apiBase || "";
    try {
      const res = await fetch(`${base}/api/nanogpt/balance`);
      const data = await res.json();
      if (data.ok && (data.usd_balance != null || data.nano_balance != null || data.nano_deposit_address)) {
        set({ nanogptBalance: { usd_balance: data.usd_balance, nano_balance: data.nano_balance, nano_deposit_address: data.nano_deposit_address } });
      } else {
        set({ nanogptBalance: null });
      }
    } catch (_) {
      set({ nanogptBalance: null });
    }
  },

  setView: (view) =>
    set({
      view:
        view === "quickStart"
          ? "quickStart"
          : view === "wallet"
          ? "wallet"
          : view === "trading"
          ? "trading"
          : view === "nostr"
          ? "nostr"
          : view === "allMessages"
          ? "allMessages"
          : view === "nanogpt"
          ? "nanogpt"
          : "chat",
    }),

  fetchConversations: async () => {
    const { apiBase } = get();
    const base = apiBase || "";
    try {
      const res = await fetch(`${base}/api/conversations`);
      const data = await res.json();
      if (Array.isArray(data.conversations)) {
        set({ conversations: data.conversations });
        const currentId = get().currentConversationId;
        const exists = currentId && data.conversations.some((c) => c.id === currentId);
        if (exists) {
          // Restore last conversation: load its messages so the chat is not empty on startup.
          get().selectConversation(currentId);
        } else if (!currentId && data.conversations.length > 0) {
          // No saved conversation: default to the newest.
          const newest = data.conversations[0]?.id;
          if (newest != null) {
            saveLastConversationId(newest);
            get().selectConversation(newest);
          }
        }
      }
    } catch (e) {
      set({ error: e.message });
    }
  },

  selectConversation: async (id) => {
    const { apiBase } = get();
    const base = apiBase || "";
    saveLastConversationId(id);
    set({ currentConversationId: id, loading: true, error: null, view: "chat" });
    try {
      const res = await fetch(`${base}/api/chat?conversation_id=${id}`);
      const data = await res.json();
      set({ messages: data.messages || [], loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  sendMessage: async (content) => {
    const { apiBase, messages, currentConversationId, sovereignTx: prevSov, latestSwapState } = get();
    const base = apiBase || "";
    const conversationId = currentConversationId;
    const history = messages.map((m) => ({ role: m.role, content: m.content || "" }));
    const newMessages = [...history, { role: "user", content }];
    const controller = new AbortController();
    set({ loading: true, error: null, messages: newMessages, currentRequestController: controller });

    try {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: newMessages,
          conversation_id: conversationId || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) {
        const msg = data.envPath
          ? `${data.error}\n\nAdd INCEPTION_API_KEY to:\n${data.envPath}`
          : data.error;
        set({ error: msg, loading: false });
        return;
      }
      let assistantContent = data.choices?.[0]?.message?.content ?? "";
      const toolResults = data.tool_results || [];
      const sovereignResult = toolResults.find((tr) => tr.tool === "sovereign_transaction")?.result || null;
      if (toolResults.length > 0) {
        const toolResultsText = toolResults
          .map((tr) => {
            const str = typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result);
            const truncated = str.length > 1500 ? str.slice(0, 1500) + "…" : str;
            return `${tr.tool}:\n${truncated}`;
          })
          .join("\n\n");
        assistantContent = assistantContent.trim()
          ? `${assistantContent}\n\n---\nTool results (use these to answer follow-ups like "summarize"):\n\n${toolResultsText}`
          : `Tool results:\n\n${toolResultsText}\n\nAsk me to summarize what I found or what to do next.`;
      }
      const updated = [
        ...newMessages,
        { role: "assistant", content: assistantContent, tool_results: toolResults },
      ];
      const usage = data.usage;
      const sessionAdd = usage
        ? (Number(usage.total_tokens) || Number(usage.prompt_tokens || 0) + Number(usage.completion_tokens || 0))
        : 0;
      const prevSession = get().sessionTokenTotal;
      set({
        messages: updated,
        currentConversationId: data.conversation_id ?? conversationId,
        loading: false,
        currentRequestController: null,
        sessionTokenTotal: prevSession + sessionAdd,
        sovereignTx: sovereignResult || prevSov || null,
        latestSwapState: sovereignResult ? latestSwapState : get().latestSwapState,
      });
      saveLastConversationId(data.conversation_id ?? conversationId);
      if (!conversationId) get().fetchConversations();
      if (usage) get().fetchUsageTotal();
      get().fetchNanogptBalance();
    } catch (e) {
      if (e.name === "AbortError") {
        // User hit Stop: keep messages as-is, just clear loading/error/controller.
        set({ loading: false, error: null, currentRequestController: null });
      } else {
        set({ error: e.message, loading: false, currentRequestController: null });
      }
    }
  },

  /** Stop the current chat request, similar to Cursor's Stop button. */
  stopChat: () => {
    const controller = get().currentRequestController;
    if (controller) {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    }
    set({ loading: false, currentRequestController: null });
  },

  newChat: () => {
    saveLastConversationId(null);
    set({
      currentConversationId: null,
      messages: [],
      error: null,
      sessionTokenTotal: 0,
    });
    const base = get().apiBase || "";
    if (base) fetch(`${base}/api/jupiter/swap/clear-expired`, { method: "POST" }).catch(() => {});
  },

  executeLatestPreparedSwap: async () => {
    const { apiBase, messages } = get();
    const base = apiBase || "";
    if (!base) return;

    const current = get().latestSwapState || { executing: false, executed: false, error: null, signature: null };
    if (current.executing) return;

    const allPrepareResults = [];
    for (const m of messages) {
      if (m.role !== "assistant" || !Array.isArray(m.tool_results)) continue;
      for (const tr of m.tool_results) {
        if (tr?.tool === "jupiter_swap_prepare" && tr?.result && typeof tr.result === "object" && tr.result?.ok && typeof tr.result.intent_id === "string") {
          allPrepareResults.push(tr.result);
        }
      }
    }
    const latest = allPrepareResults.length > 0 ? allPrepareResults[allPrepareResults.length - 1] : null;
    if (!latest) {
      set({ latestSwapState: { ...current, error: "No prepared swap found in this chat." } });
      return;
    }

    const intentId = latest.intent_id;
    set({ latestSwapState: { executing: true, executed: false, error: null, signature: null } });

    try {
      const confRes = await fetch(`${base}/api/jupiter/swap/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: intentId }),
      });
      const confData = await confRes.json();
      const alreadyConfirmed = !confData.ok && confData.error?.includes("not confirmable from status 'confirmed'");
      if (!confData.ok && !alreadyConfirmed) throw new Error(confData.error || "Confirm failed");

      const execRes = await fetch(`${base}/api/jupiter/swap/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: intentId }),
      });
      const execData = await execRes.json();
      if (!execData.ok) throw new Error(execData.error || "Execute failed");

      const sig = execData.signature || execData.VERIFIED_SIGNATURE || null;

      set({
        latestSwapState: {
          executing: false,
          executed: true,
          error: null,
          signature: sig,
        },
      });
    } catch (e) {
      set({
        latestSwapState: {
          executing: false,
          executed: false,
          error: e.message || "Execute failed",
          signature: null,
        },
      });
    }
  },

  createBulletinPaymentIntent: async () => {
    throw new Error("Removed: use Nostr (nostr_action) instead of website payment intents.");
  },

  fetchLatestBulletinIntent: async () => {
    return null;
  },

  executeBulletinOneClick: async () => {
    throw new Error("Removed: use Nostr (nostr_action) instead of website one-click flows.");
  },

  fetchUsageTotal: async () => {
    const { apiBase } = get();
    const base = apiBase || "";
    try {
      const res = await fetch(`${base}/api/usage/total`);
      const data = await res.json();
      if (data.error) return;
      set({
        usageTotal: {
          prompt_tokens: Number(data.prompt_tokens) || 0,
          completion_tokens: Number(data.completion_tokens) || 0,
          total_tokens: Number(data.total_tokens) || 0,
        },
      });
    } catch (_) {}
  },

  fetchSessions: async () => {
    const { apiBase } = get();
    const base = apiBase || "";
    try {
      const res = await fetch(`${base}/api/sessions`);
      const data = await res.json();
      set({ sessions: data.sessions || [] });
    } catch (e) {
      set({ sessions: [] });
    }
  },

  loadSession: async (id) => {
    const { apiBase } = get();
    const base = apiBase || "";
    set({ loading: true, error: null, view: "chat" });
    try {
      const res = await fetch(`${base}/api/sessions/${encodeURIComponent(id)}`);
      const data = await res.json();
      const msgs = (data.messages || []).map((m) => ({ role: m.role, content: m.content || "" }));
      set({ messages: msgs, currentConversationId: null, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  saveSession: async () => {
    const { apiBase, messages, currentConversationId } = get();
    const base = apiBase || "";
    set({ loading: true, error: null });
    try {
      const body =
        currentConversationId != null
          ? { conversation_id: currentConversationId }
          : { messages: messages.filter((m) => m.role === "user" || m.role === "assistant") };
      const res = await fetch(`${base}/api/session/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const reply = data.name ? `Saved as ${data.name}.` : (data.error || "Save failed.");
      set({
        messages: [...messages, { role: "user", content: "/save" }, { role: "assistant", content: reply }],
        loading: false,
      });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  showHelp: () => {
    const { messages } = get();
    set({
      messages: [
        ...messages,
        { role: "user", content: "/help" },
        { role: "assistant", content: SLASH_HELP },
      ],
    });
  },

  restartServer: async () => {
    const { messages } = get();
    set({
      messages: [
        ...messages,
        {
          role: "assistant",
          content:
            "Reloading the page. To restart the API server, stop `node server.js` in the terminal (Ctrl+C) and start it again.",
        },
      ],
    });
    setTimeout(() => window.location.reload(), 400);
  },
}));
