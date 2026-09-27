import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createIntegrationAdapterRegistry,
  defineIntegrationAdapter,
} from "../src/core/integration-contracts.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";

const SAVE_HASH = "d5a3dc690e8904eeac147b06a8df428590218155d63882c9f09fa2479dc17302";
const CHANGED_SAVE_HASH = "93f023636b976fcde5a3ccf06dee4df470fd9865b8c629cca34f48528bac034a";

function sourceVector(hash = SAVE_HASH) {
  return [{
    authority: "rimworld-save",
    sourceRevision: `sha256:${hash}`,
    observedAt: "2026-08-16T04:28:00.000Z",
    status: "current",
  }];
}

function composition(hash = SAVE_HASH) {
  const memberTileIds = [
    29606, 29605, 29607, 29501, 29502, 29503,
    29504, 29505, 29506, 29507, 29508, 29509,
  ];
  return {
    worldIdentity: "mass driver|1|Ain-XII",
    sourceSaveSha256: hash.toUpperCase(),
    rootTileId: 29606,
    requestedExtent: 12,
    realizedExtent: 12,
    orientation: 0,
    arrivalTileId: 29606,
    localMapSize: 350,
    memberTileIds,
    atlasEvidenceSignature: "C0F16BD585C11BD35A63947CA2DB0802CF5E5E8C9E38B5CFBB78BD57EC385A7F",
    compositionEvidenceComplete: true,
    stageReady: false,
    evidenceObligations: ["Stone types require production validation."],
    stageBlockers: ["The creator-to-plan save step is not connected."],
    tiles: memberTileIds.map((tileId) => ({
      tileId,
      biome: { defName: "TropicalRainforest", label: "tropical rainforest", sourceModId: "ludeon.rimworld" },
      elevation: 3,
      hilliness: "Flat",
      mutators: [{ defName: "CoastalAtoll", label: "coastal atoll", sourceModId: "ludeon.rimworld" }],
      roads: [],
      rivers: [],
      worldObjects: [],
      blocked: false,
      definitionComplete: true,
    })),
  };
}

function fixtureIntegrationRegistry(capabilities) {
  const adapter = defineIntegrationAdapter({
    id: "fixture-v1",
    label: "Fixture adapter",
    upstream: "fixture",
    transport: "cli-json",
    auth: "none",
    executable: { name: "fixture", acceptedNames: ["fixture"] },
    allowedEnvKeys: [],
    buildArguments: () => [],
    capabilities: capabilities.map(({ id, access = "read" }) => ({
      id,
      label: id,
      description: `Fixture ${id}`,
      access,
      inputSchema: { type: "object", properties: {}, additionalProperties: true },
      compile: () => ({ method: "READ", path: id, fields: {} }),
    })),
  });
  return createIntegrationAdapterRegistry([adapter]);
}

function connectorEnvelope(value) {
  return {
    ok: true,
    schema: "mousecat.connector.invoke/1",
    result: {
      ok: true,
      schema: "mousecat.integration-result/1",
      result: value,
    },
  };
}

function workbenchRequest(overrides = {}) {
  return {
    action: "open",
    workbenchId: "ca-proof",
    adapterRef: "colonist-awareness.world-authoring",
    hostSessionRef: "codex:thread:ca-proof",
    operatorRef: "operator:local",
    intent: "Inspect and compose a saved-world landing region.",
    sourceVector: sourceVector(),
    subjectRefs: ["world:mass-driver-ain-xii"],
    permit: { profileId: "operator-interaction" },
    ...overrides,
  };
}

test("adapter permit declarations still reject mismatched callers before connector execution", async () => {
  let calls = 0;
  const runtime = createMousecatRuntime({
    projectConnectorInvoker: async () => {
      calls += 1;
      return connectorEnvelope(composition());
    },
  });
  const opened = await runtime.handleTool("mousecat.workbench", workbenchRequest());
  assert.equal(opened.ok, true);
  const request = {
    action: "operate",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
    operationId: "cao.region.compose",
    input: { atlasId: "mass-driver-ain-xii", rootTileId: 29606, extent: 12 },
  };
  for (const profileId of ["observer", "unknown-permit"]) {
    const denied = await runtime.handleTool("mousecat.workbench", { ...request, permit: { profileId } });
    assert.equal(denied.code, "project-workbench-operation-permit-required");
    assert.equal(calls, 0);
  }
  const allowed = await runtime.handleTool("mousecat.workbench", {
    ...request, permit: { profileId: "operator-interaction" },
  });
  assert.equal(allowed.ok, true);
  assert.equal(calls, 1);
});

