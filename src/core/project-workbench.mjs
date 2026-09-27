const ID_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const EFFECTS = new Set([
  "observe",
  "draft",
  "stage-write",
  "source-write",
]);
const EVIDENCE_CLASSES = new Set([
  "source-fact",
  "deterministic-projection",
  "derived-summary",
  "illustration",
  "unknown",
]);
const SESSION_STATES = new Set([
  "active",
  "waiting",
  "stale",
  "closed",
]);
const FORBIDDEN_DESCRIPTOR_KEYS = new Set([
  "command",
  "executable",
  "rendercode",
  "script",
  "html",
  "token",
  "secret",
  "password",
  "credentialvalue",
]);

export const PROJECT_WORKBENCH_SCHEMAS = Object.freeze({
  adapter: "mousecat.project-adapter/1",
  workbench: "mousecat.project-workbench/1",
  representation: "mousecat.development-representation/1",
});

function error(code, details = {}) {
  return { schema: "mousecat.error/1", ok: false, code, ...details };
}

function text(value, maximum = 512) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function identifier(value) {
  const normalized = text(value, 160)?.toLowerCase() || null;
  return normalized && ID_RE.test(normalized) ? normalized : null;
}

function stringList(value, maximum = 128) {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized = value.map((item) => text(item, 512));
  return normalized.every(Boolean) ? [...new Set(normalized)] : null;
}

function hasForbiddenDescriptorKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenDescriptorKey);
  return Object.entries(value).some(([key, child]) => (
    FORBIDDEN_DESCRIPTOR_KEYS.has(key.toLowerCase())
    || hasForbiddenDescriptorKey(child)
  ));
}

function normalizeSourceVector(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 64) return null;
  const result = [];
  for (const item of raw) {
    const authority = identifier(item?.authority);
    const sourceRevision = text(item?.sourceRevision, 512);
    const observedAt = text(item?.observedAt, 80);
    const status = identifier(item?.status);
    if (!authority || !sourceRevision || !observedAt || !status) return null;
    result.push({ authority, sourceRevision, observedAt, status });
  }
  return result;
}

export function validateProjectAdapterDescriptor(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return error("project-adapter-descriptor-required");
  }
  if (hasForbiddenDescriptorKey(raw)) {
    return error("project-adapter-executable-or-secret-field-rejected");
  }
  const adapterId = identifier(raw.adapterId);
  const namespace = identifier(raw.namespace);
  const revision = Number.isInteger(raw.revision) && raw.revision > 0
    ? raw.revision
    : null;
  const projectRef = text(raw.projectRef, 512);
  const projectKind = identifier(raw.projectKind);
  const sourceAuthorities = stringList(raw.sourceAuthorities, 32)
    ?.map(identifier);
  const connectorRef = identifier(raw.connectorRef);
  const representationSchemaRefs = stringList(
    raw.representationSchemaRefs,
    32,
  );
  if (!adapterId) return error("project-adapter-id-invalid");
  if (!namespace) return error("project-adapter-namespace-invalid");
  if (!revision) return error("project-adapter-revision-invalid");
  if (!projectRef) return error("project-adapter-project-ref-required");
  if (!projectKind) return error("project-adapter-project-kind-invalid");
  if (!sourceAuthorities?.length || sourceAuthorities.some((item) => !item)) {
    return error("project-adapter-source-authority-invalid");
  }
  if (!connectorRef) return error("project-adapter-connector-ref-invalid");
  if (!representationSchemaRefs?.length) {
    return error("project-adapter-representation-schema-required");
  }
  if (!Array.isArray(raw.operationDescriptors)
      || raw.operationDescriptors.length === 0
      || raw.operationDescriptors.length > 64) {
    return error("project-adapter-operation-required");
  }

  const operationDescriptors = [];
  const operationIds = new Set();
  for (const operation of raw.operationDescriptors) {
    const operationId = identifier(operation?.operationId);
    const effect = text(operation?.effect, 40);
    const inputSchemaRef = text(operation?.inputSchemaRef, 512);
    const outputSchemaRef = text(operation?.outputSchemaRef, 512);
    const permitRef = identifier(operation?.permitRef);
    const projectAuthorizationRef = text(
      operation?.projectAuthorizationRef,
      512,
    );
    if (!operationId || operationIds.has(operationId)) {
      return error("project-adapter-operation-id-invalid", { operationId });
    }
    if (!EFFECTS.has(effect)) {
      return error("project-adapter-operation-effect-invalid", {
        operationId,
        effect,
      });
    }
    if (!inputSchemaRef || !outputSchemaRef || !permitRef) {
      return error("project-adapter-operation-contract-incomplete", {
        operationId,
      });
    }
    if ((effect === "stage-write" || effect === "source-write")
        && !projectAuthorizationRef) {
      return error("project-adapter-write-authorization-required", {
        operationId,
      });
    }
    operationIds.add(operationId);
    operationDescriptors.push({
      operationId,
      effect,
      inputSchemaRef,
      outputSchemaRef,
      permitRef,
      ...(projectAuthorizationRef ? { projectAuthorizationRef } : {}),
    });
  }

  return {
    schema: "mousecat.project-adapter.validation/1",
    ok: true,
    value: {
      schema: PROJECT_WORKBENCH_SCHEMAS.adapter,
      adapterId,
      namespace,
      revision,
      projectRef,
      projectKind,
      sourceAuthorities,
      operationDescriptors,
      representationSchemaRefs,
      validationCapabilityRef: text(raw.validationCapabilityRef, 512),
      checkpointCapabilityRef: text(raw.checkpointCapabilityRef, 512),
      connectorRef,
    },
  };
}

