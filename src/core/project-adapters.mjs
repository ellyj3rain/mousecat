import { PROJECT_WORKBENCH_SCHEMAS, validateProjectAdapterDescriptor } from "./project-workbench.mjs";

const CA_ADAPTER_ID = "colonist-awareness.world-authoring";
const CA_PRODUCER = "cao.offline-world-authoring";
const CA_PRODUCER_REVISION = "b14";

const CA_ADAPTER_INPUT = Object.freeze({
  adapterId: CA_ADAPTER_ID,
  namespace: "colonist-awareness",
  revision: 1,
  projectRef: "project:colonist-awareness",
  projectKind: "game-mod",
  sourceAuthorities: [
    "rimworld-save",
    "cao-world-atlas",
    "cao-current-schema",
  ],
  operationDescriptors: [
    {
      operationId: "cao.area.inspect",
      effect: "observe",
      inputSchemaRef: "cao.area-inspection.request/1",
      outputSchemaRef: "cao.atlas-tile-fact/1",
      permitRef: "observer",
    },
    {
      operationId: "cao.region.find",
      effect: "observe",
      inputSchemaRef: "cao.region-search.request/1",
      outputSchemaRef: "cao.region-candidates/1",
      permitRef: "observer",
    },
    {
      operationId: "cao.region.compose",
      effect: "draft",
      inputSchemaRef: "cao.region-composition.request/1",
      outputSchemaRef: "cao.atlas-composition/1",
      permitRef: "operator-interaction",
    },
  ],
  representationSchemaRefs: [
    "cao.atlas-tile-fact/1",
    "cao.region-candidates/1",
    "cao.atlas-composition/1",
  ],
  validationCapabilityRef: "cao.validate-regional-plan",
  checkpointCapabilityRef: "cao.atlas-evidence-signature",
  connectorRef: "colonist-awareness",
});

const validatedCaAdapter = validateProjectAdapterDescriptor(CA_ADAPTER_INPUT);
if (!validatedCaAdapter.ok) {
  throw new TypeError(`Invalid source project adapter: ${validatedCaAdapter.code}`);
}

export const COLONIST_AWARENESS_PROJECT_ADAPTER = Object.freeze(
  validatedCaAdapter.value,
);

const SOURCE_PROJECT_ADAPTERS = Object.freeze([
  COLONIST_AWARENESS_PROJECT_ADAPTER,
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function actualConnectorValue(result) {
  let current = result;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") break;
    if (current.schema === "mousecat.connector.invoke/1") {
      current = current.result;
      continue;
    }
    if (current.schema === "mousecat.integration-result/1") {
      current = current.result;
      continue;
    }
    if (current.structuredContent && typeof current.structuredContent === "object") {
      current = current.structuredContent;
      continue;
    }
    break;
  }
  return current;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value);
}

function isInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTile(value) {
  return isRecord(value)
    && isInteger(value.tileId)
    && isRecord(value.biome)
    && isText(value.biome.defName)
    && isText(value.biome.label)
    && isText(value.biome.sourceModId)
    && Array.isArray(value.mutators)
    && Array.isArray(value.roads)
    && Array.isArray(value.rivers)
    && Array.isArray(value.worldObjects)
    && typeof value.definitionComplete === "boolean";
}

function isComposition(value) {
  return isRecord(value)
    && isText(value.worldIdentity)
    && isSha256(value.sourceSaveSha256)
    && isInteger(value.rootTileId)
    && [4, 6, 8, 10, 12].includes(value.requestedExtent)
    && Number.isInteger(value.realizedExtent)
    && value.realizedExtent > 0
    && Number.isInteger(value.orientation)
    && value.orientation >= 0
    && value.orientation <= 5
    && isInteger(value.arrivalTileId)
    && (value.localMapSize === null
      || value.localMapSize === undefined
      || Number.isInteger(value.localMapSize) && value.localMapSize > 0)
    && Array.isArray(value.memberTileIds)
    && value.memberTileIds.length === value.realizedExtent
    && value.memberTileIds.every(isInteger)
    && value.memberTileIds.includes(value.rootTileId)
    && value.memberTileIds.includes(value.arrivalTileId)
    && Array.isArray(value.tiles)
    && value.tiles.length === value.realizedExtent
    && value.tiles.every(isTile)
    && isSha256(value.atlasEvidenceSignature)
    && typeof value.compositionEvidenceComplete === "boolean"
    && typeof value.stageReady === "boolean"
    && isStringArray(value.evidenceObligations)
    && isStringArray(value.stageBlockers);
}

