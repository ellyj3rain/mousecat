import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readMousecatBridgeContract } from "../src/core/bridge-contracts.mjs";
import { connectorSummary, discoverConnectorResources, discoverConnectorTools } from "../src/core/connectors.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";

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

test("connector summaries expose configuration posture without private tool schemas", () => {
  const summary = connectorSummary(configWithMockNeo(), "neo");

  assert.equal(summary.configured, true);
  assert.equal(summary.enabled, true);
  assert.equal(summary.kind, "external-mcp");
  assert.equal(summary.discovery, "dynamic-tools-list");
  assert.equal(summary.commandConfigured, true);
});

test("connector discovery reads tools from an external MCP endpoint", async () => {
  const discovered = await discoverConnectorTools(configWithMockNeo(), "neo");

  assert.equal(discovered.ok, true);
  assert.equal(discovered.tools.length, 1);
  assert.equal(discovered.tools[0].name, "neo.echo");
});

test("connector discovery reads public resources from an external MCP endpoint", async () => {
  const discovered = await discoverConnectorResources(configWithMockNeo(), "neo");

  assert.equal(discovered.ok, true);
  assert.equal(discovered.resources.length, 1);
  assert.equal(discovered.resources[0].name, "mousecat_bridge_contract_v1");
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
