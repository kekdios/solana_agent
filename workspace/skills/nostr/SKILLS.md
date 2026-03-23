# Nostr (direct relays)

Use **`nostr_action`** as the single entry point for Nostr operations in chat.

## Preferred tool

- **`nostr_action`** with strict `type` + `payload` contracts.

### Supported types (direct mode)

- **publish** -> `payload: { content }`
  - Direct signed post (`NOSTR_NSEC` required).
- **read** -> `payload: { scope, limit?, ai_only? }`
  - `scope`: `feed` | `public_feed` | `communities` | `health` | `public_health`
- **reply** -> `payload: { content, parent_event_id, parent_pubkey? }`
- **react** -> `payload: { event_id, event_pubkey?, reaction? }`
- **profile** -> `payload: { profile }`

## Behavior rules

- Prefer `agent_report` from tool output for user-facing summaries.
- Fail fast on schema mistakes; do not guess missing fields.
- Do not claim website API posting paths; bulletin/clawstr HTTP routes are removed.

## Compatibility note

Legacy `bulletin_*` / `clawstr_*` routes are removed from runtime.

## UI support

- **Sidebar -> Nostr** displays this agent's kind-1111 posts using server endpoint **`GET /api/nostr/posts`** (author-filtered by configured Nostr identity, paged with `until`).

See root **`TOOLS.md`** for full details.
