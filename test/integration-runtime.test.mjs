import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createIntegrationAdapterRegistry, defineIntegrationAdapter } from "mousecat/integration";
import { connectorSummary, discoverConnectorTools } from "../src/core/connectors.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "fixtures", "glab");
const SHA256 = createHash("sha256").update(readFileSync(FIXTURE)).digest("hex");

function successfulRunner(result, calls = []) {
  return async (executable, args, options) => {
    calls.push({ executable, args, options });
    return { code: 0, stdout: JSON.stringify(result), stderr: "" };
  };
}

function gitlabConfig() {
  return {
    hostProfile: "test",
    adapterProfile: "generic-mcp",
    credentials: { policy: "references-only" },
    upstreams: { gitlab: { enabled: true } },
    connectors: {
      gitlab: {
        enabled: true,
        kind: "integration-adapter",
        transport: "cli-json",
        adapter: "gitlab-v4",
        executablePath: FIXTURE,
        executableSha256: SHA256,
        defaultProject: "open-ground/mousecat",
        hostname: "gitlab.example.com",
      },
    },
  };
}

test("an injected provider registry composes through the public runtime", async () => {
  const adapter = defineIntegrationAdapter({
    id: "example-v1",
    label: "Example API",
    upstream: "example",
    transport: "cli-json",
    auth: "host-managed",
    executable: { name: "example", acceptedNames: ["glab"] },
    allowedEnvKeys: [],
    buildArguments: (_connector, request) => [request.path],
    capabilities: [{
      id: "example.record.get",
      label: "Example Record",
      description: "Read one record.",
      access: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      compile: () => ({ method: "GET", path: "records/1", fields: {} }),
    }],
    provenance: { source: "test-package", version: "1" },
  });
  const registry = createIntegrationAdapterRegistry([adapter]);
  const config = {
    hostProfile: "test",
    adapterProfile: "generic-mcp",
    credentials: { policy: "references-only" },
    upstreams: { example: { enabled: true } },
    connectors: { example: {
      enabled: true,
      kind: "integration-adapter",
      transport: "cli-json",
      adapter: "example-v1",
      executablePath: FIXTURE,
      executableSha256: SHA256,
    } },
  };
  const calls = [];
  const runtime = createMousecatRuntime({
    config,
    integrationRegistry: registry,
    integrationCommandRunner: successfulRunner({ id: 1 }, calls),
  });
  const route = runtime.handleTool("mousecat.route", { upstream: "example", capability: "example.record.get" });
  const listed = await runtime.handleTool("mousecat.invoke", {
    upstream: "example", capability: "tools/list", permit: { profileId: "tool-invocation" },
  });
  const invoked = await runtime.handleTool("mousecat.invoke", {
    upstream: "example", capability: "example.record.get", permit: { profileId: "tool-invocation" },
  });

  assert.equal(runtime.catalog().integrationAdapters.adapters[0].id, "example-v1");
  const upstream = runtime.status().upstreams.find((item) => item.id === "example");
  assert.deepEqual(upstream.capabilities, ["example.record.get"]);
  assert.equal(runtime.status().upstreams.some((item) => item.id === "gitlab"), false);
  assert.equal(route.plan.connector.capabilityKnown, true);
  assert.equal(route.plan.invocationReady, true);
  assert.equal(listed.result.tools[0].name, "example.record.get");
  assert.equal(invoked.result.result.id, 1);
  assert.equal(calls.length, 1);
});

test("GitLab connector discovery and route validation use the provider manifest", async () => {
  const config = gitlabConfig();
  const summary = connectorSummary(config, "gitlab");
  const relative = connectorSummary({
    ...config,
    connectors: { gitlab: { ...config.connectors.gitlab, executablePath: "glab" } },
  }, "gitlab");
  const malformedDigest = connectorSummary({
    ...config,
    connectors: { gitlab: { ...config.connectors.gitlab, executableSha256: "not-a-digest" } },
  }, "gitlab");
  const mislabeled = connectorSummary({
    ...config,
    connectors: { gitlab: { ...config.connectors.gitlab, kind: "external-mcp", transport: "stdio", command: "glab" } },
  }, "gitlab");
  const discovered = await discoverConnectorTools(config, "gitlab");
  const unknown = createMousecatRuntime({ config }).handleTool("mousecat.route", {
    upstream: "gitlab", capability: "gitlab.unknown.operation",
  });

  assert.equal(summary.configured, true);
  assert.equal(relative.configured, false);
  assert.equal(malformedDigest.configured, false);
  assert.equal(mislabeled.configured, false);
  assert.equal(mislabeled.configurationError, "integration-connector-binding-mismatch");
  assert.equal(summary.authMode, "host-managed");
  assert.ok(discovered.tools.some((tool) => tool.name === "gitlab.pipelines.list" && tool.annotations.readOnlyHint));
  assert.equal(unknown.plan.connector.reason, "integration-capability-unknown");
});