test("source CA adapter opens a capability-bound workbench and preserves its domain result", async () => {
  const calls = [];
  const runtime = createMousecatRuntime({
    projectConnectorInvoker: async (request) => {
      calls.push(request);
      return connectorEnvelope(composition());
    },
  });

  const opened = await runtime.handleTool("mousecat.workbench", workbenchRequest());
  const operated = await runtime.handleTool("mousecat.workbench", {
    action: "operate",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
    operationId: "cao.region.compose",
    input: { atlasId: "mass-driver-ain-xii", rootTileId: 29606, extent: 12 },
    permit: { profileId: "operator-interaction" },
  });
  const snapshot = await runtime.handleTool("mousecat.workbench", {
    action: "snapshot",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
  });

  assert.equal(opened.ok, true);
  assert.equal(operated.ok, true);
  assert.equal(operated.result.realizedExtent, 12);
  assert.equal(operated.representation.schema, "mousecat.development-representation/1");
  assert.equal(operated.representation.selectedDraftRef, `cao-composition:${composition().atlasEvidenceSignature}`);
  assert.deepEqual(
    operated.representation.layers.map((layer) => layer.evidenceClass),
    ["source-fact", "deterministic-projection", "unknown"],
  );
  assert.deepEqual(operated.representation.constraints, composition().stageBlockers);
  assert.equal(snapshot.receipts.length, 1);
  assert.equal(snapshot.receipts[0].result, undefined);
  assert.match(snapshot.receipts[0].resultDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(calls[0].operation.operationId, "cao.region.compose");
  assert.equal(JSON.stringify(snapshot).includes(opened.workbenchToken), false);

  const hostState = runtime.handleTool("mousecat.host-state", { profileId: "generic-mcp" });
  assert.equal(hostState.records.projectWorkbenches[0].currentRepresentationRef, operated.representation.representationId);
  assert.equal(hostState.records.projectRepresentations[0].facts[0].realizedExtent, 12);
  assert.equal(JSON.stringify(hostState).includes(opened.workbenchToken), false);
});

test("a changed project source invalidates the workbench and its current representation", async () => {
  let invocation = 0;
  const runtime = createMousecatRuntime({
    projectConnectorInvoker: async () => {
      invocation += 1;
      return connectorEnvelope(composition(invocation === 1 ? SAVE_HASH : CHANGED_SAVE_HASH));
    },
  });
  const opened = await runtime.handleTool("mousecat.workbench", workbenchRequest());
  const request = {
    action: "operate",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
    operationId: "cao.region.compose",
    input: { atlasId: "mass-driver-ain-xii", rootTileId: 29606, extent: 12 },
    permit: { profileId: "operator-interaction" },
  };
  const current = await runtime.handleTool("mousecat.workbench", request);
  const stale = await runtime.handleTool("mousecat.workbench", request);
  const snapshot = await runtime.handleTool("mousecat.workbench", {
    action: "snapshot",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
  });

  assert.equal(current.ok, true);
  assert.equal(stale.code, "project-workbench-source-stale");
  assert.equal(stale.workbench.state, "stale");
  assert.equal(snapshot.representation.freshness, "stale");
  assert.deepEqual(snapshot.receipts.map((receipt) => receipt.outcome), ["succeeded", "stale"]);
});

test("workbench capability recovery survives a runtime restart without persisting the token", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mousecat-workbench-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const statePath = join(directory, "state.json");
  const config = {
    hostProfile: "test",
    adapterProfile: "generic-mcp",
    credentials: { policy: "references-only" },
    upstreams: {},
    connectors: {},
    state: { enabled: true, path: statePath, maxEvents: 20, maxRoutePlans: 20 },
  };
  const first = createMousecatRuntime({ config });
  const opened = await first.handleTool("mousecat.workbench", workbenchRequest());
  const persisted = readFileSync(statePath, "utf8");
  const second = createMousecatRuntime({ config });
  const recovered = await second.handleTool("mousecat.workbench", {
    action: "snapshot",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
  });

  assert.equal(persisted.includes(opened.workbenchToken), false);
  assert.match(persisted, /"capabilityHash": "[a-f0-9]{64}"/u);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.workbench.intent, workbenchRequest().intent);
});

