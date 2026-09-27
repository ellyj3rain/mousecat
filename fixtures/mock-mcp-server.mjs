import readline from "node:readline";

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function sendError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

function sendStale(id) {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32075,
      message: "MCP_RUNTIME_STALE: upstream MCP server source changed after this process booted; restart before retrying.",
      data: { code: "MCP_RUNTIME_STALE" },
    },
  })}\n`);
}

const bridgeContract = {
  schema: "neo.mcp.mousecat-bridge-contract/1",
  schema_version: "1.0.0",
  consumer: "mousecat",
  role: "upstream-mcp-consumer",
  server: {
    name: "mock-private-neo",
    transport: "stdio",
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

const liveSmoke = process.env.MOUSECAT_MOCK_MCP_LIVE_SMOKE === "1";

const liveSmokeIdentity = {
  schema: "neo.runtime_identity/1",
  runtimeId: "neo.runtime",
  version: "5.4.6.0-alpha",
  source: {
    rev: "8108c30f124b2b74856e1fa931972f803935387d",
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
  version: "5.4.6.0-alpha",
  grounding: {
    status: "grounded",
    sourceRoot: "PRIVATE_NEO_SOURCE_ROOT_SHOULD_NOT_LEAK",
    branch: "main",
    head: "8108c30f124b2b74856e1fa931972f803935387d",
    worktreeKind: "deployed",
    failClosed: false,
    launcherPath: "PRIVATE_NEO_LAUNCHER_PATH_SHOULD_NOT_LEAK",
  },
  capabilityCounts: liveSmokeCapability.counts,
};

function liveSmokeTools() {
  return [
    {
      name: "crucible_classify_v1",
      description: "Test-only Neo Crucible classifier placeholder.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
      },
    },
    {
      name: "neo_intent_v1",
      description: "Test-only Neo intent router placeholder.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
      },
    },
    {
      name: "datastore_query_v1",
      description: "Test-only Neo datastore query placeholder.",
      inputSchema: {
        type: "object",
        additionalProperties: true,
      },
    },
  ];
}

function liveSmokeResources() {
  return [
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
  ];
}

function resourcePayload(name) {
  if (name === "mousecat_bridge_contract_v1" || name === "neo://resources/mousecat_bridge_contract_v1") return bridgeContract;
  if (!liveSmoke) return null;
  if (name === "runtime_identity_v1" || name === "neo://resources/runtime_identity_v1") return liveSmokeIdentity;
  if (name === "runtime_capability_v1" || name === "neo://resources/runtime_capability_v1") return liveSmokeCapability;
  if (name === "runtime_doctor_v1" || name === "neo://resources/runtime_doctor_v1") return liveSmokeDoctor;
  return null;
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let initialized = false;

for await (const line of rl) {
  if (!line.trim()) continue;
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send(message.id, {
      protocolVersion: "2025-06-18",
      serverInfo: { name: "mock-private-neo", version: "0.0.0-test" },
      capabilities: { tools: {}, resources: {} },
    });
    continue;
  }
  if (message.method === "notifications/initialized") {
    initialized = true;
    continue;
  }
  if (!initialized) {
    sendError(message.id, -32002, "server not initialized");
    continue;
  }
  if (process.env.MOUSECAT_MOCK_MCP_STALE === "1") {
    sendStale(message.id);
    continue;
  }
  if (message.method === "tools/list") {
    send(message.id, {
      tools: [
        {
          name: "neo.echo",
          description: "Test-only private Neo tool placeholder.",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            additionalProperties: true,
          },
        },
        ...(liveSmoke ? liveSmokeTools() : []),
      ],
    });
    continue;
  }
  if (message.method === "resources/list") {
    send(message.id, {
      resources: [
        {
          name: "mousecat_bridge_contract_v1",
          uri: "neo://resources/mousecat_bridge_contract_v1",
          description: "Public Mousecat bridge contract.",
          mimeType: "application/json",
          schema_version: "1.0.0",
        },
        ...(liveSmoke ? liveSmokeResources() : []),
      ],
    });
    continue;
  }
  if (message.method === "resources/read") {
    const payload = resourcePayload(message.params?.name || message.params?.uri);
    if (!payload) {
      sendError(message.id, -32004, "unknown resource");
      continue;
    }
    send(message.id, {
      contents: [
        {
          uri: message.params?.uri || `neo://resources/${message.params?.name}`,
          mimeType: "application/json",
          text: JSON.stringify(payload),
        },
      ],
    });
    continue;
  }
  if (message.method === "tools/call") {
    if (liveSmoke && message.params?.name === "crucible_classify_v1") {
      send(message.id, {
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
      });
      continue;
    }
    send(message.id, {
      content: [{ type: "text", text: JSON.stringify({ echoed: message.params?.arguments?.text || "" }) }],
      structuredContent: { echoed: message.params?.arguments?.text || "" },
    });
    continue;
  }
  sendError(message.id, -32601, "unknown method");
}
