import { SimplePool, finalizeEvent, getPublicKey, nip19 } from "nostr-tools";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

function getRelayList(env = {}) {
  const raw = String(env?.NOSTR_RELAYS ?? process.env.NOSTR_RELAYS ?? "").trim();
  if (!raw) return [...DEFAULT_RELAYS];
  const relays = raw
    .split(/[,\s;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return relays.length ? relays : [...DEFAULT_RELAYS];
}

function getNsec(env = {}) {
  return String(env?.NOSTR_NSEC ?? process.env.NOSTR_NSEC ?? "").trim();
}

function getNpubFromEnv(env = {}) {
  return String(env?.NOSTR_NPUB ?? process.env.NOSTR_NPUB ?? "").trim() || null;
}

function decodeSecretKey(nsec) {
  if (!nsec) return null;
  try {
    const dec = nip19.decode(nsec);
    if (dec.type !== "nsec") return null;
    return dec.data;
  } catch {
    return null;
  }
}

function excerpt(s, max = 220) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function normalizeResult(type, source, raw) {
  const ok = raw && typeof raw === "object" ? !(raw.ok === false || raw.error) : false;
  return {
    ok,
    type,
    source,
    error: ok ? null : raw?.error || "nostr_action_failed",
    code: raw?.code || null,
    agent_report: raw?.agent_report || null,
    action_result: raw,
  };
}

function rejectUnknownPayloadFields(payload, allowedKeys, context = "payload") {
  const extras = Object.keys(payload || {}).filter((k) => !allowedKeys.has(k));
  if (extras.length) {
    return {
      ok: false,
      error: `EXTRA_FIELD_NOT_ALLOWED: ${context}.${extras.join(",")}`,
      code: "EXTRA_FIELD_NOT_ALLOWED",
      extras,
    };
  }
  return null;
}

async function queryEvents({ relays, filter, timeoutMs = 10000 }) {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(relays, filter, { maxWait: timeoutMs });
    return { ok: true, events: Array.isArray(events) ? events : [] };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), events: [] };
  } finally {
    try {
      pool.close(relays);
    } catch {}
  }
}

async function publishEvent({ relays, event, timeoutMs = 12000 }) {
  const pool = new SimplePool();
  try {
    const pubs = pool.publish(relays, event, { timeout: Math.floor(timeoutMs / 1000) });
    const settled = await Promise.allSettled((pubs || []).map((p) => Promise.resolve(p)));
    const okCount = settled.filter((s) => s.status === "fulfilled").length;
    const errors = settled
      .filter((s) => s.status === "rejected")
      .map((s) => s.reason?.message || String(s.reason))
      .slice(0, 10);
    return { ok: okCount > 0, ok_count: okCount, attempts: settled.length, errors };
  } catch (e) {
    return { ok: false, ok_count: 0, attempts: 0, errors: [e?.message || String(e)] };
  } finally {
    try {
      pool.close(relays);
    } catch {}
  }
}

/** Default `l`-tag label values (second element) for topic-filtered feeds — OR semantics. */
export const DEFAULT_FEED_TOPIC_LABELS = Object.freeze(["ai", "blockchain", "defi"]);

function eventHasAnyTopicLabel(ev, labels) {
  if (!labels || labels.length === 0) return true;
  const set = new Set(labels.map((x) => String(x).toLowerCase()));
  return (ev.tags || []).some(
    (t) => Array.isArray(t) && t[0] === "l" && set.has(String(t[1] || "").toLowerCase())
  );
}

