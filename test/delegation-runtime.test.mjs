import test from "node:test";
import assert from "node:assert/strict";

import { createMousecatRuntime } from "../src/core/runtime.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function config() {
  return {
    hostProfile: "test",
    credentials: { policy: "references-only" },
    upstreams: { neo: { enabled: true } },
    connectors: {
      neo: {
        enabled: true,
        kind: "external-mcp",
        transport: "http",
        url: "http://127.0.0.1:9/mcp",
        timeoutMs: 5000,
      },
    },
  };
}

async function heldOrigin(runtime, suffix = "main") {
  const invoked = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "crucible",
    source: { host: "codex", sessionId: "session-a14", invocationId: `origin-${suffix}` },
    intake: { seams: [{ id: `thread-${suffix}`, prompt: `Resolve ${suffix}`, shape: "freeform" }] },
  });
  const held = runtime.handleTool("mousecat.widget", {
    action: "hold",
    interactionId: invoked.interactionId,
    responses: [{ itemId: invoked.items[0].id, reason: "Delegate" }],
  });
  assert.equal(held.status, "held");
  return {
    interactionId: invoked.interactionId,
    itemId: invoked.items[0].id,
    continuationToken: invoked.continuation.arguments.continuationToken,
  };
}

function startArgs(origin, suffix = "main", overrides = {}) {
  return {
    action: "start",
    source: { host: "codex", sessionId: "session-a14", invocationId: `council-${suffix}` },
    origin: { interactionId: origin.interactionId, itemId: origin.itemId },
    originContinuationToken: origin.continuationToken,
    target: { upstream: "neo", capability: "run_topology_v1" },
    payload: { topology: "peer-review-ring", task: `Council ${suffix}` },
    permit: { profileId: "tool-invocation" },
    timeoutMs: 5000,
    ...overrides,
  };
}

test("delegation returns immediately, permits independent work, and capability-gates its result", async () => {
  const council = deferred();
  let callCount = 0;
  const runtime = createMousecatRuntime({
    config: config(),
    connectorInvoker: async () => {
      callCount += 1;
      return council.promise;
    },
  });
  const origin = await heldOrigin(runtime);
  const started = runtime.handleTool("mousecat.delegation", startArgs(origin));
  const token = started.continuation.arguments.delegationToken;
  assert.equal(started.status, "running");
  await Promise.resolve();
  assert.equal(callCount, 1);

  const independent = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "crucible",
    source: { host: "codex", sessionId: "session-a14", invocationId: "independent" },
    intake: { seams: [{ id: "independent", prompt: "Continue independently", shape: "freeform" }] },
  });
  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: independent.interactionId,
    responses: [{ itemId: independent.items[0].id, value: "continued" }],
  });
  const independentResult = await runtime.handleTool("mousecat.skill", {
    action: "await",
    interactionId: independent.interactionId,
    continuationToken: independent.continuation.arguments.continuationToken,
  });
  assert.equal(independentResult.responses[0].value, "continued");

  const waiting = runtime.handleTool("mousecat.delegation", {
    action: "await",
    delegationId: started.delegationId,
    delegationToken: token,
    waitMs: 1000,
  });
  council.resolve({ ok: true, result: { structuredContent: { marker: "caller-only-result" } } });
  const completed = await waiting;
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.structuredContent.marker, "caller-only-result");
  assert.equal(completed.continuation.obligation, "consume-delegation-result");
  assert.equal(JSON.stringify(runtime.handleTool("mousecat.visualize")).includes("caller-only-result"), false);
  assert.equal(runtime.handleTool("mousecat.delegation", {
    action: "await",
    delegationId: started.delegationId,
  }).code, "delegation-token-required");
});

test("delegation validates origin custody, source identity, permits, and idempotent replay", async () => {
  const pending = deferred();
  let callCount = 0;
  const runtime = createMousecatRuntime({
    config: config(),
    connectorInvoker: async () => {
      callCount += 1;
      return pending.promise;
    },
  });
  const origin = await heldOrigin(runtime, "guards");
  const args = startArgs(origin, "guards");
  assert.equal(runtime.handleTool("mousecat.delegation", { ...args, permit: undefined }).code, "delegation-start-permit-required");
  assert.equal(runtime.handleTool("mousecat.delegation", { ...args, originContinuationToken: "wrong" }).code, "delegation-origin-token-invalid");
  assert.equal(runtime.handleTool("mousecat.delegation", { ...args, source: { ...args.source, host: "claude" } }).code, "delegation-source-host-mismatch");
  const started = runtime.handleTool("mousecat.delegation", args);
  const token = started.continuation.arguments.delegationToken;
  await Promise.resolve();
  assert.equal(runtime.handleTool("mousecat.delegation", args).code, "delegation-token-required");
  const replay = runtime.handleTool("mousecat.delegation", { ...args, delegationToken: token });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(callCount, 1);
  assert.equal(runtime.handleTool("mousecat.delegation", {
    ...args,
    delegationToken: token,
    payload: { ...args.payload, task: "changed" },
  }).code, "delegation-invocation-id-conflict");
  pending.resolve({ ok: true, result: { structuredContent: { done: true } } });
});

