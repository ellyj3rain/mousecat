import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hostCommandPack } from "../core/catalog.mjs";
import { createMousecatRuntime } from "../core/runtime.mjs";
import { createNativeViews, parseNativeJson } from "../core/native-view.mjs";
import { handleJsonRpc } from "../mcp/server.mjs";
import { seedOperatorDemo } from "./demo.mjs";
export { seedOperatorDemo } from "./demo.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4317;
const DEFAULT_LIMIT = 50;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_MCP_SESSIONS = 128;
const MAX_MCP_CANCELLATIONS = 256;
const MCP_SESSION_TTL_MS = 30 * 60 * 1000;
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
const require = createRequire(import.meta.url);
const lucideEntry = require.resolve("lucide");
const lucideBrowserBundle = resolve(dirname(lucideEntry), "../umd/lucide.min.js");

const STATIC_FILES = new Map([
  ["/", { path: resolve(PUBLIC_DIR, "index.html"), type: "text/html; charset=utf-8" }],
  ["/index.html", { path: resolve(PUBLIC_DIR, "index.html"), type: "text/html; charset=utf-8" }],
  ["/operator.css", { path: resolve(PUBLIC_DIR, "operator.css"), type: "text/css; charset=utf-8" }],
  ["/operator.js", { path: resolve(PUBLIC_DIR, "operator.js"), type: "text/javascript; charset=utf-8" }],
  ["/operator-model.js", { path: resolve(PUBLIC_DIR, "operator-model.js"), type: "text/javascript; charset=utf-8" }],
  ["/native-view.js", { path: resolve(PUBLIC_DIR, "native-view.js"), type: "text/javascript; charset=utf-8" }],
  ["/native-window.js", { path: resolve(PUBLIC_DIR, "native-window.js"), type: "text/javascript; charset=utf-8" }],
  ["/native-feed.html", { path: resolve(PUBLIC_DIR, "native-feed.html"), type: "text/html; charset=utf-8" }],
  ["/native-view.css", { path: resolve(PUBLIC_DIR, "native-view.css"), type: "text/css; charset=utf-8" }],
  ["/project-model.js", { path: resolve(PUBLIC_DIR, "project-model.js"), type: "text/javascript; charset=utf-8" }],
  ["/project-view.js", { path: resolve(PUBLIC_DIR, "project-view.js"), type: "text/javascript; charset=utf-8" }],
  ["/history.js", { path: resolve(PUBLIC_DIR, "history.js"), type: "text/javascript; charset=utf-8" }],
  ["/history.css", { path: resolve(PUBLIC_DIR, "history.css"), type: "text/css; charset=utf-8" }],
  ["/appearance.css", { path: resolve(PUBLIC_DIR, "appearance.css"), type: "text/css; charset=utf-8" }],
  ["/appearance.js", { path: resolve(PUBLIC_DIR, "appearance.js"), type: "text/javascript; charset=utf-8" }],
  ["/vendor/lucide.js", { path: lucideBrowserBundle, type: "text/javascript; charset=utf-8" }],
]);

const SAFE_COMMAND_IDS = new Set(["respond", "hold", "defer"]);

function securityHeaders(contentType) {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  };
}

function sendJson(response, statusCode, value, extraHeaders = {}) {
  if (response.writableEnded) return;
  response.writeHead(statusCode, { ...securityHeaders("application/json; charset=utf-8"), ...extraHeaders });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendEmpty(response, statusCode, extraHeaders = {}) {
  response.writeHead(statusCode, { ...securityHeaders("text/plain; charset=utf-8"), ...extraHeaders });
  response.end();
}

function normalizeHostname(hostname) {
  return String(hostname || "").replace(/^\[|\]$/gu, "");
}

function isLoopbackHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function isLoopbackRemote(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function parseAuthority(authority) {
  if (!authority) return null;
  try {
    return new URL(`http://${authority}`);
  } catch {
    return null;
  }
}

function requestSecurityError(request) {
  if (!isLoopbackRemote(request.socket.remoteAddress)) return "loopback-client-required";
  const authority = parseAuthority(request.headers.host);
  if (!authority || !isLoopbackHostname(authority.hostname)) return "loopback-host-required";

  const origin = request.headers.origin;
  if (!origin) return null;
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "http:" || parsedOrigin.host !== request.headers.host || !isLoopbackHostname(parsedOrigin.hostname)) {
      return "same-origin-required";
    }
  } catch {
    return "same-origin-required";
  }
  return null;
}

