import readline from "node:readline";

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function sendError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
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

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of rl) {
  if (!line.trim()) continue;
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send(message.id, {
      protocolVersion: "2025-03-26",
      serverInfo: { name: "mock-private-neo", version: "0.0.0-test" },
      capabilities: { tools: {}, resources: {} },
    });
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
      ],
    });
    continue;
  }
  if (message.method === "resources/read") {
    if (message.params?.name !== "mousecat_bridge_contract_v1" && message.params?.uri !== "neo://resources/mousecat_bridge_contract_v1") {
      sendError(message.id, -32004, "unknown resource");
      continue;
    }
    send(message.id, {
      contents: [
        {
          uri: "neo://resources/mousecat_bridge_contract_v1",
          mimeType: "application/json",
          text: JSON.stringify(bridgeContract),
        },
      ],
    });
    continue;
  }
  if (message.method === "tools/call") {
    send(message.id, {
      content: [{ type: "text", text: JSON.stringify({ echoed: message.params?.arguments?.text || "" }) }],
      structuredContent: { echoed: message.params?.arguments?.text || "" },
    });
    continue;
  }
  sendError(message.id, -32601, "unknown method");
}
