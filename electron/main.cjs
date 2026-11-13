/* ============================================================================
   Mousecat — Electron main process.

   The single trusted egress to pb-core (DR-006). The renderer NEVER touches the
   loopback port directly; Chromium webSecurity stays ON. Main performs the
   privileged HTTP fetch + SSE stream to http://127.0.0.1:7320 (main-process HTTP
   is not subject to browser CORS) and relays snapshots to the renderer over IPC.

   pb-core stays READ-ONLY: this process only ever GETs /v1/status and /v1/stream.
   The separate actuation engine is exposed through trusted IPC handlers below;
   previews and explicit approval retain their own effect boundary.
   ============================================================================ */
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const installation = require("./installation-check.cjs");
const installationCheck = installation.prepareInstallationCheck(app);
require("./installed-binding.cjs").loadInstalledBinding(app, { installationCheck: !!installationCheck });
if (process.platform === "win32") app.setAppUserModelId("app.marshmallow.commons");
const http = require("node:http");
const { assertTrustedIpcEvent } = require("./trusted-ipc.cjs");
const workspace = require("../service/workspace.cjs").createWorkspace();
const engine = require("../service/engine.cjs"); // the gated acting half + deep reads
const identity = require("../service/identity/model-identity.cjs"); // per-model identity + attribution
const { buildRegistry } = require("../service/identity/neo-adapter.cjs");

let _registry = null;
const modelRegistry = () => (_registry ||= buildRegistry({ neoPath: process.env.MC_NEO_PATH, manifestPath: process.env.MC_MODELS_MANIFEST }));

const PB_CORE_ORIGIN = process.env.MMC_PBCORE_ORIGIN || "http://127.0.0.1:7320";
const IS_DEV = process.env.MMC_DEV === "1";
const DEV_URL = "http://127.0.0.1:5173";
const APP_HTML_PATH = path.join(__dirname, "..", "dist", "index.html");

/** @type {BrowserWindow | null} */
let win = null;
/** @type {import('node:http').IncomingMessage | null} */
let streamRes = null;
let streamReq = null;
let reconnectTimer = null;
let stopped = false;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function trustedEngineHandler(handler) {
  return (event, ...args) => {
    assertTrustedIpcEvent(event, {
      webContents: win && !win.isDestroyed() ? win.webContents : null,
      isDev: IS_DEV,
      devUrl: DEV_URL,
      appHtmlPath: APP_HTML_PATH,
    });
    return handler(...args);
  };
}

// -- one-shot /v1/status (renderer asks via ipcMain.handle) -------------------
ipcMain.handle("mmc:workspace", () => workspace());
ipcMain.handle("mmc:fetchStatus", async () => {
  if (installationCheck) return { ok: false, error: "Installation observation has no live machine source" };
  try {
    const res = await fetch(PB_CORE_ORIGIN + "/v1/status", { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const doc = await res.json();
    return { ok: true, doc };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

// -- the gated engine, hosted in main and exposed over IPC (prod path) --------
// pb-core stays read-only; this is the separate acting half (DR-006/DR-008).
ipcMain.handle("mmc:engine:state", trustedEngineHandler((p) => engine.projectState(p)));
ipcMain.handle("mmc:engine:history", trustedEngineHandler((p) => engine.history(p)));
ipcMain.handle("mmc:engine:diff", trustedEngineHandler((p, file) => engine.diff(p, file || undefined)));
ipcMain.handle("mmc:engine:plan", trustedEngineHandler((action, p, opts) => engine.plan(action, p, opts || {})));
ipcMain.handle("mmc:engine:apply", trustedEngineHandler((planId, approve) => engine.apply(planId, { approve: approve === true })));
ipcMain.handle("mmc:engine:rollback", trustedEngineHandler(() => ({
  ok: false,
  retired: true,
  error: "Automatic rollback is retired. Recovery requires a new current-state preview and explicit approval.",
})));
ipcMain.handle("mmc:engine:audit", trustedEngineHandler(() => ({ entries: engine.readAudit() })));
ipcMain.handle("mmc:engine:github", trustedEngineHandler(() => engine.githubStatus()));
ipcMain.handle("mmc:engine:github:login", trustedEngineHandler(() => engine.githubLogin()));
ipcMain.handle("mmc:engine:github:switch", trustedEngineHandler((opts) => engine.githubSwitch(opts)));
ipcMain.handle("mmc:engine:github:logout", trustedEngineHandler((opts) => engine.githubLogout(opts)));
ipcMain.handle("mmc:engine:models", trustedEngineHandler(async () => { const reg = await modelRegistry(); return { sources: reg.sources, models: reg.list() }; }));
ipcMain.handle("mmc:engine:attribution", trustedEngineHandler(() => ({ entries: identity.readAttribution() })));

// -- persistent SSE /v1/stream, forwarded to the renderer ---------------------
function openStream() {
  if (stopped) return;
  closeStream();
  streamReq = http.get(
    PB_CORE_ORIGIN + "/v1/stream",
    { headers: { Accept: "text/event-stream" } },
    (res) => {
      streamRes = res;
      if (res.statusCode && res.statusCode >= 400) {
        send("mmc:conn", { open: false, error: "stream status " + res.statusCode });
        res.resume();
        scheduleReconnect();
        return;
      }
      send("mmc:conn", { open: true });
      res.setEncoding("utf8");
      let buf = "";
      res.on("data", (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const data = frame
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("\n");
          if (!data) continue;
          try {
            send("mmc:status", JSON.parse(data));
          } catch {
            /* ignore malformed frame */
          }
        }
      });
      res.on("end", () => {
        send("mmc:conn", { open: false, error: "stream ended" });
        scheduleReconnect();
      });
      res.on("error", (err) => {
        send("mmc:conn", { open: false, error: err.message });
        scheduleReconnect();
      });
    },
  );
  streamReq.on("error", (err) => {
    send("mmc:conn", { open: false, error: err.message });
    scheduleReconnect();
  });
}

function closeStream() {
  if (streamReq) {
    streamReq.destroy();
    streamReq = null;
  }
  if (streamRes) {
    streamRes.destroy();
    streamRes = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || stopped) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openStream();
  }, 4000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#000000",
    show: false,
    title: "Mousecat",
    icon: path.join(__dirname, "..", "public", "mousecat.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => { if (!installationCheck && win) win.showInactive(); });
  if (installationCheck) {
    win.webContents.on("console-message", (_event, level, message) => { if (level >= 3) installationCheck.errors.push(String(message)); });
    win.webContents.once("did-finish-load", () => installation.observeInstallation({ app, win, check: installationCheck, planStanding: require("../service/plan-standing.cjs") }));
  }

  // open external links in the OS browser, never in-app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (IS_DEV) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(APP_HTML_PATH);
  }

  if (!installationCheck) openStream();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopped = true;
  closeStream();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    stopped = false;
    createWindow();
  }
});
