import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { WIDGET_ACTIONS } from "../src/core/catalog.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { handleJsonRpc, startStdioServer } from "../src/mcp/server.mjs";

function exampleMlReview() {
  return {
    schema: "mousecat.ml-review/1",
    subject: "Retriever relevance target policy",
    scenario: "Ada holds several valid claims when a conversation turns to failed communications. The retriever needs a supervised target for which owned claims matter in that moment.",
    systemRole: "This decision defines the label source between a complete person-owned claim catalogue and the learned retriever. It does not approve an individual factual claim.",
    causalPath: [
      { label: "Person catalogue", value: "SAO supplies every claim Ada currently owns with provenance and age." },
      { label: "Relevance target", value: "The selected policy determines which claim identifiers become the retriever's expected output." },
      { label: "Runtime retrieval", value: "The trained retriever selects a bounded claim set for the present conversation." },
      { label: "Fenced speech", value: "The speaker may phrase selected claims while SAO still forbids claims Ada does not own." },
    ],
    playerImpact: "This affects whether an NPC recalls the relevant thing at the relevant moment. It does not let the NPC invent facts.",
    decisionPrecedent: "The answer becomes the corpus-wide rule for authoring and reviewing retriever relevance labels.",
    actualInput: [
      { label: "Catalogue", value: "Ada's complete current claim set." },
      { label: "Context", value: "Current listener, conversation and situation." },
    ],
    proposedLearning: [
      { label: "Input", value: "Owned claim identifiers plus bounded conversational context." },
      { label: "Target", value: "The subset judged relevant to the current utterance or response." },
    ],
    approvalEffects: ["Fix how retriever targets are produced and reviewed for future dataset rows."],
    remainingExclusions: ["Model size, cache bounds and runtime latency remain measurement decisions."],
    evidence: [{ label: "Architecture", value: "training/ARCHITECTURE.md:49-60" }],
  };
}

function tempStateConfig() {
  const dir = mkdtempSync(join(tmpdir(), "mousecat-state-"));
  return {
    dir,
    path: join(dir, ".mousecat", "state.json"),
    config: {
      state: {
        enabled: true,
        path: join(dir, ".mousecat", "state.json"),
        maxEvents: 20,
        maxRoutePlans: 20,
      },
    },
  };
}

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

test("widget validates, preserves, and redacts concrete ML reviews", () => {
  const runtime = createMousecatRuntime();
  const review = exampleMlReview();
  const requested = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "ml-review-public",
      items: [{ id: "retriever-target", prompt: "How should retriever targets be authored?", shape: "architecture", mlReview: review }],
    },
  });
  const rejected = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "ml-review-invalid",
      items: [{ id: "bad", prompt: "Admit this?", mlReview: { ...review, unexpected: true } }],
    },
  });
  const missingNarrative = { ...review };
  delete missingNarrative.scenario;
  const rejectedNarrative = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "ml-review-missing-narrative",
      items: [{ id: "bad", prompt: "Choose a policy", mlReview: missingNarrative }],
    },
  });
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "ml-review-sensitive",
      items: [{ id: "private", prompt: "Private model ruling", sensitive: true, mlReview: review }],
    },
  });
  const snapshot = runtime.handleTool("mousecat.widget", { action: "snapshot" });
  const sensitive = snapshot.interactions.find((interaction) => interaction.interactionId === "ml-review-sensitive");

  assert.deepEqual(requested.interaction.items[0].mlReview, review);
  assert.equal(rejected.code, "invalid-ml-review");
  assert.equal(rejected.field, "mlReview");
  assert.equal(rejectedNarrative.code, "invalid-ml-review");
  assert.equal(rejectedNarrative.field, "mlReview.scenario");
  assert.equal(runtime.state.interactions.has("ml-review-invalid"), false);
  assert.equal(sensitive.items[0].prompt, "[sensitive-redacted]");
  assert.equal(sensitive.items[0].mlReview, undefined);
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
  assert.ok(visual.eventStream.some((event) => event.lane === "interaction"));
});

test("widget exposes generic availability, ask, and typed response contract", () => {
  const runtime = createMousecatRuntime();
  const availability = runtime.handleTool("mousecat.widget", { action: "available" });
  const requested = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      source: "host.adapter",
      interactionId: "widget-1",
      title: "Widget Pass",
      items: [
        { id: "choice", shape: "decision", prompt: "Choose route", options: [{ label: "Local" }, { label: "Remote" }] },
        { id: "notes", shape: "freeform", prompt: "Add constraint" },
      ],
      constraints: { recommendationFirst: true, allowFreeform: true },
    },
  });
  const answered = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "widget-1",
    responses: [
      { itemId: "choice", selectedOption: "Local", value: "local" },
      { itemId: "notes", notes: "Keep it generic" },
    ],
  });
  const visual = runtime.handleTool("mousecat.visualize", { includeEvents: true, stream: "events" });

  assert.equal(availability.schema, "mousecat.widget.availability/1");
  assert.equal(availability.contract.api.available, "operator_widget.available()");
  assert.deepEqual(Object.keys(availability.contract.api).sort(), [...WIDGET_ACTIONS].sort());
  assert.ok(availability.presentation.adapterProfiles.some((profile) => profile.id === "codex"));
  assert.equal(requested.schema, "mousecat.operator-widget.request/1");
  assert.equal(requested.interaction.items.length, 2);
  assert.equal(answered.schema, "mousecat.operator-widget.result/1");
  assert.equal(answered.status, "answered");
  assert.equal(answered.responses[0].shape, "decision");
  assert.ok(visual.widget.controls.some((control) => control.id === "widget.respond"));
  assert.ok(visual.adapterProfiles.some((profile) => profile.id === "jetbrains"));
  assert.ok(visual.adapterRenderPackets.packets.some((packet) => packet.profileId === "cursor"));
  assert.ok(visual.eventStream.some((event) => event.verb === "answered" && event.subject === "widget-1"));
});

test("widget accepts nonlinear decisions while rejecting invalid and stale targets", () => {
  const runtime = createMousecatRuntime();
  const first = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "stable-interaction",
      items: [
        { id: "first", shape: "decision", prompt: "First", options: [{ label: "A", value: "a" }] },
        { id: "second", shape: "freeform", prompt: "Second" },
      ],
    },
  });
  const collision = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: { interactionId: "stable-interaction", items: [{ id: "replacement", prompt: "Replace" }] },
  });
  const duplicateItems = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: { interactionId: "duplicate-items", items: [{ id: "same", prompt: "A" }, { id: "same", prompt: "B" }] },
  });
  const callerStatus = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: { interactionId: "caller-status", items: [{ id: "one", prompt: "Invalid", status: "held" }] },
  });
  const unknown = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "stable-interaction",
    responses: [{ itemId: "missing", value: "wrong" }],
  });
  const secondAnsweredFirst = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "stable-interaction",
    responses: [{ itemId: "second", value: "answered first" }],
  });
  const unknownOption = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "stable-interaction",
    responses: [{ itemId: "first", selectedOption: "missing-option" }],
  });
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: { interactionId: "later-interaction", items: [{ id: "later", prompt: "Later" }] },
  });
  const laterInteraction = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "later-interaction",
    responses: [{ itemId: "later", value: "independent decision" }],
  });
  const answered = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "stable-interaction",
    responses: [{ itemId: "first", selectedOption: "a", status: "open" }],
  });
  const stale = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "stable-interaction",
    responses: [{ itemId: "first", selectedOption: "a" }],
  });

  assert.equal(first.schema, "mousecat.operator-widget.request/1");
  assert.equal(collision.code, "duplicate-interaction-id");
  assert.equal(duplicateItems.code, "duplicate-interaction-item-id");
  assert.equal(callerStatus.code, "caller-authored-interaction-status");
  assert.equal(unknown.reason, "unknown-interaction-item");
  assert.equal(secondAnsweredFirst.status, "pending");
  assert.equal(unknownOption.reason, "unknown-interaction-option");
  assert.equal(laterInteraction.status, "answered");
  assert.equal(answered.status, "answered");
  assert.equal(answered.responses[0].status, "answered");
  assert.equal(stale.reason, "interaction-item-not-actionable");
  assert.equal(runtime.state.interactions.get("stable-interaction").items[1].status, "answered");
  assert.equal(runtime.handleTool("mousecat.widget", { action: "await", interactionId: "absent" }).interactionId, "absent");
  assert.equal(runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: { interactionId: 7, items: [{ id: "numeric", prompt: "Invalid" }] },
  }).code, "invalid-interaction-id");
});

