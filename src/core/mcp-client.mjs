import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { packageVersion } from "./governance/version.mjs";
import readline from "node:readline";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const HTTP_MCP_TRANSPORTS = Object.freeze(["http", "streamable-http"]);
export const CANCELLATION_ACK_EXTENSION = "mousecat/cancellation-ack";
export const CANCELLATION_ACK_SCHEMA = "mousecat.mcp.cancellation-ack/1";
const CANCELLATION_STATUS_METHOD = "mousecat/cancellation/status";

function safeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
  };
}

function normalizeJsonRpcError(error, stderr) {
  const message = String(error?.message || "");
  const dataCode = typeof error?.data?.code === "string" ? error.data.code : null;
  const staleCode = dataCode === "MCP_RUNTIME_STALE" || message.includes("MCP_RUNTIME_STALE")
    ? "MCP_RUNTIME_STALE"
    : null;

  if (staleCode) {
    return {
      ok: false,
      code: "connector-runtime-stale",
      staleCode,
      restartRequired: true,
      message: "The upstream MCP runtime reported stale source. Restart that connector before retrying.",
      upstreamMessage: message || null,
      jsonrpcCode: error?.code ?? null,
      stderr: stderr.trim() || null,
    };
  }

  return {
    ok: false,
    code: "connector-jsonrpc-error",
    error,
    stderr: stderr.trim() || null,
  };
}

function connectorTransport(connector) {
  return connector?.transport || "stdio";
}

export function isHttpMcpTransport(transport) {
  return HTTP_MCP_TRANSPORTS.includes(transport);
}

function normalizeHttpMcpUrl(connector) {
  const raw = connector?.url || connector?.endpoint || connector?.baseUrl;
  if (!raw) return null;
  const normalized = String(raw).replace(/\/+$/u, "");
  return normalized.endsWith("/mcp") ? normalized : `${normalized}/mcp`;
}

function bearerToken(connector) {
  const tokenEnv = connector?.tokenEnv || connector?.bearerTokenEnv || connector?.auth?.tokenEnv;
  return tokenEnv ? process.env[tokenEnv] || null : null;
}

function compactHttpErrorBody(body) {
  if (!body || typeof body !== "object") return null;
  if (typeof body.error === "string") return { error: body.error };
  if (body.error && typeof body.error === "object") {
    return {
      error: {
        code: body.error.code ?? null,
        message: body.error.message || null,
      },
    };
  }
  return {
    code: body.code || null,
    message: body.message || null,
  };
}

function httpHeaders(connector, sessionId = null) {
  const headers = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": MCP_PROTOCOL_VERSION,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const token = bearerToken(connector);
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function invalidHttpResponse(reason, details = {}) {
  return { ok: false, code: "connector-invalid-response", reason, ...details };
}

function parseSseEvent(raw) {
  const data = raw
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function readSseResponse(response, expectedId) {
  if (!response.body?.getReader) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/u);
    buffer = events.pop() || "";
    for (const event of events) {
      const message = parseSseEvent(event);
      if (message?.id === expectedId) {
        await reader.cancel();
        return message;
      }
    }
    if (done) {
      const message = parseSseEvent(buffer);
      return message?.id === expectedId ? message : null;
    }
  }
}