function readJsonBody(request, maxBytes = MAX_BODY_BYTES, parser = JSON.parse) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        const error = new Error("request-body-too-large");
        error.code = "request-body-too-large";
        rejectBody(error);
        return;
      }
      try {
        const parsed = parser(Buffer.concat(chunks).toString("utf8") || "{}");
        resolveBody(parsed);
      } catch {
        const error = new Error("invalid-json");
        error.code = "invalid-json";
        rejectBody(error);
      }
    });
    request.on("error", rejectBody);
  });
}

function operatorRequestError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function materializeTemplate(value, values) {
  if (Array.isArray(value)) return value.map((entry) => materializeTemplate(entry, values));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, materializeTemplate(entry, values)]));
  }
  if (typeof value !== "string") return value;
  const placeholder = /^<([A-Za-z][A-Za-z0-9]*)>$/u.exec(value);
  if (!placeholder) return value;
  if (!Object.hasOwn(values, placeholder[1])) throw operatorRequestError(`missing-command-value-${placeholder[1]}`);
  return values[placeholder[1]];
}

function materializeCommand(commandId, values, profileId) {
  if (!SAFE_COMMAND_IDS.has(commandId)) throw operatorRequestError("command-not-allowed");
  if (!values || typeof values !== "object" || Array.isArray(values)) throw operatorRequestError("command-values-must-be-an-object");
  const template = hostCommandPack(profileId)[commandId]?.mcp;
  if (!template?.tool || !template.arguments) throw operatorRequestError("command-template-unavailable");
  return {
    tool: template.tool,
    arguments: materializeTemplate(template.arguments, values),
  };
}

function runtimeFailureCode(result) {
  if (!result || typeof result !== "object") return "runtime-action-empty";
  if (result.schema === "mousecat.error/1") return result.code || "runtime-action-rejected";
  if (result.ok === false) return result.code || result.error || "runtime-action-rejected";
  if (result.status === "unavailable") return result.reason || "runtime-action-unavailable";
  return null;
}

