"use strict";
const { createOperations } = require("./operations/index.cjs");
const { tools } = require("./operations/contract.cjs");
const VERSION = require("node:fs").readFileSync(require("node:path").join(__dirname, "../VERSION"), "utf8").trim();
const PROTOCOL = "2025-06-18";
const SUPPORTED = new Set([PROTOCOL, "2025-03-26", "2024-11-05"]);

function createHandler(operations = createOperations()) {
  let initialized = false;
  return async message => {
    const id = message && message.id;
    const error = (code, text) => ({ jsonrpc: "2.0", id: id == null ? null : id, error: { code, message: text } });
    if (!message || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") return error(-32600, "Invalid Request");
    if (id === undefined) return null;
    if (message.method === "initialize") {
      initialized = true;
      return { jsonrpc: "2.0", id, result: { protocolVersion: SUPPORTED.has(message.params?.protocolVersion) ? message.params.protocolVersion : PROTOCOL,
        capabilities: { tools: {}, resources: {} }, serverInfo: { name: "marshmallow-commons", title: "Mousecat", version: VERSION },
        instructions: "Read-only operational surface. Catalog bindings are declarations; observations have separate status. Mousecat actuation stays behind the operator gate. Source owners retain custody." } };
    }
    if (!initialized) return error(-32002, "Initialize first");
    const params = message.params || {};
    let result;
    try {
      if (message.method === "ping") result = {};
      else if (message.method === "tools/list") result = { tools };
      else if (message.method === "resources/list") {
        const doc = await operations.catalog();
        result = { resources: [ { uri: "mc://catalog", name: "Platform catalog", mimeType: "application/json" }, ...doc.objects.map(o => ({ uri: `mc://object/${o.id}`, name: o.label, mimeType: "application/json" })) ] };
      } else if (message.method === "resources/templates/list") result = { resourceTemplates: [] };
      else if (message.method === "resources/read") {
        const value = params.uri === "mc://catalog" ? await operations.catalog() : /^mc:\/\/object\/[a-z][a-z0-9-]{0,63}$/.test(params.uri || "") ? await operations.project(params.uri.slice("mc://object/".length)) : null;
        if (!value) return error(-32602, "Unknown resource");
        result = { contents: [{ uri: params.uri, mimeType: "application/json", text: JSON.stringify(value) }] };
      } else if (message.method === "tools/call") {
        const spec = tools.find(t => t.name === params.name);
        const args = params.arguments || {};
        if (!spec || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some(k => k !== "id" || params.name !== "mc_project") || (params.name === "mc_project" && (typeof args.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(args.id)))) return error(-32602, "Invalid tool or arguments");
        try {
          const value = params.name === "mc_catalog" ? await operations.catalog() : params.name === "mc_project" ? await operations.project(args.id) : params.name === "mc_services" ? await operations.services() : await operations.fleet();
          result = { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, isError: false };
        } catch { result = { content: [{ type: "text", text: "Observation unavailable; check catalog source and access." }], isError: true }; }
      } else return error(-32601, "Method not found");
    } catch { return error(-32603, "Observation unavailable; check catalog source and access."); }
    return { jsonrpc: "2.0", id, result };
  };
}

function start() {
  const handler = createHandler(); let pending = ""; let chain = Promise.resolve(); let queued = 0;
  const send = value => { if (value) process.stdout.write(JSON.stringify(value) + "\n"); };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => {
    pending += chunk;
    if (Buffer.byteLength(pending) > 128 * 1024) { process.stderr.write("MC input limit exceeded\n"); process.exitCode = 1; process.stdin.destroy(); return; }
    let end;
    while ((end = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      if (!line.trim()) continue;
      if (++queued > 64) { process.stderr.write("MC queue limit exceeded\n"); process.exit(1); }
      chain = chain.then(async () => { try { let message; try { message = JSON.parse(line); } catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; } send(await handler(message)); } finally { queued--; } });
    }
  });
  process.stdin.on("end", () => { if (pending.trim()) send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Incomplete message" } }); });
}
if (require.main === module) start();
module.exports = { createHandler, tools };
