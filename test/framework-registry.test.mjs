import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMousecatRuntime } from "../src/core/runtime.mjs";

const registration = {
  action: "register",
  namespace: "research-sdk",
  revision: 1,
  permit: { profileId: "operator-interaction" },
  framework: {
    id: "research-loop",
    label: "Research Loop",
    purpose: "Resolve evidence questions through a host-selected recursive loop.",
    router: "registered-host-model",
  },
  skills: [
    {
      id: "hypothesis",
      label: "Hypothesis",
      intakeMode: "single-seam",
      moduleRefs: ["hypothesis.point"],
      presentation: {
        grammar: "evidence-branch",
        icon: "flask-conical",
        accent: "cyan",
        primitives: ["claim-node", "evidence-edge"],
        motion: "evidence-flow",
      },
    },
    {
      id: "synthesis",
      label: "Synthesis",
      intakeMode: "mapped-seams",
      presentation: {
        grammar: "source-matrix",
        icon: "table-properties",
        accent: "amber",
      },
    },
  ],
};

test("runtime registry invokes and contextually hands off custom framework skills", async () => {
  const runtime = createMousecatRuntime();
  const registered = runtime.handleTool("mousecat.registry", registration);
  const listed = runtime.handleTool("mousecat.registry", { action: "list" });
  const invoked = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "hypothesis.point",
    source: { host: "grok-build", sessionId: "research-1", invocationId: "hypothesis-1" },
    intake: { seams: [{ id: "claim-1", prompt: "Which claim survives the evidence?" }] },
  });
  runtime.handleTool("mousecat.widget", {
    action: "respond",
    interactionId: invoked.interactionId,
    responses: [{ itemId: invoked.items[0].id, value: "supported" }],
  });
  const terminal = await runtime.handleTool("mousecat.skill", {
    action: "await",
    interactionId: invoked.interactionId,
    continuationToken: invoked.continuation.arguments.continuationToken,
  });
  const handoff = await runtime.handleTool("mousecat.skill", {
    action: "handoff",
    previousSkillRef: "hypothesis",
    previousResultRef: terminal.continuation.framework.resultRef,
    previousResultToken: terminal.continuation.framework.resultToken,
    skillRef: "synthesis",
    route: { selectedBy: "grok-build", reason: "The evidence set now needs synthesis." },
    source: { host: "grok-build", sessionId: "research-1", invocationId: "synthesis-1" },
    intake: { seams: [{ id: "source-1", prompt: "Synthesize the surviving evidence." }] },
  });

  assert.equal(registered.ok, true);
  assert.equal(listed.skills.find((skill) => skill.id === "hypothesis").presentation.grammar, "evidence-branch");
  assert.equal(invoked.status, "pending");
  assert.equal(invoked.skillRef, "hypothesis");
  assert.equal(invoked.continuation.arguments.action, "await");
  assert.equal(handoff.ok, true);
  assert.equal(handoff.route.frameworkRef, "research-loop");
  assert.equal(handoff.route.selectedBy, "grok-build");
  assert.deepEqual(handoff.result.intake.availableSkillRefs, ["hypothesis", "synthesis"]);

  const replayedRegistration = runtime.handleTool("mousecat.registry", {
    ...registration,
    revision: 2,
    namespaceToken: registered.namespaceToken,
    framework: { ...registration.framework, label: "Research Loop Updated" },
  });
  assert.equal(replayedRegistration.ok, true);
  assert.equal(replayedRegistration.registry.frameworks.find((candidate) => candidate.id === "research-loop").label, "Research Loop Updated");
});