export async function operatorSnapshot(runtime, options = {}) {
  const [widget, runtimeStatus] = await Promise.all([
    runtime.handleTool("mousecat.widget", { action: "snapshot" }),
    runtime.handleTool("mousecat.status", {}),
  ]);
  const projectsList = runtime.handleTool("mousecat.projects", {
    action: "list",
    permit: { profileId: "operator-interaction" },
  });
  const projects = (projectsList.registered || []).map((surface) => {
    const described = runtime.handleTool("mousecat.projects", {
      action: "describe",
      surfaceId: surface.surfaceId,
      permit: { profileId: "operator-interaction" },
    });
    return described.ok
      ? { surface, page: described.page, threads: described.threads }
      : { surface, page: null, threads: { live: [], archived: [] } };
  });
  const operatorState = runtime.readOperatorState({ profileId: options.profileId, limit: options.limit || DEFAULT_LIMIT });
  const pendingInteractions = widget.interactions
    .filter((interaction) => interaction.items?.some((item) => ["open", "deferred"].includes(item.status)))
    .map((interaction, index) => ({ interaction, index }))
    .sort((left, right) => (
      String(right.interaction.updatedAt || right.interaction.createdAt || "")
        .localeCompare(String(left.interaction.updatedAt || left.interaction.createdAt || ""))
      || right.index - left.index
    ))
    .map(({ interaction }) => interaction);
  const registeredSkills = operatorState.visualizer?.namedSkills || [];
  const registeredFrameworks = (operatorState.visualizer?.skillFrameworks || [])
    .filter((candidate) => Array.isArray(candidate.skillRefs) && candidate.skillRefs.length > 0);
  const canonicalSkillRef = (value) => {
    const normalized = String(value || "").toLowerCase().replaceAll("_", "-");
    return registeredSkills.find((skill) => skill.id === normalized || skill.moduleRefs?.includes(normalized))?.id || null;
  };
  const activeSkillRef = canonicalSkillRef(pendingInteractions[0]?.skillRef);
  const framework = registeredFrameworks.find((candidate) => candidate.skillRefs?.includes(activeSkillRef))
    || registeredFrameworks.find((candidate) => candidate.id === "recursive-deliberation")
    || registeredFrameworks[0]
    || null;
  const records = operatorState.binding?.records || {};
  const openThreads = (records.queue || []).filter((item) => !["answered", "ratified"].includes(item.status));
  const interactionCounts = new Map();
  for (const interaction of records.interactions || []) {
    const skillRef = canonicalSkillRef(interaction.skillRef);
    if (!skillRef) continue;
    interactionCounts.set(skillRef, (interactionCounts.get(skillRef) || 0) + 1);
  }
  return {
    schema: "mousecat.operator-snapshot/2",
    capturedAt: new Date().toISOString(),
    surface: "summoned-widget",
    projects,
    projectGroups: projectsList.groups || [],
    status: {
      ok: runtimeStatus.ok === true,
      hostProfile: runtimeStatus.config?.hostProfile || null,
      adapterProfile: options.profileId || runtimeStatus.config?.adapterProfile || null,
    },
    widget: {
      schema: "mousecat.operator-widget.snapshot/1",
      interaction: pendingInteractions[0] || null,
      interactions: pendingInteractions,
      pendingItems: pendingInteractions.reduce(
        (count, interaction) => count + interaction.items.filter((item) => ["open", "deferred"].includes(item.status)).length,
        0,
      ),
    },
    controlPlane: {
      schema: "mousecat.control-plane.snapshot/1",
      activeFrameworkRef: framework?.id || null,
      frameworks: registeredFrameworks.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        purpose: candidate.purpose,
        skillRefs: candidate.skillRefs,
        routing: candidate.routing,
      })),
      framework: framework ? {
        id: framework.id,
        label: framework.label,
        purpose: framework.purpose,
        routing: framework.routing,
      } : null,
      skills: registeredSkills.map((skill) => ({
        ...skill,
        interactionCount: interactionCounts.get(skill.id) || 0,
        active: activeSkillRef === skill.id,
      })),
      sessions: (records.sessions || []).map((session) => ({
        id: session.id,
        startedAt: session.startedAt || null,
        updatedAt: session.updatedAt || session.startedAt || null,
        host: session.facts?.host || session.facts?.source || null,
        provider: session.facts?.provider || null,
        model: session.facts?.model || null,
        objective: session.facts?.objective || null,
        status: session.status || "registered",
      })),
      openThreads: openThreads.map((item) => ({
        id: item.id,
        sessionId: item.sessionId || null,
        shape: item.shape || "decision",
        prompt: item.prompt,
        status: item.status,
      })),
      pendingInteractions: pendingInteractions.map((interaction) => ({
        interactionId: interaction.interactionId,
        sessionId: interaction.sessionId || null,
        skillRef: interaction.skillRef || null,
        openItems: interaction.items.filter((item) => item.status === "open").length,
        totalItems: interaction.items.length,
      })),
    },
  };
}


async function serveStatic(pathname, response) {
  const asset = STATIC_FILES.get(pathname);
  if (!asset) return false;
  try {
    const body = await readFile(asset.path);
    response.writeHead(200, securityHeaders(asset.type));
    response.end(body);
  } catch {
    sendJson(response, 500, {
      schema: "mousecat.operator-error/1",
      ok: false,
      code: "operator-asset-unavailable",
    });
  }
  return true;
}

