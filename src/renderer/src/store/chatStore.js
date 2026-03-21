import { create } from "zustand";

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
  /** Main content view: "chat" | "quickStart" | "wallet" | "allMessages" | "nanogpt". */
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
  /** Latest bulletin payment intent for one-click pay-and-post (on-chain; no admin token). */
  bulletinIntent: null,
  /** Bulletin one-click execution state (legacy / manual API). */
  bulletinState: { executing: false, executed: false, error: null, tx_signature: null, nostr_event_id: null, stage: "idle" },
  /** Last autonomous bulletin_post / bulletin_approve_and_post outcome in this chat (sidebar). */
  bulletinLastOutcome: null,
  /** Default bulletin post draft used by one-click panel. */
  bulletinDraft:
    "Thrilled to test Clawstr's open magic: any agent can post without signup, just keys + relays + ideas. No gatekeepers, just participation. #Clawstr #SolanaAgent #AgentFreedom",

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
      const bulletinFromTools =
        toolResults
          .map((tr) => tr?.result)
          .find((r) => r && typeof r === "object" && r.payment_intent && r.payment) || null;

      let bulletinLastOutcome = get().bulletinLastOutcome;
      const bulletinPostTr = [...toolResults].reverse().find(
        (tr) => tr?.tool === "bulletin_post" || tr?.tool === "bulletin_approve_and_post"
      );
      const br = bulletinPostTr?.result;
      if (br && typeof br === "object") {
        if (br.ok === true && br.stage === "posted") {
          bulletinLastOutcome = {
            ok: true,
            error: null,
            stage: "posted",
            tx_signature: br.tx_signature || null,
            nostr_event_id: br.nostr_event_id || null,
            payment_intent_id: br.payment_intent_id || null,
          };
        } else if (br.ok === false || br.error) {
          bulletinLastOutcome = {
            ok: false,
            error: br.error || "Bulletin post failed",
            stage: br.stage || "failed",
            tx_signature: null,
            nostr_event_id: null,
            payment_intent_id: br.payment_intent_id || null,
          };
        }
      }
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
        bulletinIntent: bulletinFromTools || get().bulletinIntent,
        bulletinLastOutcome,
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
      bulletinIntent: null,
      bulletinState: { executing: false, executed: false, error: null, tx_signature: null, nostr_event_id: null, stage: "idle" },
      bulletinLastOutcome: null,
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
    const { apiBase } = get();
    const base = apiBase || "";
    try {
      const res = await fetch(`${base}/api/bulletin/payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data?.payment_intent || !data?.payment) {
        throw new Error(data?.error || data?.error_code || `Payment intent failed (${res.status})`);
      }
      set({
        bulletinIntent: data,
        bulletinState: { executing: false, executed: false, error: null, tx_signature: null, nostr_event_id: null, stage: "intent_ready" },
      });
      return data;
    } catch (e) {
      set({
        bulletinState: {
          executing: false,
          executed: false,
          error: e.message || "Payment intent failed",
          tx_signature: null,
          nostr_event_id: null,
          stage: "intent_failed",
        },
      });
      throw e;
    }
  },

  fetchLatestBulletinIntent: async () => {
    const { apiBase } = get();
    const base = apiBase || "";
    try {
      const res = await fetch(`${base}/api/bulletin/payment-intent/latest`);
      const data = await res.json();
      if (data?.ok) {
        const latest = data.latest || null;
        set((state) => ({
          bulletinIntent: latest,
          bulletinState:
            !latest && !state.bulletinState.executing && !state.bulletinState.executed
              ? { ...state.bulletinState, stage: "idle" }
              : state.bulletinState,
        }));
      }
    } catch (_) {
      // ignore polling failures
    }
  },

  executeBulletinOneClick: async () => {
    const { apiBase, bulletinIntent, bulletinDraft } = get();
    const base = apiBase || "";
    set({ bulletinState: { executing: true, executed: false, error: null, tx_signature: null, nostr_event_id: null, stage: "starting" } });
    try {
      let intent = bulletinIntent;
      if (!intent?.payment_intent || !intent?.payment) {
        set({ bulletinState: { executing: true, executed: false, error: null, tx_signature: null, nostr_event_id: null, stage: "creating_intent" } });
        intent = await get().createBulletinPaymentIntent();
      }
      const payment_intent_id = intent?.payment_intent?.id;
      const treasury_solana_address = intent?.payment?.treasury_solana_address;
      const amount_lamports = intent?.payment?.amount_lamports;
      const reference = intent?.payment?.reference;
      if (!payment_intent_id || !treasury_solana_address || !amount_lamports || !reference) {
        throw new Error("Missing payment intent fields for approval.");
      }
      set({ bulletinState: { executing: true, executed: false, error: null, tx_signature: null, nostr_event_id: null, stage: "approving_transfer" } });
      const res = await fetch(`${base}/api/bulletin/approve-and-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_intent_id,
          treasury_solana_address,
          amount_lamports,
          reference,
          content: bulletinDraft,
        }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Approve-and-post failed");
      set({
        bulletinState: {
          executing: false,
          executed: true,
          error: null,
          tx_signature: data.tx_signature || null,
          nostr_event_id: data.nostr_event_id || null,
          stage: "posted",
        },
      });
    } catch (e) {
      set({
        bulletinState: {
          executing: false,
          executed: false,
          error: e.message || "Approve-and-post failed",
          tx_signature: null,
          nostr_event_id: null,
          stage: "failed",
        },
      });
    }
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
    const { apiBase } = get();
    const base = apiBase || "";
    const { messages } = get();
    set({
      messages: [
        ...messages,
        { role: "assistant", content: "Restarting server…" },
      ],
    });
    try {
      await fetch(`${base}/api/restart`, { method: "POST" });
      setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      set({ error: "Restart request failed: " + (e.message || e) });
    }
  },
}));
