import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeScenePreview, SCENE_PREVIEW_JSON_SCHEMA } from "../src/core/scene-preview.mjs";
import { normalizeMlReview } from "../src/core/ml-review.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";

function scene() {
  return {
    schema: "mousecat.scene-preview/1", provenance: { kind: "authored", label: "A hypothetical example for review." },
    coordinateSystem: "schematic",
    locations: [{ id: "table", label: "Table", x: 30, y: 60 }, { id: "door", label: "Door", x: 80, y: 30 }],
    actors: [{ id: "ada", label: "Ada" }, { id: "bo", label: "Bo" }],
    frames: [
      { id: "before", label: "Before contact", elapsedSeconds: 0,
        states: [{ actorId: "ada", locationId: "table", activity: "working", knowledge: ["Her work is unfinished."] },
          { actorId: "bo", locationId: "door", activity: "walking", knowledge: [] }], communications: [] },
      { id: "heard", label: "Request heard", elapsedSeconds: 5,
        states: [{ actorId: "ada", locationId: "table", activity: "working", knowledge: ["Her work is unfinished.", "Bo requests help."] },
          { actorId: "bo", locationId: "table", activity: "speaking", knowledge: [] }],
        communications: [{ id: "request", fromId: "bo", toId: "ada", status: "heard", summary: "Please help." }] },
    ], decision: { frameId: "heard", actorId: "ada" },
  };
}
function review() {
  return { schema: "mousecat.ml-review/1", subject: "A response to a request", scenario: "A person at work receives a request.",
    systemRole: "Teach a response.", causalPath: [{ label: "Situation", value: "Work is in progress." }, { label: "Decision", value: "Evaluate a response." }],
    playerImpact: "People can give their own work priority.", decisionPrecedent: "One exact hypothetical teaching example.",
    actualInput: [{ label: "Work", value: "Working." }], proposedLearning: [{ label: "Response", value: "Defer." }],
    approvalEffects: ["Admit the exact example."], remainingExclusions: ["No runtime behavior changed."],
    evidence: [{ label: "Subject", value: "example:1" }], scenePreview: scene() };
}
function invocation(mlReview = review()) {
  return { action: "invoke", skillRef: "crucible", source: { host: "test", sessionId: "scene-session", invocationId: "scene-invocation" },
    intake: { seams: [{ id: "scene-review", prompt: "Evaluate this example.", shape: "decision", evidenceRef: "example:1",
      options: [{ label: "Approve", value: "approved" }, { label: "Revise", value: "revision-requested" }], mlReview }] } };
}

test("scene contract preserves explicit evidence and personal information", () => {
  const value = scene();
  assert.deepEqual(normalizeScenePreview(value), { ok: true, value });
  assert.deepEqual(normalizeMlReview(review()).value.scenePreview, value);
  assert.equal(SCENE_PREVIEW_JSON_SCHEMA.additionalProperties, false);
});

test("scene refuses dangling references, duplicate people, unsupplied futures and executable fields", () => {
  const changes = [
    value => { value.frames[0].states[0].locationId = "absent"; },
    value => { value.frames[0].states[1].actorId = "ada"; },
    value => { value.frames[1].communications[0].fromId = "absent"; },
    value => { value.frames[1].elapsedSeconds = 0; },
    value => { value.decision.frameId = "before"; },
    value => { value.locations[0].x = Number.NaN; },
    value => { value.locations[0].y = 101; },
    value => { value.script = "arbitrary code"; },
    value => { value.provenance.kind = "fact-because-it-looks-real"; },
    value => { value.frames[0].states[0].knowledge = ["x".repeat(1025)]; },
    value => { value.actors[1].id = "ada"; },
  ];
  for (const change of changes) {
    const value = scene(); change(value);
    assert.equal(normalizeScenePreview(value).ok, false);
  }
});

test("scene changes invalidate invocation identity and never answer a question", async () => {
  const runtime = createMousecatRuntime();
  const args = invocation();
  const first = await runtime.handleTool("mousecat.skill", args);
  assert.equal(first.status, "pending");
  args.continuationToken = first.continuation.arguments.continuationToken;
  assert.equal((await runtime.handleTool("mousecat.skill", args)).idempotentReplay, true);
  const changed = structuredClone(args);
  changed.intake.seams[0].mlReview.scenePreview.frames[0].states[0].knowledge.push("A correction.");
  const refused = await runtime.handleTool("mousecat.skill", changed);
  assert.equal(refused.code, "skill-invocation-id-conflict");
  assert.notEqual(refused.status, "answered");
  const interaction = runtime.state.interactions.get(first.interactionId);
  assert.deepEqual(interaction.items[0].mlReview.scenePreview, scene());
  assert.equal(interaction.items[0].status, "open");
});

test("scene persists through restart and is withheld with sensitive review content", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mousecat-scene-test-"));
  try {
    const config = { state: { enabled: true, path: join(dir, "state.json") } };
    const runtime = createMousecatRuntime({ config });
    const first = await runtime.handleTool("mousecat.skill", invocation());
    const privateArgs = invocation();
    privateArgs.source.invocationId = "private-scene";
    privateArgs.intake.seams[0].id = "private-scene";
    privateArgs.intake.seams[0].sensitive = true;
    const privateResult = await runtime.handleTool("mousecat.skill", privateArgs);
    const restarted = createMousecatRuntime({ config });
    const publicItem = restarted.state.interactions.get(first.interactionId).items[0];
    assert.deepEqual(publicItem.mlReview.scenePreview, scene());
    const sensitive = restarted.state.interactions.get(privateResult.interactionId)
      || restarted.state.archivedInteractions.get(privateResult.interactionId);
    assert.equal(sensitive.items[0].mlReview, undefined);
    assert.equal(sensitive.items[0].prompt, "[sensitive-redacted]");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("operator retains recorded scene data without the retired schematic renderer", async () => {
  const runtime = createMousecatRuntime();
  await runtime.handleTool("mousecat.skill", invocation());
  const app = await startOperatorServer({ runtime, host: "127.0.0.1", port: 0 });
  try {
    const snapshot = await (await fetch(app.url + "/api/snapshot")).json();
    assert.deepEqual(snapshot.widget.interaction.items[0].mlReview.scenePreview, scene());
    for (const path of ["/scene-preview.js", "/scene-preview.css"]) {
      const response = await fetch(app.url + path);
      assert.equal(response.status, 404);
      assert.match(response.headers.get("content-security-policy"), /script-src 'self'/u);
    }
    const shell = await (await fetch(app.url + "/")).text();
    const script = await (await fetch(app.url + "/operator.js")).text();
    assert.doesNotMatch(shell, /scene-preview/u);
    assert.doesNotMatch(script, /createScenePreview/u);
  } finally { await app.close(); }
});
