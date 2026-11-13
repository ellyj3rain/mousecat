/* ============================================================================
   Dev-only HTTP front for the gated engine. Lets the BROWSER dev origin reach the
   same engine the Electron main process exposes over IPC in the packaged app
   (DR-006 swappable transport). Bound to loopback only; the Vite dev server proxies
   /api/* here so the renderer talks same-origin. NOT shipped in the packaged app
   (there, electron/main.cjs hosts the engine over IPC).
   ============================================================================ */
"use strict";
const http = require("node:http");
const engine = require("./engine.cjs");
const workspace = require("./workspace.cjs").createWorkspace();
const identity = require("./identity/model-identity.cjs");
const { buildRegistry } = require("./identity/neo-adapter.cjs");

const PORT = Number(process.env.MC_ENGINE_PORT || 7330);

// The per-model identity registry, composed once from the configured sources
// (MC_NEO_PATH wires in the neo stack; MC_MODELS_MANIFEST a portable config).
let _registry = null;
function modelRegistry() {
  if (!_registry) _registry = buildRegistry({ neoPath: process.env.MC_NEO_PATH, manifestPath: process.env.MC_MODELS_MANIFEST });
  return _registry;
}

function send(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(json);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const authority = req.headers.host;
    const allowedAuthorities = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
    const hostHeaders = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === "host");
    if (hostHeaders.length !== 1 || typeof authority !== "string" || !allowedAuthorities.includes(authority.toLowerCase())) {
      return send(res, 403, { error: "forbidden host" });
    }

    // Vite forwards the browser's Origin while replacing Host with this engine's
    // authority. Apply the browser boundary to reads as well as mutations.
    const origin = req.headers.origin;
    const allowedOrigins = [
      "http://127.0.0.1:5173", "http://localhost:5173",
      "http://127.0.0.1:4173", "http://localhost:4173",
      ...allowedAuthorities.map((host) => `http://${host}`),
    ];
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      return send(res, 403, { error: "forbidden origin" });
    }
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (!allowedOrigins.includes(url.origin) || !allowedAuthorities.includes(url.host.toLowerCase()) || url.username || url.password) {
      return send(res, 403, { error: "forbidden target" });
    }
    const p = url.pathname;
    const q = url.searchParams;

    if (req.method === "GET" && p === "/api/workspace") return send(res, 200, await workspace());
    if (req.method === "GET" && p === "/api/health") return send(res, 200, { ok: true, producer: "mc-engine", dataDir: engine.DATA_DIR });
    if (req.method === "GET" && p === "/api/state") return send(res, 200, await engine.projectState(q.get("path")));
    if (req.method === "GET" && p === "/api/history") return send(res, 200, await engine.history(q.get("path")));
    if (req.method === "GET" && p === "/api/diff") return send(res, 200, await engine.diff(q.get("path"), q.get("file") || undefined));
    if (req.method === "GET" && p === "/api/audit") return send(res, 200, { entries: engine.readAudit() });
    if (req.method === "GET" && p === "/api/github") return send(res, 200, await engine.githubStatus());
    if (req.method === "GET" && p === "/api/models") { const reg = await modelRegistry(); return send(res, 200, { sources: reg.sources, models: reg.list() }); }
    if (req.method === "GET" && p === "/api/attribution") return send(res, 200, { entries: identity.readAttribution() });
    if (req.method === "POST" && p === "/api/github/login") return send(res, 200, await engine.githubLogin());
    if (req.method === "POST" && p === "/api/github/switch") { const b = await readBody(req); return send(res, 200, await engine.githubSwitch(b)); }
    if (req.method === "POST" && p === "/api/github/logout") { const b = await readBody(req); return send(res, 200, await engine.githubLogout(b)); }

    if (req.method === "POST" && p === "/api/plan") {
      const b = await readBody(req);
      return send(res, 200, await engine.plan(b.action, b.path, b.opts || {}));
    }
    if (req.method === "POST" && p === "/api/apply") {
      const b = await readBody(req);
      return send(res, 200, await engine.apply(b.planId, { approve: b.approve === true }));
    }
    if (req.method === "POST" && p === "/api/rollback") {
      return send(res, 410, {
        ok: false,
        retired: true,
        error: "Automatic rollback is retired. Recovery requires a new current-state preview and explicit approval.",
      });
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e && e.message ? e.message : String(e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mc-engine] gated engine dev server on http://127.0.0.1:${PORT} (data: ${engine.DATA_DIR})`);
});
