import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf8"));

export default defineConfig({
  root: path.join(__dirname, "src/renderer"),
  plugins: [wasm(), topLevelAwait(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@assets": path.join(__dirname, "assets"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "3.0.1"),
  },
  build: {
    outDir: path.join(__dirname, "dist-renderer"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
      },
    },
  },
});
