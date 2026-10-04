import test from "node:test";
import assert from "node:assert/strict";

import {
  ATOMIC_SKILLS,
  DELEGATION_CONTRACT,
  HOST_ADAPTER_PROFILES,
  NAMED_SKILLS,
  OPERATOR_WIDGET_CONTRACT,
  SKILL_INVOCATION_CONTRACT,
  SKILL_FRAMEWORKS,
  WORK_PERMIT_PROFILES,
  WIDGET_ACTIONS,
  adapterRenderPacket,
  adapterRenderPackets,
  catalogSnapshot,
  hostCommandPack,
  hostStateAdapter,
  hostStateAdapters,
  skillButtons,
  widgetControls,
} from "../src/core/catalog.mjs";

test("one recursive deliberation framework contains three named skills and their modules", () => {
  const skillIds = ATOMIC_SKILLS.map((skill) => skill.id);
  const massAssault = NAMED_SKILLS.find((skill) => skill.id === "mass-assault");
  assert.deepEqual(NAMED_SKILLS.map((skill) => skill.id), ["crucible", "total-recall", "mass-assault"]);
  assert.ok(skillIds.includes("crucible.point"));
  assert.ok(skillIds.includes("crucible.continuum"));
  assert.ok(skillIds.includes("mass-assault.queue"));
  assert.ok(skillIds.includes("total-recall.docket"));

  const buttons = skillButtons();
  assert.ok(buttons.some((button) => button.skill === "crucible" && button.tool === "mousecat.skill"));
  assert.ok(buttons.some((button) => button.skill === "mass-assault" && button.tool === "mousecat.skill"));
  assert.ok(buttons.some((button) => button.skill === "total-recall" && button.tool === "mousecat.skill"));
  assert.equal(massAssault.presentation.grammar, "decision-wall");
  assert.ok(massAssault.presentation.primitives.includes("semantic-section"));
  assert.ok(massAssault.presentation.primitives.includes("decision-atlas"));
  assert.ok(massAssault.presentation.primitives.includes("review-drawer"));
  assert.ok(massAssault.presentation.primitives.includes("batch-response"));
});

test("skill frameworks keep atomic skills and permit boundaries graphable", () => {
  const operator = SKILL_FRAMEWORKS.find((framework) => framework.id === "recursive-deliberation");
  const boundary = SKILL_FRAMEWORKS.find((framework) => framework.id === "tool-boundary-control");

  assert.deepEqual(operator.skillRefs, ["crucible", "total-recall", "mass-assault"]);
  assert.ok(operator.atomicSkillRefs.includes("crucible.tree"));
  assert.ok(operator.atomicSkillRefs.includes("mass-assault.queue"));
  assert.equal(operator.routing.fixedTransitions, false);
  assert.equal(operator.routing.strategy, "contextual-capability-routing");
  assert.equal(SKILL_FRAMEWORKS.some((framework) => framework.id === "session-recall"), false);
  assert.equal(SKILL_FRAMEWORKS.some((framework) => framework.id === "queue-ratification"), false);
  assert.ok(boundary.boundaryRefs.includes("tool-invocation"));
});

test("work permits separate observer, operator interaction, invocation, and credentials", () => {
  const ids = WORK_PERMIT_PROFILES.map((permit) => permit.id);
  assert.deepEqual(ids, ["observer", "operator-interaction", "tool-invocation", "credential-steward"]);
  assert.equal(WORK_PERMIT_PROFILES.find((permit) => permit.id === "credential-steward").secretValuesAllowed, false);
});

test("catalog snapshot exposes one stable source-owned surface", () => {
  const snapshot = catalogSnapshot();
  assert.equal(snapshot.schema, "mousecat.catalog/1");
  assert.equal(snapshot.tools.length, 18);
  assert.ok(snapshot.tools.some(tool => tool.name === "mousecat.bulletin"));
  assert.equal(snapshot.namedSkills.length, 3);
  assert.ok(snapshot.buttons.length >= 6);
  assert.equal(snapshot.widgetContract.api.ask, "operator_widget.ask(payload)");
  assert.equal(snapshot.skillInvocationContract.tool, "mousecat.skill");
  assert.equal(snapshot.delegationContract.tool, "mousecat.delegation");
  assert.ok(snapshot.widgetControls.some((control) => control.tool === "mousecat.widget"));
  assert.ok(snapshot.tools.some((tool) => tool.name === "mousecat.host-state"));
  assert.ok(snapshot.tools.some((tool) => tool.name === "mousecat.registry"));
  assert.ok(snapshot.tools.some((tool) => tool.name === "mousecat.workbench"));
  assert.equal(snapshot.projectWorkbenchContract.tool, "mousecat.workbench");
  assert.equal(snapshot.integrationAdapters.schema, "mousecat.integration-adapters/1");
  assert.ok(snapshot.integrationAdapters.adapters.some((adapter) => adapter.id === "gitlab-v4"));
  assert.ok(snapshot.integrationAdapters.adapters.some((adapter) => adapter.id === "colonist-awareness-world-authoring-v1"));
  assert.equal(snapshot.hostStateAdapters.schema, "mousecat.host-state-adapters/1");
  assert.ok(widgetControls().some((control) => control.id === "widget.ask"));
});