export function createOperatorRequestHandler(options = {}) {
  const runtime = options.runtime;
  if (!runtime?.handleTool) throw new TypeError("A Mousecat runtime is required.");
  const maxBodyBytes = options.maxBodyBytes || MAX_BODY_BYTES;
  const nativeViews = createNativeViews(options.nativeViews);
  const mcpSessions = new Map();

  function pruneMcpSessions(now = Date.now()) {
    for (const [sessionId, session] of mcpSessions) {
      if (now - session.lastSeenAt <= MCP_SESSION_TTL_MS) continue;
      for (const controller of session.controllers.values()) controller.abort();
      mcpSessions.delete(sessionId);
    }
  }

  function closeMcpSessions() {
    for (const session of mcpSessions.values()) {
      for (const controller of session.controllers.values()) controller.abort();
      session.controllers.clear();
      session.cancellations.clear();
    }
    mcpSessions.clear();
  }

  const handleOperatorRequest = async function handleOperatorRequest(request, response) {
    const securityError = requestSecurityError(request);
    if (securityError) {
      sendJson(response, 403, { schema: "mousecat.operator-error/1", ok: false, code: securityError });
      return;
    }

    let requestUrl;
    try {
      requestUrl = new URL(request.url || "/", `http://${request.headers.host}`);
    } catch {
      sendJson(response, 400, { schema: "mousecat.operator-error/1", ok: false, code: "invalid-request-target" });
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/favicon.ico") {
      sendEmpty(response, 204);
      return;
    }
    if (requestUrl.pathname === "/mcp") {
      pruneMcpSessions();
      if (request.method === "GET") {
        sendJson(response, 405, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "POST JSON-RPC to this endpoint" } }, { Allow: "POST, DELETE" });
        return;
      }
      const presentedSession = request.headers["mcp-session-id"];
      if (request.method === "DELETE") {
        const session = typeof presentedSession === "string" ? mcpSessions.get(presentedSession) : null;
        if (!session) {
          sendJson(response, 404, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unknown MCP session" } });
          return;
        }
        if (request.headers["mcp-protocol-version"] !== session.protocolVersion) {
          sendJson(response, 400, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "MCP-Protocol-Version must match the initialized session" } });
          return;
        }
        session.lastSeenAt = Date.now();
        for (const controller of session.controllers.values()) controller.abort();
        mcpSessions.delete(presentedSession);
        sendEmpty(response, 204);
        return;
      }
      if (request.method !== "POST") {
        sendJson(response, 405, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Method not allowed" } }, { Allow: "POST, DELETE" });
        return;
      }
      const mediaType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
      if (mediaType !== "application/json") {
        sendJson(response, 415, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "application/json required" } });
        return;
      }
      let payload;
      try {
        payload = await readJsonBody(request, maxBodyBytes);
      } catch (error) {
        const statusCode = error.code === "request-body-too-large" ? 413 : 400;
        sendJson(response, statusCode, { jsonrpc: "2.0", id: null, error: { code: -32700, message: error.code || "Invalid JSON" } });
        return;
      }
      const isInitialize = payload?.method === "initialize";
      let session = null;
      if (!isInitialize) {
        if (typeof presentedSession !== "string") {
          sendJson(response, 400, { jsonrpc: "2.0", id: payload?.id ?? null, error: { code: -32001, message: "Mcp-Session-Id required; initialize first" } });
          return;
        }
        session = mcpSessions.get(presentedSession);
        if (!session) {
          sendJson(response, 404, { jsonrpc: "2.0", id: payload?.id ?? null, error: { code: -32001, message: "Unknown MCP session; initialize again" } });
          return;
        }
        if (request.headers["mcp-protocol-version"] !== session.protocolVersion) {
          sendJson(response, 400, { jsonrpc: "2.0", id: payload?.id ?? null, error: { code: -32600, message: "MCP-Protocol-Version must match the initialized session" } });
          return;
        }
        session.lastSeenAt = Date.now();
      }
      if (payload?.method === "notifications/cancelled") {
        const requestId = payload.params?.requestId;
        const controller = session?.controllers.get(requestId);
        if (controller) controller.abort();
        else if (session && requestId !== null && requestId !== undefined) {
          if (session.cancellations.size >= MAX_MCP_CANCELLATIONS) session.cancellations.delete(session.cancellations.values().next().value);
          session.cancellations.add(requestId);
        }
        sendEmpty(response, 202);
        return;
      }
      const controller = session && payload?.id !== null && payload?.id !== undefined ? new AbortController() : null;
      const abortRequest = () => controller?.abort();
      const abortClosedResponse = () => {
        if (!response.writableEnded) controller?.abort();
      };
      if (controller) {
        session.controllers.set(payload.id, controller);
        if (session.cancellations.delete(payload.id) || request.aborted) controller.abort();
        request.once("aborted", abortRequest);
        response.once("close", abortClosedResponse);
      }
      let result;
      try {
        result = await handleJsonRpc(payload, runtime, { signal: controller?.signal });
      } finally {
        if (controller) {
          request.off("aborted", abortRequest);
          response.off("close", abortClosedResponse);
          session.controllers.delete(payload.id);
        }
      }
      if (result === null) {
        sendEmpty(response, 202);
        return;
      }
      const headers = {};
      if (isInitialize && !result.error) {
        if (mcpSessions.size >= MAX_MCP_SESSIONS) {
          sendJson(response, 429, { jsonrpc: "2.0", id: payload.id, error: { code: -32000, message: "MCP session capacity reached" } });
          return;
        }
        const sessionId = randomUUID();
        mcpSessions.set(sessionId, {
          protocolVersion: result.result.protocolVersion,
          controllers: new Map(),
          cancellations: new Set(),
          lastSeenAt: Date.now(),
        });
        headers["Mcp-Session-Id"] = sessionId;
      }
      sendJson(response, 200, result, headers);
      return;
    }
    if (requestUrl.pathname === "/api/native-views" || requestUrl.pathname.startsWith("/api/native-views/")) {
      try {
        if (request.method === "GET" && requestUrl.pathname === "/api/native-views") {
          sendJson(response, 200, { views: await nativeViews.list() });
          return;
        }
        const route = /^\/api\/native-views\/([a-z0-9-]+)\/(snapshot|image|command)$/u.exec(requestUrl.pathname);
        if (!route) throw operatorRequestError("native-route-unavailable");
        const [, id, action] = route;
        if (request.method === "GET" && action === "snapshot") {
          sendJson(response, 200, await nativeViews.snapshot(id));
          return;
        }
        if (request.method === "GET" && action === "image") {
          const bytes = await nativeViews.image(id, requestUrl.searchParams);
          response.writeHead(200, securityHeaders("image/png")); response.end(bytes);
          return;
        }
        if (request.method === "POST" && action === "command") {
          if (request.headers.origin !== `http://${request.headers.host}`) {
            sendJson(response, 403, { ok: false, code: "same-origin-required" }); return;
          }
          if (String(request.headers["content-type"]).split(";", 1)[0].trim() !== "application/json") {
            sendJson(response, 415, { ok: false, code: "application-json-required" }); return;
          }
          sendJson(response, 202, await nativeViews.command(id, await readJsonBody(request, 8192, parseNativeJson)));
          return;
        }
        sendJson(response, 405, { ok: false, code: "method-not-allowed" });
      } catch (error) {
        // Never echo local filesystem paths or arbitrary producer/error text.
        const code = /^(native-|invalid-native-|unsafe-native-|duplicate-native-|future-native-)/u.test(error.code || "") ? error.code : "native-view-unavailable";
        sendJson(response, 409, { ok: false, code });
      }
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/history") {
      const args = { action: "query", permit: { profileId: "observer" } };
      for (const key of ["ref", "revision", "query", "kind", "project", "standing", "from", "to"]) {
        if (requestUrl.searchParams.has(key)) args[key] = requestUrl.searchParams.get(key);
      }
      for (const key of ["offset", "limit"]) if (/^\d+$/u.test(requestUrl.searchParams.get(key) || "")) args[key] = Number(requestUrl.searchParams.get(key));
      const result = runtime.handleTool("mousecat.history", args);
      sendJson(response, result.ok ? 200 : 404, result);
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/snapshot") {
      const limitRaw = requestUrl.searchParams.get("limit");
      const limit = /^\d+$/u.test(limitRaw || "") ? Number(limitRaw) : undefined;
      const snapshot = await operatorSnapshot(runtime, {
        profileId: requestUrl.searchParams.get("profileId") || undefined,
        limit,
      });
      snapshot.nativeViews = await nativeViews.list().catch(() => []);
      sendJson(response, snapshot.status.ok === false ? 400 : 200, snapshot);
      return;
    }
    if (request.method === "POST" && requestUrl.pathname === "/api/command") {
      const mediaType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
      if (mediaType !== "application/json") {
        sendJson(response, 415, { schema: "mousecat.operator-error/1", ok: false, code: "application-json-required" });
        return;
      }
      let payload;
      try {
        payload = await readJsonBody(request, maxBodyBytes);
      } catch (error) {
        const statusCode = error.code === "request-body-too-large" ? 413 : 400;
        sendJson(response, statusCode, { schema: "mousecat.operator-error/1", ok: false, code: error.code || "invalid-request" });
        return;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        sendJson(response, 400, { schema: "mousecat.operator-error/1", ok: false, code: "request-must-be-an-object" });
        return;
      }
      let command;
      try {
        const profileId = payload.profileId || runtime.status().config.adapterProfile || "generic-mcp";
        command = materializeCommand(payload.commandId, payload.values || {}, profileId);
      } catch (error) {
        const statusCode = error.code === "command-not-allowed" ? 403 : 400;
        sendJson(response, statusCode, {
          schema: "mousecat.operator-error/1",
          ok: false,
          code: error.code || "invalid-command",
          commandId: payload.commandId || null,
        });
        return;
      }
      const result = await runtime.handleTool(command.tool, command.arguments);
      const snapshot = await operatorSnapshot(runtime, {
        profileId: payload.profileId || undefined,
        limit: payload.limit,
      });
      const failureCode = runtimeFailureCode(result);
      sendJson(response, failureCode ? 409 : 200, {
        schema: "mousecat.operator-action/1",
        ok: !failureCode,
        commandId: payload.commandId,
        ...(failureCode ? { code: failureCode } : {}),
        snapshot,
      });
      return;
    }
    if (request.method === "GET" && await serveStatic(requestUrl.pathname, response)) return;
    sendJson(response, 404, { schema: "mousecat.operator-error/1", ok: false, code: "not-found" });
  };
  handleOperatorRequest.closeMcpSessions = closeMcpSessions;
  return handleOperatorRequest;
}

