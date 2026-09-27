import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_STATE_PATH = ".mousecat/state.json";
const STATE_SCHEMA = "mousecat.local-state/1";
const REDACTED = "[sensitive-redacted]";
const SECRET_KEY_RE = /(secret|token|password|cookie|privatekey|api[_-]?key)/iu;

function normalizeStateConfig(config = {}) {
  const state = config.state || {};
  return {
    enabled: state.enabled === true,
    path: state.path || DEFAULT_STATE_PATH,
    maxEvents: Number.isInteger(state.maxEvents) ? Math.max(0, state.maxEvents) : 500,
    maxRoutePlans: Number.isInteger(state.maxRoutePlans) ? Math.max(0, state.maxRoutePlans) : 100,
  };
}

function tail(records = [], max) {
  if (max === 0) return [];
  return records.slice(-max);
}

function scrubSecrets(value) {
  if (Array.isArray(value)) return value.map((item) => scrubSecrets(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_RE.test(key) ? REDACTED : scrubSecrets(entry),
    ]),
  );
}

function redactSensitiveItem(item) {
  if (!item || typeof item !== "object") return item;
  const scrubbed = scrubSecrets(item);
  if (scrubbed.sensitive !== true) return scrubbed;
  const safeFields = [
    "id",
    "shape",
    "required",
    "sensitive",
    "status",
    "sessionId",
    "interactionId",
    "parentInteractionId",
    "createdAt",
    "updatedAt",
    "answeredAt",
    "heldAt",
    "ratifiedAt",
  ];
  const persisted = Object.fromEntries(
    safeFields.filter((key) => Object.hasOwn(scrubbed, key)).map((key) => [key, scrubbed[key]]),
  );
  return {
    ...persisted,
    prompt: REDACTED,
    title: scrubbed.title ? REDACTED : null,
    options: [],
    buttons: [],
    recommendedDefault: null,
    metadata: {},
    skillRef: null,
    response: scrubbed.response ? {
      itemId: scrubbed.response.itemId || scrubbed.id || null,
      shape: scrubbed.response.shape || scrubbed.shape || null,
      status: scrubbed.response.status || scrubbed.status || null,
      value: null,
      selectedOption: null,
      selectedOptions: null,
      ranking: null,
      checklist: null,
      notes: REDACTED,
      redacted: true,
    } : undefined,
    answer: scrubbed.answer ? { redacted: true } : undefined,
    holdReason: scrubbed.holdReason ? REDACTED : null,
  };
}

function redactInteraction(interaction) {
  const scrubbed = scrubSecrets(interaction);
  const items = Array.isArray(scrubbed.items) ? scrubbed.items.map(redactSensitiveItem) : [];
  if (!items.some((item) => item?.sensitive === true)) {
    return { ...scrubbed, items };
  }
  const safeFields = [
    "id",
    "interactionId",
    "sessionId",
    "parentInteractionId",
    "status",
    "constraints",
    "createdAt",
    "updatedAt",
  ];
  const persisted = Object.fromEntries(
    safeFields.filter((key) => Object.hasOwn(scrubbed, key)).map((key) => [key, scrubbed[key]]),
  );
  return {
    ...persisted,
    source: REDACTED,
    title: scrubbed.title ? REDACTED : null,
    skillRef: null,
    items,
  };
}

function redactQueueItem(item) {
  return redactSensitiveItem(item);
}

function redactDelegation(record) {
  const scrubbed = scrubSecrets(record);
  const safeFields = [
    "id",
    "delegationId",
    "source",
    "origin",
    "target",
    "status",
    "upstreamOutcome",
    "fingerprint",
    "timeoutMs",
    "attempts",
    "activeAttempt",
    "sensitive",
    "continuationHash",
    "resultAvailable",
    "failure",
    "cancellation",
    "rejoin",
    "reason",
    "createdAt",
    "startedAt",
    "completedAt",
    "updatedAt",
  ];
  const persisted = Object.fromEntries(
    safeFields.filter((key) => Object.hasOwn(scrubbed, key)).map((key) => [key, scrubbed[key]]),
  );
  if (scrubbed.sensitive !== true) return persisted;
  return {
    ...persisted,
    source: REDACTED,
    origin: {
      interactionId: scrubbed.origin?.interactionId || null,
      itemId: scrubbed.origin?.itemId || null,
    },
    target: null,
  };
}

