# Heartbeat Checklist (Peg Trading Practice)

On trigger (e.g. every 1h or on cue): run **only** with real tool results in the **same** turn. If a required tool did not run or failed, **stop** and report the error—do **not** substitute plausible text.

---

## Anti-fabrication rules (non-negotiable)

1. **No invented identifiers** — Never output or imply real Nostr event IDs, npubs, tx signatures, intent IDs, or arXiv/paper IDs unless they are **verbatim substrings** of a **`role: tool`** message in **this** conversation turn.
2. **No invented metrics** — Do not state percentages (“70% dominance”), ack ratios (“4/4”), relay counts, or “HEARTBEAT_OK” unless they appear **verbatim** in tool JSON (e.g. `action_result`, `agent_report`).
3. **No simulated tool JSON** — Do not show example tool responses as if they ran. If you have no tool output, write: **“No tool result in this turn—cannot continue.”**
4. **No filling placeholders** — Bracketed examples below are **shape hints only**. In a real run, every fact must trace to a tool field; if you cannot trace it, omit it or stop.
5. **Summaries** — You may paraphrase **themes** from tool text, but any **quotation, ID, URL, timestamp, or number** tied to the outside world must come from tools.

---

## Core commitment

Reports use **only** data from actual tool results (`nostr_action`, `browse`, `fetch_url`, `workspace_write`, etc.). On tool failure, surface the **exact** error string (e.g. `SIGNING_NOT_CONFIGURED`, `NO_IDENTITY`, RPC errors). **Never** simulate success.

**Goal:** Research-backed, personal Nostr engagement—**only** after steps 1–2 succeed with real data.

---

## Nostr engagement contract

**Purpose:** Personal Nostr engagement backed **only** by real tool results (`nostr_action`, `browse`, `fetch_url`, `workspace_*`, etc.). **Never** simulate success or invent relay/note data.

### Ordered gates

| Step | What to do | Gate to continue |
|------|------------|-------------------|
| **1 — Retrieve** | `nostr_action` with `type: "read"` and valid **`scope`**: `feed` \| `public_feed` \| `communities` \| `health` \| `public_health`. (`ai_only` is a **boolean**, not a scope.) | Tool returns **`ok: true`**. If the list is empty, say **zero posts** and do not invent a feed. If **`ok: false`**, **stop** and report the tool error **verbatim**. |
| **2 — Corroborate** | When “research-backed” applies: **`browse`** and/or **`fetch_url`** (or **`workspace_read`** of content produced by earlier tools in this session). | At least one **successful** corroboration **or** state clearly that search/fetch failed or returned nothing—**no** fake URLs, papers, or articles. If Step 1 did not succeed, **do not** pick a fallback topic from imagination. |
| **3 — Draft** | Draft reply or top-level **content** only from Step 1 text/ids (and external claims **only** from Step 2). | For **reply**: `parent_event_id` is copied **exactly** from Step 1 tool output. No ids from memory or training data. |
| **4 — Publish** | `nostr_action` with `type: "reply"` or `type: "publish"` as appropriate. | Only after Steps 1–3 are satisfied for this run. After the tool returns, report **only** what appears in **`action_result`** / **`agent_report`** (e.g. event id). If there is no id in the tool output, **do not** claim a successful publish. |

### Cite rules

1. **Verbatim facts** — Every **event id**, **npub**, **quoted note text**, **URL**, **page title**, **timestamp**, and **number** (counts, percentages, dominance, relay counts) must appear **verbatim** in a **`role: tool`** result for **this** conversation turn (unless the user explicitly allows a prior turn; default is **same turn**).
2. **Themes only** — You may paraphrase **themes**; you may **not** paraphrase hex ids or fabricate metrics “like” the tool output.
3. **Sources footer** — For summaries/reports, end with **Sources:** listing note ids + URLs **from tools**, or **Sources: none — [reason from tool error or empty result].**
4. **No backfill from priors** — If tools failed or returned empty, do not substitute “typical Nostr” or pretraining—say you have **no tool data**.

### Error transparency (pass through exact tool strings)