test("registered write operations remain closed before connector execution", async () => {
  let calls = 0;
  const runtime = createMousecatRuntime({
    projectConnectorInvoker: async () => {
      calls += 1;
      return connectorEnvelope({ unexpected: true });
    },
  });
  const registered = runtime.handleTool("mousecat.registry", {
    action: "register-project-adapter",
    namespace: "fixture",
    revision: 1,
    permit: { profileId: "operator-interaction" },
    projectAdapter: {
      adapterId: "fixture.staging",
      namespace: "fixture",
      revision: 1,
      projectRef: "project:fixture",
      projectKind: "test-fixture",
      sourceAuthorities: ["fixture-source"],
      operationDescriptors: [{
        operationId: "fixture.stage",
        effect: "stage-write",
        inputSchemaRef: "fixture.stage.request/1",
        outputSchemaRef: "fixture.stage.receipt/1",
        permitRef: "tool-invocation",
        projectAuthorizationRef: "fixture.stage-authority/1",
      }],
      representationSchemaRefs: ["fixture.subject/1"],
      connectorRef: "fixture",
    },
  });
  const opened = await runtime.handleTool("mousecat.workbench", workbenchRequest({
    workbenchId: "fixture-proof",
    adapterRef: "fixture.staging",
    sourceVector: [{
      authority: "fixture-source",
      sourceRevision: "fixture-revision-1",
      observedAt: "2026-08-16T04:28:00.000Z",
      status: "current",
    }],
    subjectRefs: ["fixture:one"],
  }));
  const blocked = await runtime.handleTool("mousecat.workbench", {
    action: "operate",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
    operationId: "fixture.stage",
    input: {},
    permit: { profileId: "tool-invocation" },
  });

  assert.equal(registered.ok, true);
  assert.ok(registered.namespaceToken);
  assert.equal(blocked.code, "project-workbench-write-effect-closed");
  assert.equal(calls, 0);
});

test("workbenches reject source authorities outside the bound project adapter", async () => {
  const runtime = createMousecatRuntime();
  const rejected = await runtime.handleTool("mousecat.workbench", workbenchRequest({
    workbenchId: "foreign-source",
    sourceVector: [{
      authority: "unrelated-source",
      sourceRevision: "revision-1",
      observedAt: "2026-08-16T04:28:00.000Z",
      status: "current",
    }],
  }));

  assert.equal(rejected.code, "project-workbench-source-authority-mismatch");
});