async function readRequestResponse(response, expectedId) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/event-stream")) return readSseResponse(response, expectedId);
  if (!contentType.includes("application/json")) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchHttpJsonRpc(connector, endpoint, message, options = {}) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: httpHeaders(connector, options.sessionId),
      body: JSON.stringify(message),
      signal: options.signal,
    });
    const isNotification = message.id === undefined;

    if (!response.ok) {
      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      return {
        ok: false,
        code: "connector-http-error",
        status: response.status,
        message: body?.error?.message || body?.error || `HTTP ${response.status}`,
        body: compactHttpErrorBody(body),
      };
    }
    if (isNotification) {
      const text = await response.text();
      if (response.status !== 202 || text) {
        return invalidHttpResponse("notification-must-return-empty-202", { status: response.status });
      }
      return { ok: true, accepted: true, sessionId: options.sessionId || null };
    }

    if (response.status === 202 || response.status === 204) {
      return invalidHttpResponse("request-returned-notification-status", { status: response.status });
    }
    const body = await readRequestResponse(response, message.id);
    if (!body || body.jsonrpc !== "2.0" || body.id !== message.id) {
      return invalidHttpResponse("jsonrpc-response-correlation-failed", { status: response.status });
    }
    const hasResult = Object.hasOwn(body, "result");
    const hasError = Object.hasOwn(body, "error");
    if (hasResult === hasError) return invalidHttpResponse("jsonrpc-result-error-exclusivity-failed");
    if (body?.error) return normalizeJsonRpcError(body.error, "");
    return {
      ok: true,
      result: body?.result,
      sessionId: response.headers.get("mcp-session-id") || options.sessionId || null,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, code: "connector-local-abort", message: "The local MCP request was aborted." };
    }
    return {
      ok: false,
      code: "connector-http-failed",
      error: safeError(error),
    };
  }
}

async function postHttpJsonRpc(connector, endpoint, message, options = {}) {
  if (typeof fetch !== "function") {
    return {
      ok: false,
      code: "connector-http-unavailable",
      message: "This Node.js runtime does not provide fetch for HTTP MCP connectors.",
    };
  }

  const configuredTimeoutMs = Number(connector.timeoutMs || options.timeoutMs || 10000);
  const remainingMs = Number.isFinite(options.deadlineAt) ? options.deadlineAt - Date.now() : configuredTimeoutMs;
  if (remainingMs <= 0) {
    return {
      ok: false,
      code: "connector-timeout",
      message: "The MCP invocation deadline elapsed before the request could start.",
    };
  }
  const timeoutMs = Math.max(1, Math.min(configuredTimeoutMs, remainingMs));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await fetchHttpJsonRpc(connector, endpoint, message, {
      sessionId: options.sessionId,
      signal: controller.signal,
    });
    if (result.code === "connector-local-abort") {
      return {
        ok: false,
        code: "connector-timeout",
        message: `Timed out waiting for MCP response after ${timeoutMs}ms.`,
      };
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function boundedCancellationGrace(connector, options) {
  const raw = options.cancellationGraceMs ?? connector.cancellationGraceMs ?? 1000;
  return Number.isInteger(raw) ? Math.max(100, Math.min(raw, 5000)) : 1000;
}

function negotiatedCancellationCapability(capabilities) {
  const extension = capabilities?.experimental?.[CANCELLATION_ACK_EXTENSION];
  if (extension?.schema !== CANCELLATION_ACK_SCHEMA) return null;
  if (extension?.statusMethod !== CANCELLATION_STATUS_METHOD) return null;
  if (extension?.sideEffects !== "none") return null;
  return extension;
}

function cancellationStatusAcknowledged(result, requestId) {
  return result?.ok === true
    && result.result?.schema === CANCELLATION_ACK_SCHEMA
    && result.result?.requestId === requestId
    && result.result?.status === "cancelled"
    && result.result?.sideEffects === "none";
}

function raceWithin(promise, timeoutMs) {
  const marker = Symbol("timeout");
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(marker), Math.max(1, timeoutMs));
    }),
  ]).then((value) => {
    clearTimeout(timer);
    return { timedOut: value === marker, value: value === marker ? null : value };
  });
}