test("registry registration requires a permit and enforces namespace revisions", () => {
  const runtime = createMousecatRuntime();
  const denied = runtime.handleTool("mousecat.registry", { ...registration, permit: undefined });
  const first = runtime.handleTool("mousecat.registry", registration);
  const foreign = runtime.handleTool("mousecat.registry", {
    ...registration,
    namespace: "foreign-sdk",
    revision: 2,
  });
  const unownedUpdate = runtime.handleTool("mousecat.registry", {
    ...registration,
    revision: 2,
  });
  const caseBypass = runtime.handleTool("mousecat.registry", {
    ...registration,
    namespace: "RESEARCH-SDK",
    revision: 2,
  });
  const stale = runtime.handleTool("mousecat.registry", {
    ...registration,
    revision: 0,
    namespaceToken: first.namespaceToken,
  });

  assert.equal(denied.code, "registry-permit-required");
  assert.equal(first.ok, true);
  assert.equal(foreign.code, "skill-framework-namespace-conflict");
  assert.equal(unownedUpdate.code, "registry-namespace-capability-invalid");
  assert.equal(caseBypass.code, "registry-namespace-capability-invalid");
  assert.equal(stale.code, "registry-revision-required");
});

test("invalid persisted descriptors are quarantined from registry snapshots", () => {
  const runtime = createMousecatRuntime({
    state: {
      customSkills: new Map([
        ["broken", { id: "broken" }],
        ["foreign-skill", {
          id: "foreign-skill",
          frameworkRefs: ["owned-loop"],
          presentation: {},
          intakeMode: "mapped-seams",
          registration: { namespace: "foreign", revision: 1 },
        }],
      ]),
      customFrameworks: new Map([
        ["broken-loop", { id: "broken-loop" }],
        ["owned-loop", {
          id: "owned-loop",
          registration: { namespace: "owner", revision: 1 },
          routing: {
            strategy: "contextual-capability-routing",
            defaultRouter: null,
            fixedTransitions: false,
            recursion: "re-evaluate-framework-after-every-skill-result",
          },
        }],
      ]),
    },
  });
  const registry = runtime.handleTool("mousecat.registry", { action: "list" });
  assert.deepEqual(registry.invalidDescriptors, { skills: 2, frameworks: 1 });
  assert.equal(registry.skills.some((skill) => skill.id === "broken"), false);
});

test("built-in atomic and underscore aliases still resolve through the registry", async () => {
  const runtime = createMousecatRuntime();
  const atomic = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "crucible.point",
    source: { host: "claude", invocationId: "atomic-alias" },
    intake: { seams: [{ id: "atomic-seam", prompt: "Resolve the aliased seam." }] },
  });
  const recall = await runtime.handleTool("mousecat.skill", {
    action: "invoke",
    skillRef: "total_recall",
    source: { host: "codex", invocationId: "underscore-alias" },
  });

  assert.equal(atomic.skillRef, "crucible");
  assert.equal(recall.skillRef, "total-recall");
});

test("registry sanitizes presentation descriptors and persists them as data", () => {
  const dir = mkdtempSync(join(tmpdir(), "mousecat-registry-"));
  const path = join(dir, ".mousecat", "state.json");
  const config = { state: { enabled: true, path, maxEvents: 20, maxRoutePlans: 20 } };
  try {
    const first = createMousecatRuntime({ config });
    const result = first.handleTool("mousecat.registry", {
      ...registration,
      namespace: "portable-sdk",
      framework: { ...registration.framework, id: "portable-loop" },
      skills: [{
        ...registration.skills[0],
        id: "portable-hypothesis",
        frameworkRefs: ["portable-loop"],
        presentation: { ...registration.skills[0].presentation, accent: "ultraviolet", render: "alert(1)" },
      }],
    });
    const serialized = readFileSync(path, "utf8");
    const second = createMousecatRuntime({ config });
    const restored = second.handleTool("mousecat.registry", { action: "list" });
    const skill = restored.skills.find((candidate) => candidate.id === "portable-hypothesis");

    assert.equal(result.ok, true);
    assert.equal(skill.presentation.accent, "neutral");
    assert.equal(Object.hasOwn(skill.presentation, "render"), false);
    assert.doesNotMatch(serialized, /alert\(1\)/u);
    assert.equal(second.status().state.persistence.loaded, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