function serializableState(state, config) {
  return {
    schema: STATE_SCHEMA,
    savedAt: new Date().toISOString(),
    policy: {
      storage: "local-json",
      ignoredPath: ".mousecat/",
      credentialValuesStored: false,
      sensitiveItemsRedacted: true,
      routePlansCached: true,
      delegationPayloadsStored: false,
      delegationResultsStored: false,
      frameworkDescriptorsStored: true,
      projectAdapterDescriptorsStored: true,
      projectWorkbenchCapabilitiesStoredAsHashes: true,
      projectWorkbenchWriteEffects: "closed",
    },
    runtime: {
      startedAt: state.startedAt,
    },
    sessions: [...state.sessions.values()].map((session) => scrubSecrets(session)),
    interactions: [...state.interactions.values()].map(redactInteraction),
    archivedInteractions: [...(state.archivedInteractions || new Map()).values()].map(redactInteraction),
    delegations: [...(state.delegations || new Map()).values()].map(redactDelegation),
    queue: state.queue.map(redactQueueItem),
    events: tail(state.events, config.maxEvents).map((event) => scrubSecrets(event)),
    historyRecords: [...(state.historyRecords || new Map()).entries()],
    historyCoverage: [...(state.historyCoverage || new Map()).entries()],
    routePlans: tail(state.routePlans || [], config.maxRoutePlans).map((routePlan) => scrubSecrets(routePlan)),
    credentialRefs: state.credentialRefs.map((ref) => scrubSecrets(ref)),
    customSkills: [...(state.customSkills || new Map()).values()].map((skill) => scrubSecrets(skill)),
    customFrameworks: [...(state.customFrameworks || new Map()).values()].map((framework) => scrubSecrets(framework)),
    skillResults: [...(state.skillResults || new Map()).values()].map((result) => scrubSecrets(result)),
    registryNamespaces: [...(state.registryNamespaces || new Map()).entries()].map(([id, capabilityHash]) => ({ id, capabilityHash })),
    customProjectAdapters: [...(state.customProjectAdapters || new Map()).values()].map((adapter) => scrubSecrets(adapter)),
    projectSurfaces: [...(state.projectSurfaces || new Map()).values()].map((surface) => scrubSecrets(surface)),
    projectGroups: [...(state.projectGroups || new Map()).values()].map((group) => scrubSecrets(group)),
    projectWorkbenches: [...(state.projectWorkbenches || new Map()).values()].map((workbench) => scrubSecrets(workbench)),
    projectRepresentations: [...(state.projectRepresentations || new Map()).values()].map((representation) => scrubSecrets(representation)),
    projectOperationReceipts: [...(state.projectOperationReceipts || new Map()).values()].map((receipt) => scrubSecrets(receipt)),
  };
}

function mapFromRecords(records = [], key = "id") {
  return new Map(
    records
      .filter((record) => record && typeof record === "object" && record[key])
      .map((record) => [record[key], record]),
  );
}