function validCaOperationResult(operationId, value) {
  if (operationId === "cao.area.inspect") return isTile(value);
  if (operationId === "cao.region.find") {
    return Array.isArray(value) && value.every((candidate) => (
      isRecord(candidate)
      && typeof candidate.score === "number"
      && Number.isFinite(candidate.score)
      && typeof candidate.matchSummary === "string"
      && isComposition(candidate.composition)
    ));
  }
  if (operationId === "cao.region.compose") return isComposition(value);
  return false;
}

function sourceVectorFor(value, fallback, observedAt) {
  const candidate = Array.isArray(value)
    ? value.find((item) => item?.sourceSaveSha256)
    : value?.sourceSaveSha256
      ? value
      : value?.composition?.sourceSaveSha256
        ? value.composition
        : null;
  const digest = String(candidate?.sourceSaveSha256 || "").trim();
  if (!digest) return clone(fallback);
  return [{
    authority: "rimworld-save",
    sourceRevision: `sha256:${digest.toLowerCase()}`,
    observedAt,
    status: "current",
  }];
}

function sourceRefs(vector) {
  return vector.map((item) => `${item.authority}:${item.sourceRevision}`);
}

function tileSummary(tile = {}) {
  return {
    tileId: tile.tileId,
    longitude: tile.longitude,
    latitude: tile.latitude,
    biome: tile.biome ? {
      defName: tile.biome.defName,
      label: tile.biome.label,
      sourceModId: tile.biome.sourceModId,
      isWaterBiome: tile.biome.isWaterBiome === true,
      impassable: tile.biome.impassable === true,
    } : null,
    elevation: tile.elevation,
    hilliness: tile.hilliness,
    mutators: Array.isArray(tile.mutators)
      ? tile.mutators.map((item) => ({
        defName: item.defName,
        label: item.label,
        sourceModId: item.sourceModId,
      }))
      : [],
    roads: Array.isArray(tile.roads) ? tile.roads : [],
    rivers: Array.isArray(tile.rivers) ? tile.rivers : [],
    worldObjects: Array.isArray(tile.worldObjects) ? tile.worldObjects : [],
    blocked: tile.blocked === true,
    definitionComplete: tile.definitionComplete === true,
  };
}

function compositionSummary(composition = {}) {
  return {
    worldIdentity: composition.worldIdentity,
    sourceSaveSha256: composition.sourceSaveSha256,
    rootTileId: composition.rootTileId,
    requestedExtent: composition.requestedExtent,
    realizedExtent: composition.realizedExtent,
    orientation: composition.orientation,
    arrivalTileId: composition.arrivalTileId,
    localMapSize: composition.localMapSize ?? null,
    memberTileIds: Array.isArray(composition.memberTileIds)
      ? composition.memberTileIds
      : [],
    atlasEvidenceSignature: composition.atlasEvidenceSignature,
    compositionEvidenceComplete: composition.compositionEvidenceComplete === true,
    stageReady: composition.stageReady === true,
    evidenceObligations: Array.isArray(composition.evidenceObligations)
      ? composition.evidenceObligations
      : [],
    stageBlockers: Array.isArray(composition.stageBlockers)
      ? composition.stageBlockers
      : [],
    tiles: Array.isArray(composition.tiles)
      ? composition.tiles.map(tileSummary)
      : [],
  };
}

function candidateSummary(candidate = {}) {
  return {
    score: candidate.score,
    matchSummary: candidate.matchSummary,
    composition: compositionSummary(candidate.composition),
  };
}

function subjectRefsFor(operationId, value) {
  if (operationId === "cao.area.inspect") {
    return value?.tileId === undefined ? [] : [`tile:${value.tileId}`];
  }
  if (operationId === "cao.region.find") {
    return (Array.isArray(value) ? value : [])
      .map((item) => item?.composition?.atlasEvidenceSignature)
      .filter(Boolean)
      .map((item) => `composition:${item}`);
  }
  if (operationId === "cao.region.compose") {
    return [
      value?.worldIdentity ? `world:${value.worldIdentity}` : null,
      value?.rootTileId === undefined ? null : `tile:${value.rootTileId}`,
      value?.atlasEvidenceSignature
        ? `composition:${value.atlasEvidenceSignature}`
        : null,
    ].filter(Boolean);
  }
  return [];
}

function representationFacts(operationId, value) {
  if (operationId === "cao.area.inspect") return [tileSummary(value)];
  if (operationId === "cao.region.find") {
    return (Array.isArray(value) ? value : []).map(candidateSummary);
  }
  if (operationId === "cao.region.compose") return [compositionSummary(value)];
  return [];
}

