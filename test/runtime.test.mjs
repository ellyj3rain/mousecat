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

  assert.equal(question.schema, "mousecat.question/1");
  assert.equal(question.question.buttons.length, 2);
  assert.ok(visual.buttons.some((button) => button.skillRef === "crucible.point"));
  assert.ok(visual.events.length > 0);
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
  assert.equal(withPermit.code, "adapter-not-wired");
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
    token: "ghp_example",
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

  assert.equal(listed.result.tools.length, 8);
  assert.equal(called.result.structuredContent.ok, true);
});