test("post-dispatch uncertainty blocks retry until duplicate risk is acknowledged", async () => {
  const results = [
    { ok: false, code: "connector-exited" },
    { ok: true, result: { structuredContent: { recovered: true } } },
  ];
  const runtime = createMousecatRuntime({ config: config(), connectorInvoker: async () => results.shift() });
  const origin = await heldOrigin(runtime, "retry");
  const args = startArgs(origin, "retry");
  const started = runtime.handleTool("mousecat.delegation", args);
  const token = started.continuation.arguments.delegationToken;
  const interrupted = await runtime.handleTool("mousecat.delegation", {
    action: "await",
    delegationId: started.delegationId,
    delegationToken: token,
    waitMs: 1000,
  });
  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.upstreamOutcome, "unknown");
  assert.equal(runtime.handleTool("mousecat.delegation", {
    ...args,
    delegationToken: token,
    retry: true,
  }).code, "delegation-retry-acknowledgement-required");
  const retried = runtime.handleTool("mousecat.delegation", {
    ...args,
    delegationToken: token,
    retry: true,
    duplicateSideEffectAcknowledged: true,
  });
  assert.equal(retried.status, "running");
});

test("acknowledged cancellation is terminal and retryable without duplicate-side-effect acknowledgement", async () => {
  const results = [
    {
      ok: false,
      code: "connector-cancelled",
      cancellation: {
        requested: true,
        notificationAccepted: true,
        negotiated: true,
        acknowledged: true,
        reason: "deadline-exceeded",
        schema: "mousecat.mcp.cancellation-ack/1",
      },
    },
    { ok: true, result: { structuredContent: { recovered: true } } },
  ];
  const runtime = createMousecatRuntime({ config: config(), connectorInvoker: async () => results.shift() });
  const origin = await heldOrigin(runtime, "cancelled");
  const args = startArgs(origin, "cancelled");
  const started = runtime.handleTool("mousecat.delegation", args);
  const token = started.continuation.arguments.delegationToken;
  const cancelled = await runtime.handleTool("mousecat.delegation", {
    action: "await",
    delegationId: started.delegationId,
    delegationToken: token,
    waitMs: 1000,
  });

  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.upstreamOutcome, "cancelled");
  assert.equal(cancelled.cancellation.acknowledged, true);
  assert.deepEqual(cancelled.continuation.requires, ["original-start-arguments"]);
  runtime.handleTool("mousecat.session", { action: "total-recall" });
  const recallEvent = runtime.state.events.at(-1);
  assert.equal(recallEvent.type, "session.total-recall");
  assert.equal(recallEvent.data.openDelegations, 1);
  assert.equal(recallEvent.data.delegationStatuses.cancelled, 1);
  const retried = runtime.handleTool("mousecat.delegation", {
    ...args,
    delegationToken: token,
    retry: true,
  });
  assert.equal(retried.status, "running");
});

test("accepted cancellation notification without terminal acknowledgement remains unknown", async () => {
  const runtime = createMousecatRuntime({
    config: config(),
    connectorInvoker: async () => ({
      ok: false,
      code: "connector-timeout",
      cancellation: {
        requested: true,
        notificationAccepted: true,
        acknowledged: false,
        reason: "deadline-exceeded",
      },
    }),
  });
  const origin = await heldOrigin(runtime, "unacknowledged");
  const args = startArgs(origin, "unacknowledged");
  const started = runtime.handleTool("mousecat.delegation", args);
  const interrupted = await runtime.handleTool("mousecat.delegation", {
    action: "await",
    delegationId: started.delegationId,
    delegationToken: started.continuation.arguments.delegationToken,
    waitMs: 1000,
  });

  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.upstreamOutcome, "unknown");
  assert.equal(interrupted.cancellation.notificationAccepted, true);
  assert.equal(interrupted.cancellation.acknowledged, false);
  assert.ok(interrupted.continuation.requires.includes("duplicate-side-effect-acknowledgement"));
});

test("a deadline exhausted before tool dispatch is retry-safe and records its dispatch phase", async () => {
  const results = [
    { ok: false, code: "connector-timeout", dispatchPhase: "not-dispatched" },
    { ok: true, result: { structuredContent: { recovered: true } } },
  ];
  const runtime = createMousecatRuntime({ config: config(), connectorInvoker: async () => results.shift() });
  const origin = await heldOrigin(runtime, "pre-dispatch");
  const args = startArgs(origin, "pre-dispatch");
  const started = runtime.handleTool("mousecat.delegation", args);
  const token = started.continuation.arguments.delegationToken;
  const failed = await runtime.handleTool("mousecat.delegation", {
    action: "await",
    delegationId: started.delegationId,
    delegationToken: token,
    waitMs: 1000,
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.upstreamOutcome, "failed");
  assert.equal(failed.failure.dispatchPhase, "not-dispatched");
  assert.deepEqual(failed.continuation.requires, ["original-start-arguments"]);
  assert.equal(runtime.handleTool("mousecat.delegation", {
    ...args,
    delegationToken: token,
    retry: true,
  }).status, "running");
});

test("a thrown connector error records an interrupted event consistent with state", async () => {
  const runtime = createMousecatRuntime({
    config: config(),
    connectorInvoker: async () => { throw new Error("connector exploded"); },
  });
  const origin = await heldOrigin(runtime, "thrown");
  const args = startArgs(origin, "thrown");
  const started = runtime.handleTool("mousecat.delegation", args);
  const interrupted = await runtime.handleTool("mousecat.delegation", {
    action: "await",
    delegationId: started.delegationId,
    delegationToken: started.continuation.arguments.delegationToken,
    waitMs: 1000,
  });

  assert.equal(interrupted.status, "interrupted");
  assert.equal(runtime.state.events.at(-1).type, "delegation.interrupted");
});