function normalizeTopicLabelsInput(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const out = raw.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    return out.length ? out : null;
  }
  if (typeof raw === "string") {
    const out = raw
      .split(/[,;\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    return out.length ? out : null;
  }
  return null;
}

function buildPostTags() {
  return [
    ["L", "agent"],
    ["l", "ai", "agent"],
    ["l", "blockchain", "agent"],
    ["l", "defi", "agent"],
  ];
}

function buildReplyTags({ parentEventId, parentPubkey }) {
  const tags = [
    ["e", parentEventId],
    ["k", "1111"],
    ["L", "agent"],
    ["l", "ai", "agent"],
    ["l", "blockchain", "agent"],
    ["l", "defi", "agent"],
  ];
  if (parentPubkey) tags.push(["p", parentPubkey]);
  return tags;
}

function buildReactionTags({ eventId, eventPubkey, reaction }) {
  const tags = [["e", eventId]];
  if (eventPubkey) tags.push(["p", eventPubkey]);
  if (reaction) tags.push(["emoji", reaction]);
  return tags;
}

function makeSignedEvent(kind, content, tags, sk) {
  return finalizeEvent(
    {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      content: String(content || ""),
      tags: Array.isArray(tags) ? tags : [],
      pubkey: getPublicKey(sk),
    },
    sk
  );
}

async function readScope(payload, env) {
  const scope = String(payload.scope || "")
    .trim()
    .toLowerCase();
  const relays = getRelayList(env);
  const nsec = getNsec(env);
  const sk = decodeSecretKey(nsec);
  const npub = getNpubFromEnv(env);
  const signerPubkey = sk ? getPublicKey(sk) : null;
  const signerNpub = signerPubkey ? nip19.npubEncode(signerPubkey) : npub;

  if (scope === "health") {
    const relayLine = relays.length ? relays.join(", ") : "(none — defaults apply if unset)";
    return {
      ok: true,
      agent_report:
        `**Nostr (direct relays)** — signing **${sk ? "configured" : "not configured"}**.` +
        (signerNpub ? `\n- **npub:** \`${signerNpub}\`` : "") +
        `\n- **Relays (${relays.length}):** ${relayLine}` +
        `\n- **Note:** Nostr here is **relays only** (no separate website or dashboard URL)—use the list above and \`nostr_action\`.`,
      summary: {
        signing_configured: !!sk,
        npub: signerNpub,
        relays,
        relays_count: relays.length,
      },
      endpoint: "nostr://direct",
      read_scope: scope,
    };
  }

  if (scope === "public_health") {
    const relayLine = relays.length ? relays.join(", ") : "(defaults)";
    return {
      ok: true,
      agent_report:
        `**Nostr public health (relays only)** — **${relays.length}** relay URL(s): ${relayLine}. No external posting API; use \`nostr_action\` + \`NOSTR_NSEC\` to publish.`,
      summary: { ok: true, relays_count: relays.length, relays },
      endpoint: "nostr://direct",
      read_scope: scope,
    };
  }

  if (scope === "communities") {
    const q = await queryEvents({ relays, filter: { kinds: [1111], limit: 150 }, timeoutMs: 12000 });
    if (!q.ok) return { ok: false, error: q.error, read_scope: scope };
    const set = new Set();
    for (const ev of q.events) {
      for (const tag of ev.tags || []) {
        if (Array.isArray(tag) && (tag[0] === "i" || tag[0] === "I")) {
          const v = String(tag[1] || "").trim();
          if (v.startsWith("https://") && v.length >= 12 && v.length < 512) set.add(v);
        }
      }
    }
    const list = Array.from(set).sort();
    return {
      ok: true,
      agent_report:
        `**Nostr communities (direct relay scan)** — found **${list.length}** community URL(s).` +
        (list.length ? `\n\n${list.slice(0, 50).map((u) => `- ${u}`).join("\n")}` : "\n\n_(No community URLs found in sampled posts.)_"),
      summary: { count: list.length },
      communities: list,
      endpoint: "nostr://direct",
      read_scope: scope,
    };
  }

  if (scope !== "feed" && scope !== "public_feed") {
    return {
      ok: false,
      error: `INVALID_SCOPE: ${scope}`,
      code: "INVALID_SCOPE",
      agent_report:
        "nostr_action rejected: read scope must be feed, public_feed, communities, health, or public_health.",
    };
  }

  const limit = Math.min(100, Math.max(1, Number(payload.limit) || 30));
  const aiOnly = payload.ai_only === true || payload.ai_only === "true" || payload.ai_only === 1;
  const topicLabels =
    normalizeTopicLabelsInput(payload.topic_labels) ?? (aiOnly ? [...DEFAULT_FEED_TOPIC_LABELS] : null);
  const q = await queryEvents({ relays, filter: { kinds: [1111], limit: Math.min(300, limit * 4) }, timeoutMs: 12000 });
  if (!q.ok) return { ok: false, error: q.error, read_scope: scope };
  let events = q.events.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
  if (aiOnly) {
    events = events.filter((ev) => eventHasAnyTopicLabel(ev, topicLabels));
  }
  events = events.slice(0, limit);
  const previews = events.map((ev, i) => ({
    n: i + 1,
    id: ev.id,
    created_at: ev.created_at ? new Date(ev.created_at * 1000).toISOString() : null,
    pubkey: ev.pubkey,
    excerpt: excerpt(ev.content || "", 200),
  }));
  const lines = previews.map((p) => `**${p.n}.** \`${p.id}\`${p.created_at ? ` _(${p.created_at})_` : ""} — ${p.excerpt}`);
  return {
    ok: true,
    agent_report:
      `**${scope === "public_feed" ? "Public feed" : "Nostr feed"} (direct Nostr relays)** — **${events.length}** entr${events.length === 1 ? "y" : "ies"} (limit=${limit}, ai_only=${aiOnly}${
        aiOnly ? `, topic_labels_OR=${(topicLabels || []).join("|")}` : ""
      }).` +
      (lines.length ? `\n\n${lines.join("\n")}` : "\n\n_(No matching posts.)_"),
    summary: {
      total_returned: events.length,
      limit,
      ai_only: aiOnly,
      topic_labels: aiOnly ? topicLabels : null,
      relays_used: relays.length,
    },
    posts_preview: previews,
    endpoint: "nostr://direct",
    read_scope: scope,
    relays,
  };
}

export async function nostrAction(args = {}, env = {}) {
  const t = String(args?.type || "")
    .trim()
    .toLowerCase();
  const payload = args?.payload;
  const relays = getRelayList(env);
  const nsec = getNsec(env);
  const sk = decodeSecretKey(nsec);

  const validTypes = new Set(["publish", "read", "payment_intent", "latest_intent", "reply", "react", "profile"]);
  if (!validTypes.has(t)) {
    return normalizeResult(t || null, "nostr_direct", {
      ok: false,
      error:
        "INVALID_TYPE: type must be one of publish | read | payment_intent | latest_intent | reply | react | profile",
      code: "INVALID_TYPE",
      agent_report:
        "nostr_action rejected: invalid type. Use one of publish/read/payment_intent/latest_intent/reply/react/profile.",
    });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return normalizeResult(t, "nostr_direct", {
      ok: false,
      error: "INVALID_PAYLOAD: payload must be a JSON object",
      code: "INVALID_PAYLOAD",
      agent_report: "nostr_action rejected: payload must be an object.",
    });
  }

  if (t === "read") {
    const guard = rejectUnknownPayloadFields(payload, new Set(["scope", "limit", "ai_only", "topic_labels"]), "payload");
    if (guard) return normalizeResult(t, "nostr_direct", { ...guard, agent_report: guard.error });
    return normalizeResult(t, "nostr_direct", await readScope(payload, env));
  }

  if (t === "payment_intent") {
    return normalizeResult(t, "nostr_direct", {
      ok: false,
      code: "NOT_SUPPORTED",
      error: "NOT_SUPPORTED: payment intents are removed in pure nostr mode",
      agent_report: "Direct nostr mode does not support payment intents.",
    });
  }
  if (t === "latest_intent") {
    return normalizeResult(t, "nostr_direct", {
      ok: true,
      latest: null,
      agent_report: "Direct nostr mode has no local payment-intent cache.",
    });
  }

  if (!sk) {
    return normalizeResult(t, "nostr_direct", {
      ok: false,
      code: "SIGNING_NOT_CONFIGURED",
      error: "SIGNING_NOT_CONFIGURED: set NOSTR_NSEC in env for direct nostr publishing",
      agent_report: "Signing is not configured for direct nostr mode. Set NOSTR_NSEC in env.",
    });
  }

  if (t === "publish") {
    const guard = rejectUnknownPayloadFields(payload, new Set(["content"]), "payload");
    if (guard) return normalizeResult(t, "nostr_direct", { ...guard, agent_report: guard.error });
    const content = String(payload.content || "").trim();
    if (!content) {
      return normalizeResult(t, "nostr_direct", {
        ok: false,
        error: "MISSING_REQUIRED_FIELD: payload.content",
        code: "MISSING_REQUIRED_FIELD",
        agent_report: "nostr_action rejected: publish requires payload.content.",
      });
    }
    const event = makeSignedEvent(1111, content, buildPostTags(), sk);
    const pub = await publishEvent({ relays, event });
    return normalizeResult(t, "nostr_direct", {
      ok: pub.ok,
      stage: pub.ok ? "posted" : "publish_failed",
      mode: "nostr_direct",
      nostr_event_id: event.id,
      relays_attempted: relays,
      relay_publish: pub,
      post: { id: event.id, content, created_at: new Date(event.created_at * 1000).toISOString() },
      agent_report: pub.ok
        ? `Published to direct Nostr relays. Event: \`${event.id}\` (acks: ${pub.ok_count}/${pub.attempts}).`
        : `Direct Nostr publish failed (acks: ${pub.ok_count}/${pub.attempts}).`,
      error: pub.ok ? null : `Failed to publish to relays: ${pub.errors.join("; ")}`,
    });
  }

  if (t === "reply") {
    const guard = rejectUnknownPayloadFields(payload, new Set(["content", "parent_event_id", "parent_pubkey", "scope"]), "payload");
    if (guard) return normalizeResult(t, "nostr_direct", { ...guard, agent_report: guard.error });
    const content = String(payload.content || "").trim();
    const parentEventId = String(payload.parent_event_id || "").trim();
    const parentPubkey = String(payload.parent_pubkey || "").trim() || null;
    if (!content || !parentEventId) {
      return normalizeResult(t, "nostr_direct", {
        ok: false,
        code: "MISSING_REQUIRED_FIELD",
        error: "MISSING_REQUIRED_FIELD: payload.content and payload.parent_event_id are required",
        agent_report: "nostr_action reply requires content and parent_event_id.",
      });
    }
    const event = makeSignedEvent(1111, content, buildReplyTags({ parentEventId, parentPubkey }), sk);
    const pub = await publishEvent({ relays, event });
    return normalizeResult(t, "nostr_direct", {
      ok: pub.ok,
      mode: "nostr_direct",
      nostr_event_id: event.id,
      relay_publish: pub,
      relays_attempted: relays,
      agent_report: pub.ok
        ? `Reply published. Event: \`${event.id}\` (acks: ${pub.ok_count}/${pub.attempts}).`
        : `Reply publish failed (acks: ${pub.ok_count}/${pub.attempts}).`,
      error: pub.ok ? null : `Failed to publish reply: ${pub.errors.join("; ")}`,
    });
  }

  if (t === "react") {
    const guard = rejectUnknownPayloadFields(payload, new Set(["event_id", "event_pubkey", "reaction"]), "payload");
    if (guard) return normalizeResult(t, "nostr_direct", { ...guard, agent_report: guard.error });
    const eventId = String(payload.event_id || "").trim();
    const eventPubkey = String(payload.event_pubkey || "").trim() || null;
    const reaction = String(payload.reaction || "+").trim() || "+";
    if (!eventId) {
      return normalizeResult(t, "nostr_direct", {
        ok: false,
        code: "MISSING_REQUIRED_FIELD",
        error: "MISSING_REQUIRED_FIELD: payload.event_id",
        agent_report: "nostr_action react requires event_id.",
      });
    }
    const event = makeSignedEvent(7, reaction, buildReactionTags({ eventId, eventPubkey, reaction }), sk);
    const pub = await publishEvent({ relays, event });
    return normalizeResult(t, "nostr_direct", {
      ok: pub.ok,
      mode: "nostr_direct",
      nostr_event_id: event.id,
      relay_publish: pub,
      relays_attempted: relays,
      agent_report: pub.ok
        ? `Reaction published. Event: \`${event.id}\` (acks: ${pub.ok_count}/${pub.attempts}).`
        : `Reaction publish failed (acks: ${pub.ok_count}/${pub.attempts}).`,
      error: pub.ok ? null : `Failed to publish reaction: ${pub.errors.join("; ")}`,
    });
  }

  if (t === "profile") {
    const guard = rejectUnknownPayloadFields(payload, new Set(["profile"]), "payload");
    if (guard) return normalizeResult(t, "nostr_direct", { ...guard, agent_report: guard.error });
    const profile = payload.profile;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return normalizeResult(t, "nostr_direct", {
        ok: false,
        code: "MISSING_REQUIRED_FIELD",
        error: "MISSING_REQUIRED_FIELD: payload.profile object",
        agent_report: "nostr_action profile requires payload.profile object.",
      });
    }
    const event = makeSignedEvent(0, JSON.stringify(profile), [], sk);
    const pub = await publishEvent({ relays, event });
    return normalizeResult(t, "nostr_direct", {
      ok: pub.ok,
      mode: "nostr_direct",
      nostr_event_id: event.id,
      relay_publish: pub,
      relays_attempted: relays,
      agent_report: pub.ok
        ? `Profile event published. Event: \`${event.id}\` (acks: ${pub.ok_count}/${pub.attempts}).`
        : `Profile publish failed (acks: ${pub.ok_count}/${pub.attempts}).`,
      error: pub.ok ? null : `Failed to publish profile: ${pub.errors.join("; ")}`,
    });
  }

  return normalizeResult(t, "nostr_direct", {
    ok: false,
    error: "INVALID_TYPE",
    code: "INVALID_TYPE",
    agent_report: "nostr_action rejected: invalid type.",
  });
}