test("delegation contract separates start, capability-owned await, and operator rejoin", () => {
  const snapshot = catalogSnapshot();
  const tool = snapshot.tools.find((entry) => entry.name === "mousecat.delegation");
  const boundary = snapshot.toolBoundaries.find((entry) => entry.tool === "mousecat.delegation");
  assert.deepEqual(DELEGATION_CONTRACT.actions, ["start", "await", "rejoin"]);
  for (const forbidden of ["allOf", "oneOf", "anyOf"]) assert.equal(tool.inputSchema[forbidden], undefined);
  assert.equal(boundary.defaultPermit, "action-specific");
  assert.equal(boundary.actionPermits.start, "tool-invocation");
  assert.equal(boundary.actionPermits.await, "caller-capability");
  assert.equal(boundary.actionPermits.rejoin, "operator-interaction");
  assert.equal(tool.inputSchema.properties.seam.type, "object");
  assert.equal(DELEGATION_CONTRACT.cancellation.request, "notifications/cancelled");
  assert.equal(DELEGATION_CONTRACT.resultSchema, "mousecat.delegation/2");
  assert.equal(DELEGATION_CONTRACT.summarySchema, "mousecat.delegation.summary/2");
  assert.ok(DELEGATION_CONTRACT.statuses.includes("cancelled"));
  assert.ok(DELEGATION_CONTRACT.upstreamOutcomes.includes("unknown"));
  assert.equal(DELEGATION_CONTRACT.cancellation.extension, "mousecat/cancellation-ack");
  assert.equal(DELEGATION_CONTRACT.cancellation.acknowledgedSideEffects, "none");
  assert.equal(DELEGATION_CONTRACT.cancellation.notificationAcceptanceIsAcknowledgement, false);
  assert.deepEqual(DELEGATION_CONTRACT.cancellation.graceMs, { minimum: 100, maximum: 5000, default: 1000 });
});

test("operator widget contract advertises every supported action", () => {
  assert.deepEqual(Object.keys(OPERATOR_WIDGET_CONTRACT.api).sort(), [...WIDGET_ACTIONS].sort());
});

test("skill invocation contract keeps named skills on the canonical widget", () => {
  const skillTool = catalogSnapshot().tools.find((tool) => tool.name === "mousecat.skill");
  assert.deepEqual(SKILL_INVOCATION_CONTRACT.actions, ["invoke", "await", "handoff"]);
  assert.deepEqual(SKILL_INVOCATION_CONTRACT.skillRefs, ["crucible", "total-recall", "mass-assault"]);
  assert.ok(SKILL_INVOCATION_CONTRACT.ownership.mousecat.includes("widget-routing"));
  assert.ok(SKILL_INVOCATION_CONTRACT.ownership.caller.includes("recursion"));
  for (const forbidden of ["allOf", "oneOf", "anyOf"]) assert.equal(skillTool.inputSchema[forbidden], undefined);
  assert.deepEqual(skillTool.inputSchema.properties.source.required, ["host", "invocationId"]);
  assert.deepEqual(skillTool.inputSchema.properties.route.required, ["selectedBy", "reason"]);
  assert.deepEqual(skillTool.inputSchema.properties.intake.properties.seams.items.required, ["id", "prompt"]);
  assert.equal(skillTool.inputSchema.properties.intake.properties.seams.items.properties.order.type, "integer");
  const mlReview = skillTool.inputSchema.properties.intake.properties.seams.items.properties.mlReview;
  assert.deepEqual(mlReview.required, ["schema", "subject", "scenario", "systemRole", "causalPath", "playerImpact", "decisionPrecedent", "actualInput", "proposedLearning", "approvalEffects", "remainingExclusions", "evidence"]);
  assert.deepEqual(mlReview.properties.schema.enum, ["mousecat.ml-review/1"]);
  assert.equal(mlReview.properties.actualInput.items.additionalProperties, false);
  assert.equal(mlReview.properties.causalPath.minItems, 2);
});

