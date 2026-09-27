import readline from "node:readline";

import { MOUSECAT_TOOLS } from "../core/catalog.mjs";
import { loadConfig } from "../core/config.mjs";
import { packageVersion } from "../core/governance/version.mjs";
import { createMousecatRuntime } from "../core/runtime.mjs";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const MAX_STDIO_CANCELLATIONS = 256;

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message, data = undefined) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function textContent(value) {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

export async function handleJsonRpc(message, runtime, context = {}) {
  const id = message?.id ?? null;
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return error(id, -32600, "Invalid JSON-RPC request");
  }

  if (id === null || id === undefined) return null;

  if (message.method === "initialize") {
    if (!message.params || typeof message.params.protocolVersion !== "string") {
      return error(id, -32602, "initialize requires params.protocolVersion");
    }
    return result(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: { name: "mousecat", version: packageVersion() },
      capabilities: { tools: { listChanged: false } },
    });
  }

  if (context.initialized === false) return error(id, -32002, "Initialize Mousecat before calling tools");

  if (message.method === "tools/list") {
    return result(id, { tools: MOUSECAT_TOOLS });
  }

  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    if (typeof name !== "string") return error(id, -32602, "tools/call requires params.name");
    if (name === "mousecat.widget" && ["respond", "hold", "defer"].includes(args.action) && context.allowOperatorWrite !== true) {
      const toolResult = { schema: "mousecat.error/1", ok: false, code: "operator-write-required", action: args.action };
      return result(id, { content: textContent(toolResult), structuredContent: toolResult, isError: true });
    }
    try {
      const toolResult = await runtime.handleTool(name, args, context);
      const isError = toolResult?.schema === "mousecat.error/1" || toolResult?.ok === false || toolResult?.status === "unavailable";
      return result(id, {
        content: textContent(toolResult),
        structuredContent: toolResult,
        ...(isError ? { isError: true } : {}),
      });
    } catch (cause) {
      return error(id, -32000, cause?.message || "Mousecat tool call failed");
    }
  }

  return error(id, -32601, `Unknown method: ${message.method}`);
}

export async function startStdioServer(options = {}) {
  const config = options.config || await loadConfig(options.configPath);
  const runtime = options.runtime || createMousecatRuntime({ config });
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const controllers = new Map();
  const cancellations = new Set();
  const pending = new Set();
  let initialized = false;

  const writeResponse = (response) => {
    if (response) output.write(`${JSON.stringify(response)}\n`);
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify(error(null, -32700, "Parse error"))}\n`);
      continue;
    }
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      writeResponse(await handleJsonRpc(message, runtime, { initialized }));
      continue;
    }
    if (message.method === "initialize") {
      const response = await handleJsonRpc(message, runtime, { initialized });
      initialized = !response?.error;
      writeResponse(response);
      continue;
    }
    if (message.method === "notifications/cancelled") {
      const requestId = message.params?.requestId;
      const controller = controllers.get(requestId);
      if (controller) controller.abort();
      else if (requestId !== null && requestId !== undefined) {
        if (cancellations.size >= MAX_STDIO_CANCELLATIONS) cancellations.delete(cancellations.values().next().value);
        cancellations.add(requestId);
      }
      continue;
    }
    if (message.method === "notifications/initialized") continue;
    if (message.id === null || message.id === undefined) continue;
    const controller = new AbortController();
    controllers.set(message.id, controller);
    if (cancellations.delete(message.id)) controller.abort();
    const task = handleJsonRpc(message, runtime, { initialized, signal: controller.signal })
      .then(writeResponse)
      .finally(() => {
        controllers.delete(message.id);
        pending.delete(task);
      });
    pending.add(task);
  }
  await Promise.allSettled(pending);
}

export async function selfTest(options = {}) {
  const config = options.config || (options.configPath ? await loadConfig(options.configPath) : undefined);
  const runtime = options.runtime || createMousecatRuntime(config ? { config } : undefined);
  const initialized = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION } }, runtime);
  const listed = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, runtime, { initialized: true });
  const called = await handleJsonRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "mousecat.status", arguments: {} },
  }, runtime, { initialized: true });
  return {
    ok: initialized.result.serverInfo.name === "mousecat" && listed.result.tools.length > 0 && called.result.structuredContent.ok === true,
    initialized,
    toolCount: listed.result.tools.length,
    status: called.result.structuredContent,
  };
}
