import test from "node:test";
import assert from "node:assert/strict";

import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";
import {
  MousecatToolError,
  MousecatTransportError,
  createMousecatClient,
  createMousecatHostAdapter,
  readContextualContinuation,
  referenceHostAdapters,
  resolveReferenceHostAdapter,
} from "../src/sdk/index.mjs";

async function startTestSdk(t, options = {}) {
  const runtime = options.runtime || createMousecatRuntime(options.runtimeOptions);
  const app = await startOperatorServer({ runtime, port: 0 });
  const client = createMousecatClient({
    endpoint: app.mcpUrl,
    fetch: options.fetch,
    clientInfo: { name: "mousecat-sdk-test", version: "1.0.0" },
  });
  t.after(async () => {
    await client.close().catch(() => {});
    await app.close();
  });
  return { runtime, app, client };
}

test("SDK host adapter carries one project workbench capability through open, operate, snapshot, and close", async (t) => {
  const saveHash = "d5a3dc690e8904eeac147b06a8df428590218155d63882c9f09fa2479dc17302";
  const { client } = await startTestSdk(t, {
    runtimeOptions: {
      projectConnectorInvoker: async () => ({
        ok: true,
        schema: "mousecat.connector.invoke/1",
        result: {
          ok: true,
          schema: "mousecat.integration-result/1",
          result: {
            worldIdentity: "mass driver|1|Ain-XII",
            sourceSaveSha256: saveHash.toUpperCase(),
            rootTileId: 29606,
            requestedExtent: 12,
            realizedExtent: 1,
            orientation: 0,
            arrivalTileId: 29606,
            memberTileIds: [29606],
            atlasEvidenceSignature: "c0f16bd585c11bd35a63947ca2db0802cf5e5e8c9e38b5cfbb78bd57ec385a7f",
            compositionEvidenceComplete: true,
            stageReady: false,
            evidenceObligations: [],
            stageBlockers: ["Read-only proof."],
            tiles: [{
              tileId: 29606,
              biome: {
                defName: "TropicalRainforest",
                label: "tropical rainforest",
                sourceModId: "ludeon.rimworld",
              },
              mutators: [],
              roads: [],
              rivers: [],
              worldObjects: [],
              definitionComplete: true,
            }],
          },
        },
      }),
    },
  });
  const adapter = createMousecatHostAdapter(client, {
    profileId: "codex",
    sessionId: "ca-workbench-sdk",
  });
  const opened = await adapter.openProjectWorkbench({
    workbenchId: "sdk-ca-proof",
    adapterRef: "colonist-awareness.world-authoring",
    operatorRef: "operator:local",
    intent: "Compose a saved-world regional candidate.",
    sourceVector: [{
      authority: "rimworld-save",
      sourceRevision: `sha256:${saveHash}`,
      observedAt: "2026-08-16T04:28:00.000Z",
      status: "current",
    }],
    subjectRefs: ["world:mass-driver-ain-xii"],
    permit: { profileId: "operator-interaction" },
  });
  const invalidCapability = "caller-cannot-rebind-token";
  const operated = await adapter.operateProjectWorkbench(opened, {
    action: "close",
    workbenchId: "caller-cannot-rebind-workbench",
    workbenchToken: invalidCapability,
    operationId: "cao.region.compose",
    input: { atlasId: "mass-driver-ain-xii", rootTileId: 29606, extent: 12 },
    permit: { profileId: "operator-interaction" },
  });
  const snapshot = await adapter.snapshotProjectWorkbench(opened);
  const closed = await adapter.closeProjectWorkbench(opened);

  assert.equal(opened.workbench.hostSessionRef, "codex:ca-workbench-sdk");
  assert.equal(operated.result.realizedExtent, 1);
  assert.equal(snapshot.receipts.length, 1);
  assert.equal(closed.workbench.state, "closed");
});

