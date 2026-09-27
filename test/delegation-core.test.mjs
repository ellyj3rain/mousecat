import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  compileDelegationStart,
  delegationEnvelope,
  publicDelegationSummary,
} from "../src/core/delegation.mjs";
import { createLocalStateStore } from "../src/core/local-state.mjs";

function heldOrigin(options = {}) {
  return {
    interactionId: "skill-origin",
    invocation: { continuationHash: "origin-hash" },
    items: [{
      id: "held-item",
      status: options.status || "held",
      sensitive: options.sensitive === true,
      metadata: {
        lineage: {
          host: "codex",
          sessionId: "session-a14",
          threadId: "thread-a14",
          parentThreadId: "parent-a13",
          sequence: 4,
        },
      },
    }],
  };
}

function startArgs(overrides = {}) {
  return {
    source: { host: "codex", sessionId: "session-a14", invocationId: "council-1" },
    origin: { interactionId: "skill-origin", itemId: "held-item" },
    target: { upstream: "neo", capability: "run_topology_v1" },
    payload: { topology: "peer-review-ring", task: "Review the seam" },
    timeoutMs: 5000,
    ...overrides,
  };
}

function fakeState(delegations) {
  return {
    startedAt: "2026-07-10T05:00:00.000Z",
    sessions: new Map(),
    interactions: new Map(),
    delegations: new Map(delegations.map((record) => [record.delegationId, record])),
    queue: [],
    events: [],
    routePlans: [],
    credentialRefs: [],
  };
}

test("delegation compiler binds one held origin and canonicalizes its payload", () => {
  const compiled = compileDelegationStart(startArgs({
    payload: { z: 1, nested: { b: 2, a: 1 }, a: 0 },
  }), heldOrigin());

  assert.equal(compiled.ok, true);
  assert.equal(compiled.record.origin.interactionId, "skill-origin");
  assert.equal(compiled.record.origin.itemId, "held-item");
  assert.equal(compiled.record.origin.threadId, "thread-a14");
  assert.equal(compiled.record.source.host, "codex");
  assert.equal(compiled.record.status, "running");
  assert.deepEqual(Object.keys(compiled.payload), ["a", "nested", "z"]);
  assert.deepEqual(Object.keys(compiled.payload.nested), ["a", "b"]);
  assert.match(compiled.record.delegationId, /^delegation-/u);
  assert.equal(compiled.record.fingerprint.length, 16);
});

test("delegation compiler fails closed around custody, identity, transcripts, and secrets", () => {
  assert.equal(compileDelegationStart(startArgs(), heldOrigin({ status: "open" })).code, "delegation-origin-item-not-held");
  assert.equal(compileDelegationStart(startArgs({
    source: { host: "claude", sessionId: "session-a14", invocationId: "wrong-host" },
  }), heldOrigin()).code, "delegation-source-host-mismatch");
  assert.equal(compileDelegationStart(startArgs({ payload: { Messages: [] } }), heldOrigin()).code, "raw-session-transcript-not-accepted");
  assert.equal(compileDelegationStart(startArgs({ payload: { nested: { private_key: "secret" } } }), heldOrigin()).code, "delegation-secret-values-not-accepted");
  assert.equal(compileDelegationStart(startArgs({ payload: { authorization: "secret" } }), heldOrigin()).code, "delegation-secret-values-not-accepted");
});

test("public delegation envelopes clone authority-bearing records", () => {
  const compiled = compileDelegationStart(startArgs(), heldOrigin());
  compiled.record.continuationHash = "caller-held-hash";
  const summary = publicDelegationSummary(compiled.record);
  const envelope = delegationEnvelope("start", compiled.record, { delegationToken: "cap" });

  summary.source.host = "mutated";
  envelope.continuation.arguments.delegationToken = "mutated";
  assert.equal(compiled.record.source.host, "codex");
  assert.equal(delegationEnvelope("start", compiled.record, { delegationToken: "cap" }).continuation.arguments.delegationToken, "cap");

  const sensitive = compileDelegationStart(startArgs(), heldOrigin({ sensitive: true })).record;
  const sensitiveSummary = publicDelegationSummary(sensitive);
  assert.equal(sensitiveSummary.sensitive, true);
  assert.equal(sensitiveSummary.source, undefined);
  assert.equal(sensitiveSummary.origin, undefined);
  assert.equal(sensitiveSummary.target, undefined);
});

test("local state persists safe delegation provenance and restores explicit uncertainty", () => {
  const dir = mkdtempSync(join(tmpdir(), "mousecat-delegation-core-"));
  const path = join(dir, "state.json");
  try {
    const running = compileDelegationStart(startArgs(), heldOrigin()).record;
    const completed = compileDelegationStart(startArgs({
      source: { host: "codex", sessionId: "session-a14", invocationId: "council-2" },
    }), heldOrigin()).record;
    const cancelled = compileDelegationStart(startArgs({
      source: { host: "codex", sessionId: "session-a14", invocationId: "council-3" },
    }), heldOrigin()).record;
    running.continuationHash = "running-cap-hash";
    running.payload = { marker: "payload-must-not-persist" };
    completed.delegationId = "delegation-completed";
    completed.id = completed.delegationId;
    completed.status = "completed";
    completed.upstreamOutcome = "succeeded";
    completed.resultAvailable = true;
    completed.result = { marker: "result-must-not-persist" };
    cancelled.delegationId = "delegation-cancelled";
    cancelled.id = cancelled.delegationId;
    cancelled.status = "cancelled";
    cancelled.upstreamOutcome = "cancelled";
    cancelled.cancellation = {
      requested: true,
      notificationAccepted: true,
      acknowledged: true,
      reason: "deadline-exceeded",
    };
    const store = createLocalStateStore({ state: { enabled: true, path } });

    assert.equal(store.save(fakeState([running, completed, cancelled])), true);
    const serialized = readFileSync(path, "utf8");
    assert.doesNotMatch(serialized, /payload-must-not-persist|result-must-not-persist/u);
    assert.match(serialized, /delegationPayloadsStored/u);
    const restored = store.load();
    const restoredRunning = restored.delegations.get(running.delegationId);
    const restoredCompleted = restored.delegations.get(completed.delegationId);
    const restoredCancelled = restored.delegations.get(cancelled.delegationId);
    assert.equal(restoredRunning.status, "interrupted");
    assert.equal(restoredRunning.upstreamOutcome, "unknown");
    assert.equal(restoredRunning.reason, "runtime-restarted");
    assert.equal(restoredCompleted.status, "interrupted");
    assert.equal(restoredCompleted.upstreamOutcome, "succeeded");
    assert.equal(restoredCompleted.reason, "delegation-result-not-persisted");
    assert.equal(restoredCancelled.status, "cancelled");
    assert.equal(restoredCancelled.upstreamOutcome, "cancelled");
    assert.equal(restoredCancelled.cancellation.acknowledged, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