export async function startOperatorServer(options = {}) {
  const host = normalizeHostname(options.host || DEFAULT_HOST);
  const port = options.port ?? DEFAULT_PORT;
  if (!isLoopbackHostname(host)) throw new Error("The Mousecat operator server is loopback-only.");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Operator port must be an integer from 0 through 65535.");
  const runtime = options.runtime || createMousecatRuntime({ config: options.config });
  const handler = createOperatorRequestHandler({ runtime, maxBodyBytes: options.maxBodyBytes, nativeViews: options.nativeViews || options.config?.nativeViews });
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch(() => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendJson(response, 500, { schema: "mousecat.operator-error/1", ok: false, code: "operator-request-failed" });
    });
  });
  server.keepAliveTimeout = 250;
  server.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  try {
    if (options.demo === true) seedOperatorDemo(runtime);
  } catch (error) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw error;
  }
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : port;
  const urlHost = host.includes(":") ? `[${host}]` : host;
  const url = `http://${urlHost}:${activePort}`;
  return {
    schema: "mousecat.operator-server/1",
    runtime,
    server,
    host,
    port: activePort,
    url,
    mcpUrl: `${url}/mcp`,
    async close() {
      handler.closeMcpSessions();
      if (!server.listening) return;
      await new Promise((resolveTurn) => setImmediate(resolveTurn));
      const closing = new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      await closing;
    },
  };
}

export async function selfTestOperatorServer(options = {}) {
  const runtime = createMousecatRuntime({ config: options.config });
  seedOperatorDemo(runtime);
  const app = await startOperatorServer({ runtime, port: 0 });
  try {
    const [pageResponse, snapshotResponse] = await Promise.all([
      fetch(`${app.url}/`),
      fetch(`${app.url}/api/snapshot`),
    ]);
    const page = await pageResponse.text();
    const snapshot = await snapshotResponse.json();
    const status = runtime.status();
    return {
      schema: "mousecat.operator-self-test/1",
      ok: pageResponse.ok && snapshotResponse.ok && page.includes("Mousecat") && snapshot.status?.ok === true,
      checks: {
        page: pageResponse.status,
        snapshot: snapshotResponse.status,
        interactions: status.counts.interactions,
        queueItems: status.counts.queueItems,
      },
    };
  } finally {
    await app.close();
  }
}
