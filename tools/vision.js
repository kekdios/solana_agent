/**
 * Vision tool: analyse an uploaded image via an external vision API.
 * Uses env VISION_API_URL + VISION_API_KEY if set (e.g. OpenAI-compatible
 * chat/completions with vision). If not set, returns a placeholder message.
 *
 * Flow: file_write (upload) → file_read (get base64) → analyze_image (send to API).
 */

import * as files from "./files.js";

function getVisionConfig(env) {
  const base = env.VISION_API_URL || process.env.VISION_API_URL;
  const key = env.VISION_API_KEY || process.env.VISION_API_KEY;
  return { base, key };
}

/**
 * Analyse an image by file_id (from file_write). Reads the file, sends
 * base64 to the vision API with an optional prompt, returns description/OCR/etc.
 *
 * @param {string} file_id – stored file id from file_write
 * @param {string} [prompt] – optional question (e.g. "What's in this image?", "Extract text")
 * @param {Object} [env={}] – optional overrides for VISION_API_URL / VISION_API_KEY
 * @returns {Promise<Object>} { ok, message?, analysis?, error? }
 */
export async function analyzeImage(file_id, prompt = "", env = {}) {
  const { base, key } = getVisionConfig(env);

  if (!base || !key) {
    return {
      ok: false,
      message:
        "Vision not configured. Set VISION_API_URL and VISION_API_KEY in .env (e.g. OpenAI chat/completions with vision).",
    };
  }

  let fileData;
  try {
    fileData = await files.fileRead(file_id);
  } catch (e) {
    return { ok: false, message: `Could not read file: ${e.message}` };
  }

  const b64 = fileData.content;
  const filename = fileData.filename || "image";
  const mime = filename.match(/\.(jpe?g|png|gif|webp)$/i)
    ? (filename.match(/\.png$/i) ? "image/png" : "image/jpeg")
    : "image/jpeg";

  const userPrompt = (prompt && String(prompt).trim()) || "Describe this image in detail. If there is text, include it (OCR).";
  const endpoint = base.replace(/\/$/, "") + "/chat/completions";

  const body = {
    model: process.env.VISION_MODEL || "gpt-4o-mini",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${b64}` },
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        message: data.error?.message || data.error || `Vision API error: ${res.status}`,
      };
    }

    const analysis = data.choices?.[0]?.message?.content?.trim();
    if (!analysis) {
      return { ok: false, message: "No analysis in response" };
    }

    return {
      ok: true,
      file_id,
      filename,
      analysis,
    };
  } catch (e) {
    return { ok: false, message: e.message || "Vision request failed" };
  }
}
