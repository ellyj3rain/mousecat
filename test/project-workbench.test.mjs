import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectWorkbench,
  PROJECT_WORKBENCH_SCHEMAS,
  validateDevelopmentRepresentation,
  validateProjectAdapterDescriptor,
} from "../src/core/project-workbench.mjs";

function sourceVector() {
  return [{
    authority: "rimworld-save",
    sourceRevision: "sha256:93f02363",
    observedAt: "2026-08-15T22:00:00Z",
    status: "current",
  }];
}

function caAdapter() {
  return {
    adapterId: "colonist-awareness.world-authoring",
    namespace: "colonist-awareness",
    revision: 1,
    projectRef: "project:colonist-awareness",
    projectKind: "game-mod",
    sourceAuthorities: ["rimworld-save", "cao-current-schema"],
    operationDescriptors: [
      {
        operationId: "find-region",
        effect: "observe",
        inputSchemaRef: "cao.region-search/1",
        outputSchemaRef: "cao.region-candidates/1",
        permitRef: "observer",
      },
      {
        operationId: "compose-region",
        effect: "draft",
        inputSchemaRef: "cao.region-composition-request/1",
        outputSchemaRef: "cao.regional-plan-draft/1",
        permitRef: "operator-interaction",
      },
      {
        operationId: "stage-plan",
        effect: "stage-write",
        inputSchemaRef: "cao.regional-plan-draft/1",
        outputSchemaRef: "cao.regional-plan-stage-receipt/1",
        permitRef: "tool-invocation",
        projectAuthorizationRef: "cao.pending-plan-authority/1",
      },
    ],
    representationSchemaRefs: ["cao.region-landscape/1"],
    validationCapabilityRef: "cao.validate-regional-plan",
    connectorRef: "colonist-awareness",
  };
}

function representation() {
  return {
    schema: PROJECT_WORKBENCH_SCHEMAS.representation,
    representationId: "candidate-29606",
    workbenchId: "ca-region-20260815",
    projectRef: "project:colonist-awareness",
    subjectRefs: ["world:ain-xii", "tile:29606"],
    purpose: "Choose a twelve-area landing region.",
    sourceVector: sourceVector(),
    generatedAt: "2026-08-15T22:10:00Z",
    freshness: "current",
    layers: [
      {
        layerId: "saved-world",
        meaning: "Saved coast, biome, relief, road, and river state.",
        evidenceClass: "source-fact",
        sourceRefs: ["rimworld-save:sha256:93f02363"],
      },
      {
        layerId: "selected-region",
        meaning: "Connected twelve-area composition.",
        evidenceClass: "deterministic-projection",
        sourceRefs: ["rimworld-save:sha256:93f02363"],
        producerRef: "cao.connected-composition",
        producerRevision: "b14",
      },
      {
        layerId: "formation-character",
        meaning: "Visual explanation of the coastal-atoll feature.",
        evidenceClass: "illustration",
        sourceRefs: ["rimworld-save:tile:29606"],
      },
    ],
    views: [{
      viewId: "region-landscape",
      form: "map",
      scale: "saved-world neighborhood and selected region",
      artifactRef: "artifact:candidate-29606-landscape",
      layerRefs: [
        "saved-world",
        "selected-region",
        "formation-character",
      ],
    }],
    facts: [{ biome: "tropical rainforest", extent: 12 }],
    constraints: ["arrival must be a selected land area"],
    unresolved: ["cell-level landing projection not yet produced offline"],
    availableOperationRefs: ["compose-region", "stage-plan"],
  };
}

test("validates a CA-shaped project adapter without flattening its schemas", () => {
  const result = validateProjectAdapterDescriptor(caAdapter());
  assert.equal(result.ok, true);
  assert.equal(result.value.schema, PROJECT_WORKBENCH_SCHEMAS.adapter);
  assert.equal(result.value.projectKind, "game-mod");
  assert.deepEqual(
    result.value.operationDescriptors.map((item) => item.effect),
    ["observe", "draft", "stage-write"],
  );
  assert.equal(
    result.value.operationDescriptors[1].outputSchemaRef,
    "cao.regional-plan-draft/1",
  );
});

test("rejects executable and secret-bearing adapter descriptors", () => {
  const executable = validateProjectAdapterDescriptor({
    ...caAdapter(),
    command: "run-private-adapter.exe",
  });
  assert.equal(executable.ok, false);
  assert.equal(
    executable.code,
    "project-adapter-executable-or-secret-field-rejected",
  );

  const forbiddenValue = "not-allowed";
  const secret = validateProjectAdapterDescriptor({
    ...caAdapter(),
    metadata: { token: forbiddenValue },
  });
  assert.equal(secret.ok, false);
  assert.equal(
    secret.code,
    "project-adapter-executable-or-secret-field-rejected",
  );
});

test("requires project authorization for every declared write effect", () => {
  const raw = caAdapter();
  delete raw.operationDescriptors[2].projectAuthorizationRef;
  const result = validateProjectAdapterDescriptor(raw);
  assert.equal(result.ok, false);
  assert.equal(result.code, "project-adapter-write-authorization-required");
});

test("validates per-layer evidence and adapter-owned operations", () => {
  const adapter = validateProjectAdapterDescriptor(caAdapter()).value;
  const result = validateDevelopmentRepresentation(
    representation(),
    adapter,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.layers.map((item) => item.evidenceClass),
    ["source-fact", "deterministic-projection", "illustration"],
  );
  assert.equal(result.value.views[0].form, "map");
});

test("rejects projected layers without a named producer and revision", () => {
  const adapter = validateProjectAdapterDescriptor(caAdapter()).value;
  const raw = representation();
  delete raw.layers[1].producerRevision;
  const result = validateDevelopmentRepresentation(raw, adapter);
  assert.equal(result.ok, false);
  assert.equal(
    result.code,
    "development-representation-layer-producer-required",
  );
});

test("opens a bounded workbench against the validated adapter", () => {
  const adapter = validateProjectAdapterDescriptor(caAdapter()).value;
  const result = createProjectWorkbench({
    workbenchId: "ca-region-20260815",
    hostSessionRef: "codex:thread:regional-authoring",
    operatorRef: "operator:local",
    intent: "Find a tropical island landing region with atoll geography.",
    sourceVector: sourceVector(),
    subjectRefs: ["world:ain-xii"],
  }, adapter);
  assert.equal(result.ok, true);
  assert.equal(result.value.schema, PROJECT_WORKBENCH_SCHEMAS.workbench);
  assert.equal(result.value.adapterRef, "colonist-awareness.world-authoring");
  assert.equal(result.value.state, "active");
  assert.deepEqual(result.value.draftRefs, []);
});
