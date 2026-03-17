/**
 * Image generation tool: turn a text prompt into a raster image.
 * Uses env IMAGE_API_URL + IMAGE_API_KEY if set (e.g. Inception image endpoint),
 * otherwise returns a placeholder message.
 */

/**
 * Resolve base URL and API key; caller can pass env overrides for testing.
 * @param {Object} env – optional overrides for IMAGE_API_URL / IMAGE_API_KEY
 * @returns {{ base: string|undefined, key: string|undefined }}
 */
function getImageConfig(env) {
  const base = env.IMAGE_API_URL || process.env.IMAGE_API_URL;
  const key = env.IMAGE_API_KEY || process.env.IMAGE_API_KEY;
  return { base, key };
}

/**
 * Main entry point.
 *
 * @param {string} prompt – free-form description of the image you want.
 * @param {Object} [env={}] – optional overrides for IMAGE_API_URL / IMAGE_API_KEY.
 * @returns {Promise<Object>} { ok, message?, prompt?, url?, b64? }
 */
export async function generateImage(prompt, env = {}) {
  // -----------------------------------------------------------------
  // 1️⃣ Resolve configuration (URL + API key)
  // -----------------------------------------------------------------
  const { base, key } = getImageConfig(env);

  if (!base || !key) {
    return {
      ok: false,
      message:
        "Image generation not configured. Set IMAGE_API_URL and IMAGE_API_KEY in .env.",
    };
  }

  // -----------------------------------------------------------------
  // 2️⃣ Build the endpoint URL – strip trailing slash to avoid "//images/..."
  // -----------------------------------------------------------------
  const url = base.replace(/\/$/, "") + "/images/generations";

  // -----------------------------------------------------------------
  // 3️⃣ Payload for the image service (OpenAI-compatible shape).
  // -----------------------------------------------------------------
  const body = {
    prompt: String(prompt).trim(),
    n: 1,                // request a single image
    size: "1024x1024",   // default size – could be made configurable
  };

  // -----------------------------------------------------------------
  // 4️⃣ Perform the HTTP request with a generous timeout (60 s)
  // -----------------------------------------------------------------
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  // -----------------------------------------------------------------
  // 5️⃣ Parse JSON safely – if parsing fails we still get an empty object.
  // -----------------------------------------------------------------
  const data = await res.json().catch(() => ({}));

  // -----------------------------------------------------------------
  // 6️⃣ Error handling for non-2xx responses
  // -----------------------------------------------------------------
  if (!res.ok) {
    return {
      ok: false,
      message:
        data.error?.message ||
        data.error ||
        `Image API error: ${res.status}`,
    };
  }

  // -----------------------------------------------------------------
  // 7️⃣ Extract the image URL or base64 payload.
  //    The API may return either a public URL or an inline b64 string.
  // -----------------------------------------------------------------
  const imageUrl = data.data?.[0]?.url ?? data.data?.[0]?.b64_json;

  if (!imageUrl) {
    return { ok: false, message: "No image in response" };
  }

  // -----------------------------------------------------------------
  // 8️⃣ Return a tidy result object.
  //    b64 flag tells the caller whether url is a data-URI or remote link.
  // -----------------------------------------------------------------
  return {
    ok: true,
    prompt,
    url: imageUrl,
    b64: !!data.data?.[0]?.b64_json,
  };
}
