import http from "node:http";

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function sendSse(res, body) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(`event: message\ndata: ${JSON.stringify(body)}\n\n`);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : null;
}

const bridgeContract = {
  schema: "neo.mcp.mousecat-bridge-contract/1",
  schema_version: "1.0.0",
  consumer: "mousecat",
  role: "upstream-mcp-consumer",
  server: {
    name: "mock-private-neo-http",
    transport: "http",
    methods: ["initialize", "tools/list", "tools/call", "resources/list", "resources/read"],
    staleCode: "MCP_RUNTIME_STALE",
  },
  contract: {
    invocation: "mcp-tools-call-only",
    catalog: "mcp-list-methods",
    update: "restart-upstream-on-stale-code",
    permissionBoundary: "host-owned",
    auditBoundary: "consumer-owned",
  },
  publicSurface: {
    tools: [
      {
        name: "crucible_elicit_v1",
        schema_version: "1.0.0",
        boundary: "operator-elicitation",
        requiredActions: ["operator-interaction"],
      },
    ],
    resources: [
      {
        name: "mousecat_bridge_contract_v1",
        schema_version: "1.0.0",
      },
    ],
    prompts: [],
    skillButtons: [
      { id: "crucible", route: "crucible_elicit_v1" },
      { id: "mass-assault", route: "crucible_batch_route" },
    ],
    skillRoutes: [
      { id: "crucible", status: "available", tools: ["crucible_elicit_v1"] },
      { id: "mass-assault", status: "handoff-only", source: "crucible_batch_route" },
      { id: "total-recall", status: "external", owner: "mousecat-or-host" },
    ],
  },
  exportPolicy: {
    exported: ["public-schemas", "public-tool-names", "skill-routes", "stale-runtime-code"],
    withheld: ["private-neo-logic", "local-paths", "credentials", "operator-memory", "runtime-payloads", "run-traces"],
  },
};

const liveSmokeIdentity = {
  schema: "neo.runtime_identity/1",
  runtimeId: "neo.runtime",
  version: "6.1.2.3-alpha",
  source: {
    rev: "ae759259865c53d53cd9ddc90d38b1213505fff3",
    from: "build-stamp-file",
    sourceRoot: "PRIVATE_NEO_SOURCE_ROOT_SHOULD_NOT_LEAK",
    launcherPath: "PRIVATE_NEO_LAUNCHER_PATH_SHOULD_NOT_LEAK",
  },
};

const liveSmokeCapability = {
  schema: "neo.runtime_capability/1",
  counts: {
    providers: 11,
    models: 40,
    topologies: 34,
    roles: 31,
  },
};

const liveSmokeDoctor = {
  schema: "neo.runtime_doctor/1",
  status: "ok",
  version: "6.1.2.3-alpha",
  grounding: {
    status: "grounded",
    sourceRoot: "PRIVATE_NEO_SOURCE_ROOT_SHOULD_NOT_LEAK",
    branch: "main",
    head: "ae759259865c53d53cd9ddc90d38b1213505fff3",
    worktreeKind: "deployed",
    failClosed: false,
    launcherPath: "PRIVATE_NEO_LAUNCHER_PATH_SHOULD_NOT_LEAK",
  },
  capabilityCounts: liveSmokeCapability.counts,
};

function baseTools(liveSmoke) {
  return [
    {
      name: "neo.echo",
      description: "Test-only private Neo tool placeholder.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        additionalProperties: true,
      },
    },
    ...(liveSmoke
      ? [
        {
          name: "crucible_classify_v1",
          description: "Test-only Neo Crucible classifier placeholder.",
          inputSchema: { type: "object", additionalProperties: true },
        },
        {
          name: "neo_intent_v1",
          description: "Test-only Neo intent router placeholder.",
          inputSchema: { type: "object", additionalProperties: true },
        },
        {
          name: "datastore_query_v1",
          description: "Test-only Neo datastore query placeholder.",
          inputSchema: { type: "object", additionalProperties: true },
        },
      ]
      : []),
  ];
}

function baseResources(liveSmoke) {
  return [
    {
      name: "mousecat_bridge_contract_v1",
      uri: "neo://resources/mousecat_bridge_contract_v1",
      description: "Public Mousecat bridge contract.",
      mimeType: "application/json",
      schema_version: "1.0.0",
    },
    ...(liveSmoke
      ? [
        {
          name: "runtime_identity_v1",
          uri: "neo://resources/runtime_identity_v1",
          description: "Test-only runtime identity.",
          mimeType: "application/json",
          schema_version: "1.0.0",
        },
        {
          name: "runtime_capability_v1",
          uri: "neo://resources/runtime_capability_v1",
          description: "Test-only runtime capability counts.",
          mimeType: "application/json",
          schema_version: "1.0.0",
        },
        {
          name: "runtime_doctor_v1",
          uri: "neo://resources/runtime_doctor_v1",
          description: "Test-only runtime doctor.",
          mimeType: "application/json",
          schema_version: "1.0.0",
        },
      ]
      : []),
  ];
}

function resourcePayload(name) {
  if (name === "mousecat_bridge_contract_v1" || name === "neo://resources/mousecat_bridge_contract_v1") return bridgeContract;
  if (name === "runtime_identity_v1" || name === "neo://resources/runtime_identity_v1") return liveSmokeIdentity;
  if (name === "runtime_capability_v1" || name === "neo://resources/runtime_capability_v1") return liveSmokeCapability;
  if (name === "runtime_doctor_v1" || name === "neo://resources/runtime_doctor_v1") return liveSmokeDoctor;
  return null;
}