test("adapter profiles emit host render packets without changing widget semantics", () => {
  const ids = HOST_ADAPTER_PROFILES.map((profile) => profile.id);
  const packets = adapterRenderPackets();
  const codex = adapterRenderPacket("codex");

  assert.deepEqual(ids, [
    "generic-mcp",
    "codex",
    "claude",
    "chatgpt",
    "openai-sdk",
    "anthropic-sdk",
    "google-genai",
    "antigravity",
    "xai-sdk",
    "grok-build",
    "ollama",
    "jetbrains",
    "cursor",
    "cli",
  ]);
  assert.equal(packets.schema, "mousecat.adapter.render-packets/1");
  assert.equal(packets.packets.length, ids.length);
  assert.equal(packets.stateAdapters.adapters.length, ids.length);
  assert.equal(codex.schema, "mousecat.adapter.render-packet/1");
  assert.equal(codex.host.kind, "agent-host");
  assert.ok(codex.consumes.tools.includes("mousecat.widget"));
  assert.ok(codex.consumes.tools.includes("mousecat.skill"));
  assert.ok(codex.consumes.tools.includes("mousecat.delegation"));
  assert.ok(codex.consumes.schemas.includes("mousecat.operator-widget.request/1"));
  assert.ok(codex.consumes.schemas.includes("mousecat.skill-invocation/2"));
  assert.ok(codex.consumes.schemas.includes("mousecat.host-state-adapter/1"));
  assert.ok(codex.consumes.schemas.includes("mousecat.host-command-pack/1"));
  assert.ok(codex.controls.some((control) => control.id === "widget.respond"));
  assert.ok(codex.boundaries.includes("mousecat-owns-semantics"));
  assert.ok(codex.boundaries.includes("mousecat-renders-widget"));
  assert.equal(codex.commands.schema, "mousecat.host-command-pack/1");
  assert.equal(codex.commands.binding.mcp.arguments.profileId, "codex");
  assert.equal(codex.commands.sessionHeartbeat.mcp.arguments.action, "heartbeat");
  assert.equal(codex.stateAdapter.scope, "thread");
  assert.equal(codex.stateAdapter.sync.recall, "mousecat.session(action=total-recall)");
});

test("host state adapters bind state scopes without adding host-specific semantics", () => {
  const adapters = hostStateAdapters();
  const codex = hostStateAdapter("codex");
  const cursor = hostStateAdapter("cursor");
  const cli = hostStateAdapter("cli");

  assert.deepEqual(adapters.adapters.map((adapter) => adapter.profileId), HOST_ADAPTER_PROFILES.map((profile) => profile.id));
  assert.equal(codex.schema, "mousecat.host-state-adapter/1");
  assert.equal(codex.storage, "mousecat-runtime");
  assert.equal(cursor.scope, "workspace");
  assert.equal(cli.scope, "process");
  assert.ok(codex.reads.records.includes("routePlans"));
  assert.ok(codex.reads.tools.includes("mousecat.session"));
  assert.ok(codex.writes.tools.includes("mousecat.session"));
  assert.ok(codex.writes.tools.includes("mousecat.skill"));
  assert.ok(codex.writes.tools.includes("mousecat.delegation"));
  assert.ok(codex.writes.records.includes("delegations"));
  assert.ok(codex.writes.tools.includes("mousecat.queue"));
  assert.equal(codex.commands.routePreview.mcp.arguments.upstream, "<upstream>");
  assert.equal(hostCommandPack("cli").binding.cli.command, "mousecat host-state cli");
  assert.equal(hostCommandPack("cli").binding.cli.executable, "mousecat");
  assert.deepEqual(hostCommandPack("cli").binding.cli.arguments, ["host-state", "cli"]);
  assert.equal(hostCommandPack("cli").queueAnswer.mcp.arguments.action, "answer");
  assert.equal(hostCommandPack("cli").queueHold.mcp.arguments.action, "hold");
  assert.equal(hostCommandPack("cli").queueRatify.mcp.arguments.action, "ratify");
  assert.equal(hostCommandPack("cli").skillInvoke.mcp.tool, "mousecat.skill");
  assert.equal(hostCommandPack("cli").skillAwait.mcp.arguments.action, "await");
  assert.equal(hostCommandPack("grok-build").sessionHeartbeat.mcp.arguments.facts.host, "grok-build");
  assert.equal(hostCommandPack("cli").delegationStart.mcp.arguments.action, "start");
  assert.equal(hostCommandPack("cli").delegationAwait.mcp.arguments.action, "await");
  assert.equal(hostCommandPack("cli").delegationRejoin.mcp.arguments.action, "rejoin");
  assert.ok(codex.boundaries.includes("mousecat-owns-state-semantics"));
  assert.ok(codex.boundaries.includes("mousecat-owns-runtime-state"));
  assert.ok(codex.boundaries.includes("credential-values-withheld"));
});