| Condition | Required behavior |
|-----------|-------------------|
| `SIGNING_NOT_CONFIGURED`, missing **`NOSTR_NSEC`**, **`NO_IDENTITY`**, or equivalent | **Stop.** Paste or quote the **exact** error string/code from the tool. No publish, no “I posted” narrative. |
| Read: `ok: false`, relay error, timeout, RPC error | Quote the tool’s error text; **no** invented events or npubs. |
| Read: `ok: true` but **zero** posts | State **zero posts**; do not invent a dominant topic or thread. |
| Browse / `fetch_url`: failure, empty, or “no results” | Say so using the tool message; **no** synthetic citations for Step 2. |
| Publish: success unclear (e.g. no event **id** in tool JSON) | Do **not** claim success; say the tool output was incomplete or ambiguous. |

*Expanded call shapes, scopes, and logging: sections **Step 1–4** below.*

---

### Step 1: Read latest Nostr posts

- **Call** (valid contract):  
  `nostr_action` with  
  `{ "type": "read", "payload": { "scope": "feed", "limit": 10, "ai_only": true } }`  
  (or `"scope": "public_feed"` if you intend the public scope).  
  **`scope` must be** `feed` | `public_feed` | `communities` | `health` | `public_health` — **not** `ai_only` (`ai_only` is a separate boolean flag).
- **Analyze:** From **`agent_report`** / **`posts_preview`** / structured fields in the tool result only—describe dominant themes **without** fabricating counts unless the tool returned counts.
- **Output:** Short summary + **only** excerpts copied or lightly trimmed from tool output. If the tool returned no posts, say so and **do not** proceed to publish.

---

### Step 2: Web research on the chosen topic

- **Topic:** Must be justified by Step 1 tool text. If Step 1 was empty or failed, **stop**—do not pick a default topic from imagination.
- **Tools:** Use **`browse`** and/or **`fetch_url`** as actually configured. For **`browse`**, prefer **short keywords** or a full **`https://` URL**—long sentences often fail with “no results”. When the server has **`SERPAPI_API_KEY`**, search quality is usually better (SerpApi Google). Do **not** invent HTTP methods, URLs, or request bodies unless you are copying them from project docs **and** the tool supports them.
- **Optional (Tier 4, peg):** For automated HL-vs-pool checks without hand-running each tool, the app also exposes **`peg_monitor_tick`** / cron **`peg_monitor`** / Trading **Run peg check**—**dry-run** swaps only; see **TOOLS.md**.
- **Findings:** Bullet points **only** from returned snippets/bodies. If search returns nothing: **“No data—skip post”** and stop (no synthetic citations).
- **Citations:** Title + URL + snippet must all come from tool output. **Never** invent arXiv IDs like `2403.12345`.

---

### Step 3: Draft reply-style Nostr content (no publish yet)

- **Parent:** `parent_event_id` must be copied **exactly** from a post entry in Step 1’s tool result (e.g. an `id` field). If none is valid, **do not** publish.
- **Mentions / npubs:** Only use npubs or identifiers **present in** Step 1 tool output.
- **Length / tone:** Keep conversational; respect any length limits you choose, but **do not** claim the post was published here—it is still a draft until Step 4.

---

### Step 4: Publish (only if signing is configured)

- **Call:**  
  `nostr_action` with  
  `{ "type": "reply", "payload": { "content": "<draft from step 3>", "parent_event_id": "<exact id from tool>", "parent_pubkey": "<if required and from tool>" } }`  
  or **`publish`** if the workflow is a top-level post (per product choice)—still **only** with real tool confirmation.
- **After tool returns:** Report **only** what appears in **`action_result`** / **`agent_report`** (e.g. event id, relay publish summary). If the tool does not return an id, say **“Publish result missing id in tool output.”**
- **Log:** If you use `workspace_write`, path/content must reflect **real** tool results—no fabricated JSON files.

---

### Post-run logging

- Update a run log (e.g. `memory/heartbeat-practice-v2.md`) **only** with strings you can point back to tool output in that session.
- **Fallback:** If there is no dominant topic from data, **stop** or post nothing—avoid a generic default topic unless the user explicitly approved it in writing for that run.
- **Next run:** Schedule as configured (e.g. +1h); no fake cron confirmation.

---

## Wrong vs right (behavioral)

| Wrong | Right |
|--------|--------|
| Inventing a parent event id to complete the flow | Skip publish; say no id in tool result |
| “Dominant topic 70%” with no counts in JSON | “Several posts discuss X” only if excerpts support it |
| Example hex/npub in the final user message as if real | Use **only** ids from the latest `nostr_action` read result |
| Continuing after `NO_IDENTITY` / missing `NOSTR_NSEC` | Report error and stop |

---

*This file is instructions for the agent, not a log. Do not append fake “example runs” or status lines here unless a human or tool actually wrote them.*
