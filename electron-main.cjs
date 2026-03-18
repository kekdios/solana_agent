/**
 * Electron main process: open BrowserWindow to local or remote server.
 * With DLLM_USE_LOCAL=1 (default), the HTTP server runs in-process (Method 2).
 */
const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const nativeImage = electron.nativeImage;
if (!app) {
  console.error("Solana Agent must be run with Electron (e.g. npm run electron or the packaged app). Do not run with: node electron-main.cjs");
  process.exit(1);
}
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const agentEngine = require("./src/main/agent-engine.cjs");
let autoUpdater;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch (_) {}

const USE_LOCAL = process.env.DLLM_USE_LOCAL !== "0" && (process.env.DLLM_USE_LOCAL === "1" || !process.env.DLLM_REMOTE_URL);
const LOAD_VITE = process.env.ELECTRON_LOAD_VITE === "1";
const REMOTE_URL = process.env.DLLM_REMOTE_URL || "http://152.42.168.173:3333";
const PORT = process.env.PORT || 3333;
const VITE_PORT = process.env.VITE_PORT || 5173;

let mainWindow = null;
/** @type { { server: import('http').Server } | null } */
let serverModule = null;

function getAppRoot() {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.join(__dirname);
}

function getIconImage() {
  const pngPath = path.join(__dirname, "build", "icon_dock.png");
  if (fs.existsSync(pngPath)) {
    const img = nativeImage.createFromPath(pngPath);
    if (!img.isEmpty()) return img;
  }
  return null;
}

function copyWorkspaceTemplate(userData, appRoot) {
  const srcWorkspace = path.join(appRoot, "workspace");
  const destWorkspace = path.join(userData, "workspace");
  if (!fs.existsSync(destWorkspace) && fs.existsSync(srcWorkspace)) {
    try {
      fs.mkdirSync(destWorkspace, { recursive: true });
      const entries = fs.readdirSync(srcWorkspace, { withFileTypes: true });
      for (const e of entries) {
        const src = path.join(srcWorkspace, e.name);
        const dest = path.join(destWorkspace, e.name);
        if (e.isDirectory()) {
          fs.mkdirSync(dest, { recursive: true });
          const sub = fs.readdirSync(src, { withFileTypes: true });
          for (const s of sub) {
            const sSrc = path.join(src, s.name);
            const sDest = path.join(dest, s.name);
            if (s.isFile()) fs.copyFileSync(sSrc, sDest);
          }
        } else {
          fs.copyFileSync(src, dest);
        }
      }
    } catch (err) {
      console.error("Copy workspace template failed:", err);
    }
  }
}

/**
 * Start the HTTP server in-process by loading server.js (ESM).
 * Sets env so server and db use userData paths, then dynamic-imports server.
 * @returns { Promise<{ server: import('http').Server } | null> }
 */
async function startInProcessServer(appRoot, userData, port) {
  const dataDir = path.join(userData, "data");
  const dbPath = path.join(dataDir, "solagent.db");
  const workspaceDir = path.join(userData, "workspace");

  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    console.error("Create data dir failed:", err);
  }
  copyWorkspaceTemplate(userData, appRoot);
  // No .env — config is from Settings (config table) only. .env is not used when shipped.

  process.env.PORT = String(port);
  process.env.DB_PATH = dbPath;
  process.env.WORKSPACE_DIR = workspaceDir;
  process.env.DATA_DIR = dataDir;
  process.env.HOST = process.env.HOST || "127.0.0.1";

  const serverPath = path.join(appRoot, "server.js");
  if (!fs.existsSync(serverPath)) {
    console.error("server.js not found at", serverPath);
    return null;
  }

  const mod = await import(pathToFileURL(serverPath).href);
  if (mod && mod.server) return mod;
  return null;
}

function createWindow(url, errorDetail) {
  const iconImg = getIconImage();
  const iconOpt = iconImg ? { icon: iconImg } : {};
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 1000,
    show: false,
    ...iconOpt,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    const msg = `Cannot reach server.\n\n${validatedURL || url}\n\n${errorDescription} (${errorCode})`;
    const extra = errorDetail ? "\n\n" + errorDetail : "";
    mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
      "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Solana Agent</title></head><body style='font:16px system-ui; padding:2rem; background:#0a1628; color:#e2e8f0; max-width:800px;'>" +
      "<h1>Connection failed</h1><pre style='white-space:pre-wrap;'>" + (msg + extra).replace(/</g, "&lt;") + "</pre></body></html>"
    ));
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.loadURL(url);
}

function showErrorPage(title, bodyHtml) {
  const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Solana Agent</title></head><body style='font:16px system-ui; padding:2rem; background:#0a1628; color:#e2e8f0; max-width:800px;'>" +
    "<h1>" + title.replace(/</g, "&lt;") + "</h1>" + bodyHtml + "</body></html>";
  createWindow("about:blank");
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  }
}

app.whenReady().then(async () => {
  try {
    const iconImg = getIconImage();
    if (iconImg && app.dock && app.dock.setIcon) {
      app.dock.setIcon(iconImg);
    }
  } catch (_) {}

  if (LOAD_VITE) {
    createWindow(`http://127.0.0.1:${VITE_PORT}`);
    return;
  }
  if (autoUpdater && app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
  if (USE_LOCAL) {
    const userData = app.getPath("userData");
    const appRoot = getAppRoot();
    try {
      serverModule = await startInProcessServer(appRoot, userData, PORT);
      if (!serverModule) {
        showErrorPage("Server not found", "<p>server.js is missing at " + (appRoot || "").replace(/</g, "&lt;") + ". Run from project root or rebuild with server files included.</p>");
        return;
      }
      createWindow(`http://127.0.0.1:${PORT}`);
      agentEngine.startAgentEngine(mainWindow, PORT, 30000);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      const stack = err && err.stack ? err.stack : "";
      console.error("In-process server failed to start:", err);
      showErrorPage(
        "Server failed to start",
        "<p>The HTTP server could not be loaded in the main process.</p>" +
        "<p><strong>Error:</strong> <code>" + message.replace(/</g, "&lt;") + "</code></p>" +
        (stack ? "<h2>Stack</h2><pre style='white-space:pre-wrap; font-size:12px;'>" + stack.replace(/</g, "&lt;") + "</pre>" : "")
      );
    }
  } else {
    createWindow(REMOTE_URL);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  agentEngine.stopAgentEngine();
  if (serverModule && serverModule.server) {
    try {
      serverModule.server.close();
    } catch (_) {}
    serverModule = null;
  }
});