test("provider ownership cannot be reclassified by connector config", async () => {
  let calls = 0;
  const config = gitlabConfig();
  config.connectors.gitlab = {
    ...config.connectors.gitlab,
    kind: "external-mcp",
    transport: "stdio",
    command: "glab",
  };
  const runtime = createMousecatRuntime({
    config,
    connectorInvoker: async () => {
      calls += 1;
      return { ok: true, result: { unexpected: true } };
    },
  });

  const invoked = await runtime.handleTool("mousecat.invoke", {
    upstream: "gitlab",
    capability: "gitlab.user.get",
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(invoked.code, "integration-connector-binding-mismatch");
  assert.equal(calls, 0);
});

test("mousecat.invoke preserves the permit boundary for provider execution", async () => {
  const calls = [];
  const runtime = createMousecatRuntime({
    config: gitlabConfig(),
    integrationCommandRunner: successfulRunner({ id: 7, status: "success" }, calls),
  });
  const blocked = await runtime.handleTool("mousecat.invoke", {
    upstream: "gitlab", capability: "gitlab.pipelines.get", payload: { pipelineId: 7 },
  });
  const invoked = await runtime.handleTool("mousecat.invoke", {
    upstream: "gitlab",
    capability: "gitlab.pipelines.get",
    payload: { pipelineId: 7 },
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(blocked.code, "permit-required");
  assert.equal(invoked.result.result.status, "success");
  assert.equal(calls.length, 1);
});

test("provider writes still require central confirmation through mousecat.invoke", async () => {
  const calls = [];
  const runtime = createMousecatRuntime({
    config: gitlabConfig(),
    integrationCommandRunner: successfulRunner({ iid: 9 }, calls),
  });
  const result = await runtime.handleTool("mousecat.invoke", {
    upstream: "gitlab",
    capability: "gitlab.merge-requests.create",
    payload: { sourceBranch: "feature", targetBranch: "main", title: "Draft" },
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(result.code, "integration-confirmation-required");
  assert.equal(calls.length, 0);
});

test("runtime route validation cannot be bypassed by an injected connector invoker", async () => {
  let calls = 0;
  const runtime = createMousecatRuntime({
    config: gitlabConfig(),
    connectorInvoker: async () => {
      calls += 1;
      return { ok: true, result: { unexpected: true } };
    },
  });

  const result = await runtime.handleTool("mousecat.invoke", {
    upstream: "gitlab",
    capability: "gitlab.unknown.operation",
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "integration-capability-unknown");
  assert.equal(calls, 0);
});

test("valid provider execution cannot be intercepted by a generic connector invoker", async () => {
  let bypassCalls = 0;
  const providerCalls = [];
  const runtime = createMousecatRuntime({
    config: gitlabConfig(),
    connectorInvoker: async () => {
      bypassCalls += 1;
      return { ok: true, result: { bypassed: true } };
    },
    integrationCommandRunner: successfulRunner({ id: 7, status: "success" }, providerCalls),
  });

  const result = await runtime.handleTool("mousecat.invoke", {
    upstream: "gitlab",
    capability: "gitlab.pipelines.get",
    payload: { pipelineId: 7 },
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.result.status, "success");
  assert.equal(bypassCalls, 0);
  assert.equal(providerCalls.length, 1);
});

test("delegation cannot inherit integration execution", async () => {
  let calls = 0;
  const runtime = createMousecatRuntime({
    config: gitlabConfig(),
    connectorInvoker: async () => {
      calls += 1;
      return { ok: true, result: { unexpected: true } };
    },
  });
  const origin = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "crucible",
    source: { host: "codex", sessionId: "integration-session", invocationId: "integration-origin" },
    intake: { seams: [{ id: "integration-seam", prompt: "Delegate integration work", shape: "freeform" }] },
  });
  runtime.handleTool("mousecat.widget", {
    action: "hold",
    interactionId: origin.interactionId,
    responses: [{ itemId: origin.items[0].id, reason: "Delegate" }],
  });

  const delegated = runtime.handleTool("mousecat.delegation", {
    action: "start",
    source: { host: "codex", sessionId: "integration-session", invocationId: "integration-delegation" },
    origin: { interactionId: origin.interactionId, itemId: origin.items[0].id },
    originContinuationToken: origin.continuation.arguments.continuationToken,
    target: { upstream: "gitlab", capability: "gitlab.pipelines.get" },
    payload: { pipelineId: 7 },
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(delegated.code, "delegation-integration-unsupported");
  assert.equal(calls, 0);
});
