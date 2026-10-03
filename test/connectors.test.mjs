import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readMousecatBridgeContract } from "../src/core/bridge-contracts.mjs";
import {
  connectorSummary,
  discoverConnectorResources,
  discoverConnectorTools,
  invokeConnectorTool,
} from "../src/core/connectors.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { createMockHttpMcpServer } from "../fixtures/mock-http-mcp-server.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MOCK_SERVER = join(REPO_ROOT, "fixtures", "mock-mcp-server.mjs");

function configWithMockNeo() {
  return {
    hostProfile: "test",
    credentials: { policy: "references-only" },
    upstreams: {
      neo: { enabled: true },
    },
    connectors: {
      neo: {
        enabled: true,
        kind: "external-mcp",
        transport: "stdio",
        command: process.execPath,
        args: [MOCK_SERVER],
        timeoutMs: 5000,
      },
    },
  };
}

function configWithStaleMockNeo() {
  const config = configWithMockNeo();
  config.connectors.neo.env = {
    ...(config.connectors.neo.env || {}),
    MOUSECAT_MOCK_MCP_STALE: "1",
  };
  return config;
}

function configWithHttpMockNeo(url) {
  return {
    hostProfile: "test",
    credentials: { policy: "references-only" },
    upstreams: {
      neo: { enabled: true },
    },
    connectors: {
      neo: {
        enabled: true,
        kind: "external-mcp",
        transport: "http",
        url,
        tokenEnv: "NEO_RUNTIME_TOKEN",
        timeoutMs: 5000,
      },
    },
  };
}

test("connector summaries expose configuration posture without private tool schemas", () => {
  const summary = connectorSummary(configWithMockNeo(), "neo");

  assert.equal(summary.configured, true);
  assert.equal(summary.enabled, true);
  assert.equal(summary.kind, "external-mcp");
  assert.equal(summary.discovery, "dynamic-tools-list");
  assert.equal(summary.commandConfigured, true);
});

test("connector summaries expose HTTP endpoint posture without token values", () => {
  const summary = connectorSummary(configWithHttpMockNeo("http://127.0.0.1:7473/mcp"), "neo");

  assert.equal(summary.configured, true);
  assert.equal(summary.enabled, true);
  assert.equal(summary.kind, "external-mcp");
  assert.equal(summary.transport, "http");
  assert.equal(summary.commandConfigured, false);
  assert.equal(summary.cancellationGraceMs, 1000);
  assert.equal(summary.cancellationHandshake, "notification-plus-negotiated-status");
  assert.equal(summary.endpointConfigured, true);
  assert.equal(summary.tokenEnvConfigured, true);
  assert.equal(JSON.stringify(summary).includes("Bearer"), false);
});

test("connector discovery reads tools from an external MCP endpoint", async () => {
  const discovered = await discoverConnectorTools(configWithMockNeo(), "neo");

  assert.equal(discovered.ok, true);
  assert.equal(discovered.tools.length, 1);
  assert.equal(discovered.tools[0].name, "neo.echo");
});

test("HTTP connector discovery reads tools from a Streamable HTTP MCP endpoint", async () => {
  const server = await createMockHttpMcpServer();
  try {
    const discovered = await discoverConnectorTools(configWithHttpMockNeo(server.url), "neo");

    assert.equal(discovered.ok, true);
    assert.equal(discovered.connector.transport, "http");
    assert.equal(discovered.tools.length, 1);
    assert.equal(discovered.tools[0].name, "neo.echo");
  } finally {
    await server.close();
  }
});

test("connector discovery reads public resources from an external MCP endpoint", async () => {
  const discovered = await discoverConnectorResources(configWithMockNeo(), "neo");

  assert.equal(discovered.ok, true);
  assert.equal(discovered.resources.length, 1);
  assert.equal(discovered.resources[0].name, "mousecat_bridge_contract_v1");
});

test("HTTP connector discovery reads public resources from a Streamable HTTP MCP endpoint", async () => {
  const server = await createMockHttpMcpServer();
  try {
    const discovered = await discoverConnectorResources(configWithHttpMockNeo(server.url), "neo");

    assert.equal(discovered.ok, true);
    assert.equal(discovered.connector.transport, "http");
    assert.equal(discovered.resources.length, 1);
    assert.equal(discovered.resources[0].name, "mousecat_bridge_contract_v1");
  } finally {
    await server.close();
  }
});

