import test from "node:test";
import assert from "node:assert/strict";
import { projectModel, inQuestionScope, projectRoute, questionRoute, pendingQuestionCount } from "../src/operator/public/project-model.js";
import { compileSkillInvocation } from "../src/core/skill-invocation.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";

test("project navigation consolidates sources without inferring ownership from evidence", () => {
  const question = { interactionId: "q", items: [{ status: "open", metadata: { lineage: { evidenceRef: "project:source" } } }] };
  const snapshot = { projects: [
    { surface: { surfaceId: "primary", projectRef: "project:work" }, threads: { live: [question] } },
    { surface: { surfaceId: "evidence", projectRef: "project:work" } },
    { surface: { surfaceId: "source", projectRef: "project:source" } },
  ], projectGroups: [{ groupId: "group", memberSurfaceIds: ["primary"] }], widget: { interactions: [question] } };
  const model = projectModel(snapshot);
  assert.equal(model.projects.size, 2);
  assert.equal(model.groups[0].members.length, 1);
  assert.equal(model.groups[0].members[0].sources.length, 2);
  assert.equal(inQuestionScope(question, { project: "project:work" }, model), true);
  assert.equal(inQuestionScope(question, { project: "project:source" }, model), false);
  assert.equal(inQuestionScope(question, { project: "project:work", interaction: "other" }, model), false);
  assert.equal(inQuestionScope(question, {}, model), true);
  assert.equal(new URLSearchParams(projectRoute("project:a&b").split("?")[1]).get("project"), "project:a&b");
  assert.equal(new URLSearchParams(questionRoute("project:a", "id/#&").split("?")[1]).get("interaction"), "id/#&");
});

test("skill ownership reaches questions and participates in replay identity", async () => {
  const runtime = createMousecatRuntime();
  const request = { action: "invoke", skillRef: "crucible", source: { host: "test", invocationId: "owned" }, intake: { seams: [{ id: "choice", prompt: "Choose" }] } };
  const legacy = compileSkillInvocation(request);
  assert.equal(legacy.request.projectRef, undefined);
  assert.equal(compileSkillInvocation({ ...request, projectRef: undefined }).intake.fingerprint, legacy.intake.fingerprint);
  const withProject = { ...request, projectRef: "project:work" };
  const invoked = await runtime.handleTool("mousecat.skill", withProject);
  assert.equal(invoked.status, "pending");
  assert.equal(runtime.handleTool("mousecat.projects", { action: "threads", projectRef: "project:work", permit: { profileId: "observer" } }).threads.live[0].interactionId, invoked.interactionId);
  const changed = await runtime.handleTool("mousecat.skill", { ...withProject, projectRef: "project:other", continuationToken: invoked.continuation.arguments.continuationToken });
  assert.equal(changed.ok, false);
  assert.notEqual(compileSkillInvocation(withProject).intake.fingerprint, legacy.intake.fingerprint);
  for (const projectRef of ["", " ", "x".repeat(513), 42]) assert.equal(compileSkillInvocation({ ...request, projectRef }).ok, false);
});

test("retained unanswered history is not presented as an available response form", () => {
  const record = { interactionId: "retained", status: "open", openCount: 2 };
  const snapshot = { projects: [{ surface: { surfaceId: "primary", projectRef: "project:work" }, threads: { archived: [record] } }] };
  const retained = projectModel(snapshot).projects.get("project:work").threads.get("retained");
  assert.equal(retained.status, "open");
  assert.equal(pendingQuestionCount(retained), 0);
  snapshot.projects.unshift({ surface: { surfaceId: "active", projectRef: "project:work" }, threads: { live: [record] } });
  const resumed = projectModel(snapshot).projects.get("project:work").threads.get("retained");
  assert.equal(pendingQuestionCount(resumed), 2);
  assert.equal(resumed.availability, "live");
});