async function callHttpWithCancellation(connector, endpoint, method, params, options, session) {
  const requestId = randomUUID();
  const deadlineAt = Number.isFinite(options.deadlineAt)
    ? options.deadlineAt
    : Date.now() + Number(connector.timeoutMs || options.timeoutMs || 10000);
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    return {
      ok: false,
      code: "connector-timeout",
      message: "The MCP invocation deadline elapsed before the tool request could start.",
      cancellation: { requested: false, notificationAccepted: false, acknowledged: false },
      dispatchPhase: "not-dispatched",
    };
  }

  const controller = new AbortController();
  const callPromise = fetchHttpJsonRpc(connector, endpoint, {
    jsonrpc: "2.0",
    id: requestId,
    method,
    params,
  }, { sessionId: session.id, signal: controller.signal });
  const initial = await raceWithin(callPromise, remainingMs);
  if (!initial.timedOut) return { ...initial.value, dispatchPhase: "terminal-observed" };

  const requestedAt = new Date().toISOString();
  const graceMs = boundedCancellationGrace(connector, options);
  const graceDeadline = Date.now() + graceMs;
  const notification = await postHttpJsonRpc(connector, endpoint, {
    jsonrpc: "2.0",
    method: "notifications/cancelled",
    params: { requestId, reason: "deadline-exceeded" },
  }, { sessionId: session.id, deadlineAt: graceDeadline, timeoutMs: graceMs });
  const notificationAccepted = notification.ok === true;
  const capability = negotiatedCancellationCapability(session.capabilities);
  let status = null;
  if (notificationAccepted && capability && Date.now() < graceDeadline) {
    status = await postHttpJsonRpc(connector, endpoint, {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: capability.statusMethod,
      params: { requestId, waitMs: Math.max(1, graceDeadline - Date.now()) },
    }, { sessionId: session.id, deadlineAt: graceDeadline, timeoutMs: graceMs });
  }

  controller.abort();
  await callPromise;
  const acknowledged = cancellationStatusAcknowledged(status, requestId);
  if (acknowledged) {
    return {
      ok: false,
      code: "connector-cancelled",
      message: "The upstream cancellation extension confirmed terminal cancellation with no side effects.",
      cancellation: {
        requested: true,
        requestedAt,
        notificationAccepted,
        negotiated: true,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        requestId,
        reason: "deadline-exceeded",
        schema: CANCELLATION_ACK_SCHEMA,
        graceMs,
        graceExpiredAt: new Date(graceDeadline).toISOString(),
      },
      dispatchPhase: "terminal-observed",
    };
  }
  return {
    ok: false,
    code: "connector-timeout",
    message: "Timed out waiting for MCP response; cancellation remains an unknown upstream outcome.",
    cancellation: {
      requested: true,
      requestedAt,
      notificationAccepted,
      negotiated: Boolean(capability),
      acknowledged: false,
      requestId,
      reason: "deadline-exceeded",
      graceMs,
      graceExpiredAt: new Date(graceDeadline).toISOString(),
    },
    dispatchPhase: "request-sent",
  };
}

export async function callMcpHttp(connector, method, params = {}, options = {}) {
  const endpoint = normalizeHttpMcpUrl(connector);
  if (!endpoint) {
    return {
      ok: false,
      code: "connector-url-missing",
      message: "The connector has no HTTP MCP url or baseUrl configured.",
    };
  }

  const timeoutMs = Number(connector.timeoutMs || options.timeoutMs || 10000);
  const deadlineAt = Number.isFinite(options.deadlineAt) ? options.deadlineAt : Date.now() + timeoutMs;
  const initialize = await postHttpJsonRpc(connector, endpoint, {
    jsonrpc: "2.0",
    id: randomUUID(),
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        experimental: {
          [CANCELLATION_ACK_EXTENSION]: {
            schema: CANCELLATION_ACK_SCHEMA,
            statusMethod: CANCELLATION_STATUS_METHOD,
          },
        },
      },
      clientInfo: { name: "mousecat", version: packageVersion() },
    },
  }, { ...options, deadlineAt });
  if (!initialize.ok) return { ...initialize, dispatchPhase: "not-dispatched" };
  if (initialize.result?.protocolVersion !== MCP_PROTOCOL_VERSION) {
    return { ...invalidHttpResponse("unsupported-negotiated-protocol-version", {
      protocolVersion: initialize.result?.protocolVersion || null,
    }), dispatchPhase: "not-dispatched" };
  }
  const session = {
    id: initialize.sessionId,
    capabilities: initialize.result?.capabilities || {},
  };
  const initialized = await postHttpJsonRpc(connector, endpoint, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }, { ...options, sessionId: session.id, deadlineAt });
  if (!initialized.ok) return { ...initialized, dispatchPhase: "not-dispatched" };

  if (method === "tools/call") {
    return callHttpWithCancellation(connector, endpoint, method, params, { ...options, deadlineAt }, session);
  }
  return postHttpJsonRpc(connector, endpoint, {
    jsonrpc: "2.0",
    id: randomUUID(),
    method,
    params,
  }, { ...options, sessionId: session.id, deadlineAt });
}