test("bridge contract summaries preserve public routes and withhold private surfaces", async () => {
  const bridge = await readMousecatBridgeContract(configWithMockNeo(), "neo");

  assert.equal(bridge.ok, true);
  assert.equal(bridge.summary.contractSchema, "neo.mcp.mousecat-bridge-contract/1");
  assert.equal(bridge.summary.server.staleCode, "MCP_RUNTIME_STALE");
  assert.ok(bridge.summary.skillRoutes.some((route) => route.id === "crucible"));
  assert.ok(bridge.summary.withheld.includes("operator-memory"));
  assert.equal(JSON.stringify(bridge.summary).includes("inputSchema"), false);
});

test("HTTP bridge contract summaries preserve public routes and withhold private surfaces", async () => {
  const server = await createMockHttpMcpServer();
  try {
    const bridge = await readMousecatBridgeContract(configWithHttpMockNeo(server.url), "neo");

    assert.equal(bridge.ok, true);
    assert.equal(bridge.summary.contractSchema, "neo.mcp.mousecat-bridge-contract/1");
    assert.equal(bridge.summary.server.transport, "http");
    assert.ok(bridge.summary.skillRoutes.some((route) => route.id === "crucible"));
    assert.ok(bridge.summary.withheld.includes("operator-memory"));
    assert.equal(JSON.stringify(bridge.summary).includes("inputSchema"), false);
  } finally {
    await server.close();
  }
});

test("mousecat.bridge reads a configured upstream bridge contract", async () => {
  const runtime = createMousecatRuntime({ config: configWithMockNeo() });
  const bridge = await runtime.handleTool("mousecat.bridge", { upstream: "neo" });

  assert.equal(bridge.ok, true);
  assert.equal(bridge.summary.upstream, "neo");
  assert.deepEqual(bridge.summary.boundaries, ["operator-elicitation"]);
});