export function validateDevelopmentRepresentation(raw = {}, adapter = null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return error("development-representation-required");
  }
  if (raw.schema !== PROJECT_WORKBENCH_SCHEMAS.representation) {
    return error("development-representation-schema-invalid");
  }
  const representationId = identifier(raw.representationId);
  const workbenchId = identifier(raw.workbenchId);
  const projectRef = text(raw.projectRef, 512);
  const purpose = text(raw.purpose, 2_000);
  const subjectRefs = stringList(raw.subjectRefs, 256);
  const sourceVector = normalizeSourceVector(raw.sourceVector);
  const generatedAt = text(raw.generatedAt, 80);
  const freshness = identifier(raw.freshness);
  if (!representationId || !workbenchId || !projectRef || !purpose
      || !subjectRefs?.length || !sourceVector || !generatedAt
      || !freshness) {
    return error("development-representation-identity-incomplete");
  }
  if (adapter && projectRef !== adapter.projectRef) {
    return error("development-representation-project-mismatch");
  }
  if (!Array.isArray(raw.layers) || raw.layers.length === 0
      || raw.layers.length > 256) {
    return error("development-representation-layer-required");
  }

  const layers = [];
  const layerIds = new Set();
  for (const layer of raw.layers) {
    const layerId = identifier(layer?.layerId);
    const meaning = text(layer?.meaning, 2_000);
    const evidenceClass = text(layer?.evidenceClass, 64);
    const sourceRefs = stringList(layer?.sourceRefs || [], 128);
    const producerRef = text(layer?.producerRef, 512);
    const producerRevision = text(layer?.producerRevision, 512);
    if (!layerId || layerIds.has(layerId) || !meaning
        || !EVIDENCE_CLASSES.has(evidenceClass) || !sourceRefs) {
      return error("development-representation-layer-invalid", { layerId });
    }
    if (evidenceClass !== "illustration" && evidenceClass !== "unknown"
        && sourceRefs.length === 0) {
      return error("development-representation-layer-source-required", {
        layerId,
      });
    }
    if ((evidenceClass === "deterministic-projection"
        || evidenceClass === "derived-summary")
        && (!producerRef || !producerRevision)) {
      return error("development-representation-layer-producer-required", {
        layerId,
      });
    }
    layerIds.add(layerId);
    layers.push({
      layerId,
      meaning,
      evidenceClass,
      sourceRefs,
      ...(producerRef ? { producerRef } : {}),
      ...(producerRevision ? { producerRevision } : {}),
    });
  }

  if (!Array.isArray(raw.views) || raw.views.length === 0
      || raw.views.length > 64) {
    return error("development-representation-view-required");
  }
  const views = [];
  const viewIds = new Set();
  for (const view of raw.views) {
    const viewId = identifier(view?.viewId);
    const form = identifier(view?.form);
    const scale = text(view?.scale, 160);
    const artifactRef = text(view?.artifactRef, 1_024);
    const layerRefs = stringList(view?.layerRefs, 256)
      ?.map(identifier);
    if (!viewId || viewIds.has(viewId) || !form || !scale || !artifactRef
        || !layerRefs?.length || layerRefs.some((item) => !item
          || !layerIds.has(item))) {
      return error("development-representation-view-invalid", { viewId });
    }
    viewIds.add(viewId);
    views.push({ viewId, form, scale, artifactRef, layerRefs });
  }

  const availableOperationRefs = stringList(
    raw.availableOperationRefs || [],
    64,
  )?.map(identifier);
  if (!availableOperationRefs
      || availableOperationRefs.some((item) => !item)) {
    return error("development-representation-operation-ref-invalid");
  }
  if (adapter) {
    const knownOperations = new Set(
      adapter.operationDescriptors.map((item) => item.operationId),
    );
    if (availableOperationRefs.some((item) => !knownOperations.has(item))) {
      return error("development-representation-operation-ref-unknown");
    }
  }

  return {
    schema: "mousecat.development-representation.validation/1",
    ok: true,
    value: {
      schema: PROJECT_WORKBENCH_SCHEMAS.representation,
      representationId,
      workbenchId,
      projectRef,
      subjectRefs,
      purpose,
      sourceVector,
      generatedAt,
      freshness,
      views,
      layers,
      facts: Array.isArray(raw.facts) ? raw.facts.slice(0, 512) : [],
      constraints: Array.isArray(raw.constraints)
        ? raw.constraints.slice(0, 512)
        : [],
      unresolved: Array.isArray(raw.unresolved)
        ? raw.unresolved.slice(0, 512)
        : [],
      availableOperationRefs,
      selectedDraftRef: text(raw.selectedDraftRef, 512),
    },
  };
}