test("post-connector representation rejection leaves a durable failure receipt", async () => {
  const runtime = createMousecatRuntime({
    integrationRegistry: fixtureIntegrationRegistry([
      { id: "fixture.inspect", access: "read" },
    ]),
    projectConnectorInvoker: async () => connectorEnvelope({
      schema: "fixture.inspect.result/1",
      sourceVector: [{
        authority: "fixture-source",
        sourceRevision: "revision-1",
        observedAt: "2026-08-16T04:28:00.000Z",
        status: "current",
      }],
      result: { inspected: true },
      representation: { schema: "fixture.invalid-representation/1" },
    }),
  });
  const registered = runtime.handleTool("mousecat.registry", {
    action: "register-project-adapter",
    namespace: "fixture",
    revision: 1,
    permit: { profileId: "operator-interaction" },
    projectAdapter: {
      adapterId: "fixture.projection",
      namespace: "fixture",
      revision: 1,
      projectRef: "project:fixture",
      projectKind: "test-fixture",
      sourceAuthorities: ["fixture-source"],
      operationDescriptors: [{
        operationId: "fixture.inspect",
        effect: "observe",
        inputSchemaRef: "fixture.inspect.request/1",
        outputSchemaRef: "fixture.inspect.result/1",
        permitRef: "observer",
      }],
      representationSchemaRefs: ["fixture.subject/1"],
      connectorRef: "fixture",
    },
  });
  assert.equal(registered.ok, true);
  const opened = await runtime.handleTool("mousecat.workbench", workbenchRequest({
    workbenchId: "rejected-projection",
    adapterRef: "fixture.projection",
    sourceVector: [{
      authority: "fixture-source",
      sourceRevision: "revision-1",
      observedAt: "2026-08-16T04:28:00.000Z",
      status: "current",
    }],
  }));
  const rejected = await runtime.handleTool("mousecat.workbench", {
    action: "operate",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
    operationId: "fixture.inspect",
    input: {},
    permit: { profileId: "observer" },
  });
  const snapshot = await runtime.handleTool("mousecat.workbench", {
    action: "snapshot",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.receipt.outcome, "failed");
  assert.equal(snapshot.receipts.length, 1);
  assert.equal(snapshot.receipts[0].receiptId, rejected.receipt.receiptId);
});

test("project adapters cannot relabel a write capability as an observable operation", () => {
  const runtime = createMousecatRuntime({
    integrationRegistry: fixtureIntegrationRegistry([
      { id: "fixture.write", access: "consequential-write" },
    ]),
  });
  const rejected = runtime.handleTool("mousecat.registry", {
    action: "register-project-adapter",
    namespace: "fixture",
    revision: 1,
    permit: { profileId: "operator-interaction" },
    projectAdapter: {
      adapterId: "fixture.disguised-write",
      namespace: "fixture",
      revision: 1,
      projectRef: "project:fixture",
      projectKind: "test-fixture",
      sourceAuthorities: ["fixture-source"],
      operationDescriptors: [{
        operationId: "fixture.write",
        effect: "observe",
        inputSchemaRef: "fixture.write.request/1",
        outputSchemaRef: "fixture.write.result/1",
        permitRef: "observer",
      }],
      representationSchemaRefs: ["fixture.write.result/1"],
      connectorRef: "fixture",
    },
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "project-adapter-connector-capability-not-read");
});

test("malformed successful connector output fails before representation or durable raw result custody", async () => {
  const runtime = createMousecatRuntime({
    projectConnectorInvoker: async () => ({
      ok: true,
      result: { neutralField: "raw-upstream-payload" },
    }),
  });
  const opened = await runtime.handleTool("mousecat.workbench", workbenchRequest({
    workbenchId: "malformed-output",
  }));
  const rejected = await runtime.handleTool("mousecat.workbench", {
    action: "operate",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
    operationId: "cao.region.compose",
    input: { atlasId: "mass-driver-ain-xii", rootTileId: 29606, extent: 12 },
    permit: { profileId: "operator-interaction" },
  });
  const snapshot = await runtime.handleTool("mousecat.workbench", {
    action: "snapshot",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
  });

  assert.equal(rejected.code, "project-output-schema-invalid");
  assert.equal(snapshot.representation, null);
  assert.equal(snapshot.receipts[0].result, undefined);
  assert.equal(snapshot.receipts[0].reason, undefined);
  assert.equal(JSON.stringify(snapshot).includes("raw-upstream-payload"), false);
});

test("one workbench serializes connector operations", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const runtime = createMousecatRuntime({
    projectConnectorInvoker: async () => {
      await gate;
      return connectorEnvelope(composition());
    },
  });
  const opened = await runtime.handleTool("mousecat.workbench", workbenchRequest({
    workbenchId: "serialized-operations",
  }));
  const request = {
    action: "operate",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
    operationId: "cao.region.compose",
    input: { atlasId: "mass-driver-ain-xii", rootTileId: 29606, extent: 12 },
    permit: { profileId: "operator-interaction" },
  };
  const first = runtime.handleTool("mousecat.workbench", request);
  const second = await runtime.handleTool("mousecat.workbench", request);
  release();
  const completed = await first;

  assert.equal(second.code, "project-workbench-operation-active");
  assert.equal(completed.ok, true);
});

test("adapter revision drift invalidates an in-flight workbench before commit", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const integrationRegistry = fixtureIntegrationRegistry([
    { id: "fixture.inspect", access: "read" },
  ]);
  const runtime = createMousecatRuntime({
    integrationRegistry,
    projectConnectorInvoker: async () => {
      await gate;
      return connectorEnvelope({
        schema: "fixture.inspect.result/1",
        inspected: true,
      });
    },
  });
  const descriptor = (revision) => ({
    adapterId: "fixture.revisioned",
    namespace: "fixture",
    revision,
    projectRef: "project:fixture",
    projectKind: "test-fixture",
    sourceAuthorities: ["fixture-source"],
    operationDescriptors: [{
      operationId: "fixture.inspect",
      effect: "observe",
      inputSchemaRef: "fixture.inspect.request/1",
      outputSchemaRef: "fixture.inspect.result/1",
      permitRef: "observer",
    }],
    representationSchemaRefs: ["fixture.inspect.result/1"],
    connectorRef: "fixture",
  });
  const firstRegistration = runtime.handleTool("mousecat.registry", {
    action: "register-project-adapter",
    namespace: "fixture",
    revision: 1,
    projectAdapter: descriptor(1),
    permit: { profileId: "operator-interaction" },
  });
  const opened = await runtime.handleTool("mousecat.workbench", workbenchRequest({
    workbenchId: "adapter-drift",
    adapterRef: "fixture.revisioned",
    sourceVector: [{
      authority: "fixture-source",
      sourceRevision: "revision-1",
      observedAt: "2026-08-16T04:28:00.000Z",
      status: "current",
    }],
  }));
  const pending = runtime.handleTool("mousecat.workbench", {
    action: "operate",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
    operationId: "fixture.inspect",
    input: {},
    permit: { profileId: "observer" },
  });
  const secondRegistration = runtime.handleTool("mousecat.registry", {
    action: "register-project-adapter",
    namespace: "fixture",
    namespaceToken: firstRegistration.namespaceToken,
    revision: 2,
    projectAdapter: descriptor(2),
    permit: { profileId: "operator-interaction" },
  });
  release();
  const rejected = await pending;
  const snapshot = await runtime.handleTool("mousecat.workbench", {
    action: "snapshot",
    workbenchId: opened.workbench.workbenchId,
    workbenchToken: opened.workbenchToken,
  });

  assert.equal(secondRegistration.ok, true);
  assert.equal(rejected.code, "project-workbench-adapter-stale");
  assert.equal(snapshot.workbench.state, "stale");
  assert.equal(snapshot.workbench.staleCode, "project-workbench-adapter-stale");
});