test("SDK client initializes lazily and preserves one MCP session", async (t) => {
  const requests = [];
  const observingFetch = async (url, init) => {
    requests.push({ url: String(url), method: init?.method, headers: init?.headers });
    return fetch(url, init);
  };
  const { client } = await startTestSdk(t, { fetch: observingFetch });

  const heartbeat = await client.heartbeat("sdk-session", { host: "custom-harness", provider: "custom" });
  const status = await client.callTool("mousecat.status");

  assert.equal(heartbeat.action, "heartbeat");
  assert.equal(status.ok, true);
  assert.equal(requests.filter((request) => !request.headers?.["mcp-session-id"]).length, 1);
  assert.equal(client.describeSession().schema, "mousecat.sdk-session/1");
  assert.match(client.endpoint, /\/mcp$/u);
});

test("reference host adapter heartbeats, registers, invokes, awaits, and hands off contextually", async (t) => {
  const { runtime, client } = await startTestSdk(t);
  const adapter = createMousecatHostAdapter(client, {
    profileId: "grok-build",
    sessionId: "grok-sdk-session",
    threadId: "thread-17",
    model: "grok-example",
  });

  const heartbeat = await adapter.heartbeat({
    objective: "Prove contextual framework handoff",
    host: "spoofed-host",
    provider: "spoofed-provider",
  });
  const registered = await adapter.registerFramework({
    namespace: "sdk-proof",
    revision: 1,
    permit: { profileId: "operator-interaction" },
    framework: { id: "sdk-proof-loop", label: "SDK Proof Loop" },
    skills: [
      { id: "sdk-frame", label: "Frame", intakeMode: "single-seam" },
      { id: "sdk-resolve", label: "Resolve", intakeMode: "single-seam" },
    ],
  });
  const invoked = await adapter.invokeSkill({
    skillRef: "sdk-frame",
    invocationId: "frame-1",
    source: { host: "spoofed-host", sessionId: "spoofed-session" },
    intake: { seams: [{ id: "frame-seam", prompt: "Which frame should continue?" }] },
  });
  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: invoked.interactionId,
    responses: [{ itemId: invoked.items[0].id, value: "contextual" }],
  });
  const terminal = await adapter.awaitSkill(invoked);
  const continuation = readContextualContinuation(terminal);
  const handoff = await adapter.handoffSkill(terminal, {
    skillRef: "sdk-resolve",
    invocationId: "resolve-1",
    previousResultToken: ["spoofed", "capability"].join("-"),
    source: { host: "spoofed-host", sessionId: "spoofed-session" },
    route: { reason: "The selected frame is ready for resolution." },
    intake: { seams: [{ id: "resolve-seam", prompt: "Resolve the selected frame." }] },
  });
  const handed = await adapter.awaitSkill(handoff, { waitMs: 0 });

  assert.equal(heartbeat.session.facts.provider, "xai");
  assert.equal(heartbeat.session.facts.host, "grok-build");
  assert.equal(heartbeat.session.facts.threadId, "thread-17");
  assert.ok(registered.namespaceToken);
  assert.equal(terminal.status, "answered");
  assert.equal(continuation.previousSkillRef, "sdk-frame");
  assert.deepEqual(continuation.availableSkillRefs, ["sdk-frame", "sdk-resolve"]);
  assert.equal(handoff.schema, "mousecat.framework-handoff/1");
  assert.equal(handoff.route.fromSkillRef, "sdk-frame");
  assert.equal(handoff.route.toSkillRef, "sdk-resolve");
  assert.equal(handoff.route.selectedBy, "grok-build");
  assert.equal(handoff.route.fixedTransition, false);
  assert.equal(handoff.result.intake.source.host, "grok-build");
  assert.equal(handoff.result.intake.source.sessionId, "grok-sdk-session");
  assert.equal(handed.status, "pending");
  assert.throws(() => {
    adapter.descriptor.host = "mutable-host";
  }, TypeError);
});

test("SDK reports Mousecat tool failures as typed errors", async (t) => {
  const { client } = await startTestSdk(t);

  await assert.rejects(
    client.callTool("mousecat.session", { action: "heartbeat" }),
    (error) => error instanceof MousecatToolError && error.code === "session-id-required",
  );
  assert.throws(
    () => client.awaitSkill({ continuation: { arguments: {} } }),
    /interactionId and continuationToken/u,
  );
});