/** Resolve agent hex pubkey from NOSTR_NSEC (preferred) or NOSTR_NPUB. */
export function getAgentPubkeyHexFromEnv(env = {}) {
  const nsec = getNsec(env);
  const sk = decodeSecretKey(nsec);
  if (sk) return getPublicKey(sk);
  const npub = getNpubFromEnv(env);
  if (npub) {
    try {
      const d = nip19.decode(npub);
      if (d.type === "npub") return d.data;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Fetch kind 1111 posts authored by this agent (same identity as signing key or NOSTR_NPUB).
 * Relays may not retain full history—results are best-effort.
 */
export async function fetchAgentKind1111Posts(env = {}, opts = {}) {
  const limitRaw = opts.limit != null ? Number(opts.limit) : 100;
  const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100));
  const until =
    opts.until != null && Number.isFinite(Number(opts.until)) ? Math.floor(Number(opts.until)) : undefined;

  const pubkeyHex = getAgentPubkeyHexFromEnv(env);
  if (!pubkeyHex) {
    return {
      ok: false,
      code: "NO_IDENTITY",
      error: "Set NOSTR_NSEC or NOSTR_NPUB in .env / Settings to load agent posts.",
    };
  }

  const relays = getRelayList(env);
  const filter = { kinds: [1111], authors: [pubkeyHex], limit };
  if (until != null) filter.until = until;

  const q = await queryEvents({ relays, filter, timeoutMs: 18000 });
  if (!q.ok) {
    return { ok: false, error: q.error || "Relay query failed" };
  }

  let events = [...(q.events || [])].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
  events = events.slice(0, limit);

  const posts = events.map((ev) => ({
    id: ev.id,
    pubkey: ev.pubkey,
    created_at: ev.created_at,
    content: ev.content != null ? String(ev.content) : "",
    kind: ev.kind,
  }));

  const oldestTs = events.length ? Number(events[events.length - 1].created_at) : null;
  const next_until =
    events.length > 0 && events.length === limit && oldestTs != null && Number.isFinite(oldestTs)
      ? oldestTs - 1
      : null;

  return {
    ok: true,
    npub: nip19.npubEncode(pubkeyHex),
    pubkey: pubkeyHex,
    relays,
    posts,
    limit,
    until: until ?? null,
    next_until,
  };
}

/**
 * Fetch latest kind 1111 posts from relays (global feed, not author-filtered).
 * Matches what users usually ask with "what's new on nostr".
 */
export async function fetchLatestKind1111FeedPosts(env = {}, opts = {}) {
  const limitRaw = opts.limit != null ? Number(opts.limit) : 10;
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 10));
  const until =
    opts.until != null && Number.isFinite(Number(opts.until)) ? Math.floor(Number(opts.until)) : undefined;
  const aiOnly = opts.ai_only === true || opts.ai_only === "true" || opts.ai_only === 1;
  const topicLabels =
    normalizeTopicLabelsInput(opts.topic_labels) ?? (aiOnly ? [...DEFAULT_FEED_TOPIC_LABELS] : null);

  const relays = getRelayList(env);
  const filter = { kinds: [1111], limit: Math.min(400, limit * 6) };
  if (until != null) filter.until = until;

  const q = await queryEvents({ relays, filter, timeoutMs: 18000 });
  if (!q.ok) return { ok: false, error: q.error || "Relay query failed" };

  let events = [...(q.events || [])].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
  if (aiOnly) {
    events = events.filter((ev) => eventHasAnyTopicLabel(ev, topicLabels));
  }
  events = events.slice(0, limit);

  const posts = events.map((ev) => ({
    id: ev.id,
    pubkey: ev.pubkey,
    created_at: ev.created_at,
    content: ev.content != null ? String(ev.content) : "",
    kind: ev.kind,
  }));

  const oldestTs = events.length ? Number(events[events.length - 1].created_at) : null;
  const next_until =
    events.length > 0 && events.length === limit && oldestTs != null && Number.isFinite(oldestTs)
      ? oldestTs - 1
      : null;

  return {
    ok: true,
    relays,
    posts,
    limit,
    until: until ?? null,
    next_until,
    ai_only: aiOnly,
    topic_labels: aiOnly ? topicLabels : null,
  };
}