export async function callMcpStdio(connector, method, params = {}, options = {}) {
  if (!connector?.command) {
    return {
      ok: false,
      code: "connector-command-missing",
      message: "The connector has no stdio command configured.",
    };
  }

  const timeoutMs = Number(connector.timeoutMs || options.timeoutMs || 10000);
  const child = spawn(connector.command, connector.args || [], {
    cwd: connector.cwd || process.cwd(),
    env: { ...process.env, ...(connector.env || {}) },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  let settled = false;
  const initializeId = randomUUID();
  const callId = randomUUID();
  let callDispatched = false;

  const cleanup = () => {
    settled = true;
    try {
      child.stdin.end();
    } catch {
      // best-effort shutdown
    }
    if (!child.killed) child.kill();
  };

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      resolve({
        ok: false,
        code: "connector-timeout",
        message: `Timed out waiting for MCP response after ${timeoutMs}ms.`,
        stderr: stderr.trim() || null,
        dispatchPhase: callDispatched ? "request-sent" : "not-dispatched",
      });
    }, timeoutMs);

    const finish = (value) => {
      if (settled) return;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };

    child.on("error", (error) => {
      finish({
        ok: false,
        code: "connector-spawn-failed",
        error: safeError(error),
        dispatchPhase: "not-dispatched",
      });
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("exit", (code) => {
      if (settled) return;
      finish({
        ok: false,
        code: "connector-exited",
        exitCode: code,
        stderr: stderr.trim() || null,
        dispatchPhase: callDispatched ? "request-sent" : "not-dispatched",
      });
    });

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id === initializeId) {
        if (message.error) {
          finish({ ...normalizeJsonRpcError(message.error, stderr), dispatchPhase: "not-dispatched" });
          return;
        }
        if (message.result?.protocolVersion !== MCP_PROTOCOL_VERSION) {
          finish({
            ...invalidHttpResponse("unsupported-negotiated-protocol-version", {
              protocolVersion: message.result?.protocolVersion || null,
            }),
            dispatchPhase: "not-dispatched",
          });
          return;
        }
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: callId, method, params })}\n`);
        callDispatched = true;
        return;
      }
      if (message.id !== callId) return;
      if (message.error) {
        finish({ ...normalizeJsonRpcError(message.error, stderr), dispatchPhase: "terminal-observed" });
        return;
      }
      finish({
        ok: true,
        result: message.result,
        stderr: stderr.trim() || null,
        dispatchPhase: "terminal-observed",
      });
    });

    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: initializeId,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "mousecat", version: packageVersion() },
      },
    })}\n`);
  });
}

export function callMcp(connector, method, params = {}, options = {}) {
  if (isHttpMcpTransport(connectorTransport(connector))) {
    return callMcpHttp(connector, method, params, options);
  }
  return callMcpStdio(connector, method, params, options);
}

export function listMcpTools(connector) {
  return callMcp(connector, "tools/list", {});
}

export function callMcpTool(connector, name, args = {}, options = {}) {
  return callMcp(connector, "tools/call", { name, arguments: args }, options);
}

export function listMcpResources(connector) {
  return callMcp(connector, "resources/list", {});
}

export function readMcpResource(connector, resource = {}) {
  return callMcp(connector, "resources/read", resource);
}
