import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildNeoLiveSmokeReport } from "../scripts/neo-live-smoke.mjs";
import { createMockHttpMcpServer } from "../fixtures/mock-http-mcp-server.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MOCK_SERVER = join(REPO_ROOT, "fixtures", "mock-mcp-server.mjs");

function configWithLiveSmokeMockNeo() {
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
        env: {
          MOUSECAT_MOCK_MCP_LIVE_SMOKE: "1",
        },
        timeoutMs: 5000,
      },
    },
  };
}

function configWithLiveSmokeHttpMockNeo(url) {
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

test("neo live smoke reports sanitized connector readiness", async () => {
  const report = await buildNeoLiveSmokeReport(configWithLiveSmokeMockNeo(), { upstream: "neo" });
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, true);
  assert.equal(report.tools.required.crucible_classify_v1, true);
  assert.equal(report.tools.required.neo_intent_v1, true);
  assert.equal(report.tools.required.datastore_query_v1, true);
  assert.equal(report.resources.required.runtime_identity_v1, true);
  assert.equal(report.resources.required.runtime_capability_v1, true);
  assert.equal(report.resources.required.runtime_doctor_v1, true);
  assert.equal(report.runtime.identity.version, "5.4.6.0-alpha");
  assert.equal(report.runtime.identity.rev, "8108c30f124b2b74856e1fa931972f803935387d");
  assert.equal(report.runtime.doctor.groundingStatus, "grounded");
  assert.equal(report.runtime.doctor.worktreeKind, "deployed");
  assert.equal(report.runtime.doctor.failClosed, false);
  assert.equal(report.runtime.doctor.capabilityCounts.models, 40);
  assert.equal(report.route.invocationReady, true);
  assert.equal(report.invocation.forwarded, true);
  assert.equal(serialized.includes("SHOULD_NOT_LEAK"), false);
  assert.equal(serialized.includes("launcherPath"), false);
});

test("neo live smoke reports sanitized HTTP connector readiness", async () => {
  const server = await createMockHttpMcpServer({ liveSmoke: true });
  try {
    const report = await buildNeoLiveSmokeReport(configWithLiveSmokeHttpMockNeo(server.url), { upstream: "neo" });
    const serialized = JSON.stringify(report);

    assert.equal(report.ok, true);
    assert.equal(report.connector.transport, "http");
    assert.equal(report.connector.endpointConfigured, true);
    assert.equal(report.connector.tokenEnvConfigured, true);
    assert.equal(report.tools.required.crucible_classify_v1, true);
    assert.equal(report.tools.required.neo_intent_v1, true);
    assert.equal(report.tools.required.datastore_query_v1, true);
    assert.equal(report.resources.required.runtime_identity_v1, true);
    assert.equal(report.resources.required.runtime_capability_v1, true);
    assert.equal(report.resources.required.runtime_doctor_v1, true);
    assert.equal(report.runtime.identity.version, "6.1.2.3-alpha");
    assert.equal(report.runtime.doctor.groundingStatus, "grounded");
    assert.equal(report.route.invocationReady, true);
    assert.equal(report.invocation.forwarded, true);
    assert.equal(serialized.includes("SHOULD_NOT_LEAK"), false);
    assert.equal(serialized.includes("launcherPath"), false);
  } finally {
    await server.close();
  }
});