test("widget cancellation releases a bounded awaiter", async () => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: { interactionId: "cancel-me", items: [{ id: "one", shape: "freeform", prompt: "Wait" }] },
  });
  const controller = new AbortController();
  const waiting = runtime.handleTool(
    "mousecat.widget",
    { action: "await", interactionId: "cancel-me", waitMs: 1000 },
    { signal: controller.signal },
  );
  controller.abort();
  const cancelled = await waiting;

  assert.equal(cancelled.status, "unavailable");
  assert.equal(cancelled.reason, "request-cancelled");
  assert.equal(runtime.handleTool("mousecat.widget", { action: "await", interactionId: "cancel-me" }).status, "pending");
});

test("widget walks an arbitrary interaction sequentially and resolves awaiters only at the terminus", async () => {
  const runtime = createMousecatRuntime();
  const requested = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      source: "neo.mass-assault",
      interactionId: "mass-1",
      items: [
        {
          id: "one",
          shape: "decision",
          prompt: "Pick every useful path",
          selectionMode: "multiple",
          options: [{ label: "A", value: "a" }, { label: "B", value: "b" }, { label: "C", value: "c" }],
        },
        { id: "two", shape: "freeform", prompt: "Add the constraint" },
      ],
    },
  });
  assert.equal(requested.interaction.items[0].selectionMode, "multiple");
  assert.equal(runtime.handleTool("mousecat.widget", { action: "await", interactionId: "mass-1" }).status, "pending");

  let settled = false;
  const waiting = Promise.resolve(runtime.handleTool("mousecat.widget", {
    action: "await",
    interactionId: "mass-1",
    waitMs: 1000,
  })).then((result) => {
    settled = true;
    return result;
  });

  const partial = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "mass-1",
    responses: [{ itemId: "one", selectedOption: "a", selectedOptions: ["a", "c"] }],
  });
  assert.equal(partial.status, "pending");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(settled, false);

  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "mass-1",
    responses: [{ itemId: "two", value: "Keep it host-neutral" }],
  });
  const completed = await waiting;
  assert.equal(completed.status, "answered");
  assert.deepEqual(completed.responses[0].selectedOptions, ["a", "c"]);
  assert.equal(completed.progress.total, 2);
  assert.equal(completed.progress.resolved, 2);
});

test("widget does not inherit native host limits for interaction or option counts", () => {
  const runtime = createMousecatRuntime();
  const options = Array.from({ length: 10 }, (_value, index) => ({
    label: `Reality ${index + 1}`,
    value: `reality-${index + 1}`,
  }));
  const items = Array.from({ length: 20 }, (_value, index) => ({
    id: `thread-${index + 1}`,
    shape: "decision",
    selectionMode: "multiple",
    prompt: `Open thread ${index + 1}`,
    options,
  }));

  const requested = runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      source: "neo.mass-assault",
      interactionId: "mass-20",
      items,
    },
  });
  const availability = runtime.handleTool("mousecat.widget", { action: "available" });

  assert.equal(requested.interaction.items.length, 20);
  assert.equal(requested.interaction.items[0].options.length, 10);
  assert.equal(requested.interaction.items[19].selectionMode, "multiple");
  assert.equal(availability.limits.maxItems, null);
  assert.equal(availability.limits.maxOptionsPerItem, null);
});

test("Crucible invocation normalizes one seam and returns typed lineage for recursion", async () => {
  const runtime = createMousecatRuntime();
  const request = {
    action: "invoke",
    skillRef: "crucible",
    source: { host: "codex", sessionId: "codex-thread-7", invocationId: "decision-3" },
    intake: {
      seams: [{
        id: "public-contract",
        occurredAt: "2026-07-10T02:00:00Z",
        prompt: "Which invocation contract should Mousecat expose?",
        options: [
          { label: "Two workflow tools", value: "two-tools" },
          { label: "One skill adapter", value: "skill-adapter", recommended: true },
        ],
        allowFreeform: true,
      }],
    },
  };

  const invoked = await runtime.handleTool("mousecat.skill", request);
  const replayWithoutToken = await runtime.handleTool("mousecat.skill", request);
  const replayWithWrongToken = await runtime.handleTool("mousecat.skill", { ...request, continuationToken: "wrong" });
  const replayed = await runtime.handleTool("mousecat.skill", {
    ...request,
    continuationToken: invoked.continuation.arguments.continuationToken,
  });
  const conflict = await runtime.handleTool("mousecat.skill", {
    ...request,
    intake: { seams: [{ ...request.intake.seams[0], prompt: "A different decision" }] },
  });
  const interaction = runtime.state.interactions.get(invoked.interactionId);
  const missingToken = await runtime.handleTool("mousecat.skill", { action: "await", interactionId: invoked.interactionId });
  const invalidToken = await runtime.handleTool("mousecat.skill", {
    action: "await",
    interactionId: invoked.interactionId,
    continuationToken: "wrong",
  });

  assert.equal(invoked.schema, "mousecat.skill-invocation/2");
  assert.equal(invoked.status, "pending");
  assert.equal(invoked.skillRef, "crucible");
  assert.equal(invoked.intake.seamCount, 1);
  assert.equal(invoked.intake.rawTranscriptAccepted, false);
  assert.equal(invoked.continuation.tool, "mousecat.skill");
  assert.equal(replayWithoutToken.code, "skill-continuation-token-required");
  assert.equal(replayWithWrongToken.code, "skill-continuation-token-invalid");
  assert.equal(replayed.interactionId, invoked.interactionId);
  assert.equal(replayed.idempotentReplay, true);
  assert.equal(conflict.code, "skill-invocation-id-conflict");
  assert.equal(missingToken.code, "skill-continuation-token-required");
  assert.equal(invalidToken.code, "skill-continuation-token-invalid");
  assert.equal(interaction.source, "codex.crucible");
  assert.equal(interaction.options, undefined);
  assert.equal(interaction.items[0].options[0].value, "skill-adapter");
  assert.match(interaction.items[0].options[0].label, /Recommended/u);

  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: invoked.interactionId,
    responses: [{
      itemId: invoked.items[0].id,
      selectedOption: "skill-adapter",
      value: "skill-adapter",
      notes: "Keep mousecat.widget canonical underneath.",
    }],
  });
  const returned = await runtime.handleTool("mousecat.skill", {
    action: "await",
    interactionId: invoked.interactionId,
    continuationToken: invoked.continuation.arguments.continuationToken,
  });

  assert.equal(returned.status, "answered");
  assert.equal(returned.responses[0].value, "skill-adapter");
  assert.equal(returned.responses[0].lineage.host, "codex");
  assert.equal(returned.responses[0].lineage.sessionId, "codex-thread-7");
  assert.equal(returned.responses[0].lineage.threadId, "public-contract");
  assert.equal(returned.continuation.obligation, "route-framework-context");
  assert.equal(returned.continuation.framework.frameworkRef, "recursive-deliberation");
  assert.equal(returned.continuation.framework.fixedNextSkill, null);
  assert.deepEqual(returned.continuation.framework.availableSkillRefs, ["crucible", "total-recall", "mass-assault"]);
});