function reviveState(record) {
  if (!record || typeof record !== "object" || record.schema !== STATE_SCHEMA) return null;
  const delegations = mapFromRecords(record.delegations, "delegationId");
  for (const delegation of delegations.values()) {
    delegation.resultAvailable = false;
    if (delegation.rejoin?.interactionId) continue;
    if (delegation.status === "running") {
      delegation.status = "interrupted";
      delegation.reason = "runtime-restarted";
      delegation.upstreamOutcome = "unknown";
    } else if (delegation.status === "completed") {
      delegation.status = "interrupted";
      delegation.reason = "delegation-result-not-persisted";
      delegation.upstreamOutcome = "succeeded";
    }
  }
  return {
    sessions: mapFromRecords(record.sessions, "id"),
    interactions: mapFromRecords(record.interactions, "interactionId"),
    archivedInteractions: mapFromRecords(record.archivedInteractions, "interactionId"),
    delegations,
    queue: Array.isArray(record.queue) ? record.queue : [],
    events: Array.isArray(record.events) ? record.events : [],
    historyRecords: new Map(record.historyRecords || []),
    historyCoverage: new Map(record.historyCoverage || []),
    routePlans: Array.isArray(record.routePlans) ? record.routePlans : [],
    credentialRefs: Array.isArray(record.credentialRefs) ? record.credentialRefs : [],
    customSkills: mapFromRecords(record.customSkills, "id"),
    customFrameworks: mapFromRecords(record.customFrameworks, "id"),
    skillResults: mapFromRecords(record.skillResults, "id"),
    registryNamespaces: new Map((record.registryNamespaces || []).map((entry) => [entry.id, entry.capabilityHash])),
    customProjectAdapters: mapFromRecords(record.customProjectAdapters, "adapterId"),
    projectSurfaces: mapFromRecords(record.projectSurfaces, "surfaceId"),
    projectGroups: mapFromRecords(record.projectGroups, "groupId"),
    projectWorkbenches: mapFromRecords(record.projectWorkbenches, "workbenchId"),
    projectRepresentations: mapFromRecords(record.projectRepresentations, "representationId"),
    projectOperationReceipts: mapFromRecords(record.projectOperationReceipts, "receiptId"),
  };
}

export function createLocalStateStore(config = {}) {
  const stateConfig = normalizeStateConfig(config);
  let loaded = false;
  let loadErrorCode = null;
  let saveErrorCode = null;

  function summary() {
    return {
      enabled: stateConfig.enabled,
      storage: stateConfig.enabled ? "local-json" : "memory",
      pathConfigured: Boolean(stateConfig.path),
      maxEvents: stateConfig.maxEvents,
      maxRoutePlans: stateConfig.maxRoutePlans,
      loaded,
      loadErrorCode,
      saveErrorCode,
      credentialValuesStored: false,
      sensitiveItemsRedacted: true,
      routePlansCached: true,
      delegationPayloadsStored: false,
      delegationResultsStored: false,
      frameworkDescriptorsStored: true,
      projectAdapterDescriptorsStored: true,
      projectWorkbenchCapabilitiesStoredAsHashes: true,
      projectWorkbenchWriteEffects: "closed",
    };
  }

  function load() {
    if (!stateConfig.enabled) return null;
    if (!existsSync(stateConfig.path)) return null;
    try {
      const restored = reviveState(JSON.parse(readFileSync(stateConfig.path, "utf8").replace(/^\uFEFF/u, "")));
      loaded = Boolean(restored);
      return restored;
    } catch (error) {
      loadErrorCode = error.code || "state-load-failed";
      return null;
    }
  }

  function save(state) {
    if (!stateConfig.enabled || loadErrorCode) return false;
    try {
      mkdirSync(dirname(stateConfig.path), { recursive: true });
      const tmpPath = `${stateConfig.path}.${process.pid}.tmp`;
      writeFileSync(tmpPath, `${JSON.stringify(serializableState(state, stateConfig), null, 2)}\n`, "utf8");
      renameSync(tmpPath, stateConfig.path);
      saveErrorCode = null;
      return true;
    } catch (error) {
      saveErrorCode = error.code || "state-save-failed";
      return false;
    }
  }

  return {
    enabled: stateConfig.enabled,
    path: stateConfig.path,
    summary,
    load,
    save,
  };
}
