import readline from "node:readline";

import { MOUSECAT_TOOLS } from "../core/catalog.mjs";
import { loadConfig } from "../core/config.mjs";
import { packageVersion } from "../core/governance/version.mjs";
import { createMousecatRuntime } from "../core/runtime.mjs";

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message, data = undefined) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function textContent(value) {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

export async function handleJsonRpc(message, runtime) {
  const id = message?.id ?? null;
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return error(id, -32600, "Invalid JSON-RPC request");
  }

  if (id === null || id === undefined) return null;

  if (message.method === "initialize") {
    return result(id, {
      protocolVersion: message.params?.protocolVersion || "2025-03-26",
      serverInfo: { name: "mousecat", version: packageVersion() },
      capabilities: { tools: {} },
    });
  }

  if (message.method === "tools/list") {
    return result(id, { tools: MOUSECAT_TOOLS });
  }

  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    if (typeof name !== "string") return error(id, -32602, "tools/call requires params.name");
    const toolResult = await runtime.handleTool(name, args);
    return result(id, { content: textContent(toolResult), structuredContent: toolResult });
  }

  return error(id, -32601, `Unknown method: ${message.method}`);
}

export async function startStdioServer(options = {}) {
  const config = options.config || await loadConfig(options.configPath);
  const runtime = options.runtime || createMousecatRuntime({ config });
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify(error(null, -32700, "Parse error"))}\n`);
      continue;
    }
    const response = await handleJsonRpc(message, runtime);
    if (response) output.write(`${JSON.stringify(response)}\n`);
  }
}

export async function selfTest(options = {}) {
  const config = options.config || (options.configPath ? await loadConfig(options.configPath) : undefined);
  const runtime = options.runtime || createMousecatRuntime(config ? { config } : undefined);
  const initialized = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, runtime);
  const listed = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, runtime);
  const called = await handleJsonRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "mousecat.status", arguments: {} },
  }, runtime);
  return {
    ok: initialized.result.serverInfo.name === "mousecat" && listed.result.tools.length > 0 && called.result.structuredContent.ok === true,
    initialized,
    toolCount: listed.result.tools.length,
    status: called.result.structuredContent,
  };
}