test("mousecat.invoke forwards permitted calls to a configured external MCP connector", async () => {
  const runtime = createMousecatRuntime({ config: configWithMockNeo() });
  const route = runtime.handleTool("mousecat.route", { upstream: "neo", capability: "neo.echo" });
  const invoked = await runtime.handleTool("mousecat.invoke", {
    upstream: "neo",
    capability: "neo.echo",
    payload: { text: "hello" },
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(route.plan.connector.configured, true);
  assert.equal(route.plan.invocationReady, true);
  assert.equal(invoked.ok, true);
  assert.equal(invoked.code, "connector-forwarded");
  assert.deepEqual(invoked.result.structuredContent, { echoed: "hello" });
});

test("mousecat.invoke forwards permitted calls through a configured HTTP MCP connector", async () => {
  const server = await createMockHttpMcpServer();
  try {
    const runtime = createMousecatRuntime({ config: configWithHttpMockNeo(server.url) });
    const route = runtime.handleTool("mousecat.route", { upstream: "neo", capability: "neo.echo" });
    const invoked = await runtime.handleTool("mousecat.invoke", {
      upstream: "neo",
      capability: "neo.echo",
      payload: { text: "hello" },
      permit: { profileId: "tool-invocation" },
    });

    assert.equal(route.plan.connector.configured, true);
    assert.equal(route.plan.connector.transport, "http");
    assert.equal(route.plan.invocationReady, true);
    assert.equal(invoked.ok, true);
    assert.equal(invoked.code, "connector-forwarded");
    assert.deepEqual(invoked.result.structuredContent, { echoed: "hello" });
    assert.equal(server.initializedSessions.has("mock-session-1"), true);
  } finally {
    await server.close();
  }
});

test("HTTP connector applies one absolute deadline across initialize and tool call", async () => {
  const server = await createMockHttpMcpServer({ initializeDelayMs: 5, toolDelayMs: 60 });
  try {
    const invoked = await invokeConnectorTool(
      configWithHttpMockNeo(server.url),
      "neo",
      "neo.echo",
      { text: "deadline" },
      { timeoutMs: 30, cancellationGraceMs: 100 },
    );

    assert.equal(invoked.ok, false);
    assert.equal(invoked.code, "connector-timeout");
    assert.equal(invoked.cancellation.requested, true);
    assert.equal(invoked.cancellation.notificationAccepted, true);
    assert.equal(invoked.cancellation.acknowledged, false);
  } finally {
    await server.close();
  }
});

test("HTTP connector reports initialization timeout as pre-dispatch", async () => {
  const server = await createMockHttpMcpServer({ initializeDelayMs: 60 });
  try {
    const invoked = await invokeConnectorTool(
      configWithHttpMockNeo(server.url),
      "neo",
      "neo.echo",
      { text: "not-dispatched" },
      { timeoutMs: 30, cancellationGraceMs: 100 },
    );

    assert.equal(invoked.ok, false);
    assert.equal(invoked.code, "connector-timeout");
    assert.equal(invoked.dispatchPhase, "not-dispatched");
    assert.equal(invoked.cancellation, undefined);
    assert.equal(server.cancellations.length, 0);
  } finally {
    await server.close();
  }
});

test("HTTP connector uses the negotiated cancellation status extension", async () => {
  const server = await createMockHttpMcpServer({ holdToolCall: true, cancellationMode: "acknowledge" });
  try {
    const invoked = await invokeConnectorTool(
      configWithHttpMockNeo(server.url),
      "neo",
      "neo.echo",
      { text: "cancel" },
      { timeoutMs: 25, cancellationGraceMs: 100 },
    );

    assert.equal(invoked.ok, false);
    assert.equal(invoked.code, "connector-cancelled");
    assert.equal(invoked.cancellation.requested, true);
    assert.equal(invoked.cancellation.notificationAccepted, true);
    assert.equal(invoked.cancellation.acknowledged, true);
    assert.equal(server.cancellations.length, 1);
    assert.deepEqual(server.cancellations[0], {
      requestId: invoked.cancellation.requestId,
      reason: "deadline-exceeded",
    });
    assert.match(invoked.cancellation.requestId, /^[0-9a-f-]{36}$/u);
    assert.equal(invoked.cancellation.negotiated, true);
    assert.equal(invoked.cancellation.schema, "mousecat.mcp.cancellation-ack/1");
  } finally {
    await server.close();
  }
});

test("HTTP connector does not treat notification acceptance as cancellation acknowledgement", async () => {
  const server = await createMockHttpMcpServer({ holdToolCall: true, cancellationMode: "accept-only" });
  try {
    const invoked = await invokeConnectorTool(
      configWithHttpMockNeo(server.url),
      "neo",
      "neo.echo",
      { text: "cancel" },
      { timeoutMs: 25, cancellationGraceMs: 100 },
    );

    assert.equal(invoked.ok, false);
    assert.equal(invoked.code, "connector-timeout");
    assert.equal(invoked.cancellation.requested, true);
    assert.equal(invoked.cancellation.notificationAccepted, true);
    assert.equal(invoked.cancellation.acknowledged, false);
    assert.equal(server.cancellations.length, 1);
  } finally {
    await server.close();
  }
});

test("HTTP connector correlates concurrent cancellation to one unique request", async (t) => {
  const server = await createMockHttpMcpServer({ holdToolCall: true, cancellationMode: "acknowledge" });
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;
  const requestIds = new Map();
  t.mock.method(globalThis, "fetch", (url, options) => {
    const message = JSON.parse(options.body);
    if (message.method === "tools/call") requestIds.set(message.params.arguments.text, message.id);
    return realFetch(url, options);
  });
  // This case tests correlation after dispatch. Initialization deadlines have
  // their own cases; advance this clock only once both real requests are held.
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  const firstPromise = invokeConnectorTool(
    configWithHttpMockNeo(server.url),
    "neo",
    "neo.echo",
    { text: "first" },
    { timeoutMs: 30, cancellationGraceMs: 100 },
  );
  const secondPromise = invokeConnectorTool(
    configWithHttpMockNeo(server.url),
    "neo",
    "neo.echo",
    { text: "second" },
    { timeoutMs: 500, cancellationGraceMs: 100 },
  );
  try {
    const started = performance.now();
    while (server.pendingRequestIds.length !== 2) {
      t.mock.timers.tick(0);
      assert.ok(performance.now() - started < 5000, "both concurrent tool requests must reach the fixture");
      await new Promise((resolve) => realSetTimeout(resolve, 5));
    }
    const firstRequestId = requestIds.get("first");
    const secondRequestId = requestIds.get("second");
    assert.match(firstRequestId, /^[0-9a-f-]{36}$/u);
    assert.match(secondRequestId, /^[0-9a-f-]{36}$/u);
    assert.notEqual(firstRequestId, secondRequestId);
    assert.deepEqual(new Set(server.pendingRequestIds), new Set([firstRequestId, secondRequestId]));

    t.mock.timers.tick(30);
    const first = await firstPromise;
    assert.equal(first.code, "connector-cancelled");
    assert.equal(first.cancellation.acknowledged, true);
    assert.equal(first.cancellation.requestId, firstRequestId);
    assert.deepEqual(server.cancellations, [{ requestId: firstRequestId, reason: "deadline-exceeded" }]);
    assert.ok(server.pendingRequestIds.includes(secondRequestId));
    assert.equal(server.complete(secondRequestId, { echoed: "second" }), true);
    const second = await secondPromise;

    assert.equal(second.ok, true);
    assert.deepEqual(second.result.structuredContent, { echoed: "second" });
  } finally {
    t.mock.timers.runAll();
    for (const requestId of server.pendingRequestIds) server.complete(requestId);
    await Promise.allSettled([firstPromise, secondPromise]);
    t.mock.timers.reset();
    t.mock.restoreAll();
    await server.close();
  }
});

test("Streamable HTTP connector consumes a correlated SSE tool response", async () => {
  const server = await createMockHttpMcpServer({ sseToolResponses: true });
  try {
    const invoked = await invokeConnectorTool(
      configWithHttpMockNeo(server.url),
      "neo",
      "neo.echo",
      { text: "sse" },
    );
    assert.equal(invoked.ok, true);
    assert.deepEqual(invoked.result.structuredContent, { echoed: "sse" });
  } finally {
    await server.close();
  }
});

test("HTTP connector rejects empty notification status and mismatched response identity for requests", async () => {
  for (const invalidToolResponse of ["empty-202", "wrong-id"]) {
    const server = await createMockHttpMcpServer({ invalidToolResponse });
    try {
      const invoked = await invokeConnectorTool(
        configWithHttpMockNeo(server.url),
        "neo",
        "neo.echo",
        { text: invalidToolResponse },
      );
      assert.equal(invoked.ok, false);
      assert.equal(invoked.code, "connector-invalid-response");
    } finally {
      await server.close();
    }
  }
});

test("mousecat.invoke still requires a permit before connector forwarding", async () => {
  const runtime = createMousecatRuntime({ config: configWithMockNeo() });
  const blocked = await runtime.handleTool("mousecat.invoke", {
    upstream: "neo",
    capability: "neo.echo",
    payload: { text: "hello" },
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "permit-required");
});

test("stale upstream MCP runtime is a first-class connector boundary result", async () => {
  const discovered = await discoverConnectorTools(configWithStaleMockNeo(), "neo");

  assert.equal(discovered.ok, false);
  assert.equal(discovered.code, "connector-runtime-stale");
  assert.equal(discovered.staleCode, "MCP_RUNTIME_STALE");
  assert.equal(discovered.restartRequired, true);
  assert.equal(discovered.connector.upstream, "neo");
  assert.match(discovered.upstreamMessage, /MCP_RUNTIME_STALE/u);
  assert.equal(JSON.stringify(discovered).includes("inputSchema"), false);
});

test("stale upstream HTTP MCP runtime is a first-class connector boundary result", async () => {
  const server = await createMockHttpMcpServer({ stale: true });
  try {
    const discovered = await discoverConnectorTools(configWithHttpMockNeo(server.url), "neo");

    assert.equal(discovered.ok, false);
    assert.equal(discovered.code, "connector-runtime-stale");
    assert.equal(discovered.staleCode, "MCP_RUNTIME_STALE");
    assert.equal(discovered.restartRequired, true);
    assert.equal(discovered.connector.upstream, "neo");
    assert.equal(discovered.connector.transport, "http");
    assert.match(discovered.upstreamMessage, /MCP_RUNTIME_STALE/u);
    assert.equal(JSON.stringify(discovered).includes("inputSchema"), false);
  } finally {
    await server.close();
  }
});

test("mousecat.invoke surfaces stale Neo runtime after permit checks", async () => {
  const runtime = createMousecatRuntime({ config: configWithStaleMockNeo() });
  const invoked = await runtime.handleTool("mousecat.invoke", {
    upstream: "neo",
    capability: "neo.echo",
    payload: { text: "hello" },
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(invoked.ok, false);
  assert.equal(invoked.code, "connector-runtime-stale");
  assert.equal(invoked.restartRequired, true);
  assert.equal(invoked.staleCode, "MCP_RUNTIME_STALE");
  assert.match(invoked.upstreamMessage, /MCP_RUNTIME_STALE/u);
  assert.equal(invoked.connector.reason, "external-mcp-tool-call-ready");
});