function staleError(id) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32075,
      message: "MCP_RUNTIME_STALE: upstream MCP server source changed after this process booted; restart before retrying.",
      data: { code: "MCP_RUNTIME_STALE" },
    },
  };
}

export async function createMockHttpMcpServer(options = {}) {
  const liveSmoke = options.liveSmoke === true;
  const stale = options.stale === true;
  const delayMs = Number.isInteger(options.delayMs) ? Math.max(0, options.delayMs) : 0;
  const initializeDelayMs = Number.isInteger(options.initializeDelayMs)
    ? Math.max(0, options.initializeDelayMs)
    : delayMs;
  const toolDelayMs = Number.isInteger(options.toolDelayMs) ? Math.max(0, options.toolDelayMs) : delayMs;
  const holdToolCall = options.holdToolCall === true;
  const cancellationMode = options.cancellationMode || "accept-only";
  const sseToolResponses = options.sseToolResponses === true;
  const invalidToolResponse = options.invalidToolResponse || null;
  const pendingCalls = new Map();
  const cancellations = [];
  const initializedSessions = new Set();
  const cancelledRequests = new Set();
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/mcp") {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    const message = await readJson(req);
    if (message?.method === "notifications/cancelled") {
      const requestId = message.params?.requestId;
      cancellations.push({ requestId, reason: message.params?.reason || null });
      if (pendingCalls.has(requestId) && cancellationMode === "acknowledge") cancelledRequests.add(requestId);
      res.writeHead(202);
      res.end();
      return;
    }
    const requestDelayMs = message?.method === "initialize"
      ? initializeDelayMs
      : message?.method === "notifications/initialized" ? 0 : toolDelayMs;
    if (requestDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
    if (message?.method === "initialize") {
      sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-06-18",
          serverInfo: { name: "mock-private-neo-http", version: "0.0.0-test" },
          capabilities: {
            tools: {},
            resources: {},
            ...(cancellationMode === "acknowledge" ? {
              experimental: {
                "mousecat/cancellation-ack": {
                  schema: "mousecat.mcp.cancellation-ack/1",
                  statusMethod: "mousecat/cancellation/status",
                  sideEffects: "none",
                },
              },
            } : {}),
          },
        },
      }, { "mcp-session-id": "mock-session-1" });
      return;
    }
    if (message?.method === "notifications/initialized") {
      initializedSessions.add(String(req.headers["mcp-session-id"] || ""));
      res.writeHead(202);
      res.end();
      return;
    }
    if (!initializedSessions.has(String(req.headers["mcp-session-id"] || ""))) {
      sendJson(res, 400, { error: "session not initialized" });
      return;
    }
    if (stale) {
      sendJson(res, 200, staleError(message?.id ?? null));
      return;
    }
    if (message?.method === "tools/list") {
      sendJson(res, 200, { jsonrpc: "2.0", id: message.id, result: { tools: baseTools(liveSmoke) } });
      return;
    }
    if (message?.method === "resources/list") {
      sendJson(res, 200, { jsonrpc: "2.0", id: message.id, result: { resources: baseResources(liveSmoke) } });
      return;
    }
    if (message?.method === "resources/read") {
      const payload = resourcePayload(message.params?.name || message.params?.uri);
      if (!payload) {
        sendJson(res, 200, { jsonrpc: "2.0", id: message.id, error: { code: -32004, message: "unknown resource" } });
        return;
      }
      sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          contents: [
            {
              uri: message.params?.uri || `neo://resources/${message.params?.name}`,
              mimeType: "application/json",
              text: JSON.stringify(payload),
            },
          ],
        },
      });
      return;
    }
    if (message?.method === "mousecat/cancellation/status") {
      const requestId = message.params?.requestId;
      const acknowledged = cancelledRequests.has(requestId);
      sendJson(res, 200, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          schema: "mousecat.mcp.cancellation-ack/1",
          requestId,
          status: acknowledged ? "cancelled" : "unknown",
          sideEffects: acknowledged ? "none" : "unknown",
        },
      });
      return;
    }
    if (message?.method === "tools/call") {
      if (holdToolCall) {
        pendingCalls.set(message.id, res);
        res.once("close", () => pendingCalls.delete(message.id));
        return;
      }
      if (liveSmoke && message.params?.name === "crucible_classify_v1") {
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [{
              type: "text",
              text: JSON.stringify({
                question: message.params?.arguments?.question || null,
                route: "skip",
                skip: "settled",
                reason: "already settled/ratified",
              }),
            }],
            structuredContent: {
              route: "skip",
              skip: "settled",
            },
          },
        });
        return;
      }
      if (invalidToolResponse === "empty-202") {
        res.writeHead(202);
        res.end();
        return;
      }
      const response = {
        jsonrpc: "2.0",
        id: invalidToolResponse === "wrong-id" ? "wrong-id" : message.id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ echoed: message.params?.arguments?.text || "" }) }],
          structuredContent: { echoed: message.params?.arguments?.text || "" },
        },
      };
      if (sseToolResponses) sendSse(res, response);
      else sendJson(res, 200, response);
      return;
    }

    sendJson(res, 200, { jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32601, message: "unknown method" } });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    cancellations,
    initializedSessions,
    get pendingRequestIds() {
      return [...pendingCalls.keys()];
    },
    complete(requestId, structuredContent = { echoed: "completed" }) {
      const pending = pendingCalls.get(requestId);
      if (!pending) return false;
      pendingCalls.delete(requestId);
      sendJson(pending, 200, {
        jsonrpc: "2.0",
        id: requestId,
        result: { content: [], structuredContent },
      });
      return true;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