function operationForm(operationId) {
  if (operationId === "cao.area.inspect") return "spatial-detail";
  return "map";
}

function operationScale(operationId) {
  if (operationId === "cao.area.inspect") return "one saved world area";
  if (operationId === "cao.region.find") return "candidate regions in one saved world";
  return "one connected regional composition";
}

function caProjection(adapter, operation, connectorResult, context) {
  const value = actualConnectorValue(connectorResult);
  if (!validCaOperationResult(operation.operationId, value)) {
    const failure = new TypeError("project-output-schema-invalid");
    failure.code = "project-output-schema-invalid";
    throw failure;
  }
  const sourceVector = sourceVectorFor(
    operation.operationId === "cao.region.find" && Array.isArray(value)
      ? value[0]?.composition
      : value,
    context.workbench.sourceVector,
    context.completedAt,
  );
  const refs = sourceRefs(sourceVector);
  const subjects = subjectRefsFor(operation.operationId, value);
  const layers = [{
    layerId: "project-facts",
    meaning: "Facts read from the selected CA saved-world atlas.",
    evidenceClass: "source-fact",
    sourceRefs: refs,
  }];
  if (["cao.region.find", "cao.region.compose"].includes(operation.operationId)) {
    layers.push({
      layerId: "regional-composition",
      meaning: "Connected areas selected by CA's current offline composition algorithm.",
      evidenceClass: "deterministic-projection",
      sourceRefs: refs,
      producerRef: CA_PRODUCER,
      producerRevision: CA_PRODUCER_REVISION,
    });
  }
  const compositions = operation.operationId === "cao.region.find"
    ? (Array.isArray(value) ? value.map((item) => item?.composition).filter(Boolean) : [])
    : operation.operationId === "cao.region.compose" ? [value] : [];
  const unresolved = compositions.flatMap((item) => [
    ...(item.evidenceObligations || []),
    ...(item.stageBlockers || []),
  ]);
  if (unresolved.length > 0) {
    layers.push({
      layerId: "unresolved-ground",
      meaning: "Project facts that the current offline authoring boundary cannot yet resolve.",
      evidenceClass: "unknown",
      sourceRefs: [],
    });
  }
  const selectedDraftRef = operation.operationId === "cao.region.compose"
    && value.atlasEvidenceSignature
    ? `cao-composition:${value.atlasEvidenceSignature}`
    : null;
  return {
    sourceVector,
    domainResult: value,
    representation: {
      schema: PROJECT_WORKBENCH_SCHEMAS.representation,
      representationId: `ca-${context.receiptId}`,
      workbenchId: context.workbench.workbenchId,
      projectRef: adapter.projectRef,
      subjectRefs: subjects.length > 0
        ? subjects
        : context.workbench.subjectRefs,
      purpose: context.workbench.intent,
      sourceVector,
      generatedAt: context.completedAt,
      freshness: "current",
      layers,
      views: [{
        viewId: "project-subject",
        form: operationForm(operation.operationId),
        scale: operationScale(operation.operationId),
        artifactRef: `mousecat://workbench/${context.workbench.workbenchId}/operations/${context.receiptId}`,
        layerRefs: layers.map((item) => item.layerId),
      }],
      facts: representationFacts(operation.operationId, value),
      constraints: compositions.flatMap((item) => item.stageBlockers || []),
      unresolved,
      availableOperationRefs: adapter.operationDescriptors.map((item) => item.operationId),
      ...(selectedDraftRef ? { selectedDraftRef } : {}),
    },
  };
}

export function sourceProjectAdapterDescriptors() {
  return SOURCE_PROJECT_ADAPTERS.map(clone);
}

export function projectSourceOperationProjection(
  adapter,
  operation,
  connectorResult,
  context,
) {
  if (adapter?.adapterId === CA_ADAPTER_ID) {
    return caProjection(adapter, operation, connectorResult, context);
  }
  const value = actualConnectorValue(connectorResult);
  if (!value || typeof value !== "object" || value.schema !== operation.outputSchemaRef) {
    const failure = new TypeError("project-output-schema-invalid");
    failure.code = "project-output-schema-invalid";
    throw failure;
  }
  if (value?.representation) {
    return {
      sourceVector: value.sourceVector || value.representation.sourceVector,
      domainResult: value.result ?? value,
      representation: value.representation,
    };
  }
  return {
    sourceVector: context.workbench.sourceVector,
    domainResult: value,
    representation: null,
  };
}