test("Crucible binds a narrative ML review into invocation identity", async () => {
  const runtime = createMousecatRuntime();
  const review = exampleMlReview();
  const request = {
    action: "invoke",
    skillRef: "crucible",
    source: { host: "codex", sessionId: "retriever-design", invocationId: "target-policy" },
    intake: {
      seams: [{
        id: "retriever-target-policy",
        prompt: "How should retriever targets be authored?",
        shape: "architecture",
        mlReview: review,
      }],
    },
  };
  const invoked = await runtime.handleTool("mousecat.skill", request);
  const changed = await runtime.handleTool("mousecat.skill", {
    ...request,
    continuationToken: invoked.continuation.arguments.continuationToken,
    intake: {
      seams: [{
        ...request.intake.seams[0],
        mlReview: {
          ...review,
          proposedLearning: [{ label: "Bearer", value: "A different person" }],
        },
      }],
    },
  });
  const invalid = await createMousecatRuntime().handleTool("mousecat.skill", {
    ...request,
    source: { ...request.source, invocationId: "invalid-review" },
    intake: { seams: [{ ...request.intake.seams[0], mlReview: { ...review, schema: "unknown" } }] },
  });

  assert.deepEqual(runtime.state.interactions.get(invoked.interactionId).items[0].mlReview, review);
  assert.equal(changed.code, "skill-invocation-id-conflict");
  assert.equal(invalid.code, "invalid-ml-review");
  assert.equal(invalid.field, "mlReview.schema");
});

test("skill invocation identity is session-scoped and object-key-stable", async () => {
  const runtime = createMousecatRuntime();
  const base = {
    action: "invoke",
    skillRef: "crucible",
    source: { host: "codex", sessionId: "session-a", invocationId: "local-decision-1" },
    intake: {
      seams: [{
        id: "object-choice",
        prompt: "Choose the object value",
        options: [{ label: "Structured", value: { alpha: 1, beta: 2 } }],
      }],
    },
  };
  const first = await runtime.handleTool("mousecat.skill", base);
  const replayed = await runtime.handleTool("mousecat.skill", {
    ...base,
    continuationToken: first.continuation.arguments.continuationToken,
    intake: {
      seams: [{
        ...base.intake.seams[0],
        options: [{ label: "Structured", value: { beta: 2, alpha: 1 } }],
      }],
    },
  });
  const secondSession = await runtime.handleTool("mousecat.skill", {
    ...base,
    source: { ...base.source, sessionId: "session-b" },
  });

  assert.equal(replayed.idempotentReplay, true);
  assert.equal(replayed.interactionId, first.interactionId);
  assert.notEqual(secondSession.interactionId, first.interactionId);
});

test("Mass Assault normalizes multiple sessions into one chronological widget return", async () => {
  const runtime = createMousecatRuntime();
  const sessions = [
    {
      sessionId: "later-session",
      startedAt: "2026-07-10T03:00:00Z",
      seams: [
        { id: "later-a", occurredAt: "2026-07-10T03:00:00Z", prompt: "Later A", options: [{ label: "Accept", value: "accept" }] },
        { id: "later-b", occurredAt: "2026-07-10T03:01:00Z", prompt: "Later B", shape: "freeform" },
      ],
    },
    {
      sessionId: "earlier-session",
      startedAt: "2026-07-10T01:00:00Z",
      seams: [
        { id: "earlier-a", occurredAt: "2026-07-10T01:00:00Z", prompt: "Earlier A", options: [{ label: "Accept", value: "accept" }] },
        { id: "earlier-b", occurredAt: "2026-07-10T01:01:00Z", prompt: "Earlier B", shape: "freeform" },
      ],
    },
  ];
  const invoked = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "claude", invocationId: "recall-pass-9" },
    intake: { sessions },
  });
  const reordered = await createMousecatRuntime().handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "claude", invocationId: "recall-pass-reordered" },
    intake: { sessions: [...sessions].reverse() },
  });
  const interaction = runtime.state.interactions.get(invoked.interactionId);

  assert.equal(invoked.intake.ordering, "occurred-at");
  assert.equal(invoked.intake.seamCount, 4);
  assert.deepEqual(invoked.items.map((item) => item.lineage.threadId), ["earlier-a", "earlier-b", "later-a", "later-b"]);
  assert.deepEqual(reordered.items.map((item) => item.id), invoked.items.map((item) => item.id));
  assert.equal(interaction.items.length, 4);

  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: invoked.interactionId,
    responses: interaction.items.map((item) => ({
      itemId: item.id,
      value: item.options[0]?.value || `answer-${item.metadata.lineage.threadId}`,
      ...(item.options[0] ? { selectedOption: item.options[0].value } : {}),
    })),
  });
  const returned = await runtime.handleTool("mousecat.skill", {
    action: "await",
    interactionId: invoked.interactionId,
    continuationToken: invoked.continuation.arguments.continuationToken,
  });

  assert.equal(returned.status, "answered");
  assert.equal(returned.responses.length, 4);
  assert.deepEqual(returned.responses.map((response) => response.lineage.threadId), ["earlier-a", "earlier-b", "later-a", "later-b"]);
  assert.equal(returned.continuation.obligation, "route-framework-context");
  assert.equal(returned.continuation.framework.previousSkillRef, "mass-assault");
});

test("deferred decisions remain pending and can be answered later", async () => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "nonlinear-docket",
      items: [
        { id: "now", shape: "freeform", prompt: "Answer now" },
        { id: "later", shape: "freeform", prompt: "Answer later" },
      ],
    },
  });
  const deferred = runtime.handleTool("mousecat.widget", {
    action: "defer",
    interactionId: "nonlinear-docket",
    responses: [{ itemId: "later", notes: "operator-deferred" }],
  });
  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "nonlinear-docket",
    responses: [{ itemId: "now", value: "first answer" }],
  });
  const pending = await runtime.handleTool("mousecat.widget", { action: "await", interactionId: "nonlinear-docket" });
  const completed = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "nonlinear-docket",
    responses: [{ itemId: "later", value: "later answer" }],
  });

  assert.equal(deferred.status, "pending");
  assert.equal(deferred.progress.deferred, 1);
  assert.equal(pending.status, "pending");
  assert.equal(completed.status, "answered");
  assert.deepEqual(completed.responses.map((response) => response.value), ["first answer", "later answer"]);
});

test("Total Recall is a read-shaped framework skill with contextual handoff", async () => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.session", { action: "start", sessionId: "recall-session", facts: { host: "codex" } });
  runtime.handleTool("mousecat.queue", {
    action: "enqueue",
    sessionId: "recall-session",
    item: { id: "open-seam", prompt: "Resolve the open seam", shape: "decision" },
  });

  const recalled = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "total-recall",
    source: { host: "codex", sessionId: "recall-session", invocationId: "recall-1" },
  });

  assert.equal(recalled.schema, "mousecat.skill-invocation/2");
  assert.equal(recalled.status, "observed");
  assert.equal(recalled.skillRef, "total-recall");
  assert.equal(recalled.interactionId, null);
  assert.equal(recalled.intake.returnExpectation, "chronological-open-seam-map");
  assert.equal(recalled.recall.schema, "mousecat.total-recall/1");
  assert.equal(recalled.recall.openThreads.length, 1);
  assert.equal(recalled.continuation.obligation, "route-framework-context");
  assert.equal(recalled.continuation.framework.previousSkillRef, "total-recall");
  assert.equal(recalled.continuation.framework.fixedNextSkill, null);
});