test("reference descriptors cover flagship, local, and custom hosts without changing runtime semantics", () => {
  const profiles = referenceHostAdapters();

  assert.ok(profiles.some((profile) => profile.id === "codex" && profile.provider === "openai"));
  assert.ok(profiles.some((profile) => profile.id === "claude" && profile.provider === "anthropic"));
  assert.ok(profiles.some((profile) => profile.id === "antigravity" && profile.provider === "google"));
  assert.ok(profiles.some((profile) => profile.id === "grok-build" && profile.provider === "xai"));
  assert.ok(profiles.some((profile) => profile.id === "ollama" && profile.provider === "ollama"));
  assert.ok(profiles.some((profile) => profile.id === "jetbrains"));
  assert.ok(profiles.some((profile) => profile.id === "cursor"));
  assert.ok(profiles.some((profile) => profile.id === "cli"));
  assert.deepEqual(resolveReferenceHostAdapter("phoenix-agent", { provider: "local-provider" }), {
    schema: "mousecat.sdk-host-adapter/1",
    profileId: "phoenix-agent",
    label: "phoenix-agent",
    hostKind: "custom-mcp-host",
    host: "phoenix-agent",
    provider: "local-provider",
    transport: "streamable-http",
  });
});

test("SDK follows Streamable HTTP lifecycle and consumes correlated SSE results", async () => {
  const requests = [];
  const mockFetch = async (url, init) => {
    const payload = init.body ? JSON.parse(init.body) : null;
    requests.push({ url: String(url), method: init.method, headers: init.headers, payload });
    if (payload?.method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: payload.id,
        result: {
          protocolVersion: "2025-06-18",
          serverInfo: { name: "mousecat", version: "test" },
          capabilities: { tools: {} },
        },
      }), { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "sse-session" } });
    }
    if (payload?.method === "notifications/initialized") return new Response(null, { status: 202 });
    const event = {
      jsonrpc: "2.0",
      id: payload.id,
      result: { structuredContent: { schema: "mousecat.status/1", ok: true } },
    };
    return new Response(`data: ${JSON.stringify(event)}\n\n`, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
  const client = createMousecatClient({ endpoint: "http://127.0.0.1:4317/mcp/", fetch: mockFetch });

  const status = await client.callTool("mousecat.status");

  assert.equal(status.ok, true);
  assert.equal(client.endpoint, "http://127.0.0.1:4317/mcp");
  assert.equal(requests[1].payload.method, "notifications/initialized");
  assert.ok(requests.every((request) => request.headers.accept === "application/json, text/event-stream"));
});

test("SDK invalidates an expired transport session without replaying the dispatched call", async () => {
  let initializeCount = 0;
  let toolCount = 0;
  const mockFetch = async (_url, init) => {
    const payload = init.body ? JSON.parse(init.body) : null;
    if (payload?.method === "initialize") {
      initializeCount += 1;
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: payload.id,
        result: { protocolVersion: "2025-06-18", serverInfo: { name: "mousecat" }, capabilities: {} },
      }), { status: 200, headers: { "content-type": "application/json", "mcp-session-id": `session-${initializeCount}` } });
    }
    if (payload?.method === "notifications/initialized") return new Response(null, { status: 202 });
    toolCount += 1;
    if (toolCount === 1) {
      return new Response(JSON.stringify({ error: { message: "Unknown MCP session" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: payload.id,
      result: { structuredContent: { schema: "mousecat.status/1", ok: true } },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createMousecatClient({ fetch: mockFetch });

  await assert.rejects(client.callTool("mousecat.status"), MousecatTransportError);
  assert.equal(client.sessionId, null);
  assert.equal(toolCount, 1);
  const recovered = await client.callTool("mousecat.status");

  assert.equal(recovered.ok, true);
  assert.equal(initializeCount, 2);
  assert.equal(toolCount, 2);
});
