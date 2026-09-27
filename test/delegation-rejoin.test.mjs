import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createMousecatRuntime } from "../src/core/runtime.mjs";

function delegationConfig(statePath = null) {
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
    ...(statePath ? { state: { enabled: true, path: statePath } } : {}),
  };
}

async function heldOrigin(runtime, suffix = "main", sensitive = false) {
  const invoked = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "crucible",
    source: { host: "codex", sessionId: "session-a14", invocationId: `origin-${suffix}` },
    intake: {
      seams: [{ id: `thread-${suffix}`, prompt: `Resolve ${suffix}`, shape: "freeform", sensitive }],
    },
  });
  const held = runtime.handleTool("mousecat.widget", {
    action: "hold",
    interactionId: invoked.interactionId,
    responses: [{ itemId: invoked.items[0].id, reason: "Delegate to council" }],
  });
  assert.equal(held.status, "held");
  return {
    interactionId: invoked.interactionId,
    itemId: invoked.items[0].id,
    continuationToken: invoked.continuation.arguments.continuationToken,
  };
}

function startArgs(origin, suffix = "main") {
  return {
    action: "start",
    source: { host: "codex", sessionId: "session-a14", invocationId: `council-${suffix}` },
    origin: { interactionId: origin.interactionId, itemId: origin.itemId },
    originContinuationToken: origin.continuationToken,
    target: { upstream: "neo", capability: "run_topology_v1" },
    payload: { topology: "peer-review-ring", prompt: `Council ${suffix}` },
    permit: { profileId: "tool-invocation" },
    timeoutMs: 5000,
  };
}

async function completedDelegation(runtime, origin, suffix = "main") {
  const started = runtime.handleTool("mousecat.delegation", startArgs(origin, suffix));
  const delegationToken = started.continuation.arguments.delegationToken;
  const completed = await runtime.handleTool("mousecat.delegation", {
    action: "await",
    delegationId: started.delegationId,
    delegationToken,
    waitMs: 1000,
  });
  assert.equal(completed.status, "completed");
  return { started, delegationToken };
}

function rejoinArgs(started, delegationToken, seam = {}) {
  return {
    action: "rejoin",
    delegationId: started.delegationId,
    delegationToken,
    permit: { profileId: "operator-interaction" },
    seam: {
      id: "council-recommendation",
      prompt: "Adopt the council recommendation?",
      options: [{ label: "Adopt", value: "adopt", recommended: true }],
      ...seam,
    },
  };
}

test("a completed delegation rejoins through the existing widget with full lineage", async () => {
  const runtime = createMousecatRuntime({
    config: delegationConfig(),
    connectorInvoker: async () => ({
      ok: true,
      result: { structuredContent: { recommendation: "Normalize into one bounded seam" } },
    }),
  });
  const origin = await heldOrigin(runtime);
  const { started, delegationToken } = await completedDelegation(runtime, origin);
  const args = rejoinArgs(started, delegationToken);
  const rejoined = await runtime.handleTool("mousecat.delegation", args);
  const child = rejoined.interaction;
  const lineage = child.items[0].lineage;

  assert.equal(rejoined.schema, "mousecat.delegation-rejoin/1");
  assert.equal(lineage.originInteractionId, origin.interactionId);
  assert.equal(lineage.originItemId, origin.itemId);
  assert.equal(lineage.delegationId, started.delegationId);
  assert.equal(lineage.delegationAttempt, 1);
  assert.equal(runtime.handleTool("mousecat.session", { action: "total-recall" }).openDelegations.length, 1);

  const replay = await runtime.handleTool("mousecat.delegation", args);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.interaction.interactionId, child.interactionId);
  assert.equal(replay.interaction.continuation.tool, "mousecat.delegation");
  assert.equal(replay.interaction.continuation.arguments.delegationToken, delegationToken);

  const replayedStart = runtime.handleTool("mousecat.delegation", {
    ...startArgs(origin),
    delegationToken,
  });
  assert.equal(replayedStart.continuation.arguments.action, "rejoin");
  assert.ok(replayedStart.continuation.requires.includes("original-rejoin-seam"));

  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: child.interactionId,
    responses: [{ itemId: child.items[0].id, selectedOption: "adopt", value: "adopt" }],
  });
  const returned = await runtime.handleTool("mousecat.skill", {
    action: "await",
    interactionId: child.interactionId,
    continuationToken: child.continuation.arguments.continuationToken,
  });
  const visual = runtime.handleTool("mousecat.visualize");

  assert.equal(returned.responses[0].value, "adopt");
  assert.equal(runtime.handleTool("mousecat.session", { action: "total-recall" }).openDelegations.length, 0);
  assert.ok(visual.liveGraph.edges.some((edge) => edge.from === `interaction:${origin.interactionId}` && edge.to === `delegation:${started.delegationId}`));
  assert.ok(visual.liveGraph.edges.some((edge) => edge.from === `delegation:${started.delegationId}` && edge.to === `interaction:${child.interactionId}`));
});

test("persisted rejoin intent recreates its deterministic child after a crash window", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mousecat-rejoin-intent-"));
  const path = join(dir, "state.json");
  const config = delegationConfig(path);
  try {
    const first = createMousecatRuntime({
      config,
      connectorInvoker: async () => ({ ok: true, result: { structuredContent: { ready: true } } }),
    });
    const origin = await heldOrigin(first, "crash-window");
    const { started, delegationToken } = await completedDelegation(first, origin, "crash-window");
    const args = rejoinArgs(started, delegationToken, { id: "crash-rejoin", prompt: "Recover the child" });
    const initial = await first.handleTool("mousecat.delegation", args);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    saved.interactions = saved.interactions.filter((entry) => entry.interactionId !== initial.interaction.interactionId);
    writeFileSync(path, `${JSON.stringify(saved, null, 2)}\n`, "utf8");

    const recovered = await createMousecatRuntime({ config }).handleTool("mousecat.delegation", args);
    assert.equal(recovered.interaction.interactionId, initial.interaction.interactionId);
    assert.equal(recovered.interaction.status, "pending");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sensitive custody is inherited by rejoin and redacted from public and persisted state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mousecat-sensitive-delegation-"));
  const path = join(dir, "state.json");
  try {
    const runtime = createMousecatRuntime({
      config: delegationConfig(path),
      connectorInvoker: async () => ({
        ok: true,
        result: { structuredContent: { marker: "sensitive-vault-only" } },
      }),
    });
    const origin = await heldOrigin(runtime, "sensitive", true);
    const { started, delegationToken } = await completedDelegation(runtime, origin, "sensitive");
    await runtime.handleTool("mousecat.delegation", rejoinArgs(started, delegationToken, {
      id: "sensitive-child",
      prompt: "sensitive-child-marker",
    }));
    const visual = runtime.handleTool("mousecat.visualize");
    const summary = visual.delegations[0];
    const child = visual.interactions.find((entry) => entry.parentInteractionId === origin.interactionId);

    assert.equal(summary.sensitive, true);
    assert.equal(summary.source, undefined);
    assert.equal(summary.origin, undefined);
    assert.equal(summary.target, undefined);
    assert.equal(child.items[0].prompt, "[sensitive-redacted]");
    assert.equal(JSON.stringify(visual).includes("sensitive-vault-only"), false);
    assert.doesNotMatch(readFileSync(path, "utf8"), /sensitive-vault-only|sensitive-child-marker/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