test("framework handoff dynamically invokes any compatible member and records route provenance", async () => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.session", { action: "start", sessionId: "handoff-session", facts: { host: "codex" } });

  const previous = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "crucible",
    source: { host: "codex", sessionId: "handoff-session", invocationId: "handoff-origin" },
    intake: { seams: [{ id: "handoff-origin-seam", prompt: "Resolve the origin before routing." }] },
  });
  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: previous.interactionId,
    responses: [{ itemId: previous.items[0].id, value: "resolved" }],
  });
  const terminal = await runtime.handleTool("mousecat.skill", {
    action: "await",
    interactionId: previous.interactionId,
    continuationToken: previous.continuation.arguments.continuationToken,
  });

  const handoff = await runtime.handleTool("mousecat.skill", {
    action: "handoff",
    previousSkillRef: "crucible",
    previousResultRef: terminal.continuation.framework.resultRef,
    previousResultToken: terminal.continuation.framework.resultToken,
    skillRef: "total-recall",
    source: { host: "codex", sessionId: "handoff-session", invocationId: "handoff-1" },
    route: {
      selectedBy: "neo",
      reason: "The resolved decision changed session assumptions and requires reconstruction.",
      contextRef: "decision:framework-shape",
    },
  });

  assert.equal(handoff.schema, "mousecat.framework-handoff/1");
  assert.equal(handoff.ok, true);
  assert.equal(handoff.route.frameworkRef, "recursive-deliberation");
  assert.equal(handoff.route.fromSkillRef, "crucible");
  assert.equal(handoff.route.toSkillRef, "total-recall");
  assert.equal(handoff.route.fixedTransition, false);
  assert.equal(handoff.result.skillRef, "total-recall");
  assert.equal(handoff.result.status, "observed");
  assert.ok(runtime.state.events.some((event) => event.type === "framework.routed"));

  const fabricated = await runtime.handleTool("mousecat.skill", {
    action: "handoff",
    previousSkillRef: "crucible",
    previousResultRef: "fabricated",
    previousResultToken: ["fab", "ricated"].join(""),
    skillRef: "total-recall",
    source: { host: "codex", sessionId: "handoff-session", invocationId: "handoff-fabricated" },
    route: { selectedBy: "calling-model", reason: "Fabricated route." },
  });
  assert.equal(fabricated.code, "framework-handoff-result-capability-invalid");
});

test("skill intake rejects transcripts and invalid Crucible cardinality before opening the widget", async () => {
  const runtime = createMousecatRuntime();
  const transcript = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", invocationId: "raw-transcript" },
    intake: { sessions: [{ sessionId: "raw", messages: [{ role: "user", content: "private" }] }] },
  });
  const seamTranscript = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", invocationId: "raw-seam-transcript" },
    intake: { seams: [{ id: "raw", prompt: "Private", order: 1, transcript: "private" }] },
  });
  const nestedMessages = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", invocationId: "nested-messages" },
    intake: { sessions: [{ sessionId: "raw", seams: [{ id: "raw", prompt: "Private", order: 1, metadata: { messages: [] } }] }] },
  });
  const cardinality = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "crucible",
    source: { host: "codex", invocationId: "too-many" },
    intake: { seams: [{ id: "one", prompt: "One", order: 1 }, { id: "two", prompt: "Two", order: 2 }] },
  });
  const missingPrompt = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", invocationId: "missing-prompt" },
    intake: { seams: [{ id: "missing" }] },
  });
  const incompleteChronology = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", invocationId: "mixed-order" },
    intake: { seams: [{ id: "one", prompt: "One", order: 1 }, { id: "two", prompt: "Two" }] },
  });
  const duplicateLineage = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", sessionId: "same-session", invocationId: "duplicate-lineage" },
    intake: { seams: [{ id: "same", prompt: "One", order: 1 }, { id: "same", prompt: "Two", order: 2 }] },
  });
  const duplicateOrdinal = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", invocationId: "duplicate-ordinal" },
    intake: { seams: [{ id: "one", prompt: "One", order: 1 }, { id: "two", prompt: "Two", order: 1 }] },
  });
  const duplicateTimestamp = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", invocationId: "duplicate-timestamp" },
    intake: {
      seams: [
        { id: "one", prompt: "One", occurredAt: "2026-07-10T01:00:00Z" },
        { id: "two", prompt: "Two", occurredAt: "2026-07-10T01:00:00Z" },
      ],
    },
  });
  const mixedTimestampSource = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", invocationId: "mixed-timestamp-source" },
    intake: {
      sessions: [{
        sessionId: "session-started",
        startedAt: "2026-07-10T01:00:00Z",
        seams: [
          { id: "explicit", prompt: "Explicit", occurredAt: "2026-07-10T02:00:00Z" },
          { id: "inherited", prompt: "Must not inherit the session timestamp" },
        ],
      }],
    },
  });

  assert.equal(transcript.code, "raw-session-transcript-not-accepted");
  assert.equal(seamTranscript.code, "raw-session-transcript-not-accepted");
  assert.equal(nestedMessages.code, "raw-session-transcript-not-accepted");
  assert.equal(cardinality.code, "crucible-requires-one-seam");
  assert.equal(missingPrompt.code, "skill-seam-prompt-required");
  assert.equal(incompleteChronology.code, "incomplete-skill-chronology");
  assert.equal(duplicateLineage.code, "duplicate-skill-seam-id");
  assert.equal(duplicateOrdinal.code, "ambiguous-skill-chronology");
  assert.equal(duplicateTimestamp.code, "ambiguous-skill-chronology");
  assert.equal(mixedTimestampSource.code, "incomplete-skill-chronology");
  assert.equal(runtime.state.interactions.size, 0);
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

