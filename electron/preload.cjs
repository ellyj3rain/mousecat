/* ============================================================================
   Preload — exposes the minimal, read-only pb-core bridge to the renderer over a
   contextIsolated boundary. The renderer reaches pb-core ONLY through these calls
   (DR-006). No Node, no fs, no arbitrary IPC is exposed.
   ============================================================================ */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mmc", {
  workspace: () => ipcRenderer.invoke("mmc:workspace"),
  fetchStatus: () => ipcRenderer.invoke("mmc:fetchStatus"),
  subscribeStatus: (cb) => {
    const listener = (_e, doc) => cb(doc);
    ipcRenderer.on("mmc:status", listener);
    return () => ipcRenderer.removeListener("mmc:status", listener);
  },
  subscribeConn: (cb) => {
    const listener = (_e, ev) => cb(ev);
    ipcRenderer.on("mmc:conn", listener);
    return () => ipcRenderer.removeListener("mmc:conn", listener);
  },
  platform: process.platform,
  // the gated engine (acting half + deep reads), hosted in main
  engine: {
    state: (p) => ipcRenderer.invoke("mmc:engine:state", p),
    history: (p) => ipcRenderer.invoke("mmc:engine:history", p),
    diff: (p, file) => ipcRenderer.invoke("mmc:engine:diff", p, file),
    plan: (action, p, opts) => ipcRenderer.invoke("mmc:engine:plan", action, p, opts),
    apply: (planId, approve) => ipcRenderer.invoke("mmc:engine:apply", planId, approve),
    audit: () => ipcRenderer.invoke("mmc:engine:audit"),
    githubStatus: () => ipcRenderer.invoke("mmc:engine:github"),
    githubLogin: () => ipcRenderer.invoke("mmc:engine:github:login"),
    githubSwitch: (opts) => ipcRenderer.invoke("mmc:engine:github:switch", opts),
    githubLogout: (opts) => ipcRenderer.invoke("mmc:engine:github:logout", opts),
    models: () => ipcRenderer.invoke("mmc:engine:models"),
    attribution: () => ipcRenderer.invoke("mmc:engine:attribution"),
  },
});
