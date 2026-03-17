# Venice API Reference

This document summarizes the [Venice API](https://docs.venice.ai/api-reference/api-spec) for use in the Solana Agent app (chat provider option: Venice). The Venice API offers HTTP-based REST and streaming interfaces for AI applications with uncensored models and private inference.

**Source:** [Venice API Spec — docs.venice.ai](https://docs.venice.ai/api-reference/api-spec)  
**Documentation index:** https://docs.venice.ai/llms.txt  
**Swagger:** https://api.venice.ai/doc/api/swagger.yaml

---

## 1. Introduction

- **Base URL:** `https://api.venice.ai/api/v1`
- **Chat completions:** `POST https://api.venice.ai/api/v1/chat/completions`
- Supports text generation, image creation, embeddings, and more, without restrictive content policies.
- Integration examples and SDKs are available in the [Venice documentation](https://docs.venice.ai/overview/getting-started).

---

## 2. Authentication

The Venice API uses **API keys**. Create and manage keys at [Venice API settings](https://venice.ai/settings/api).

All requests require **HTTP Bearer** authentication:

```http
Authorization: Bearer VENICE_API_KEY
```

> **Security:** Your API key is a secret. Do not share it or expose it in client-side code.

In this app, the Venice key is stored as `VENICE_ADMIN_KEY` in `.env` or in the encrypted config table (Settings → Venice API key).

---

## 3. OpenAI Compatibility

Venice implements the **OpenAI API specification**, so existing OpenAI-style clients and tools work with Venice.

**Setup:** Use Venice’s base URL and send requests in the usual OpenAI format.

**Example (curl):**

```bash
curl https://api.venice.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $VENICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "venice-uncensored",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

**Example (JavaScript):**

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.VENICE_API_KEY,
  baseURL: "https://api.venice.ai/api/v1",
});

const response = await client.chat.completions.create({
  model: "venice-uncensored",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);
```

**Example (Python):**

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("VENICE_API_KEY"),
    base_url="https://api.venice.ai/api/v1"
)

response = client.chat.completions.create(
    model="venice-uncensored",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

---

## 4. Venice-Specific Features

### 4.1 System Prompts

Venice can use default system prompts for uncensored, natural responses. Two options:

1. **Default:** Your system prompts are **appended** to Venice’s defaults.
2. **Custom:** Disable Venice’s system prompts entirely.

**Disabling Venice system prompts** — send `venice_parameters.include_venice_system_prompt: false`:

```json
{
  "model": "venice-uncensored",
  "messages": [
    {"role": "system", "content": "Your custom system prompt"},
    {"role": "user", "content": "Why is the sky blue?"}
  ],
  "venice_parameters": {
    "include_venice_system_prompt": false
  }
}
```

### 4.2 Venice Parameters

The `venice_parameters` object exposes options not in the standard OpenAI API:

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `character_slug` | string | Public Venice character slug ("Public ID" on the character page). | — |
| `strip_thinking_response` | boolean | Strip `<think></think>` blocks (legacy thinking tag format). See [Reasoning Models](https://docs.venice.ai/overview/guides/reasoning-models). | `false` |
| `disable_thinking` | boolean | On reasoning models, disable thinking and strip `<think></think>` blocks. | `false` |
| `enable_web_search` | string | Web search: `off`, `on`, or `auto` (model’s discretion). Extra usage pricing applies. | `off` |
| `enable_web_scraping` | boolean | Scrape up to 5 URLs in the user message; content augments responses. Only successful scrapes are billed. | `false` |
| `enable_web_citations` | boolean | When web search is on, ask the model to cite sources with `[REF]0[/REF]` format. | `false` |
| `include_search_results_in_stream` | boolean | Experimental: include search results in the stream as the first chunk. | `false` |
| `return_search_results_as_documents` | boolean | Expose search results via OpenAI-compatible tool call `venice_web_search_documents` (e.g. LangChain). | `false` |
| `include_venice_system_prompt` | boolean | Include Venice’s default system prompts with your system prompts. | `true` |

These can also be specified as **model suffixes** (e.g. `llama-3.3-70b:enable_web_search=auto`). See [Model Feature Suffixes](https://docs.venice.ai/api-reference/endpoint/chat/model_feature_suffix).

### 4.3 Prompt Caching

Venice supports **prompt caching** on select models to reduce latency and cost for repeated content. System prompts are cached automatically where supported.

- **`prompt_cache_key`** (string): Optional routing hint to improve cache hit rates; helps keep multi-turn conversations on the same backend.

Details: [Prompt Caching](https://docs.venice.ai/overview/guides/prompt-caching) (billing and best practices).

---

## 5. Response Headers Reference

Responses include headers for request ID, rate limits, model info, and account balance. Venice recommends logging **`CF-RAY`** for support and troubleshooting.

| Header | Type | Purpose | When Returned |
|--------|------|---------|----------------|
| **Standard HTTP** | | | |
| `Content-Type` | string | MIME type of body | Always |
| `Content-Encoding` | string | e.g. `gzip`, `br` | When client sends `Accept-Encoding` |
| `Content-Disposition` | string | e.g. attachment filename | File/export downloads |
| `Date` | string | RFC 7231 response time | Always |
| **Request identification** | | | |
| `CF-RAY` | string | Unique request ID (log for support) | Always |
| `x-venice-version` | string | API version (e.g. `20250828.222653`) | Always |
| `x-venice-timestamp` | string | Server time (ISO 8601) | When timestamp tracking enabled |
| `x-venice-host-name` | string | Host that processed the request | Errors / debugging |
| **Model** | | | |
| `x-venice-model-id` | string | Model ID (e.g. `venice-01-lite`) | Inference endpoints |
| `x-venice-model-name` | string | Display name (e.g. Venice Lite) | Inference endpoints |
| `x-venice-model-router` | string | Router/backend for inference | When available |
| `x-venice-model-deprecation-warning` | string | Deprecation message | Deprecated models |
| `x-venice-model-deprecation-date` | string | Deprecation date (ISO 8601) | Deprecated models |
| **Rate limiting** | | | |
| `x-ratelimit-limit-requests` | number | Max requests in window | Authenticated requests |
| `x-ratelimit-remaining-requests` | number | Requests left in window | Authenticated requests |
| `x-ratelimit-reset-requests` | number | Unix time when limit resets | Authenticated requests |
| `x-ratelimit-limit-tokens` | number | Max tokens (prompt + completion) in window | Authenticated requests |
| `x-ratelimit-remaining-tokens` | number | Tokens left in window | Authenticated requests |
| `x-ratelimit-reset-tokens` | number | Seconds until token limit resets | Authenticated requests |
| `x-ratelimit-type` | string | `user`, `api_key`, or `global` | When enforced |
| **Pagination** | | | |
| `x-pagination-limit` | number | Items per page | Paginated endpoints |
| `x-pagination-page` | number | Current page (1-based) | Paginated endpoints |
| `x-pagination-total` | number | Total items | Paginated endpoints |
| `x-pagination-total-pages` | number | Total pages | Paginated endpoints |
| **Account balance** | | | |
| `x-venice-balance-diem` | string | DIEM balance before request | Authenticated requests |
| `x-venice-balance-usd` | string | USD credit balance before request | Authenticated requests |
| **Content safety** | | | |
| `x-venice-is-blurred` | string | Image blurred by policy (`true`/`false`) | Image gen with Safe Venice |
| `x-venice-is-content-violation` | string | Content policy violation | Content generation |
| `x-venice-is-adult-model-content-violation` | string | Adult model policy violation | Image generation |
| `x-venice-contains-minor` | string | Minors detected in image | Image analysis with age detection |
| **Auth** | | | |
| `x-auth-refreshed` | string | Token refreshed during request | When auto-refresh used |
| `x-retry-count` | number | Retry attempts | When retries occur |

**Notes:**

- Header names are case-insensitive; Venice uses lowercase-with-hyphens.
- Boolean header values are strings `"true"` or `"false"`.
- Large numbers/balances may be strings to preserve precision.

**Example (reading headers):**

```javascript
const requestId = response.headers.get('CF-RAY');
const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
const remainingTokens = response.headers.get('x-ratelimit-remaining-tokens');
const usdBalance = response.headers.get('x-venice-balance-usd');

const deprecationWarning = response.headers.get('x-venice-model-deprecation-warning');
if (deprecationWarning) {
  console.warn(`Model Deprecation: ${deprecationWarning}`);
}
```

---

## 6. Best Practices

1. **Rate limiting:** Use `x-ratelimit-remaining-*` and implement exponential backoff.
2. **Balance:** Monitor `x-venice-balance-usd` and `x-venice-balance-diem` to avoid interruptions.
3. **System prompts:** Test with and without Venice defaults (`include_venice_system_prompt`) for your use case.
4. **API keys:** Keep keys secret and rotate them regularly.
5. **Troubleshooting:** Log `CF-RAY` for support.
6. **Deprecation:** Check `x-venice-model-deprecation-warning` when using models.

---

## 7. Differences from OpenAI’s API

| Area | Venice behavior |
|------|-----------------|
| **venice_parameters** | Extra options: `enable_web_search`, `character_slug`, `strip_thinking_response`, etc. |
| **System prompts** | Your prompts are appended to Venice defaults unless `include_venice_system_prompt: false`. |
| **Models** | Use Venice [model IDs](https://docs.venice.ai/overview/models) (e.g. `venice-uncensored`), not OpenAI model names. |
| **Response headers** | Venice-specific: balance (`x-venice-balance-usd`, `x-venice-balance-diem`), deprecation, content safety. |
| **Content policies** | More permissive; uncensored models and optional filtering. |

---

## 8. API Stability

Venice maintains **backward compatibility** for v1 endpoints and parameters. For model lifecycle, deprecations, and migration, see [Deprecations](https://docs.venice.ai/overview/deprecations).

---

## 9. Use in Solana Agent

- **Settings:** Chat provider can be set to **Venice**; API key is stored as **Venice API key** (config key `VENICE_ADMIN_KEY`).
- **Test connection:** Settings → Test connection uses the selected provider (Inception or Venice) and calls the corresponding chat completions endpoint.
- **Chat requests:** When Venice is selected, the app sends `POST https://api.venice.ai/api/v1/chat/completions` with `Authorization: Bearer <VENICE_ADMIN_KEY>` and `model: "venice-uncensored"`. Tool-use and message format follow the same pattern as Inception (OpenAI-compatible). The app sends `venice_parameters: { include_venice_system_prompt: false }` so only the app’s system prompt (workspace + wallet rules) is used, and `prompt_cache_key: conversationId` for multi-turn cache hints. Venice responses are logged with `CF-RAY` for support.

- **Token usage:** Venice returns an OpenAI-compatible `usage` object (`prompt_tokens`, `completion_tokens`, `total_tokens`) on each completion. The app records it the same way as Inception: `data.usage` is accumulated and stored via `db.insertTokenUsage`, and the header shows session and all-time totals. So you can monitor token usage with Venice exactly as with Inception.

---

## 10. Implementation vs this document

Comparison of the **current app implementation** to what this document describes.

| Doc / API spec | Current implementation | Status |
|----------------|------------------------|--------|
| **Endpoint** `POST …/chat/completions` | `server.js`: `VENICE_API = "https://api.venice.ai/api/v1/chat/completions"` | ✅ Matches |
| **Auth** `Authorization: Bearer <key>` | Chat and test use `Authorization: Bearer ${activeKey}` (key from `VENICE_ADMIN_KEY`) | ✅ Matches |
| **Model** `venice-uncensored` | `getChatBackendConfig()` returns `model: "venice-uncensored"` | ✅ Matches |
| **Body** `model`, `messages`, `max_tokens` | Chat: `model`, `messages`, `max_tokens: 8192`; test: `model`, `messages: [{ role: "user", content: "Hi" }]`, `max_tokens: 10` | ✅ Matches |
| **Tools** (OpenAI-compatible) | Same request shape as Inception: `tools`, `tool_choice: "auto"` when `sendTools` | ✅ Matches |
| **venice_parameters** (`include_venice_system_prompt: false`) | Sent for Venice so only the app’s system prompt is used. | ✅ Implemented. |
| **prompt_cache_key** | Sent for Venice as `conversationId` for multi-turn cache routing. | ✅ Implemented. |
| **Response headers** (CF-RAY) | Venice: `CF-RAY` is logged to console for support. Balance/rate limits not surfaced in UI. | ✅ CF-RAY logged; balance/limits optional. |
| **Token usage** | Same as Inception: `data.usage` accumulated and stored; header shows session + all-time. | ✅ Venice returns OpenAI-compatible `usage`; monitoring identical. |
| **Error handling** | Uses generic `data.error?.message \|\| data.error`; Inception-style status map used for both backends. | ✅ Adequate; Venice errors are typically in same shape. |
| **Test connection** | `POST /api/chat/test` → minimal completion to current provider (Inception or Venice). | ✅ Matches doc “minimal request” idea. |

**Summary:** The app uses the Venice API in an OpenAI-compatible way (URL, auth, model, messages, tools), sends `venice_parameters` and `prompt_cache_key` for Venice, logs `CF-RAY` for support, and tracks token usage the same as Inception.

---

*Request fields not listed here may be passed through but are not validated or guaranteed by Venice. See the [official API spec](https://docs.venice.ai/api-reference/api-spec) and [Swagger](https://api.venice.ai/doc/api/swagger.yaml) for the full definition.*
