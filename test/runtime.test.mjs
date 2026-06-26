import test from "node:test";
import assert from "node:assert/strict";

import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { handleJsonRpc } from "../src/mcp/server.mjs";

test("runtime creates questions and visualizer button snapshots", () => {
  const runtime = createMousecatRuntime();
  const question = runtime.handleTool("mousecat.ask", {
    prompt: "Pick a route",
    skillRef: "crucible.point",
    options: [{ label: "Neo (Recommended)", value: "neo" }, { label: "GitHub", value: "github" }],
  });
  const visual = runtime.handleTool("mousecat.visualize", { includeEvents: true });

  assert.equal(question.schema, "mousecat.interaction/1");
  assert.equal(question.interaction.items[0].shape, "decision");
  assert.equal(question.question.buttons.length, 2);
  assert.ok(visual.buttons.some((button) => button.skillRef === "crucible.point"));
  assert.equal(visual.interactions.length, 1);
  assert.equal(visual.events[0].category, "interaction");
  assert.ok(visual.events.length > 0);
});

test("interaction sessions support atomic multi-item chains and visual graph nodes", () => {
  const runtime = createMousecatRuntime();
  const interaction = runtime.handleTool("mousecat.ask", {
    source: "governance-planner",
    sessionId: "session-a",
    interactionId: "plan-a:scope-pass",
    title: "Scope Pass",
    items: [
      { id: "boundary", shape: "decision", prompt: "Pick boundary", options: [{ label: "Adapter only" }] },
      { id: "notes", shape: "freeform", prompt: "Add constraints" },
    ],
    constraints: { maxItems: 5, recommendationFirst: true, allowFreeform: true },
  });
  const visual = runtime.handleTool("mousecat.visualize", { includeEvents: true, stream: "game" });

  assert.equal(interaction.interaction.items.length, 2);
  assert.equal(interaction.interaction.constraints.allowFreeform, true);
  assert.equal(visual.interactionSessions[0].sessionId, "session-a");
  assert.ok(visual.liveGraph.nodes.some((node) => node.id === "interaction:plan-a:scope-pass"));
});

test("queue supports enqueue, answer, ratify, and total recall docketing", () => {
  const runtime = createMousecatRuntime();
  const enqueued = runtime.handleTool("mousecat.queue", {
    action: "enqueue",
    item: { prompt: "Ratify adapter priority", shape: "point", recommendedDefault: "Neo first" },
  });
  const itemId = enqueued.item.id;
  runtime.handleTool("mousecat.queue", { action: "answer", itemId, answer: { value: "Neo first" } });
  runtime.handleTool("mousecat.queue", { action: "ratify" });
  const recall = runtime.handleTool("mousecat.session", { action: "total-recall" });

  assert.equal(recall.schema, "mousecat.total-recall/1");
  assert.equal(recall.openThreads.length, 0);
  assert.equal(runtime.handleTool("mousecat.queue", { action: "list" }).queue[0].status, "ratified");
});

test("queue supports held items and session lineage for long chains", () => {
  const runtime = createMousecatRuntime();
  const enqueued = runtime.handleTool("mousecat.queue", {
    action: "enqueue",
    sessionId: "session-b",
    interactionId: "chain-b",
    items: [
      { id: "q1", prompt: "First decision", shape: "decision" },
      { id: "q2", prompt: "Second decision", shape: "review" },
    ],
  });
  const held = runtime.handleTool("mousecat.queue", { action: "hold", itemId: "q2", reason: "needs evidence" });
  const recall = runtime.handleTool("mousecat.session", { action: "total-recall" });
  const visual = runtime.handleTool("mousecat.visualize", { includeEvents: true });

  assert.equal(enqueued.items.length, 2);
  assert.equal(held.item.status, "held");
  assert.equal(recall.openThreads.length, 2);
  assert.ok(visual.liveGraph.edges.some((edge) => edge.from === "interaction:chain-b" && edge.to === "queue:q2"));
});

test("invoke fails closed without a tool-invocation permit or adapter", () => {
  const runtime = createMousecatRuntime();
  const withoutPermit = runtime.handleTool("mousecat.invoke", { upstream: "neo", capability: "status" });
  const withPermit = runtime.handleTool("mousecat.invoke", {
    upstream: "neo",
    capability: "status",
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(withoutPermit.ok, false);
  assert.equal(withoutPermit.code, "permit-required");
  assert.equal(withPermit.ok, false);
  assert.equal(withPermit.code, "connector-not-configured");
});

test("credential API accepts references and rejects raw secret-shaped values", () => {
  const runtime = createMousecatRuntime();
  const ref = runtime.handleTool("mousecat.credentials", {
    action: "register-reference",
    upstream: "github",
    ref: "GITHUB_TOKEN",
    kind: "environment-variable",
  });
  const rejected = runtime.handleTool("mousecat.credentials", {
    action: "register-reference",
    upstream: "github",
    token: "x",
  });

  assert.equal(ref.ok, true);
  assert.equal(ref.ref.ref, "GITHUB_TOKEN");
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "secret-values-not-accepted");
});

test("MCP handler lists tools and calls mousecat.status", async () => {
  const runtime = createMousecatRuntime();
  const listed = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, runtime);
  const called = await handleJsonRpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "mousecat.status", arguments: {} },
  }, runtime);

  assert.equal(listed.result.tools.length, 9);
  assert.equal(called.result.structuredContent.ok, true);
});