export function createProjectWorkbench(raw = {}, adapter = null) {
  if (!adapter || adapter.schema !== PROJECT_WORKBENCH_SCHEMAS.adapter) {
    return error("project-workbench-adapter-required");
  }
  const workbenchId = identifier(raw.workbenchId);
  const hostSessionRef = text(raw.hostSessionRef, 512);
  const operatorRef = text(raw.operatorRef, 512);
  const intent = text(raw.intent, 4_000);
  const sourceVector = normalizeSourceVector(raw.sourceVector);
  const subjectRefs = stringList(raw.subjectRefs || [], 256);
  const state = identifier(raw.state || "active");
  if (!workbenchId || !hostSessionRef || !operatorRef || !intent
      || !sourceVector || !subjectRefs || !SESSION_STATES.has(state)) {
    return error("project-workbench-state-invalid");
  }
  return {
    schema: "mousecat.project-workbench.validation/1",
    ok: true,
    value: {
      schema: PROJECT_WORKBENCH_SCHEMAS.workbench,
      workbenchId,
      projectRef: adapter.projectRef,
      adapterRef: adapter.adapterId,
      hostSessionRef,
      operatorRef,
      intent,
      sourceVector,
      subjectRefs,
      currentRepresentationRef: text(raw.currentRepresentationRef, 512),
      draftRefs: stringList(raw.draftRefs || [], 256) || [],
      stagedRef: text(raw.stagedRef, 512),
      operationReceipts: Array.isArray(raw.operationReceipts)
        ? raw.operationReceipts.slice(0, 512)
        : [],
      checkpointRef: text(raw.checkpointRef, 512),
      state,
    },
  };
}