test("host session heartbeats register provider-neutral cross-host presence", () => {
  const runtime = createMousecatRuntime();
  const first = runtime.handleTool("mousecat.session", {
    action: "heartbeat",
    sessionId: "custom-session-1",
    facts: { host: "pyharness", provider: "ollama", model: "local-model", objective: "Compile a custom skill" },
  });
  const second = runtime.handleTool("mousecat.session", {
    action: "heartbeat",
    sessionId: "custom-session-1",
    facts: { objective: "Render the custom skill" },
  });
  const closed = runtime.handleTool("mousecat.session", { action: "close", sessionId: "custom-session-1" });

  assert.equal(first.created, true);
  assert.equal(first.session.status, "active");
  assert.equal(second.created, false);
  assert.equal(second.session.facts.host, "pyharness");
  assert.equal(second.session.facts.provider, "ollama");
  assert.equal(second.session.facts.objective, "Render the custom skill");
  assert.equal(closed.session.status, "closed");
  assert.ok(runtime.state.events.some((event) => event.type === "session.heartbeat"));
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

test("local state persists recursive dockets across runtime processes", () => {
  const { dir, config } = tempStateConfig();
  try {
    const first = createMousecatRuntime({ config });
    first.handleTool("mousecat.session", { action: "start", sessionId: "neo-recursive" });
    first.handleTool("mousecat.queue", {
      action: "enqueue",
      sessionId: "neo-recursive",
      source: "neo.execution-loop",
      item: {
        id: "next-slice",
        prompt: "Build the next recursive Mousecat slice",
        shape: "queue",
      },
    });

    const second = createMousecatRuntime({ config });
    const recall = second.handleTool("mousecat.session", { action: "total-recall" });
    const snapshot = second.handleTool("mousecat.session", { action: "snapshot" });

    assert.equal(second.status().state.persistence.loaded, true);
    assert.equal(snapshot.snapshot.sessions[0].id, "neo-recursive");
    assert.equal(recall.openThreads.length, 1);
    assert.equal(recall.openThreads[0].id, "next-slice");
    assert.equal(recall.crucibleQueue[0].evidence, "neo.execution-loop");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("persisted skill intake resumes with the caller-held continuation capability", async () => {
  const { dir, path, config } = tempStateConfig();
  try {
    const first = createMousecatRuntime({ config });
    const invoked = await first.handleTool("mousecat.skill", {
      action: "invoke",
      skillRef: "crucible",
      source: { host: "codex", sessionId: "persisted-session", invocationId: "persisted-invocation" },
      intake: { seams: [{ id: "persisted-thread", prompt: "Persist this decision" }] },
    });
    const continuationToken = invoked.continuation.arguments.continuationToken;
    first.handleTool("mousecat.widget", {
      action: "respond",
      interactionId: invoked.interactionId,
      responses: [{ itemId: invoked.items[0].id, value: "persisted-answer" }],
    });

    const serialized = readFileSync(path, "utf8");
    assert.doesNotMatch(serialized, new RegExp(continuationToken, "u"));
    const second = createMousecatRuntime({ config });
    const returned = await second.handleTool("mousecat.skill", {
      action: "await",
      interactionId: invoked.interactionId,
      continuationToken,
    });

    assert.equal(returned.status, "answered");
    assert.equal(returned.responses[0].value, "persisted-answer");
    assert.equal(returned.responses[0].lineage.threadId, "persisted-thread");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("operator answers survive disconnected skill callers and consecutive runtime restarts", async () => {
  const { dir, path, config } = tempStateConfig();
  try {
    const first = createMousecatRuntime({ config });
    first.handleTool("mousecat.session", { action: "start", sessionId: "offline-session" });
    const invoked = await first.handleTool("mousecat.skill", {
      action: "invoke",
      skillRef: "crucible",
      source: { host: "codex", sessionId: "offline-session", invocationId: "offline-invocation" },
      intake: { seams: [{ id: "offline-thread", prompt: "Review while the host is offline", allowFreeform: true,
        options: [{ label: "Trial", value: "trial" }, { label: "Adopt", value: "adopt" }] }] },
    });
    const continuationToken = invoked.continuation.arguments.continuationToken;
    const closed = first.handleTool("mousecat.session", { action: "close", sessionId: "offline-session" });
    assert.equal(closed.session.status, "closed");
    const second = createMousecatRuntime({ config });
    const wall = second.handleTool("mousecat.widget", { action: "snapshot" });
    assert.equal(wall.interactions[0].interactionId, invoked.interactionId);
    assert.deepEqual(wall.interactions[0].items[0].options.map((option) => option.value), ["trial", "adopt"]);
    const response = { itemId: invoked.items[0].id, selectedOption: "trial", value: "Only the offline trial", notes: "Preserve this condition exactly" };
    const answered = second.handleTool("mousecat.widget", { action: "respond", interactionId: invoked.interactionId, responses: [response] });
    assert.equal(answered.status, "answered");

    const third = createMousecatRuntime({ config });
    assert.equal(third.handleTool("mousecat.widget", { action: "snapshot" }).interactions.length, 0);
    assert.equal(third.status().counts.archivedInteractions, 1);
    const invalidCapability = "not-the-capability";
    const denied = await third.handleTool("mousecat.skill", { action: "await", interactionId: invoked.interactionId, continuationToken: invalidCapability });
    assert.equal(denied.code, "skill-continuation-token-invalid");
    const returned = await third.handleTool("mousecat.skill", { action: "await", interactionId: invoked.interactionId, continuationToken });
    assert.equal(returned.status, "answered");
    for (const [key, value] of Object.entries(response)) assert.deepEqual(returned.responses[0][key], value);
    assert.equal(returned.responses[0].lineage.threadId, "offline-thread");
    assert.equal(returned.continuation.framework.resultRef, invoked.interactionId);
    assert.equal(returned.continuation.framework.resultToken, continuationToken);
    assert.equal(third.status().counts.archivedInteractions, 1, "result retrieval must not put completed work back on the wall");
    assert.doesNotMatch(readFileSync(path, "utf8"), new RegExp(continuationToken, "u"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restart restores deferred and legacy archived questions but keeps terminal work archived", () => {
  const { dir, config } = tempStateConfig();
  try {
    const first = createMousecatRuntime({ config });
    for (const id of ["deferred", "held", "withdrawn", "legacy"]) {
      first.handleTool("mousecat.ask", { interactionId: id, items: [{ id: "one", prompt: `Question ${id}` }] });
    }
    first.handleTool("mousecat.widget", { action: "defer", interactionId: "deferred", responses: [{ itemId: "one", reason: "Return later" }] });
    first.handleTool("mousecat.widget", { action: "hold", interactionId: "held", responses: [{ itemId: "one", reason: "Blocked" }] });
    first.handleTool("mousecat.widget", { action: "close", interactionId: "withdrawn" });
    first.state.archivedInteractions.set("legacy", first.state.interactions.get("legacy"));
    first.state.interactions.delete("legacy");
    first.handleTool("mousecat.session", { action: "heartbeat", sessionId: "flush-legacy-state" });

    const second = createMousecatRuntime({ config });
    const wall = second.handleTool("mousecat.widget", { action: "snapshot" });
    assert.deepEqual(wall.interactions.map((interaction) => interaction.interactionId).sort(), ["deferred", "legacy"]);
    assert.equal(wall.interactions.find((interaction) => interaction.interactionId === "deferred").items[0].status, "deferred");
    assert.equal(second.status().counts.archivedInteractions, 2);
    const answered = second.handleTool("mousecat.widget", { action: "respond", interactionId: "deferred", responses: [{ itemId: "one", value: "Ready now" }] });
    assert.equal(answered.status, "answered");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restart keeps redacted questions nonanswerable while restoring safe items in mixed work", async () => {
  const { dir, path, config } = tempStateConfig();
  try {
    const first = createMousecatRuntime({ config });
    for (const interactionId of ["private-only", "mixed"]) {
      first.handleTool("mousecat.ask", { interactionId, items: [
        { id: "private", prompt: "Private prompt never persisted", sensitive: true },
        ...(interactionId === "mixed" ? [{ id: "safe", prompt: "Safe pending prompt" }] : []),
      ] });
    }
    const second = createMousecatRuntime({ config });
    assert.deepEqual(second.handleTool("mousecat.widget", { action: "snapshot" }).interactions.map((interaction) => interaction.interactionId), ["mixed"]);
    const pending = await second.handleTool("mousecat.widget", { action: "await", interactionId: "private-only", waitMs: 1 });
    assert.equal(pending.status, "pending");
    assert.equal(second.status().counts.archivedInteractions, 1);
    const archivedRejected = second.handleTool("mousecat.widget", { action: "respond", interactionId: "private-only", responses: [{ itemId: "private", value: "Cannot answer missing context" }] });
    assert.equal(archivedRejected.reason, "unknown-interaction");
    const rejected = second.handleTool("mousecat.widget", { action: "respond", interactionId: "mixed", responses: [{ itemId: "private", value: "Cannot answer missing context" }] });
    assert.equal(rejected.reason, "interaction-item-redacted");
    assert.equal(second.state.interactions.get("mixed").items[0].status, "open");
    second.handleTool("mousecat.widget", { action: "respond", interactionId: "mixed", responses: [{ itemId: "safe", value: "Safe answer" }] });
    const third = createMousecatRuntime({ config });
    assert.equal(third.handleTool("mousecat.widget", { action: "snapshot" }).interactions.length, 0);
    assert.equal(third.status().counts.archivedInteractions, 2);
    assert.doesNotMatch(readFileSync(path, "utf8"), /Private prompt never persisted|Cannot answer missing context/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withdrawing archived redacted work immediately resolves an active caller wait", async () => {
  const { dir, config } = tempStateConfig();
  try {
    const first = createMousecatRuntime({ config });
    first.handleTool("mousecat.ask", {
      interactionId: "archived-private-wait",
      items: [{ id: "private", prompt: "Private pending question", sensitive: true }],
    });
    const second = createMousecatRuntime({ config });
    assert.equal(second.state.interactions.size, 0);
    assert.equal(second.state.archivedInteractions.size, 1);
    const waiting = second.handleTool("mousecat.widget", {
      action: "await", interactionId: "archived-private-wait", waitMs: 600,
    });
    const closed = second.handleTool("mousecat.widget", {
      action: "close", interactionId: "archived-private-wait",
    });
    assert.equal(closed.status, "withdrawn");
    const settled = await Promise.race([waiting, Promise.resolve(null)]);
    assert.equal(settled?.status, "withdrawn", "withdrawal must settle the waiter immediately without waiting for its timeout");
    assert.equal(second.state.interactions.size, 0);
    assert.equal(second.state.archivedInteractions.size, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("local state persists bounded route plans across runtime processes", () => {
  const { dir, path, config } = tempStateConfig();
  config.state.maxRoutePlans = 1;
  try {
    const first = createMousecatRuntime({ config });
    first.handleTool("mousecat.route", {
      upstream: "neo",
      capability: "crucible_classify_v1",
      intent: "first recursive route",
    });
    const routed = first.handleTool("mousecat.route", {
      upstream: "github",
      capability: "pull-request",
      intent: "second recursive route",
    });

    const saved = JSON.parse(readFileSync(path, "utf8"));
    const second = createMousecatRuntime({ config });
    const recall = second.handleTool("mousecat.session", { action: "total-recall" });

    assert.equal(routed.routeCache.size, 1);
    assert.equal(saved.policy.routePlansCached, true);
    assert.equal(saved.routePlans.length, 1);
    assert.equal(saved.routePlans[0].plan.upstream, "github");
    assert.equal(second.status().counts.routePlans, 1);
    assert.equal(recall.routeCache.count, 1);
    assert.equal(recall.routeCache.latest.plan.capability, "pull-request");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("widget validates required, single-select, and freeform response semantics", () => {
  const cases = [
    { id: "required", item: { required: true }, response: { value: "" }, reason: "interaction-response-required" },
    {
      id: "single",
      item: { selectionMode: "single", options: [{ value: "a" }, { value: "b" }] },
      response: { selectedOptions: ["a", "b"] },
      reason: "multiple-options-not-allowed",
    },
    {
      id: "closed",
      item: { allowFreeform: false, options: [{ value: "a" }] },
      response: { selectedOption: "a", value: "outside" },
      reason: "interaction-freeform-not-allowed",
    },
  ];
  for (const entry of cases) {
    const runtime = createMousecatRuntime();
    runtime.handleTool("mousecat.widget", {
      action: "ask",
      request: { interactionId: entry.id, items: [{ id: "one", prompt: "Choose", ...entry.item }] },
    });
    const result = runtime.handleTool("mousecat.widget", {
      action: "respond",
      interactionId: entry.id,
      responses: [{ itemId: "one", ...entry.response }],
    });
    assert.equal(result.reason, entry.reason);
  }

  const aliases = createMousecatRuntime();
  aliases.handleTool("mousecat.widget", {
    action: "ask",
    request: { interactionId: "aliases", items: [{ id: "one", prompt: "Choose", allowFreeform: false, options: [{ label: "A", value: "a" }] }] },
  });
  const accepted = aliases.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "aliases",
    responses: [{ itemId: "one", selectedOption: "A", selectedOptions: ["a"], value: "a" }],
  });
  assert.equal(accepted.status, "answered");

  const checklist = createMousecatRuntime();
  checklist.handleTool("mousecat.widget", {
    action: "ask",
    request: { interactionId: "checklist", items: [{ id: "one", shape: "checklist", prompt: "Check", options: [{ value: "a" }, { value: "b" }] }] },
  });
  assert.equal(checklist.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "checklist",
    responses: [{ itemId: "one", checklist: ["a", "b"], selectedOptions: ["a", "b"], value: ["a", "b"] }],
  }).status, "answered");
});

test("generated interaction identities remain unique across bounded-state reloads", () => {
  const { dir, config } = tempStateConfig();
  config.state.maxEvents = 1;
  try {
    const first = createMousecatRuntime({ config });
    const firstAsk = first.handleTool("mousecat.ask", { prompt: "First generated interaction" });
    const second = createMousecatRuntime({ config });
    const secondAsk = second.handleTool("mousecat.ask", { prompt: "Second generated interaction" });
    const third = createMousecatRuntime({ config });
    const thirdAsk = third.handleTool("mousecat.ask", { prompt: "Third generated interaction" });

    assert.equal(firstAsk.schema, "mousecat.interaction/1");
    assert.equal(secondAsk.schema, "mousecat.interaction/1");
    assert.equal(thirdAsk.schema, "mousecat.interaction/1");
    assert.equal(new Set([
      firstAsk.interaction.interactionId,
      secondAsk.interaction.interactionId,
      thirdAsk.interaction.interactionId,
    ]).size, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("host-state binding exposes adapter-scoped records with public redaction", () => {
  const tokenKey = "to" + "ken";
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.session", { action: "start", sessionId: "cli-session" });
  runtime.handleTool("mousecat.ask", {
    sessionId: "cli-session",
    interactionId: "host-state-sensitive",
    items: [
      {
        id: "secret-note",
        prompt: "Private operator note",
        title: "Private title",
        shape: "freeform",
        sensitive: true,
        options: [{ label: "Contains private context" }],
        recommendedDefault: "Private recommendation",
        metadata: { privateContext: "private metadata" },
      },
    ],
  });
  runtime.handleTool("mousecat.queue", {
    action: "enqueue",
    sessionId: "cli-session",
    item: { id: "next-host-step", prompt: "Bind CLI host state", shape: "queue" },
  });
  runtime.handleTool("mousecat.route", {
    upstream: "neo",
    capability: "total_recall_v1",
    intent: "host binding route",
  });
  runtime.emit("connector.blocked", {
    upstream: "neo",
    [tokenKey]: "not-public",
  });

  const binding = runtime.handleTool("mousecat.host-state", { profileId: "cli", limit: 10 });

  assert.equal(binding.schema, "mousecat.host-state.binding/1");
  assert.equal(binding.ok, true);
  assert.equal(binding.profileId, "cli");
  assert.equal(binding.adapterProfileSource, "request");
  assert.equal(binding.adapter.scope, "process");
  assert.equal(binding.renderPacket.profileId, "cli");
  assert.ok(binding.commands.reads.includes("mousecat.session"));
  assert.equal(binding.commands.host.schema, "mousecat.host-command-pack/1");
  assert.equal(binding.commands.host.binding.cli.command, "mousecat host-state cli");
  assert.equal(binding.renderPacket.commands.binding.mcp.arguments.profileId, "cli");
  assert.ok(binding.records.sessions.some((session) => session.id === "cli-session"));
  assert.ok(binding.records.queue.some((item) => item.id === "next-host-step"));
  assert.equal(binding.records.interactions[0].items[0].prompt, "[sensitive-redacted]");
  assert.equal(binding.records.interactions[0].items[0].title, "[sensitive-redacted]");
  assert.deepEqual(binding.records.interactions[0].items[0].options, []);
  assert.deepEqual(binding.records.interactions[0].items[0].metadata, {});
  assert.equal(binding.records.interactions[0].items[0].recommendedDefault, null);
  assert.equal(binding.records.routePlans.length, 1);
  assert.ok(binding.records.events.some((event) => event.data[tokenKey] === "[sensitive-redacted]"));
});

test("visualizer applies the public redaction boundary to records and events", () => {
  const tokenKey = "to" + "ken";
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "visualizer-sensitive",
      source: "private interaction source",
      items: [{
        id: "private-item",
        prompt: "private prompt",
        title: "private title",
        shape: "freeform",
        sensitive: true,
        metadata: { privateContext: "private metadata" },
      }],
    },
  });
  runtime.handleTool("mousecat.queue", {
    action: "enqueue",
    item: {
      id: "private-queue-item",
      prompt: "private queue prompt",
      shape: "review",
      sensitive: true,
      metadata: { privateContext: "private queue metadata" },
    },
  });
  runtime.emit("connector.blocked", { upstream: "neo", [tokenKey]: "private event value" });

  const visual = runtime.handleTool("mousecat.visualize", { includeEvents: true, stream: "events" });
  const serialized = JSON.stringify(visual);

  assert.equal(visual.interactions[0].items[0].prompt, "[sensitive-redacted]");
  assert.deepEqual(visual.interactions[0].items[0].metadata, {});
  assert.equal(visual.queue[0].prompt, "[sensitive-redacted]");
  assert.deepEqual(visual.queue[0].metadata, {});
  assert.ok(visual.events.some((event) => event.data[tokenKey] === "[sensitive-redacted]"));
  assert.ok(visual.eventStream.some((event) => event.data[tokenKey] === "[sensitive-redacted]"));
  assert.doesNotMatch(serialized, /private interaction source|private prompt|private title|private metadata|private queue prompt|private queue metadata|private event value/);
});

test("host-state binding normalizes unknown hosts through the generic MCP contract", () => {
  const runtime = createMousecatRuntime({ config: { hostProfile: "ci" } });
  const fallback = runtime.handleTool("mousecat.host-state", {});
  const custom = runtime.handleTool("mousecat.host-state", { profileId: "pyharness" });

  assert.equal(fallback.ok, true);
  assert.equal(fallback.profileId, "generic-mcp");
  assert.equal(custom.ok, true);
  assert.equal(custom.profileId, "pyharness");
  assert.equal(custom.adapter.profileId, "pyharness");
  assert.equal(custom.adapter.scope, "host");
  assert.equal(custom.renderPacket.host.kind, "custom-mcp-host");
});

test("host-state binding uses configured adapter profile when no profile is requested", () => {
  const runtime = createMousecatRuntime({
    config: {
      hostProfile: "codex-thread",
      adapterProfile: "codex",
    },
  });
  const status = runtime.status();
  const binding = runtime.handleTool("mousecat.host-state", {});
  const custom = createMousecatRuntime({
    config: {
      hostProfile: "broken-host",
      adapterProfile: "missing-host",
    },
  }).handleTool("mousecat.host-state", {});

  assert.equal(status.config.hostProfile, "codex-thread");
  assert.equal(status.config.adapterProfile, "codex");
  assert.equal(binding.ok, true);
  assert.equal(binding.profileId, "codex");
  assert.equal(binding.hostProfile, "codex-thread");
  assert.equal(binding.adapterProfileSource, "config");
  assert.equal(custom.ok, true);
  assert.equal(custom.profileId, "missing-host");
  assert.equal(custom.renderPacket.host.kind, "custom-mcp-host");
});

test("local state redacts sensitive and secret-shaped fields before disk writes", () => {
  const { dir, path, config } = tempStateConfig();
  try {
    const tokenKey = "to" + "ken";
    const passwordKey = "pass" + "word";
    const runtime = createMousecatRuntime({ config });
    runtime.handleTool("mousecat.ask", {
      interactionId: "sensitive-chain",
      source: "private-source-name",
      title: "private interaction title",
      skillRef: "private.skill.ref",
      items: [
        {
          id: "secret-note",
          prompt: "Paste the private token",
          shape: "freeform",
          sensitive: true,
          options: [{ label: "Contains token" }],
        },
      ],
    });
    runtime.handleTool("mousecat.widget", {
      action: "respond",
      interactionId: "sensitive-chain",
      responses: [{
        itemId: "secret-note",
        status: "open",
        value: "classified value",
        selectedOption: "Contains token",
        selectedOptions: ["Contains token"],
        checklist: ["Contains token"],
        ranking: [{ value: "Contains token", rank: 1 }],
        notes: "classified notes",
      }],
    });
    runtime.emit("connector.blocked", {
      upstream: "neo",
      [tokenKey]: "not-written",
      nested: { [passwordKey]: "also-not-written" },
    });

    const saved = JSON.parse(readFileSync(path, "utf8"));
    const item = saved.interactions[0].items[0];
    const event = saved.events.at(-1);

    assert.equal(saved.policy.credentialValuesStored, false);
    assert.equal(saved.policy.sensitiveItemsRedacted, true);
    assert.equal(saved.interactions[0].source, "[sensitive-redacted]");
    assert.equal(saved.interactions[0].title, "[sensitive-redacted]");
    assert.equal(saved.interactions[0].skillRef, null);
    assert.equal(item.prompt, "[sensitive-redacted]");
    assert.deepEqual(item.options, []);
    assert.equal(item.response.status, "answered");
    assert.equal(item.response.value, null);
    assert.equal(item.response.selectedOption, null);
    assert.equal(item.response.selectedOptions, null);
    assert.equal(item.response.checklist, null);
    assert.equal(item.response.ranking, null);
    assert.equal(item.response.notes, "[sensitive-redacted]");
    assert.equal(event.data[tokenKey], "[sensitive-redacted]");
    assert.equal(event.data.nested[passwordKey], "[sensitive-redacted]");
    assert.doesNotMatch(JSON.stringify(saved), /classified value|classified notes|private-source-name|private interaction title|private\.skill\.ref/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

  assert.equal(listed.result.tools.length, 17);
  assert.equal(
    listed.result.tools.some((tool) => tool.name === "mousecat.workbench"),
    true,
  );
  assert.ok(listed.result.tools.some((tool) => tool.name === "mousecat.delegation"));
  assert.ok(listed.result.tools.some((tool) => tool.name === "mousecat.skill"));
  assert.ok(listed.result.tools.some((tool) => tool.name === "mousecat.registry"));
  assert.equal(called.result.structuredContent.ok, true);
});

test("stdio MCP initializes before tools and cancels an active await concurrently", async () => {
  const runtime = createMousecatRuntime();
  const input = new PassThrough();
  const output = new PassThrough();
  let transcript = "";
  output.on("data", (chunk) => { transcript += chunk.toString("utf8"); });
  const serving = startStdioServer({ runtime, input, output, config: {} });
  const send = (message) => input.write(`${JSON.stringify(message)}\n`);

  send({ nope: true });
  send({ jsonrpc: "2.0", id: 0, method: "tools/list" });
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
    name: "mousecat.widget",
    arguments: { action: "ask", request: { interactionId: "stdio-await", items: [{ id: "one", prompt: "Wait" }] } },
  } });
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
    name: "mousecat.widget",
    arguments: { action: "await", interactionId: "stdio-await", waitMs: 2000 },
  } });
  send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 3 } });
  input.end();
  await serving;

  const responses = new Map(transcript.trim().split("\n").map((line) => JSON.parse(line)).map((entry) => [entry.id, entry]));
  assert.equal(responses.get(null).error.code, -32600);
  assert.equal(responses.get(0).error.code, -32002);
  assert.equal(responses.get(1).result.protocolVersion, "2025-06-18");
  assert.equal(responses.get(2).result.structuredContent.interaction.interactionId, "stdio-await");
  assert.equal(responses.get(3).result.isError, true);
  assert.equal(responses.get(3).result.structuredContent.reason, "request-cancelled");
});

test("MCP tool failures are explicit and operator response writes stay browser-owned", async () => {
  const runtime = createMousecatRuntime();
  const ask = (id, args) => handleJsonRpc({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: "mousecat.widget", arguments: args },
  }, runtime);
  await ask(1, {
    action: "ask",
    request: { interactionId: "mcp-owned", items: [{ id: "one", prompt: "Wait for the operator" }] },
  });
  const collision = await ask(2, {
    action: "ask",
    request: { interactionId: "mcp-owned", items: [{ id: "replacement", prompt: "Do not replace" }] },
  });
  const bypass = await ask(3, {
    action: "respond",
    interactionId: "mcp-owned",
    responses: [{ itemId: "one", value: "host bypass" }],
  });
  const deferredBypass = await ask(4, {
    action: "defer",
    interactionId: "mcp-owned",
    responses: [{ itemId: "one", status: "deferred" }],
  });

  assert.equal(collision.result.isError, true);
  assert.equal(collision.result.structuredContent.code, "duplicate-interaction-id");
  assert.equal(bypass.result.isError, true);
  assert.equal(bypass.result.structuredContent.code, "operator-write-required");
  assert.equal(deferredBypass.result.structuredContent.code, "operator-write-required");
  assert.equal(runtime.state.interactions.get("mcp-owned").items[0].status, "open");
  assert.equal(runtime.handleTool("mousecat.widget", { action: "await", interactionId: "mcp-owned" }).status, "pending");
});

test("restored unanswered interactions appear without a caller returning", () => {
  const { dir, path, config } = tempStateConfig();
  try {
    const first = createMousecatRuntime({ config });
    first.handleTool("mousecat.ask", { interactionId: "ledger-1", prompt: "Old project question" });
    const saved = JSON.parse(readFileSync(path, "utf8"));

    const second = createMousecatRuntime({ config });
    const wall = second.handleTool("mousecat.widget", { action: "snapshot" });
    assert.equal(saved.interactions.length, 1);
    assert.equal(wall.interactions.length, 1);
    assert.equal(wall.interactions[0].interactionId, "ledger-1");
    assert.equal(second.status().counts.archivedInteractions, 0);

    const revived = second.handleTool("mousecat.widget", { action: "await", interactionId: "ledger-1" });
    const afterRevive = second.handleTool("mousecat.widget", { action: "snapshot" });
    assert.equal(revived.status, "pending");
    assert.equal(afterRevive.interactions.length, 1);
    assert.equal(second.status().counts.archivedInteractions, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a caller can withdraw its own unanswered question", async () => {
  const runtime = createMousecatRuntime();
  const asked = runtime.handleTool("mousecat.ask", { interactionId: "withdraw-me", prompt: "Withdraw this" });
  const waiting = runtime.handleTool("mousecat.widget", { action: "await", interactionId: "withdraw-me", waitMs: 5000 });
  const closed = runtime.handleTool("mousecat.widget", {
    action: "close",
    interactionId: "withdraw-me",
    reason: "caller cleaned up",
  });

  assert.equal(closed.status, "withdrawn");
  assert.equal(closed.progress.withdrawn, 1);
  const resolved = await waiting;
  assert.equal(resolved.status, "withdrawn");

  const wall = runtime.handleTool("mousecat.widget", { action: "snapshot" });
  assert.equal(wall.interactions[0].status, "withdrawn");
  assert.equal(wall.interactions[0].items[0].status, "withdrawn");

  const refused = runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "withdraw-me",
    responses: [{ itemId: asked.interaction.items[0].id, value: "late" }],
  });
  assert.equal(refused.reason, "interaction-item-not-actionable");
});

test("withdrawal never overwrites an operator response", () => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.ask", { interactionId: "answered-1", prompt: "Already answered" });
  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "answered-1",
    responses: [{ itemId: "item-1", value: "kept" }],
  });

  const refused = runtime.handleTool("mousecat.widget", { action: "close", interactionId: "answered-1" });
  assert.equal(refused.reason, "no-open-items");
  assert.equal(runtime.state.interactions.get("answered-1").items[0].status, "answered");
});

test("a caller can withdraw open items beside answered ones", () => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.ask", {
    interactionId: "mixed-1",
    prompt: "Mixed withdrawal",
    items: [
      { id: "keep", shape: "freeform", prompt: "First" },
      { id: "drop", shape: "freeform", prompt: "Second" },
    ],
  });
  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: "mixed-1",
    responses: [{ itemId: "keep", value: "kept by the operator" }],
  });

  const closed = runtime.handleTool("mousecat.widget", {
    action: "close",
    interactionId: "mixed-1",
    itemIds: ["drop"],
    reason: "caller withdrew its own unanswered item",
  });
  assert.equal(closed.status, "answered");
  assert.equal(closed.progress.answered, 1);
  assert.equal(closed.progress.withdrawn, 1);
  const interaction = runtime.state.interactions.get("mixed-1");
  assert.equal(interaction.items[0].status, "answered");
  assert.equal(interaction.items[0].response.value, "kept by the operator");
  assert.equal(interaction.items[1].status, "withdrawn");

  const refused = runtime.handleTool("mousecat.widget", {
    action: "close",
    interactionId: "mixed-1",
    itemIds: ["keep"],
  });
  assert.equal(refused.reason, "interaction-item-has-operator-response");

  const none = runtime.handleTool("mousecat.widget", { action: "close", interactionId: "mixed-1" });
  assert.equal(none.reason, "no-open-items");
});

test("a caller can withdraw an automatically restored question", () => {
  const { dir, config } = tempStateConfig();
  try {
    const first = createMousecatRuntime({ config });
    first.handleTool("mousecat.ask", { interactionId: "archived-open", prompt: "Still open" });

    const second = createMousecatRuntime({ config });
    const closed = second.handleTool("mousecat.widget", { action: "close", interactionId: "archived-open" });
    const wall = second.handleTool("mousecat.widget", { action: "snapshot" });
    assert.equal(closed.status, "withdrawn");
    assert.equal(wall.interactions.length, 1);
    assert.equal(wall.interactions[0].status, "withdrawn");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the MCP boundary allows caller withdrawal and refuses operator answers", async () => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.ask", { interactionId: "boundary-1", prompt: "Boundary question" });
  const closed = await handleJsonRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "mousecat.widget", arguments: { action: "close", interactionId: "boundary-1" } },
  }, runtime, { initialized: true });
  const answered = await handleJsonRpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "mousecat.widget", arguments: { action: "respond", interactionId: "boundary-1", responses: [{ itemId: "item-1", value: "no" }] } },
  }, runtime, { initialized: true });

  assert.equal(closed.result.structuredContent.status, "withdrawn");
  assert.equal(answered.result.structuredContent.code, "operator-write-required");
});
