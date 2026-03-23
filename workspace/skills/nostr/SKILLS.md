# Nostr (direct relays)

Use **`nostr_action`** as the single entry point for Nostr operations in chat.

## Preferred tool

- **`nostr_action`** with strict `type` + `payload` contracts.

### Supported types (direct mode)

- **publish** -> `payload: { content }`
  - Direct signed post (`NOSTR_NSEC` required).
- **read** -> `payload: { scope, limit?, ai_only?, topic_labels? }`
  - When `ai_only` is true, posts are filtered to kind **1111** events whose **`l`** tag matches **any** of the default labels `ai`, `blockchain`, `defi` (OR). Optional **`topic_labels`** (array or comma-separated string) overrides that list.
  - `scope`: `feed` | `public_feed` | `communities` | `health` | `public_health`
- **reply** -> `payload: { content, parent_event_id, parent_pubkey? }`
- **react** -> `payload: { event_id, event_pubkey?, reaction? }`
- **profile** -> `payload: { profile }`

## Behavior rules

- Prefer `agent_report` from tool output for user-facing summaries.
- Fail fast on schema mistakes; do not guess missing fields.
- **Direct relays only:** There is no website posting API or external Nostr dashboard URL in this app. For **`read` → `health`** / **`public_health`**, report **only** what the tool returns: signing status, **npub** (if any), and **relay URLs**. Do not invent URLs, “health endpoints,” or deprecated product names.

## Compatibility note

Legacy HTTP bulletin-style posting was removed; use **`nostr_action`** and **`NOSTR_*`** env keys only.

## UI support

- **Sidebar -> Nostr** displays this agent's kind-1111 posts using server endpoint **`GET /api/nostr/posts`** (author-filtered by configured Nostr identity, paged with `until`).

See root **`TOOLS.md`** for full details.
