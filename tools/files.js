/**
 * File tool: upload, read, write, list, download.
 * Files stored under data/files (sandboxed by conversation or global id).
 */

import { mkdir, readFile, writeFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FILES_DIR = process.env.DATA_DIR
  ? join(process.env.DATA_DIR, "files")
  : join(__dirname, "..", "data", "files");

async function ensureDir() {
  await mkdir(FILES_DIR, { recursive: true });
}

export async function fileWrite(filename, content) {
  await ensureDir();
  const id = randomUUID();
  const path = join(FILES_DIR, id);
  const data = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  await writeFile(path, data);
  const metaPath = path + ".meta.json";
  await writeFile(metaPath, JSON.stringify({ filename: filename || "file", id }));
  return { id, filename: filename || "file", size: data.length };
}

export async function fileRead(id) {
  await ensureDir();
  const path = join(FILES_DIR, id);
  const metaPath = path + ".meta.json";
  let filename = "file";
  try {
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    filename = meta.filename || "file";
  } catch {
    // no meta
  }
  const content = await readFile(path);
  return { id, filename, content: content.toString("base64"), size: content.length };
}

export async function fileList() {
  await ensureDir();
  const entries = await readdir(FILES_DIR, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.isFile() && !e.name.endsWith(".meta.json")) {
      const metaPath = join(FILES_DIR, e.name + ".meta.json");
      let filename = e.name;
      try {
        const meta = JSON.parse(await readFile(metaPath, "utf8"));
        filename = meta.filename || e.name;
      } catch {}
      const s = await stat(join(FILES_DIR, e.name));
      out.push({ id: e.name, filename, size: s.size });
    }
  }
  return out;
}

export function getFilePath(id) {
  return join(FILES_DIR, id);
}
