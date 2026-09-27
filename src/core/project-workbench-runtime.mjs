import { createHash, randomUUID } from "node:crypto";

import {
  createProjectWorkbench,
  PROJECT_WORKBENCH_SCHEMAS,
  validateDevelopmentRepresentation,
  validateProjectAdapterDescriptor,
} from "./project-workbench.mjs";
import {
  projectSourceOperationProjection,
  sourceProjectAdapterDescriptors,
} from "./project-adapters.mjs";

const MAX_OPERATION_INPUT_BYTES = 256 * 1024;
const MAX_OPERATION_RESULT_BYTES = 2 * 1024 * 1024;
const MAX_OPERATION_RECEIPTS = 512;
const CLOSED_EFFECTS = new Set(["stage-write", "source-write"]);

function error(code, details = {}) {
  return { schema: "mousecat.error/1", ok: false, code, ...details };
}

function identifier(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(normalized)
    ? normalized
    : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function capabilityHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function adapterFingerprint(adapter) {
  return createHash("sha256").update(JSON.stringify({
    schema: adapter.schema,
    adapterId: adapter.adapterId,
    namespace: adapter.namespace,
    revision: adapter.revision,
    projectRef: adapter.projectRef,
    projectKind: adapter.projectKind,
    sourceAuthorities: adapter.sourceAuthorities,
    operationDescriptors: adapter.operationDescriptors,
    representationSchemaRefs: adapter.representationSchemaRefs,
    validationCapabilityRef: adapter.validationCapabilityRef,
    checkpointCapabilityRef: adapter.checkpointCapabilityRef,
    connectorRef: adapter.connectorRef,
  })).digest("hex");
}

function adapterBindingMatches(workbench, adapter) {
  return Boolean(adapter)
    && workbench.adapterRevision === adapter.revision
    && workbench.adapterFingerprint === adapterFingerprint(adapter)
    && workbench.adapterProjectRef === adapter.projectRef
    && workbench.adapterConnectorRef === adapter.connectorRef;
}

function operationConnectorAuthority(adapter, operation, resolver) {
  if (CLOSED_EFFECTS.has(operation.effect)) {
    return { ok: true, closed: true, value: null };
  }
  let authority = null;
  try {
    authority = typeof resolver === "function"
      ? resolver(adapter.connectorRef, operation.operationId)
      : null;
  } catch {
    authority = null;
  }
  if (!authority) {
    return error("project-adapter-connector-capability-unknown", {
      adapterRef: adapter.adapterId,
      connectorRef: adapter.connectorRef,
      operationId: operation.operationId,
    });
  }
  if (authority.access !== "read") {
    return error("project-adapter-connector-capability-not-read", {
      adapterRef: adapter.adapterId,
      connectorRef: adapter.connectorRef,
      operationId: operation.operationId,
      connectorAccess: authority.access,
    });
  }
  return {
    ok: true,
    closed: false,
    value: clone(authority),
  };
}

function adapterConnectorAuthority(adapter, resolver) {
  for (const operation of adapter.operationDescriptors) {
    const resolved = operationConnectorAuthority(adapter, operation, resolver);
    if (!resolved.ok) return resolved;
  }
  return { ok: true };
}

function boundedJson(value, maximumBytes) {
  let serialized;
  try {
    serialized = JSON.stringify(value ?? {});
  } catch {
    return null;
  }
  if (Buffer.byteLength(serialized, "utf8") > maximumBytes) return null;
  return {
    value: JSON.parse(serialized),
    digest: `sha256:${createHash("sha256").update(serialized).digest("hex")}`,
    bytes: Buffer.byteLength(serialized, "utf8"),
  };
}

function sourceIdentity(vector = []) {
  return [...vector]
    .map((item) => `${item.authority}|${item.sourceRevision}|${item.status}`)
    .sort()
    .join("\n");
}

function sameSourceIdentity(left, right) {
  return sourceIdentity(left) === sourceIdentity(right);
}

function sourceVectorOwnedByAdapter(vector, adapter) {
  const authorities = new Set(adapter?.sourceAuthorities || []);
  return Array.isArray(vector) && vector.length > 0
    && vector.every((item) => authorities.has(item?.authority)
      && typeof item?.sourceRevision === "string"
      && item.sourceRevision.length > 0
      && typeof item?.status === "string"
      && item.status.length > 0);
}

function publicWorkbench(record) {
  if (!record) return null;
  const { capabilityHash: _capabilityHash, ...value } = record;
  return clone(value);
}

function publicReceipt(receipt) {
  return receipt ? clone(receipt) : null;
}

function sourceAdapters() {
  return sourceProjectAdapterDescriptors();
}

function validCustomAdapters(state) {
  const records = [...(state.customProjectAdapters || new Map()).values()];
  const adapters = [];
  for (const record of records) {
    const validated = validateProjectAdapterDescriptor(record);
    if (!validated.ok) continue;
    if (record.registration?.namespace !== validated.value.namespace
        || record.registration?.revision !== validated.value.revision) {
      continue;
    }
    adapters.push({
      ...validated.value,
      source: "runtime-registry",
      registration: clone(record.registration),
    });
  }
  return { records, adapters };
}

export function projectAdapterRegistrySnapshot(state) {
  const custom = validCustomAdapters(state);
  return {
    schema: "mousecat.project-adapter-registry/1",
    adapters: [
      ...sourceAdapters().map((adapter) => ({
        ...adapter,
        source: "mousecat-source",
        registration: {
          namespace: adapter.namespace,
          revision: adapter.revision,
        },
      })),
      ...custom.adapters,
    ],
    invalidDescriptors: custom.records.length - custom.adapters.length,
    policy: {
      executableDescriptorsAccepted: false,
      secretValuesAccepted: false,
      projectSchemasRemainProjectOwned: true,
      writeEffectsExecutable: false,
    },
  };
}

export function resolveProjectAdapter(state, adapterRef) {
  const normalized = identifier(adapterRef);
  if (!normalized) return null;
  return projectAdapterRegistrySnapshot(state).adapters.find(
    (adapter) => adapter.adapterId === normalized,
  ) || null;
}

export function registerProjectAdapterDescriptor(
  state,
  args = {},
  resolveConnectorCapability = null,
) {
  const namespace = identifier(args.namespace);
  if (!namespace) return error("project-adapter-registry-namespace-required");
  const validated = validateProjectAdapterDescriptor(args.projectAdapter);
  if (!validated.ok) return validated;
  const adapter = validated.value;
  if (adapter.namespace !== namespace) {
    return error("project-adapter-registry-namespace-mismatch", {
      namespace,
      adapterNamespace: adapter.namespace,
    });
  }
  if (sourceAdapters().some((item) => item.adapterId === adapter.adapterId)) {
    return error("project-adapter-source-id-conflict", {
      adapterRef: adapter.adapterId,
    });
  }
  const connectorAuthority = adapterConnectorAuthority(
    adapter,
    resolveConnectorCapability,
  );
  if (!connectorAuthority.ok) return connectorAuthority;
  const collection = state.customProjectAdapters || new Map();
  state.customProjectAdapters = collection;
  const existing = collection.get(adapter.adapterId);
  if (existing) {
    if (existing.registration?.namespace !== namespace) {
      return error("project-adapter-registry-namespace-conflict", {
        adapterRef: adapter.adapterId,
        owner: existing.registration?.namespace || null,
      });
    }
    if (adapter.revision < existing.registration.revision) {
      return error("project-adapter-registry-revision-stale", {
        adapterRef: adapter.adapterId,
      });
    }
    const candidate = {
      ...adapter,
      source: "runtime-registry",
      registration: { namespace, revision: adapter.revision },
    };
    if (adapter.revision === existing.registration.revision
        && JSON.stringify(existing) !== JSON.stringify(candidate)) {
      return error("project-adapter-registry-revision-conflict", {
        adapterRef: adapter.adapterId,
      });
    }
  }
  const record = {
    ...adapter,
    source: "runtime-registry",
    registration: { namespace, revision: adapter.revision },
  };
  collection.set(adapter.adapterId, record);
  return {
    schema: "mousecat.project-adapter-registration/1",
    ok: true,
    adapter: clone(record),
    registry: projectAdapterRegistrySnapshot(state),
  };
}

function requireWorkbench(state, args) {
  const workbenchId = identifier(args.workbenchId);
  const workbench = workbenchId
    ? state.projectWorkbenches.get(workbenchId)
    : null;
  if (!workbench) return { error: error("project-workbench-unknown", { workbenchId }) };
  if (capabilityHash(args.workbenchToken) !== workbench.capabilityHash) {
    return { error: error("project-workbench-capability-invalid", { workbenchId }) };
  }
  return { workbench };
}

function markCurrentRepresentationStale(state, workbench) {
  const current = workbench.currentRepresentationRef
    ? state.projectRepresentations.get(workbench.currentRepresentationRef)
    : null;
  if (!current) return;
  state.projectRepresentations.set(current.representationId, {
    ...current,
    freshness: "stale",
  });
}

function rememberReceipt(state, workbench, receipt) {
  state.projectOperationReceipts.set(receipt.receiptId, receipt);
  workbench.operationReceipts.push(receipt.receiptId);
  while (workbench.operationReceipts.length > MAX_OPERATION_RECEIPTS) {
    const expired = workbench.operationReceipts.shift();
    if (expired) state.projectOperationReceipts.delete(expired);
  }
}

export function createProjectWorkbenchController(options) {
  const {
    state,
    emit,
    invokeConnector,
    resolveConnectorCapability,
    permitAllows,
    now = () => new Date().toISOString(),
  } = options;
  const activeOperations = new Set();

  function markAdapterBindingStale(workbench) {
    const changed = workbench.state !== "stale"
      || workbench.staleCode !== "project-workbench-adapter-stale";
    workbench.state = "stale";
    workbench.staleCode = "project-workbench-adapter-stale";
    workbench.updatedAt = now();
    markCurrentRepresentationStale(state, workbench);
    if (changed) {
      emit("project-workbench.adapter-stale", {
        workbenchId: workbench.workbenchId,
        adapterRef: workbench.adapterRef,
      });
    }
  }

  function open(args = {}) {
    const permission = permitAllows(args.permit, "mousecat.workbench", "open");
    if (!permission.allowed) {
      return error("project-workbench-open-permit-required", {
        reason: permission.reason,
      });
    }
    const adapter = resolveProjectAdapter(state, args.adapterRef);
    if (!adapter) return error("project-workbench-adapter-unknown");
    const connectorAuthority = adapterConnectorAuthority(
      adapter,
      resolveConnectorCapability,
    );
    if (!connectorAuthority.ok) return connectorAuthority;
    const workbenchId = identifier(args.workbenchId)
      || `workbench-${randomUUID()}`;
    if (state.projectWorkbenches.has(workbenchId)) {
      return error("project-workbench-id-conflict", { workbenchId });
    }
    const compiled = createProjectWorkbench({
      ...args,
      workbenchId,
      state: "active",
    }, adapter);
    if (!compiled.ok) return compiled;
    if (!sourceVectorOwnedByAdapter(compiled.value.sourceVector, adapter)) {
      return error("project-workbench-source-authority-mismatch", {
        adapterRef: adapter.adapterId,
      });
    }
    const workbenchToken = `workbench-capability-${randomUUID()}`;
    const record = {
      ...compiled.value,
      adapterRevision: adapter.revision,
      adapterFingerprint: adapterFingerprint(adapter),
      adapterProjectRef: adapter.projectRef,
      adapterConnectorRef: adapter.connectorRef,
      capabilityHash: capabilityHash(workbenchToken),
      createdAt: now(),
      updatedAt: now(),
    };
    state.projectWorkbenches.set(workbenchId, record);
    emit("project-workbench.opened", {
      workbenchId,
      adapterRef: adapter.adapterId,
      projectRef: adapter.projectRef,
    });
    return {
      schema: "mousecat.project-workbench.opened/1",
      ok: true,
      workbench: publicWorkbench(record),
      workbenchToken,
    };
  }

  function snapshot(args = {}) {
    const required = requireWorkbench(state, args);
    if (required.error) return required.error;
    const workbench = required.workbench;
    const adapter = resolveProjectAdapter(state, workbench.adapterRef);
    if (!adapterBindingMatches(workbench, adapter)) {
      markAdapterBindingStale(workbench);
    }
    const representation = workbench.currentRepresentationRef
      ? state.projectRepresentations.get(workbench.currentRepresentationRef)
      : null;
    return {
      schema: "mousecat.project-workbench.snapshot/1",
      ok: true,
      workbench: publicWorkbench(workbench),
      adapter: adapter ? clone(adapter) : null,
      representation: representation ? clone(representation) : null,
      receipts: workbench.operationReceipts
        .map((receiptId) => state.projectOperationReceipts.get(receiptId))
        .filter(Boolean)
        .map(publicReceipt),
    };
  }

  async function operate(args = {}, context = {}) {
    const required = requireWorkbench(state, args);
    if (required.error) return required.error;
    const workbench = required.workbench;
    const adapter = resolveProjectAdapter(state, workbench.adapterRef);
    if (!adapterBindingMatches(workbench, adapter)) {
      markAdapterBindingStale(workbench);
      return error("project-workbench-adapter-stale", {
        workbenchId: workbench.workbenchId,
        adapterRef: workbench.adapterRef,
      });
    }
    if (workbench.state === "closed") {
      return error("project-workbench-closed", { workbenchId: workbench.workbenchId });
    }
    if (workbench.state === "stale") {
      return error("project-workbench-stale", { workbenchId: workbench.workbenchId });
    }
    const operationId = identifier(args.operationId);
    const operation = adapter.operationDescriptors.find(
      (item) => item.operationId === operationId,
    );
    if (!operation) {
      return error("project-workbench-operation-unknown", { operationId });
    }
    if (CLOSED_EFFECTS.has(operation.effect)) {
      return error("project-workbench-write-effect-closed", {
        operationId,
        effect: operation.effect,
      });
    }
    const connectorAuthority = operationConnectorAuthority(
      adapter,
      operation,
      resolveConnectorCapability,
    );
    if (!connectorAuthority.ok) return connectorAuthority;
    const permission = permitAllows(args.permit, "mousecat.workbench", "operate");
    if (!permission.allowed || permission.profile?.id !== operation.permitRef) {
      return error("project-workbench-operation-permit-required", {
        operationId,
        requiredPermit: operation.permitRef,
        reason: permission.reason,
      });
    }
    const input = boundedJson(args.input || {}, MAX_OPERATION_INPUT_BYTES);
    if (!input) return error("project-workbench-operation-input-too-large");
    if (activeOperations.has(workbench.workbenchId)) {
      return error("project-workbench-operation-active", {
        workbenchId: workbench.workbenchId,
      });
    }
    activeOperations.add(workbench.workbenchId);

    try {
      const receiptId = `operation-${randomUUID()}`;
    const startedAt = now();
    const fail = (code, details = {}) => {
      const completedAt = details.completedAt || now();
      const receipt = {
        schema: "mousecat.project-operation-receipt/1",
        receiptId,
        workbenchId: workbench.workbenchId,
        adapterRef: adapter.adapterId,
        operationId,
        effect: operation.effect,
        inputDigest: input.digest,
        inputBytes: input.bytes,
        startedAt,
        completedAt,
        outcome: "failed",
        code,
        sourceVectorBefore: clone(workbench.sourceVector),
        sourceVectorAfter: details.sourceVectorAfter
          ? clone(details.sourceVectorAfter)
          : null,
        resultSchemaRef: operation.outputSchemaRef,
        ...(details.resultDigest ? { resultDigest: details.resultDigest } : {}),
        ...(details.resultBytes ? { resultBytes: details.resultBytes } : {}),
      };
      rememberReceipt(state, workbench, receipt);
      workbench.updatedAt = completedAt;
      emit("project-workbench.operation-failed", {
        workbenchId: workbench.workbenchId,
        adapterRef: adapter.adapterId,
        operationId,
        receiptId,
        code,
      });
      return {
        schema: "mousecat.project-workbench.operation/1",
        ok: false,
        code,
        receipt: publicReceipt(receipt),
      };
    };
    let invoked;
    try {
      invoked = await invokeConnector({
        adapter,
        operation,
        connectorAuthority: connectorAuthority.value,
        input: input.value,
        workbench: publicWorkbench(workbench),
        context,
      });
    } catch (cause) {
      invoked = {
        ok: false,
        code: "project-connector-threw",
      };
    }
    const completedAt = now();
    if (!invoked?.ok) {
      return fail(invoked?.code || "project-connector-failed", {
        completedAt,
      });
    }

    const currentAdapter = resolveProjectAdapter(state, workbench.adapterRef);
    if (!adapterBindingMatches(workbench, currentAdapter)) {
      markAdapterBindingStale(workbench);
      return fail("project-workbench-adapter-stale", { completedAt });
    }
    if (state.projectWorkbenches.get(workbench.workbenchId) !== workbench
        || workbench.state !== "active") {
      return fail("project-workbench-state-changed", { completedAt });
    }

    let projection;
    try {
      projection = projectSourceOperationProjection(
        adapter,
        operation,
        invoked,
        { receiptId, workbench: publicWorkbench(workbench), startedAt, completedAt },
      );
    } catch (cause) {
      return fail(cause?.code === "project-output-schema-invalid"
        ? cause.code
        : "project-workbench-projection-failed", {
        completedAt,
      });
    }
    const result = boundedJson(
      projection?.domainResult ?? invoked.result ?? invoked,
      MAX_OPERATION_RESULT_BYTES,
    );
    if (!result) {
      return fail("project-workbench-operation-result-too-large", {
        completedAt,
      });
    }
    const sourceVectorAfter = projection?.sourceVector || workbench.sourceVector;
    if (!sourceVectorOwnedByAdapter(sourceVectorAfter, adapter)) {
      return fail("project-workbench-source-authority-mismatch", {
        completedAt,
        sourceVectorAfter,
        resultDigest: result.digest,
        resultBytes: result.bytes,
      });
    }
    let representation = null;
    if (projection?.representation) {
      const validated = validateDevelopmentRepresentation(
        projection.representation,
        adapter,
      );
      if (!validated.ok) {
        return fail("project-workbench-representation-rejected", {
          completedAt,
          sourceVectorAfter,
          resultDigest: result.digest,
          resultBytes: result.bytes,
        });
      }
      representation = validated.value;
      if (representation.workbenchId !== workbench.workbenchId
          || !sameSourceIdentity(representation.sourceVector, sourceVectorAfter)) {
        return fail("project-workbench-representation-binding-mismatch", {
          completedAt,
          sourceVectorAfter,
          resultDigest: result.digest,
          resultBytes: result.bytes,
        });
      }
      const boundedRepresentation = boundedJson(
        representation,
        MAX_OPERATION_RESULT_BYTES,
      );
      if (!boundedRepresentation) {
        return fail("project-workbench-representation-too-large", {
          completedAt,
          sourceVectorAfter,
          resultDigest: result.digest,
          resultBytes: result.bytes,
        });
      }
      representation = boundedRepresentation.value;
    }

    if (!sameSourceIdentity(workbench.sourceVector, sourceVectorAfter)) {
      workbench.state = "stale";
      workbench.updatedAt = completedAt;
      markCurrentRepresentationStale(state, workbench);
      if (representation) representation.freshness = "stale";
      const receipt = {
        schema: "mousecat.project-operation-receipt/1",
        receiptId,
        workbenchId: workbench.workbenchId,
        adapterRef: adapter.adapterId,
        operationId,
        effect: operation.effect,
        inputDigest: input.digest,
        inputBytes: input.bytes,
        startedAt,
        completedAt,
        outcome: "stale",
        code: "project-source-changed",
        sourceVectorBefore: clone(workbench.sourceVector),
        sourceVectorAfter: clone(sourceVectorAfter),
        resultSchemaRef: operation.outputSchemaRef,
        resultDigest: result.digest,
        resultBytes: result.bytes,
      };
      rememberReceipt(state, workbench, receipt);
      emit("project-workbench.stale", {
        workbenchId: workbench.workbenchId,
        operationId,
        receiptId,
      });
      return {
        schema: "mousecat.project-workbench.operation/1",
        ok: false,
        code: "project-workbench-source-stale",
        workbench: publicWorkbench(workbench),
        receipt: publicReceipt(receipt),
      };
    }

    const receipt = {
      schema: "mousecat.project-operation-receipt/1",
      receiptId,
      workbenchId: workbench.workbenchId,
      adapterRef: adapter.adapterId,
      operationId,
      effect: operation.effect,
      inputDigest: input.digest,
      inputBytes: input.bytes,
      startedAt,
      completedAt,
      outcome: "succeeded",
      code: "project-operation-succeeded",
      sourceVectorBefore: clone(workbench.sourceVector),
      sourceVectorAfter: clone(sourceVectorAfter),
      resultSchemaRef: operation.outputSchemaRef,
      resultDigest: result.digest,
      resultBytes: result.bytes,
      representationRef: representation?.representationId || null,
    };
    rememberReceipt(state, workbench, receipt);
    if (representation) {
      state.projectRepresentations.set(
        representation.representationId,
        representation,
      );
      workbench.currentRepresentationRef = representation.representationId;
      workbench.subjectRefs = [...new Set([
        ...workbench.subjectRefs,
        ...representation.subjectRefs,
      ])];
      if (operation.effect === "draft" && representation.selectedDraftRef) {
        workbench.draftRefs = [...new Set([
          ...workbench.draftRefs,
          representation.selectedDraftRef,
        ])];
      }
    }
    workbench.updatedAt = completedAt;
    emit("project-workbench.operation-succeeded", {
      workbenchId: workbench.workbenchId,
      adapterRef: adapter.adapterId,
      operationId,
      receiptId,
      representationRef: representation?.representationId || null,
    });
    return {
      schema: "mousecat.project-workbench.operation/1",
      ok: true,
      workbench: publicWorkbench(workbench),
      receipt: publicReceipt(receipt),
      representation: representation ? clone(representation) : null,
      result: clone(result.value),
    };
    } finally {
      activeOperations.delete(workbench.workbenchId);
    }
  }

  function close(args = {}) {
    const required = requireWorkbench(state, args);
    if (required.error) return required.error;
    const workbench = required.workbench;
    if (activeOperations.has(workbench.workbenchId)) {
      return error("project-workbench-operation-active", {
        workbenchId: workbench.workbenchId,
      });
    }
    workbench.state = "closed";
    workbench.updatedAt = now();
    emit("project-workbench.closed", {
      workbenchId: workbench.workbenchId,
      adapterRef: workbench.adapterRef,
    });
    return {
      schema: "mousecat.project-workbench.closed/1",
      ok: true,
      workbench: publicWorkbench(workbench),
    };
  }

  async function handle(args = {}, context = {}) {
    const action = args.action || "snapshot";
    if (action === "open") return open(args);
    if (action === "snapshot") return snapshot(args);
    if (action === "operate") return operate(args, context);
    if (action === "close") return close(args);
    return error("project-workbench-action-unknown", { action });
  }

  return Object.freeze({
    handle,
    open,
    snapshot,
    operate,
    close,
  });
}

export { PROJECT_WORKBENCH_SCHEMAS };
