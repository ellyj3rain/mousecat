import { readDevelopmentGraph } from "./development-graph.mjs";
import { createBulletinController } from "./bulletin.mjs";
import { randomUUID } from "node:crypto";

import {
  ATOMIC_SKILLS,
  INTERACTION_SHAPES,
  NAMED_SKILLS,
  OPERATOR_WIDGET_CONTRACT,
  SKILL_FRAMEWORKS,
  TOOL_BOUNDARIES,
  UPSTREAMS,
  WORK_PERMIT_PROFILES,
  adapterProfiles,
  adapterRenderPacket,
  adapterRenderPackets,
  catalogSnapshot,
  getPermitProfile,
  getUpstream,
  hostStateAdapter,
  skillButtons,
  widgetControls,
} from "./catalog.mjs";
import { readMousecatBridgeContract } from "./bridge-contracts.mjs";
import { defaultConfig } from "./config.mjs";
import {
  connectorSummaries,
  discoverConnectorTools,
  invokeConnectorTool,
  routeConnectorPlan,
} from "./connectors.mjs";
import { sourceIntegrationAdapterRegistry } from "./integration-adapters.mjs";
import {
  compileDelegationStart,
  delegationEnvelope,
  publicDelegationSummary,
} from "./delegation.mjs";
import { createLocalStateStore } from "./local-state.mjs";
import { createHistoryController } from "./history.mjs";
import { normalizeMlReview } from "./ml-review.mjs";
import {
  compatibleFramework,
  registerFrameworkDescriptors,
  registrySnapshot,
  resolveRegisteredSkill,
} from "./framework-registry.mjs";
import {
  compileSkillInvocation,
  continuationTokenHash,
  skillInvocationEnvelope,
} from "./skill-invocation.mjs";
import {
  createProjectWorkbenchController,
  projectAdapterRegistrySnapshot,
  registerProjectAdapterDescriptor,
} from "./project-workbench-runtime.mjs";
import {
  PROJECT_SURFACE_CONTRACT,
  discoverProjectSurfaceDrafts,
  generateProjectSurfaceDraft,
  readProjectSurfacePage,
  summarizeProjectDataSource,
  validateProjectSurfaceDescriptor,
  validateProjectGroupDescriptor,
} from "./project-surfaces.mjs";

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const DEFINITIVE_PRE_DISPATCH_FAILURES = new Set([
  "connector-command-missing",
  "connector-http-unavailable",
  "connector-url-missing",
  "unsupported-connector-transport",
]);

function nextId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function credentialValueLooksSecret(args) {
  return ["value", "secret", "token", "password", "cookie", "privateKey", "apiKey"].some((key) => args[key]);
}

function connectorBoundaryFields(result) {
  const fields = {};
  if (result?.restartRequired === true) fields.restartRequired = true;
  if (result?.staleCode) fields.staleCode = result.staleCode;
  if (result?.upstreamMessage) fields.upstreamMessage = result.upstreamMessage;
  return fields;
}

const PUBLIC_REDACTED = "[sensitive-redacted]";
const SECRET_KEY_RE = /(secret|token|password|cookie|privatekey|api[_-]?key)/iu;

function scrubPublicState(value) {
  if (Array.isArray(value)) return value.map((item) => scrubPublicState(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_RE.test(key) ? PUBLIC_REDACTED : scrubPublicState(entry),
    ]),
  );
}

function redactPublicItem(item) {
  if (!item || typeof item !== "object") return item;
  const scrubbed = scrubPublicState(item);
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
  const publicItem = Object.fromEntries(
    safeFields.filter((key) => Object.hasOwn(scrubbed, key)).map((key) => [key, scrubbed[key]]),
  );
  return {
    ...publicItem,
    prompt: PUBLIC_REDACTED,
    title: scrubbed.title ? PUBLIC_REDACTED : null,
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
      notes: PUBLIC_REDACTED,
      redacted: true,
    } : undefined,
    answer: scrubbed.answer ? { redacted: true } : undefined,
    holdReason: scrubbed.holdReason ? PUBLIC_REDACTED : null,
  };
}

function publicInteraction(interaction) {
  const scrubbed = scrubPublicState(interaction);
  if (scrubbed.invocation && typeof scrubbed.invocation === "object") {
    const { continuationHash: _continuationHash, ...publicInvocation } = scrubbed.invocation;
    scrubbed.invocation = publicInvocation;
  }
  const items = Array.isArray(scrubbed.items) ? scrubbed.items.map(redactPublicItem) : [];
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
  const publicRecord = Object.fromEntries(
    safeFields.filter((key) => Object.hasOwn(scrubbed, key)).map((key) => [key, scrubbed[key]]),
  );
  return {
    ...publicRecord,
    source: PUBLIC_REDACTED,
    title: scrubbed.title ? PUBLIC_REDACTED : null,
    skillRef: null,
    items,
  };
}

function publicQueueItem(item) {
  return redactPublicItem(item);
}

function optionButtons(options = []) {
  return options.map((option, index) => ({
    id: `option-${index + 1}`,
    label: option.label || String(option.value || `Option ${index + 1}`),
    value: option.value ?? option.label ?? index + 1,
    recommended: index === 0 && /recommended/i.test(option.label || ""),
    description: option.description || null,
  }));
}

const LEGACY_SHAPE_MAP = Object.freeze({
  point: "decision",
  architecture: "decision",
  tree: "queue",
  batch: "queue",
});

function normalizeShape(shape = "decision") {
  const mapped = LEGACY_SHAPE_MAP[shape] || shape;
  return INTERACTION_SHAPES.includes(mapped) ? mapped : "decision";
}

function publicConstraintSummary(constraints = {}) {
  return {
    maxItems: Number.isInteger(constraints.maxItems) ? constraints.maxItems : null,
    recommendationFirst: constraints.recommendationFirst === true,
    allowFreeform: constraints.allowFreeform === true,
  };
}

function normalizeInteractionItem(raw = {}, fallback = {}) {
  const prompt = String(raw.prompt || raw.question || fallback.prompt || "Decision required");
  const options = Array.isArray(raw.options) ? raw.options : Array.isArray(fallback.options) ? fallback.options : [];
  const mlReview = normalizeMlReview(raw.mlReview ?? fallback.mlReview);
  if (!mlReview.ok) return { schema: "mousecat.error/1", ...mlReview };
  return {
    id: String(raw.id || fallback.id || "item-1"),
    shape: normalizeShape(raw.shape || fallback.shape),
    prompt,
    title: raw.title || raw.header || null,
    options,
    buttons: optionButtons(options),
    required: raw.required !== false,
    sensitive: raw.sensitive === true,
    status: "open",
    recommendedDefault: raw.recommendedDefault || null,
    selectionMode: raw.selectionMode === "multiple" || raw.multiple === true || fallback.selectionMode === "multiple" ? "multiple" : "single",
    allowFreeform: raw.allowFreeform === undefined ? fallback.allowFreeform !== false : raw.allowFreeform !== false,
    description: raw.description || null,
    mlReview: mlReview.value,
    metadata: raw.metadata && typeof raw.metadata === "object" ? clone(raw.metadata) : {},
  };
}

function summarizeInteraction(interaction) {
  const publicRecord = publicInteraction(interaction);
  return {
    interactionId: publicRecord.interactionId,
    sessionId: publicRecord.sessionId,
    source: publicRecord.source,
    status: publicRecord.status,
    itemCount: publicRecord.items.length,
    shapes: [...new Set(publicRecord.items.map((item) => item.shape))],
    parentInteractionId: publicRecord.parentInteractionId,
  };
}

function eventCategory(type) {
  if (type.startsWith("interaction.")) return "interaction";
  if (type.startsWith("queue.")) return "queue";
  if (type.startsWith("connector.")) return "connector";
  if (type.startsWith("invoke.")) return "invoke";
  if (type.startsWith("delegation.")) return "delegation";
  if (type.startsWith("route.")) return "route";
  if (type.startsWith("credentials.")) return "credentials";
  if (type.startsWith("session.")) return "session";
  if (type.startsWith("host-state.")) return "host-state";
  return "runtime";
}

function publicEvent(event) {
  return {
    id: event.id,
    type: event.type,
    category: eventCategory(event.type),
    at: event.at,
    data: scrubPublicState(event.data || {}),
  };
}

function visualizerEvent(event) {
  const category = eventCategory(event.type);
  const data = scrubPublicState(event.data || {});
  return {
    schema: "mousecat.visualizer.event/1",
    eventId: event.id,
    at: event.at,
    lane: category,
    actor: data.source || data.upstream || data.sessionId || "mousecat",
    verb: event.type.split(".").slice(1).join(".") || event.type,
    subject: data.interactionId || data.itemId || data.capability || data.resourceName || data.reason || category,
    status: data.status || data.reason || "observed",
    intensity: category === "invoke" || category === "connector" ? 0.8 : category === "interaction" || category === "queue" ? 0.6 : 0.35,
    data,
  };
}

function responsePayloadFor(item, response = {}) {
  return {
    itemId: item.id,
    shape: item.shape,
    status: item.status,
    value: response.value ?? response.answer ?? null,
    selectedOption: response.selectedOption ?? response.option ?? null,
    selectedOptions: Array.isArray(response.selectedOptions) ? response.selectedOptions : null,
    ranking: Array.isArray(response.ranking) ? response.ranking : null,
    checklist: Array.isArray(response.checklist) ? response.checklist : null,
    notes: response.notes || response.reason || null,
  };
}

function optionKey(value) {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function optionResponseValues(response = {}) {
  const values = [];
  const selectedOption = response.selectedOption ?? response.option;
  if (selectedOption !== null && selectedOption !== undefined) values.push(selectedOption);
  if (Array.isArray(response.selectedOptions)) values.push(...response.selectedOptions);
  for (const entry of Array.isArray(response.checklist) ? response.checklist : []) {
    values.push(entry && typeof entry === "object" ? entry.value ?? entry.label : entry);
  }
  for (const entry of Array.isArray(response.ranking) ? response.ranking : []) {
    values.push(entry && typeof entry === "object" ? entry.value ?? entry.label : entry);
  }
  return values;
}

function optionIdentity(item, value) {
  const key = optionKey(value);
  const index = (item.options || []).findIndex((option) =>
    optionKey(option?.value) === key || optionKey(option?.label) === key);
  return index < 0 ? key : `option:${index}`;
}

function responseValueReferences(response = {}) {
  const values = Array.isArray(response.value) ? response.value : [response.value];
  return values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => value && typeof value === "object" ? value.value ?? value.label ?? value : value);
}

function responseUsesKnownOptions(item, response) {
  if (!Array.isArray(item.options) || item.options.length === 0) return true;
  const allowed = new Set(item.options.flatMap((option) => [optionKey(option?.value), optionKey(option?.label)]));
  return optionResponseValues(response).every((value) => allowed.has(optionKey(value)));
}

function responseValidationReason(item, response = {}, action = "respond") {
  if (item.prompt === PUBLIC_REDACTED) return "interaction-item-redacted";
  if (!responseUsesKnownOptions(item, response)) return "unknown-interaction-option";
  const selected = [response.selectedOption ?? response.option, ...(Array.isArray(response.selectedOptions) ? response.selectedOptions : [])]
    .filter((value) => value !== null && value !== undefined);
  if (!["checklist", "ranking"].includes(item.shape)
    && item.selectionMode !== "multiple"
    && new Set(selected.map((value) => optionIdentity(item, value))).size > 1) {
    return "multiple-options-not-allowed";
  }
  const hasValue = Array.isArray(response.value)
    ? response.value.length > 0
    : response.value !== null && response.value !== undefined && response.value !== "";
  const hasStructuredValue = optionResponseValues(response).length > 0
    || (typeof (response.notes ?? response.reason) === "string" && (response.notes ?? response.reason).trim().length > 0);
  if (!["hold", "defer"].includes(action) && item.required !== false && !hasValue && !hasStructuredValue) return "interaction-response-required";
  if (!["hold", "defer"].includes(action) && item.allowFreeform === false && Array.isArray(item.options) && item.options.length > 0) {
    const allowed = new Set(item.options.flatMap((option) => [optionKey(option?.value), optionKey(option?.label)]));
    const hasFreeformNotes = typeof (response.notes ?? response.reason) === "string" && (response.notes ?? response.reason).trim().length > 0;
    if (hasFreeformNotes || responseValueReferences(response).some((value) => !allowed.has(optionKey(value)))) {
      return "interaction-freeform-not-allowed";
    }
  }
  return null;
}

function interactionEntries(value) {
  if (!value) return [];
  if (value instanceof Map) return [...value.entries()];
  if (Array.isArray(value)) {
    return value
      .filter((record) => record && record.interactionId)
      .map((record) => [record.interactionId, record]);
  }
  return Object.entries(value);
}

export function createMousecatRuntime(options = {}) {
  const config = options.config || defaultConfig();
  const integrationRegistry = options.integrationRegistry || sourceIntegrationAdapterRegistry();
  function resolveProjectConnectorCapability(connectorRef, capabilityId) {
    const manifest = integrationRegistry.manifests().adapters.find(
      (candidate) => candidate.upstream === connectorRef,
    );
    const capability = manifest?.capabilities.find(
      (candidate) => candidate.id === capabilityId,
    );
    if (!manifest || !capability) return null;
    return {
      adapterRef: manifest.id,
      upstream: manifest.upstream,
      capabilityId: capability.id,
      access: capability.access,
      provenance: { ...manifest.provenance },
    };
  }
  const connectorOptions = { integrationRegistry };
  const defaultConnectorInvoker = (runtimeConfig, upstream, capability, payload, invokeOptions = {}) => (
    invokeConnectorTool(runtimeConfig, upstream, capability, payload, {
      ...invokeOptions,
      integrationRegistry,
      commandRunner: options.integrationCommandRunner,
    })
  );
  const connectorInvoker = options.connectorInvoker || defaultConnectorInvoker;
  const projectConnectorInvoker = options.projectConnectorInvoker
    || (({ connectorAuthority, input }) => invokeConnectorTool(
      config,
      connectorAuthority.upstream,
      connectorAuthority.capabilityId,
      input,
      {
        integrationRegistry,
        commandRunner: options.integrationCommandRunner,
      },
    ));
  const stateStore = createLocalStateStore(config);
  const state = {
    startedAt: nowIso(),
    sessions: new Map(),
    interactions: new Map(),
    archivedInteractions: new Map(),
    delegations: new Map(),
    queue: [],
    events: [],
    routePlans: [],
    credentialRefs: [],
    customSkills: new Map(),
    customFrameworks: new Map(),
    skillResults: new Map(),
    registryNamespaces: new Map(),
    customProjectAdapters: new Map(),
    projectSurfaces: new Map(),
    projectGroups: new Map(),
    projectWorkbenches: new Map(),
    projectRepresentations: new Map(),
    projectOperationReceipts: new Map(),
    bulletin: new Map(),
  };
  const interactionWaiters = new Map();
  const delegationWaiters = new Map();
  const delegationVault = new Map();
  const runningDelegations = new Map();

  function resolveUpstream(id) {
    const connector = config.connectors?.[id] || config.upstreams?.[id]?.connector;
    const sourceUpstream = getUpstream(id);
    const integrationManifest = integrationRegistry.manifests().adapters.find((adapter) => adapter.upstream === id) || null;
    if (integrationManifest || connector?.kind === "integration-adapter" || sourceUpstream?.adapter === "integration-adapter") {
      if (!integrationManifest) return null;
      const adapter = integrationRegistry.get(integrationManifest.id);
      if (!adapter) return null;
      return {
        id,
        label: adapter.label,
        kind: "integration",
        adapter: "integration-adapter",
        defaultEnabled: false,
        capabilities: adapter.capabilities.map((capability) => capability.id),
        policy: "tool-invocation permit; host-managed authentication; explicit confirmation for consequential writes",
      };
    }
    return sourceUpstream;
  }

  function runtimeUpstreams() {
    const ids = new Set([
      ...UPSTREAMS.map((upstream) => upstream.id),
      ...Object.keys(config.upstreams || {}),
      ...Object.keys(config.connectors || {}),
    ]);
    return [...ids].map(resolveUpstream).filter(Boolean);
  }
  const restored = options.state || stateStore.load();
  if (restored) {
    state.sessions = restored.sessions || state.sessions;
    state.archivedInteractions = new Map([
      ...interactionEntries(restored.archivedInteractions),
      ...interactionEntries(restored.interactions),
    ]);
    for (const [interactionId, interaction] of state.archivedInteractions) {
      const answerable = ["open", "deferred"].includes(interaction.status)
        && interaction.items?.some((item) => ["open", "deferred"].includes(item.status)
          && item.sensitive !== true && item.prompt !== PUBLIC_REDACTED);
      if (answerable) {
        state.interactions.set(interactionId, interaction);
        state.archivedInteractions.delete(interactionId);
      }
    }
    state.delegations = restored.delegations || state.delegations;
    state.queue = restored.queue || state.queue;
    state.events = restored.events || state.events;
    state.routePlans = restored.routePlans || state.routePlans;
    state.credentialRefs = restored.credentialRefs || state.credentialRefs;
    state.customSkills = restored.customSkills || state.customSkills;
    state.customFrameworks = restored.customFrameworks || state.customFrameworks;
    state.skillResults = restored.skillResults || state.skillResults;
    state.registryNamespaces = restored.registryNamespaces || state.registryNamespaces;
    state.customProjectAdapters = restored.customProjectAdapters || state.customProjectAdapters;
    state.projectSurfaces = restored.projectSurfaces || state.projectSurfaces;
    state.projectGroups = restored.projectGroups || state.projectGroups;
    state.projectWorkbenches = restored.projectWorkbenches || state.projectWorkbenches;
    state.projectRepresentations = restored.projectRepresentations || state.projectRepresentations;
    state.projectOperationReceipts = restored.projectOperationReceipts || state.projectOperationReceipts;
    state.bulletin = restored.bulletin || state.bulletin;
    state.bulletinQuarantine = restored.bulletinQuarantine || [];
    state.historyRecords = restored.historyRecords || new Map();
    state.historyCoverage = restored.historyCoverage || new Map();
  }

  const historyController = createHistoryController({ state, publicInteraction, persist: () => stateStore.save(state) });
  historyController.syncInteractions();

  function emit(type, data = {}) {
    const event = {
      id: nextId("evt", state.events.length),
      type,
      at: nowIso(),
      data,
    };
    state.events.push(event);
    historyController.syncInteractions();
    stateStore.save(state);
    return event;
  }

  function isUpstreamEnabled(id) {
    const setting = config.upstreams?.[id];
    if (setting && typeof setting.enabled === "boolean") return setting.enabled;
    return resolveUpstream(id)?.defaultEnabled !== false;
  }

  function permitAllows(permit, toolName, action = null) {
    const profileId = permit?.profileId || permit?.id;
    const profile = getPermitProfile(profileId);
    if (!profile) return { allowed: false, reason: "missing-or-unknown-permit", profile: null };
    const candidates = action ? [toolName, `${toolName}:${action}`] : [toolName];
    const allowed = candidates.some((candidate) => profile.grants.includes(candidate));
    return {
      allowed,
      reason: allowed ? "permit-grants-tool" : "permit-does-not-grant-tool",
      profile,
    };
  }

  const projectWorkbenchController = createProjectWorkbenchController({
    state,
    emit,
    invokeConnector: projectConnectorInvoker,
    resolveConnectorCapability: resolveProjectConnectorCapability,
    permitAllows,
    now: nowIso,
  });
  const bulletinController = createBulletinController({ state, permitAllows, persist: () => !stateStore.enabled || stateStore.save(state) });

  function routePlanLimit() {
    const max = config.state?.maxRoutePlans;
    return Number.isInteger(max) ? Math.max(0, max) : 100;
  }

  function rememberRoutePlan(plan) {
    const limit = routePlanLimit();
    if (limit === 0) return null;
    const record = {
      id: nextId("route", state.events.length + state.routePlans.length),
      plannedAt: nowIso(),
      plan: clone(plan),
    };
    state.routePlans.push(record);
    if (state.routePlans.length > limit) {
      state.routePlans.splice(0, state.routePlans.length - limit);
    }
    return record;
  }

  function status() {
    const registry = registrySnapshot(state);
    return {
      schema: "mousecat.status/1",
      ok: true,
      startedAt: state.startedAt,
      config: {
        hostProfile: config.hostProfile,
        adapterProfile: config.adapterProfile || "generic-mcp",
        credentialsPolicy: config.credentials?.policy || "references-only",
      },
      counts: {
        tools: TOOL_BOUNDARIES.length,
        atomicSkills: ATOMIC_SKILLS.length,
        namedSkills: registry.skills.length,
        skillFrameworks: registry.frameworks.length,
        adapterProfiles: adapterProfiles().length,
        workPermitProfiles: WORK_PERMIT_PROFILES.length,
        sessions: state.sessions.size,
        interactions: state.interactions.size,
        archivedInteractions: state.archivedInteractions.size,
        delegations: state.delegations.size,
        queueItems: state.queue.length,
        credentialRefs: state.credentialRefs.length,
        events: state.events.length,
        routePlans: state.routePlans.length,
        projectAdapters: projectAdapterRegistrySnapshot(state).adapters.length,
        projectSurfaces: state.projectSurfaces.size,
        projectGroups: state.projectGroups.size,
        projectWorkbenches: state.projectWorkbenches.size,
        projectRepresentations: state.projectRepresentations.size,
      },
      connectors: connectorSummaries(config, connectorOptions),
      upstreams: runtimeUpstreams().map((upstream) => ({
        id: upstream.id,
        label: upstream.label,
        kind: upstream.kind,
        enabled: isUpstreamEnabled(upstream.id),
        adapter: upstream.adapter,
        capabilities: [...upstream.capabilities],
      })),
      policy: {
        invokeFailsClosed: true,
        credentialValuesStored: false,
        routePlansDoNotInvoke: true,
        delegationPayloadsPersisted: false,
        delegationResultsPersisted: false,
        interruptedDelegationOutcome: "unknown",
        cancellationNotificationAcceptanceIsAcknowledgement: false,
        cancellationAcknowledgement: "negotiated-mousecat-cancellation-status",
        projectWorkbenchWriteEffects: "closed",
      },
      state: {
        persistence: stateStore.summary(),
      },
    };
  }

  function widgetAvailability() {
    return {
      schema: "mousecat.widget.availability/1",
      available: true,
      status: "available",
      contract: OPERATOR_WIDGET_CONTRACT,
      limits: {
        maxItems: null,
        maxOptionsPerItem: null,
        maxQueueItems: 200,
        supportsLongChains: true,
      },
      presentation: {
        mousecatOwned: true,
        hostOwned: false,
        adapterProfile: config.adapterProfile || "generic-mcp",
        controls: widgetControls(),
        eventStream: "mousecat.visualize(stream=events)",
        adapterProfiles: adapterProfiles().map((profile) => ({
          id: profile.id,
          label: profile.label,
          primarySurface: profile.primarySurface,
        })),
      },
    };
  }

  function interactionResult(interaction) {
    if (!interaction) {
      return {
        schema: "mousecat.operator-widget.result/1",
        interactionId: null,
        status: "unavailable",
        responses: [],
        reason: "unknown-interaction",
      };
    }

    const open = interaction.items.filter((item) => item.status === "open").length;
    const deferred = interaction.items.filter((item) => item.status === "deferred").length;
    const held = interaction.items.filter((item) => item.status === "held").length;
    const answered = interaction.items.filter((item) => item.status === "answered" || item.status === "ratified").length;
    const withdrawn = interaction.items.filter((item) => item.status === "withdrawn").length;
    return {
      schema: "mousecat.operator-widget.result/1",
      interactionId: interaction.interactionId,
      status: open + deferred > 0 ? "pending" : held > 0 ? "held" : answered > 0 ? "answered" : withdrawn > 0 ? "withdrawn" : "answered",
      responses: interaction.items
        .filter((item) => !["open", "deferred", "withdrawn"].includes(item.status))
        .map((item) => clone(item.response || {
          itemId: item.id,
          shape: item.shape,
          status: item.status,
          value: null,
          selectedOption: null,
          selectedOptions: null,
          ranking: null,
          checklist: null,
          notes: item.holdReason || null,
        })),
      progress: {
        total: interaction.items.length,
        resolved: interaction.items.length - open - deferred,
        open,
        deferred,
        held,
        answered,
        withdrawn,
      },
    };
  }

  function unavailableInteraction(interactionId, reason) {
    return {
      schema: "mousecat.operator-widget.result/1",
      interactionId: interactionId || null,
      status: "unavailable",
      responses: [],
      reason,
    };
  }

  function resolveInteractionWaiters(interaction) {
    const result = interactionResult(interaction);
    if (result.status === "pending") return;
    const waiters = interactionWaiters.get(interaction.interactionId);
    if (!waiters) return;
    interactionWaiters.delete(interaction.interactionId);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.cleanup();
      waiter.resolve(clone(result));
    }
  }

  function findInteraction(interactionId) {
    return state.interactions.get(interactionId) || state.archivedInteractions.get(interactionId) || null;
  }

  function waitForInteraction(interactionId, waitMs = 0, signal) {
    const interaction = findInteraction(interactionId);
    if (!interaction) return unavailableInteraction(interactionId, "unknown-interaction");
    const current = interactionResult(interaction);
    if (current.status !== "pending" || !Number.isInteger(waitMs) || waitMs <= 0) return current;
    if (signal?.aborted) return unavailableInteraction(interactionId, "request-cancelled");

    const boundedWaitMs = Math.min(waitMs, 30000);
    return new Promise((resolve) => {
      const waiters = interactionWaiters.get(interactionId) || new Set();
      const removeWaiter = () => {
        waiters.delete(waiter);
        if (waiters.size === 0) interactionWaiters.delete(interactionId);
      };
      const cancel = () => {
        clearTimeout(waiter.timer);
        removeWaiter();
        waiter.cleanup();
        resolve(unavailableInteraction(interactionId, "request-cancelled"));
      };
      const waiter = {
        resolve,
        cleanup: () => signal?.removeEventListener("abort", cancel),
        timer: setTimeout(() => {
          removeWaiter();
          waiter.cleanup();
          resolve(interactionResult(findInteraction(interactionId)));
        }, boundedWaitMs),
      };
      waiters.add(waiter);
      interactionWaiters.set(interactionId, waiters);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }

  function ask(args = {}) {
    const legacyId = nextId("q", state.events.length);
    const source = String(args.source || args.skillRef || "mousecat.ask");
    const sessionId = args.sessionId || null;
    const projectRef = typeof args.projectRef === "string" && args.projectRef.trim()
      ? args.projectRef.trim().slice(0, 512)
      : null;
    if (args.interactionId !== undefined && (typeof args.interactionId !== "string" || !args.interactionId.trim())) {
      return { schema: "mousecat.error/1", ok: false, code: "invalid-interaction-id" };
    }
    const interactionId = args.interactionId || legacyId;
    if (state.interactions.has(interactionId) || state.archivedInteractions.has(interactionId)) {
      return { schema: "mousecat.error/1", ok: false, code: "duplicate-interaction-id", interactionId };
    }
    const rawItems = Array.isArray(args.items) && args.items.length > 0
      ? args.items
      : [{
        id: args.itemId || "item-1",
        prompt: args.prompt,
        shape: args.shape,
        options: args.options,
        recommendedDefault: args.recommendedDefault,
      }];
    if (rawItems.some((item) => item && Object.hasOwn(item, "status"))) {
      return { schema: "mousecat.error/1", ok: false, code: "caller-authored-interaction-status", interactionId };
    }
    const items = rawItems.map((item, index) => normalizeInteractionItem(item, {
      id: `item-${index + 1}`,
      prompt: args.prompt,
      shape: args.shape,
      options: args.options,
      selectionMode: args.selectionMode,
      allowFreeform: args.constraints?.allowFreeform,
    }));
    const invalidItem = items.find((item) => item.schema === "mousecat.error/1");
    if (invalidItem) return { ...invalidItem, interactionId };
    const itemIds = items.map((item) => item.id);
    if (new Set(itemIds).size !== itemIds.length) {
      return { schema: "mousecat.error/1", ok: false, code: "duplicate-interaction-item-id", interactionId };
    }
    const status = items.some((item) => item.status === "open") ? "open" : "answered";
    const interaction = {
      id: legacyId,
      interactionId,
      sessionId,
      projectRef,
      parentInteractionId: args.parentInteractionId || null,
      source,
      title: args.title || null,
      status,
      items,
      constraints: publicConstraintSummary(args.constraints || {}),
      skillRef: args.skillRef || null,
      invocation: args.invocation && typeof args.invocation === "object" ? clone(args.invocation) : null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.interactions.set(interactionId, interaction);

    const question = {
      id: legacyId,
      prompt: items[0]?.prompt || String(args.prompt || ""),
      shape: args.shape || items[0]?.shape || "decision",
      skillRef: interaction.skillRef,
      options: items[0]?.options || [],
      buttons: items[0]?.buttons || [],
      skillButtons: skillButtons().filter((buttonSpec) => !args.skillRef || buttonSpec.skillRef === args.skillRef),
      createdAt: interaction.createdAt,
    };
    emit("interaction.requested", summarizeInteraction(interaction));
    return { schema: "mousecat.interaction/1", interaction, question };
  }

  function widget(args = {}, context = {}) {
    const action = args.action || "available";
    if (action === "available") {
      const availability = widgetAvailability();
      emit("widget.available", { status: availability.status });
      return availability;
    }

    if (action === "ask") {
      const request = args.request && typeof args.request === "object" ? args.request : args;
      const interactionResult = ask(request);
      if (interactionResult.schema === "mousecat.error/1") return interactionResult;
      emit("widget.requested", {
        interactionId: interactionResult.interaction.interactionId,
        source: publicInteraction(interactionResult.interaction).source,
        itemCount: interactionResult.interaction.items.length,
      });
      const requested = {
        schema: "mousecat.operator-widget.request/1",
        available: true,
        contract: OPERATOR_WIDGET_CONTRACT,
        interaction: interactionResult.interaction,
        controls: widgetControls(),
      };
      const waitMs = Number.isInteger(args.waitMs) ? args.waitMs : Number.isInteger(request.waitMs) ? request.waitMs : 0;
      return waitMs > 0
        ? waitForInteraction(interactionResult.interaction.interactionId, waitMs, context.signal)
        : requested;
    }

    if (action === "await") {
      return waitForInteraction(args.interactionId || args.request?.interactionId, args.waitMs || 0, context.signal);
    }

    if (action === "respond" || action === "hold" || action === "defer") {
      const interactionId = args.interactionId || args.request?.interactionId;
      if (typeof interactionId !== "string" || !interactionId.trim()) {
        return unavailableInteraction(interactionId, "invalid-interaction-id");
      }
      const interaction = state.interactions.get(interactionId);
      if (!interaction) {
        return unavailableInteraction(interactionId, "unknown-interaction");
      }
      const rawResponses = Array.isArray(args.responses) && args.responses.length > 0
        ? args.responses
        : [{ ...(args.response || {}), itemId: args.itemId }];
      const responseIds = rawResponses.map((raw) => raw.itemId);
      if (responseIds.some((itemId) => typeof itemId !== "string" || !itemId)) {
        return unavailableInteraction(interactionId, "interaction-item-id-required");
      }
      if (new Set(responseIds).size !== responseIds.length) {
        return unavailableInteraction(interactionId, "duplicate-response-item-id");
      }
      const responseItems = responseIds.map((itemId) => interaction.items.find((candidate) => candidate.id === itemId));
      if (responseItems.some((item) => !item)) {
        return unavailableInteraction(interactionId, "unknown-interaction-item");
      }
      if (responseItems.some((item) => !["open", "deferred"].includes(item.status))) {
        return unavailableInteraction(interactionId, "interaction-item-not-actionable");
      }
      const invalidResponse = rawResponses
        .map((raw, index) => responseValidationReason(responseItems[index], raw, action))
        .find(Boolean);
      if (invalidResponse) return unavailableInteraction(interactionId, invalidResponse);
      const responses = rawResponses.map((raw, index) => {
        const item = responseItems[index];
        item.status = action === "hold" ? "held" : action === "defer" ? "deferred" : "answered";
        item.response = responsePayloadFor(item, raw);
        item.updatedAt = nowIso();
        return item.response;
      }).filter(Boolean);
      const hasPendingItems = interaction.items.some((item) => ["open", "deferred"].includes(item.status));
      const hasHeldItems = interaction.items.some((item) => item.status === "held");
      interaction.status = hasPendingItems ? "open" : hasHeldItems ? "held" : "answered";
      interaction.updatedAt = nowIso();
      emit(action === "hold" ? "widget.held" : action === "defer" ? "widget.deferred" : "widget.answered", {
        interactionId,
        status: interaction.status,
        responseCount: responses.length,
      });
      resolveInteractionWaiters(interaction);
      return interactionResult(interaction);
    }

    if (action === "close") {
      const interactionId = args.interactionId || args.request?.interactionId;
      if (typeof interactionId !== "string" || !interactionId.trim()) {
        return unavailableInteraction(interactionId, "invalid-interaction-id");
      }
      const live = state.interactions.get(interactionId) || null;
      const archived = live ? null : state.archivedInteractions.get(interactionId) || null;
      const interaction = live || archived;
      if (!interaction) {
        return unavailableInteraction(interactionId, "unknown-interaction");
      }
      const requestedIds = Array.isArray(args.itemIds) && args.itemIds.length > 0
        ? [...new Set(args.itemIds.map((itemId) => String(itemId)))]
        : null;
      const targets = requestedIds
        ? requestedIds.map((itemId) => interaction.items.find((item) => item.id === itemId) || null)
        : interaction.items.filter((item) => item.status === "open");
      if (targets.some((item) => !item)) {
        return unavailableInteraction(interactionId, "unknown-interaction-item");
      }
      if (targets.length === 0) {
        return unavailableInteraction(interactionId, "no-open-items");
      }
      if (targets.some((item) => item.status !== "open")) {
        return unavailableInteraction(interactionId, "interaction-item-has-operator-response");
      }
      for (const item of targets) {
        item.status = "withdrawn";
        item.updatedAt = nowIso();
      }
      const hasPendingItems = interaction.items.some((item) => ["open", "deferred"].includes(item.status));
      const hasHeldItems = interaction.items.some((item) => item.status === "held");
      const hasWithdrawnItems = interaction.items.some((item) => item.status === "withdrawn");
      const hasAnsweredItems = interaction.items.some((item) => item.status === "answered" || item.status === "ratified");
      interaction.status = hasPendingItems ? "open" : hasHeldItems ? "held" : hasAnsweredItems ? "answered" : hasWithdrawnItems ? "withdrawn" : "answered";
      interaction.updatedAt = nowIso();
      emit("widget.withdrawn", {
        interactionId,
        status: interaction.status,
        withdrawnCount: targets.length,
        reason: typeof args.reason === "string" && args.reason.trim() ? args.reason : "caller-withdrew",
      });
      resolveInteractionWaiters(interaction);
      return interactionResult(interaction);
    }

    if (action === "snapshot") {
      return {
        schema: "mousecat.widget.snapshot/1",
        availability: widgetAvailability(),
        interactions: [...state.interactions.values()].map(publicInteraction),
        queue: state.queue.map(publicQueueItem),
        controls: widgetControls(),
      };
    }

    return { schema: "mousecat.error/1", ok: false, code: "unknown-widget-action", action };
  }

  function session(args = {}) {
    const action = args.action || "snapshot";
    if (action === "start") {
      const id = args.sessionId || nextId("session", state.sessions.size);
      const record = {
        id,
        startedAt: nowIso(),
        updatedAt: nowIso(),
        status: "active",
        facts: args.facts && typeof args.facts === "object" ? clone(args.facts) : {},
      };
      state.sessions.set(id, record);
      emit("session.started", { sessionId: id });
      return { schema: "mousecat.session/1", action, session: record };
    }

    if (action === "heartbeat") {
      if (!args.sessionId) return { schema: "mousecat.error/1", ok: false, code: "session-id-required" };
      const existing = state.sessions.get(args.sessionId);
      const at = nowIso();
      const record = existing || {
        id: args.sessionId,
        startedAt: at,
        facts: {},
      };
      record.updatedAt = at;
      record.status = "active";
      record.facts = {
        ...record.facts,
        ...(args.facts && typeof args.facts === "object" ? clone(args.facts) : {}),
      };
      state.sessions.set(record.id, record);
      emit("session.heartbeat", { sessionId: record.id, host: record.facts.host || null });
      return { schema: "mousecat.session/1", action, created: !existing, session: clone(record) };
    }

    if (action === "close") {
      if (!args.sessionId) return { schema: "mousecat.error/1", ok: false, code: "session-id-required" };
      const record = state.sessions.get(args.sessionId);
      if (!record) return { schema: "mousecat.error/1", ok: false, code: "unknown-session", sessionId: args.sessionId };
      record.status = "closed";
      record.updatedAt = nowIso();
      record.closedAt = record.updatedAt;
      emit("session.closed", { sessionId: record.id });
      return { schema: "mousecat.session/1", action, session: clone(record) };
    }

    const delegationIsOpen = (delegationRecord) => {
      if (delegationRecord.status !== "completed" || !delegationRecord.rejoin?.interactionId) return true;
      const rejoinInteraction = state.interactions.get(delegationRecord.rejoin.interactionId);
      return !rejoinInteraction || rejoinInteraction.status === "open";
    };
    const snapshot = {
      sessions: [...state.sessions.values()],
      interactions: [...state.interactions.values()].map((interaction) => clone(interaction)),
      delegations: [...state.delegations.values()].map(publicDelegationSummary),
      queue: clone(state.queue),
      openThreads: state.queue.filter((item) => item.status !== "answered" && item.status !== "ratified"),
      openDelegations: [...state.delegations.values()]
        .filter(delegationIsOpen)
        .map(publicDelegationSummary),
      routePlans: clone(state.routePlans),
      recentEvents: state.events.slice(-20).map(publicEvent),
    };

    if (action === "total-recall") {
      const delegationStatuses = Object.fromEntries(
        [...state.delegations.values()].reduce((counts, record) => {
          counts.set(record.status, (counts.get(record.status) || 0) + 1);
          return counts;
        }, new Map()),
      );
      emit("session.total-recall", {
        openThreads: snapshot.openThreads.length,
        openDelegations: snapshot.openDelegations.length,
        delegationStatuses,
      });
      return {
        schema: "mousecat.total-recall/1",
        currentState: status(),
        openThreads: snapshot.openThreads,
        openDelegations: snapshot.openDelegations,
        driftSensitiveFacts: [
          "upstream adapter availability",
          "host credential references",
          "local config enablement",
          "open decision queue",
          "delegation retry, result, cancellation, and rejoin obligations",
        ],
        crucibleQueue: snapshot.openThreads.map((item) => ({
          id: item.id,
          shape: item.shape || "point",
          question: item.prompt,
          recommendedDefault: item.recommendedDefault || null,
          evidence: item.source || "mousecat.queue",
        })),
        interactionChains: snapshot.interactions.map((interaction) => ({
          interactionId: interaction.interactionId,
          sessionId: interaction.sessionId,
          status: interaction.status,
          shapes: interaction.items.map((item) => item.shape),
        })),
        routeCache: {
          count: snapshot.routePlans.length,
          latest: snapshot.routePlans.at(-1) || null,
        },
        nextMove: snapshot.openDelegations.length > 0
          ? "Evaluate the open delegation in framework context before routing the next skill."
          : "Route the reconstructed context to any compatible Recursive Deliberation skill; no fixed next skill is imposed.",
      };
    }

    return { schema: "mousecat.session/1", action: "snapshot", snapshot };
  }

  function finalizeSkillEnvelope(envelope, interaction, resultToken) {
    if (!envelope?.continuation?.framework || !["answered", "held"].includes(envelope.status)) return envelope;
    const resultRef = interaction.interactionId;
    if (!state.skillResults.has(resultRef)) {
      state.skillResults.set(resultRef, {
        id: resultRef,
        skillRef: envelope.skillRef,
        frameworkRefs: [envelope.continuation.framework.frameworkRef],
        status: envelope.status,
        capabilityHash: continuationTokenHash(resultToken),
        createdAt: nowIso(),
      });
      emit("skill.result-observed", { resultRef, skillRef: envelope.skillRef, status: envelope.status });
    }
    envelope.continuation.framework.resultRef = resultRef;
    envelope.continuation.framework.resultToken = resultToken;
    return envelope;
  }

  function skill(args = {}, context = {}) {
    const action = args.action || "invoke";
    if (action === "handoff") {
      const previousSkillRef = args.previousSkillRef;
      const nextSkillRef = args.skillRef;
      const registry = registrySnapshot(state);
      const availableSkillRefs = registry.skills.map((candidate) => candidate.id);
      const frameworkRef = compatibleFramework(state, previousSkillRef, nextSkillRef, args.frameworkRef || null);
      if (!frameworkRef) {
        return {
          schema: "mousecat.error/1",
          ok: false,
          code: "framework-handoff-skill-invalid",
          availableSkillRefs,
        };
      }
      const previousResult = state.skillResults.get(args.previousResultRef);
      if (
        !previousResult
        || previousResult.skillRef !== resolveRegisteredSkill(state, previousSkillRef)?.id
        || previousResult.status === "pending"
        || continuationTokenHash(args.previousResultToken) !== previousResult.capabilityHash
        || !previousResult.frameworkRefs.includes(frameworkRef)
      ) {
        return { schema: "mousecat.error/1", ok: false, code: "framework-handoff-result-capability-invalid" };
      }
      if (!args.route || !String(args.route.selectedBy || "").trim() || !String(args.route.reason || "").trim()) {
        return { schema: "mousecat.error/1", ok: false, code: "framework-handoff-route-required" };
      }
      const invoked = skill({ ...args, action: "invoke" }, context);
      return Promise.resolve(invoked).then((result) => {
        if (result?.schema === "mousecat.error/1" || result?.ok === false) return result;
        const receipt = {
          schema: "mousecat.framework-route/1",
          id: nextId("framework-route"),
          frameworkRef,
          fromSkillRef: previousSkillRef,
          toSkillRef: nextSkillRef,
          selectedBy: args.route.selectedBy,
          reason: args.route.reason.trim(),
          contextRef: args.route.contextRef || null,
          routedAt: nowIso(),
          fixedTransition: false,
        };
        emit("framework.routed", receipt);
        return {
          schema: "mousecat.framework-handoff/1",
          ok: true,
          route: receipt,
          result,
        };
      });
    }
    if (action === "await") {
      const interactionId = args.interactionId;
      const interaction = findInteraction(interactionId);
      if (!interaction?.invocation) {
        return { schema: "mousecat.error/1", ok: false, code: "unknown-skill-interaction", interactionId: interactionId || null };
      }
      if (!args.continuationToken) {
        return { schema: "mousecat.error/1", ok: false, code: "skill-continuation-token-required", interactionId };
      }
      if (continuationTokenHash(args.continuationToken) !== interaction.invocation.continuationHash) {
        return { schema: "mousecat.error/1", ok: false, code: "skill-continuation-token-invalid", interactionId };
      }
      const waited = waitForInteraction(interactionId, args.waitMs || 0, context.signal);
      return Promise.resolve(waited).then((result) => finalizeSkillEnvelope(
        skillInvocationEnvelope(action, interaction, result, { continuationToken: args.continuationToken }),
        interaction,
        args.continuationToken,
      ));
    }
    if (action !== "invoke") {
      return { schema: "mousecat.error/1", ok: false, code: "unknown-skill-action", action };
    }

    const descriptor = resolveRegisteredSkill(state, args.skillRef || args.skill);
    if (!descriptor) {
      return {
        schema: "mousecat.error/1",
        ok: false,
        code: "unsupported-skill-ref",
        supportedSkillRefs: registrySnapshot(state).skills.map((candidate) => candidate.id),
      };
    }
    const frameworkRefs = descriptor.frameworkRefs || [];
    const frameworkRef = args.frameworkRef
      ? (frameworkRefs.includes(args.frameworkRef) ? args.frameworkRef : null)
      : frameworkRefs.length === 1 ? frameworkRefs[0] : null;
    if (!frameworkRef) {
      return {
        schema: "mousecat.error/1",
        ok: false,
        code: "skill-framework-ref-required",
        skillRef: descriptor.id,
        frameworkRefs,
      };
    }
    const framework = registrySnapshot(state).frameworks.find((candidate) => candidate.id === frameworkRef);
    const compiled = compileSkillInvocation(args, {
      descriptor,
      frameworkRef,
      availableSkillRefs: framework?.skillRefs || [descriptor.id],
    });
    if (compiled.schema === "mousecat.error/1") return compiled;
    if (compiled.mode === "recall") {
      const recalled = session({ action: "total-recall" });
      const resultRef = nextId("skill-result");
      const resultToken = nextId("route-capability");
      state.skillResults.set(resultRef, {
        id: resultRef,
        skillRef: compiled.skillRef,
        frameworkRefs: [frameworkRef],
        status: "observed",
        capabilityHash: continuationTokenHash(resultToken),
        createdAt: nowIso(),
      });
      emit("skill.invoked", {
        skillRef: compiled.skillRef,
        seamCount: 0,
        ordering: compiled.intake.ordering,
      });
      return {
        schema: "mousecat.skill-invocation/2",
        action,
        skillRef: compiled.skillRef,
        interactionId: null,
        status: "observed",
        idempotentReplay: false,
        intake: compiled.intake,
        items: [],
        responses: [],
        progress: null,
        reason: null,
        recall: recalled,
        continuation: {
          obligation: "route-framework-context",
          recurse: true,
          framework: {
            frameworkRef,
            routing: "contextual-capability-routing",
            previousSkillRef: "total-recall",
            availableSkillRefs: framework?.skillRefs || [compiled.skillRef],
            fixedNextSkill: null,
            resultRef,
            resultToken,
          },
        },
      };
    }
    const interactionId = compiled.request.interactionId;
    const existing = interactionId ? findInteraction(interactionId) : null;
    if (existing) {
      if (existing.invocation?.fingerprint !== compiled.intake.fingerprint) {
        return { schema: "mousecat.error/1", ok: false, code: "skill-invocation-id-conflict", interactionId };
      }
      const continuationToken = args.continuationToken;
      if (!continuationToken) {
        return { schema: "mousecat.error/1", ok: false, code: "skill-continuation-token-required", interactionId };
      }
      if (continuationTokenHash(continuationToken) !== existing.invocation.continuationHash) {
        return { schema: "mousecat.error/1", ok: false, code: "skill-continuation-token-invalid", interactionId };
      }
      const current = interactionResult(existing);
      const waited = args.waitMs > 0
        ? waitForInteraction(interactionId, args.waitMs, context.signal)
        : current;
      return Promise.resolve(waited).then((result) => finalizeSkillEnvelope(
        skillInvocationEnvelope(action, existing, result, { idempotentReplay: true, continuationToken }),
        existing,
        continuationToken,
      ));
    }

    const continuationToken = nextId("continuation");
    compiled.request.invocation.continuationHash = continuationTokenHash(continuationToken);
    const requested = widget({ action: "ask", request: compiled.request });
    if (requested.schema === "mousecat.error/1") return requested;
    const interaction = state.interactions.get(requested.interaction.interactionId);
    emit("skill.invoked", {
      skillRef: compiled.skillRef,
      interactionId: interaction.interactionId,
      seamCount: compiled.intake.seamCount,
      ordering: compiled.intake.ordering,
    });
    const current = interactionResult(interaction);
    const waited = args.waitMs > 0
      ? waitForInteraction(interaction.interactionId, args.waitMs, context.signal)
      : current;
    return Promise.resolve(waited).then((result) => finalizeSkillEnvelope(
      skillInvocationEnvelope(action, interaction, result, { continuationToken }),
      interaction,
      continuationToken,
    ));
  }

  function delegationError(code, details = {}) {
    return { schema: "mousecat.error/1", ok: false, code, ...details };
  }

  function delegationResult(action, record, delegationToken, options = {}) {
    return delegationEnvelope(action, record, {
      ...options,
      delegationToken,
      result: delegationVault.get(record.delegationId)?.result || null,
    });
  }

  function resolveDelegationWaiters(record) {
    if (record.status === "running") return;
    const waiters = delegationWaiters.get(record.delegationId);
    if (!waiters) return;
    delegationWaiters.delete(record.delegationId);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.cleanup();
      waiter.resolve(delegationResult("await", record, waiter.delegationToken, { includeResult: true }));
    }
  }

  function waitForDelegation(record, delegationToken, waitMs = 0, signal) {
    if (record.status !== "running" || !Number.isInteger(waitMs) || waitMs <= 0) {
      return delegationResult("await", record, delegationToken, { includeResult: true });
    }
    if (signal?.aborted) return delegationError("delegation-await-cancelled", { delegationId: record.delegationId });
    const boundedWaitMs = Math.min(waitMs, 30000);
    return new Promise((resolve) => {
      const waiters = delegationWaiters.get(record.delegationId) || new Set();
      const removeWaiter = () => {
        waiters.delete(waiter);
        if (waiters.size === 0) delegationWaiters.delete(record.delegationId);
      };
      const cancel = () => {
        clearTimeout(waiter.timer);
        removeWaiter();
        waiter.cleanup();
        resolve(delegationError("delegation-await-cancelled", { delegationId: record.delegationId }));
      };
      const waiter = {
        delegationToken,
        resolve,
        cleanup: () => signal?.removeEventListener("abort", cancel),
        timer: setTimeout(() => {
          removeWaiter();
          waiter.cleanup();
          resolve(delegationResult("await", state.delegations.get(record.delegationId), delegationToken, { includeResult: true }));
        }, boundedWaitMs),
      };
      waiters.add(waiter);
      delegationWaiters.set(record.delegationId, waiters);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }

  function scheduleDelegation(record, payload) {
    if (runningDelegations.has(record.delegationId) && record.status === "running") return;
    record.attempts += 1;
    record.activeAttempt = record.attempts;
    record.status = "running";
    record.upstreamOutcome = "pending";
    record.resultAvailable = false;
    record.failure = null;
    record.cancellation = null;
    record.reason = null;
    record.startedAt = nowIso();
    record.completedAt = null;
    record.updatedAt = record.startedAt;
    const attempt = record.activeAttempt;
    delegationVault.set(record.delegationId, { payload: clone(payload), result: null });
    emit("delegation.started", {
      delegationId: record.delegationId,
      attempt,
      originInteractionId: record.origin.interactionId,
      originItemId: record.origin.itemId,
      upstream: record.target.upstream,
      capability: record.target.capability,
    });

    const deadlineAt = Date.now() + record.timeoutMs;
    const run = Promise.resolve()
      .then(() => connectorInvoker(
        config,
        record.target.upstream,
        record.target.capability,
        clone(payload),
        { timeoutMs: record.timeoutMs, deadlineAt },
      ))
      .then((invoked) => {
        if (record.activeAttempt !== attempt) return;
        const cancellationAcknowledged = invoked?.code === "connector-cancelled"
          && invoked?.cancellation?.acknowledged === true;
        const notDispatched = invoked?.dispatchPhase === "not-dispatched"
          || DEFINITIVE_PRE_DISPATCH_FAILURES.has(invoked?.code);
        const unknownOutcome = !invoked?.ok
          && !cancellationAcknowledged
          && !notDispatched;
        record.cancellation = invoked?.cancellation ? clone(invoked.cancellation) : null;
        if (invoked?.ok) {
          record.status = "completed";
          record.upstreamOutcome = "succeeded";
          record.resultAvailable = true;
          delegationVault.set(record.delegationId, { payload: clone(payload), result: clone(invoked.result) });
        } else if (cancellationAcknowledged) {
          record.status = "cancelled";
          record.upstreamOutcome = "cancelled";
          record.failure = {
            code: "connector-cancelled",
            cancellationAcknowledged: true,
          };
          record.reason = record.failure.code;
        } else {
          record.status = unknownOutcome ? "interrupted" : "failed";
          record.upstreamOutcome = invoked?.upstreamOutcome || (unknownOutcome ? "unknown" : "failed");
          record.failure = {
            code: invoked?.code || "delegation-upstream-failed",
            restartRequired: invoked?.restartRequired === true,
            staleCode: invoked?.staleCode || null,
            cancellationAcknowledged: invoked?.cancellation?.acknowledged === true,
            dispatchPhase: invoked?.dispatchPhase || null,
          };
          record.reason = record.failure.code;
        }
        record.completedAt = nowIso();
        record.updatedAt = record.completedAt;
        emit(record.status === "completed" ? "delegation.completed" : `delegation.${record.status}`, {
          delegationId: record.delegationId,
          attempt,
          status: record.status,
          upstreamOutcome: record.upstreamOutcome,
          reason: record.reason,
        });
        resolveDelegationWaiters(record);
      })
      .catch((error) => {
        if (record.activeAttempt !== attempt) return;
        record.status = "interrupted";
        record.upstreamOutcome = "unknown";
        record.reason = "delegation-runtime-error";
        record.failure = { code: "delegation-runtime-error", name: error?.name || "Error" };
        record.completedAt = nowIso();
        record.updatedAt = record.completedAt;
        emit("delegation.interrupted", {
          delegationId: record.delegationId,
          attempt,
          status: record.status,
          upstreamOutcome: record.upstreamOutcome,
          reason: record.reason,
        });
        resolveDelegationWaiters(record);
      })
      .finally(() => {
        if (runningDelegations.get(record.delegationId) === run) runningDelegations.delete(record.delegationId);
      });
    runningDelegations.set(record.delegationId, run);
  }

  function delegation(args = {}, context = {}) {
    const action = args.action || "start";
    const delegationId = args.delegationId;
    if (action === "await") {
      const record = state.delegations.get(delegationId);
      if (!record) return delegationError("unknown-delegation", { delegationId: delegationId || null });
      if (!args.delegationToken) return delegationError("delegation-token-required", { delegationId });
      if (continuationTokenHash(args.delegationToken) !== record.continuationHash) {
        return delegationError("delegation-token-invalid", { delegationId });
      }
      return waitForDelegation(record, args.delegationToken, args.waitMs || 0, context.signal);
    }

    if (action === "rejoin") {
      const record = state.delegations.get(delegationId);
      if (!record) return delegationError("unknown-delegation", { delegationId: delegationId || null });
      if (!args.delegationToken) return delegationError("delegation-token-required", { delegationId });
      if (continuationTokenHash(args.delegationToken) !== record.continuationHash) {
        return delegationError("delegation-token-invalid", { delegationId });
      }
      const permit = permitAllows(args.permit, "mousecat.delegation", "rejoin");
      if (!permit.allowed) return delegationError("delegation-rejoin-permit-required", { delegationId });
      if (record.status !== "completed") {
        return delegationError("delegation-not-completed", { delegationId, status: record.status });
      }
      if (!record.resultAvailable && !record.rejoin?.interactionId) {
        return delegationError("delegation-result-unavailable", { delegationId });
      }
      if (!args.seam || typeof args.seam !== "object" || Array.isArray(args.seam)) {
        return delegationError("delegation-rejoin-seam-required", { delegationId });
      }
      const seam = {
        ...args.seam,
        id: args.seam.id || `rejoin-${record.origin.threadId}`,
        parentThreadId: record.origin.threadId,
        evidenceRef: `delegation:${record.delegationId}`,
        originInteractionId: record.origin.interactionId,
        originItemId: record.origin.itemId,
        delegationId: record.delegationId,
        delegationAttempt: record.activeAttempt,
        sensitive: record.sensitive === true || args.seam.sensitive === true,
      };
      const skillArgs = {
        action: "invoke",
        skillRef: "crucible",
        source: {
          host: record.source.host,
          sessionId: record.source.sessionId,
          invocationId: `${record.source.invocationId}:delegation-rejoin`,
        },
        intake: { seams: [seam] },
        parentInteractionId: record.origin.interactionId,
        title: args.title || "Council Rejoin",
      };
      const compiledRejoin = compileSkillInvocation(skillArgs);
      if (compiledRejoin.schema === "mousecat.error/1") return compiledRejoin;
      if (record.rejoin?.fingerprint && record.rejoin.fingerprint !== compiledRejoin.intake.fingerprint) {
        return delegationError("delegation-rejoin-conflict", { delegationId });
      }
      const existingRejoin = record.rejoin?.interactionId
        ? state.interactions.get(record.rejoin.interactionId)
        : null;
      if (existingRejoin) {
        const replay = skillInvocationEnvelope("await", existingRejoin, interactionResult(existingRejoin), {
          idempotentReplay: true,
        });
        if (replay.status === "pending") {
          replay.continuation = {
            obligation: "await-rejoined-interaction",
            tool: "mousecat.delegation",
            arguments: { action: "rejoin", delegationId, delegationToken: args.delegationToken },
            requires: ["original-rejoin-seam", "operator-interaction-permit"],
          };
        }
        return {
          schema: "mousecat.delegation-rejoin/1",
          action,
          idempotentReplay: true,
          delegation: publicDelegationSummary(record),
          interaction: replay,
        };
      }
      if (!record.rejoin) {
        record.rejoin = {
          interactionId: compiledRejoin.request.interactionId,
          itemId: compiledRejoin.request.items[0]?.id || null,
          fingerprint: compiledRejoin.intake.fingerprint,
          status: "creating",
          createdAt: nowIso(),
        };
        record.updatedAt = record.rejoin.createdAt;
        emit("delegation.rejoin-started", {
          delegationId,
          attempt: record.activeAttempt,
          rejoinInteractionId: record.rejoin.interactionId,
        });
      }
      const interaction = skill(skillArgs, context);
      return Promise.resolve(interaction).then((result) => {
        if (result.schema === "mousecat.error/1") return result;
        record.rejoin = {
          ...record.rejoin,
          interactionId: result.interactionId,
          itemId: result.items?.[0]?.id || record.rejoin.itemId,
          status: "active",
        };
        record.updatedAt = nowIso();
        emit("delegation.rejoined", {
          delegationId,
          attempt: record.activeAttempt,
          originInteractionId: record.origin.interactionId,
          originItemId: record.origin.itemId,
          rejoinInteractionId: record.rejoin.interactionId,
        });
        return {
          schema: "mousecat.delegation-rejoin/1",
          action,
          delegation: publicDelegationSummary(record),
          interaction: result,
        };
      });
    }

    if (action !== "start") return delegationError("unknown-delegation-action", { action });
    const originInput = args.origin && typeof args.origin === "object" ? args.origin : {};
    const originInteractionId = originInput.interactionId || args.originInteractionId;
    const origin = state.interactions.get(originInteractionId);
    if (!origin) return delegationError("unknown-delegation-origin", { interactionId: originInteractionId || null });
    if (!origin.invocation?.continuationHash) {
      return delegationError("delegation-origin-skill-required", { interactionId: originInteractionId });
    }
    if (!args.originContinuationToken) {
      return delegationError("delegation-origin-token-required", { interactionId: originInteractionId });
    }
    if (continuationTokenHash(args.originContinuationToken) !== origin.invocation.continuationHash) {
      return delegationError("delegation-origin-token-invalid", { interactionId: originInteractionId });
    }
    const compiled = compileDelegationStart(args, origin);
    if (compiled.schema === "mousecat.error/1") return compiled;
    const candidate = compiled.record;
    const existing = state.delegations.get(candidate.delegationId);
    if (existing) {
      if (existing.fingerprint !== candidate.fingerprint) {
        return delegationError("delegation-invocation-id-conflict", { delegationId: candidate.delegationId });
      }
      if (!args.delegationToken) return delegationError("delegation-token-required", { delegationId: candidate.delegationId });
      if (continuationTokenHash(args.delegationToken) !== existing.continuationHash) {
        return delegationError("delegation-token-invalid", { delegationId: candidate.delegationId });
      }
      if (["interrupted", "failed", "cancelled"].includes(existing.status) && args.retry === true) {
        const retryPermit = permitAllows(args.permit, "mousecat.delegation", "start");
        if (!retryPermit.allowed) return delegationError("delegation-start-permit-required");
        const retryRoute = route({ upstream: candidate.target.upstream, capability: candidate.target.capability });
        if (retryRoute.plan?.connector?.integrationOwned) {
          return delegationError("delegation-integration-unsupported", { upstream: candidate.target.upstream });
        }
        if (!retryRoute.ok || !retryRoute.plan.enabled || !retryRoute.plan.connector?.invocationReady) {
          return delegationError(
            retryRoute.plan?.connector?.reason || retryRoute.code || "delegation-route-unavailable",
            { upstream: candidate.target.upstream },
          );
        }
      }
      if (existing.status === "interrupted" && args.retry === true) {
        if (args.duplicateSideEffectAcknowledged !== true) {
          return delegationError("delegation-retry-acknowledgement-required", {
            delegationId: existing.delegationId,
            upstreamOutcome: existing.upstreamOutcome,
          });
        }
        existing.timeoutMs = candidate.timeoutMs;
        scheduleDelegation(existing, compiled.payload);
      } else if (["failed", "cancelled"].includes(existing.status) && args.retry === true) {
        scheduleDelegation(existing, compiled.payload);
      }
      return delegationResult("start", existing, args.delegationToken, {
        idempotentReplay: true,
        includeResult: true,
      });
    }

    const permit = permitAllows(args.permit, "mousecat.delegation", "start");
    if (!permit.allowed) return delegationError("delegation-start-permit-required");
    const routeResult = route({ upstream: candidate.target.upstream, capability: candidate.target.capability });
    if (!routeResult.ok) return delegationError(routeResult.code || "delegation-route-unavailable");
    if (!routeResult.plan.enabled) return delegationError("upstream-disabled", { upstream: candidate.target.upstream });
    if (routeResult.plan.connector?.integrationOwned) {
      return delegationError("delegation-integration-unsupported", { upstream: candidate.target.upstream });
    }
    if (!routeResult.plan.connector?.invocationReady) {
      return delegationError(routeResult.plan.connector?.reason || "connector-not-configured", {
        upstream: candidate.target.upstream,
      });
    }
    const delegationToken = nextId("delegation-cap");
    candidate.continuationHash = continuationTokenHash(delegationToken);
    state.delegations.set(candidate.delegationId, candidate);
    scheduleDelegation(candidate, compiled.payload);
    return delegationResult("start", candidate, delegationToken);
  }

  function queue(args = {}) {
    const action = args.action || "list";
    if (action === "enqueue") {
      const rawItems = Array.isArray(args.items) && args.items.length > 0 ? args.items : [args.item || args];
      const normalizedItems = rawItems.map((raw, index) => normalizeInteractionItem(raw, {
          id: raw?.id || nextId("dq", state.queue.length + index),
          prompt: raw?.prompt || args.prompt,
          shape: raw?.shape || args.shape || "queue",
          options: raw?.options || args.options,
        }));
      const invalidItem = normalizedItems.find((item) => item.schema === "mousecat.error/1");
      if (invalidItem) return invalidItem;
      const enqueued = normalizedItems.map((normalized, index) => {
        const raw = rawItems[index];
        return {
          ...normalized,
          id: raw?.id || normalized.id,
          sessionId: raw?.sessionId || args.sessionId || null,
          interactionId: raw?.interactionId || args.interactionId || null,
          parentInteractionId: raw?.parentInteractionId || args.parentInteractionId || null,
          source: raw?.source || args.source || "mousecat.queue",
          recommendedDefault: raw?.recommendedDefault || normalized.recommendedDefault,
          status: "open",
          createdAt: nowIso(),
        };
      });
      state.queue.push(...enqueued);
      emit("queue.enqueued", {
        itemIds: enqueued.map((item) => item.id),
        itemCount: enqueued.length,
        shapes: [...new Set(enqueued.map((item) => item.shape))],
        sessionId: enqueued[0]?.sessionId || null,
      });
      return { schema: "mousecat.queue/1", action, item: enqueued[0], items: enqueued, queueLength: state.queue.length };
    }

    if (action === "answer" || action === "hold") {
      const item = state.queue.find((candidate) => candidate.id === args.itemId);
      if (!item) return { schema: "mousecat.queue/1", action, ok: false, error: "unknown-queue-item" };
      item.status = action === "hold" ? "held" : "answered";
      item.answer = action === "answer" ? args.answer || {} : null;
      item.holdReason = action === "hold" ? args.reason || args.answer?.reason || "operator-held" : null;
      item.answeredAt = action === "answer" ? nowIso() : item.answeredAt || null;
      item.heldAt = action === "hold" ? nowIso() : item.heldAt || null;
      emit(action === "hold" ? "queue.held" : "queue.answered", { itemId: item.id, sessionId: item.sessionId || null });
      return { schema: "mousecat.queue/1", action, ok: true, item };
    }

    if (action === "ratify") {
      for (const item of state.queue) {
        if (item.status === "answered") {
          item.status = "ratified";
          item.ratifiedAt = nowIso();
        }
      }
      emit("queue.ratified", { itemCount: state.queue.filter((item) => item.status === "ratified").length });
      return { schema: "mousecat.queue/1", action, ok: true, queue: clone(state.queue) };
    }

    if (action === "clear") {
      const previousLength = state.queue.length;
      state.queue.length = 0;
      emit("queue.cleared", { previousLength });
      return { schema: "mousecat.queue/1", action, ok: true, previousLength };
    }

    return { schema: "mousecat.queue/1", action: "list", queue: clone(state.queue) };
  }

  function visualize(args = {}, options = {}) {
    const limit = Number.isInteger(args.limit) ? Math.max(1, args.limit) : 25;
    const stream = args.stream || "snapshot";
    if (options.emitEvent !== false) emit("visualize.snapshot", { includeEvents: args.includeEvents === true, stream });
    const interactions = [...state.interactions.values()].map(publicInteraction);
    const delegations = [...state.delegations.values()].map(publicDelegationSummary);
    const events = state.events.slice(-limit).map(publicEvent);
    const queue = state.queue.map(publicQueueItem);
    const runtimeStatus = status();
    const hostNodeId = `host:${config.hostProfile || "local"}`;
    const runtimeNodeId = "runtime:mousecat";
    return {
      schema: "mousecat.visualizer/1",
      stream,
      buttons: skillButtons(),
      widget: {
        availability: widgetAvailability(),
        controls: widgetControls(),
      },
      namedSkills: registrySnapshot(state).skills,
      skillFrameworks: registrySnapshot(state).frameworks,
      adapterProfiles: adapterProfiles(),
      adapterRenderPackets: adapterRenderPackets(),
      workPermitProfiles: WORK_PERMIT_PROFILES,
      toolBoundaries: TOOL_BOUNDARIES,
      connectors: connectorSummaries(config, connectorOptions),
      interactions,
      delegations,
      interactionSessions: [...new Set(interactions.map((interaction) => interaction.sessionId).filter(Boolean))].map((sessionId) => ({
        sessionId,
        interactions: interactions
          .filter((interaction) => interaction.sessionId === sessionId)
          .map((interaction) => summarizeInteraction(interaction)),
      })),
      queue,
      upstreams: runtimeStatus.upstreams,
      credentialRefs: state.credentialRefs.map((ref) => scrubPublicState(ref)),
      projectWorkbenches: [...state.projectWorkbenches.values()].map((record) => {
        const { capabilityHash: _capabilityHash, ...publicRecord } = record;
        return scrubPublicState(publicRecord);
      }),
      projectRepresentations: [...state.projectRepresentations.values()].map((record) => scrubPublicState(record)),
      projectOperationReceipts: [...state.projectOperationReceipts.values()].map((record) => scrubPublicState(record)),
      events: args.includeEvents ? events : [],
      eventStream: state.events.slice(-limit).map(visualizerEvent),
      liveGraph: {
        nodes: [
          { id: hostNodeId, kind: "host", label: config.hostProfile || "Local host", status: config.adapterProfile || "generic-mcp" },
          { id: runtimeNodeId, kind: "runtime", label: "Mousecat", status: "active" },
          ...UPSTREAMS.map((upstream) => ({ id: `upstream:${upstream.id}`, kind: "upstream", label: upstream.label })),
          ...interactions.map((interaction) => ({ id: `interaction:${interaction.interactionId}`, kind: "interaction", label: interaction.title || interaction.source, status: interaction.status })),
          ...delegations.map((delegationRecord) => ({
            id: `delegation:${delegationRecord.delegationId}`,
            kind: "delegation",
            label: delegationRecord.target?.capability || "Delegation",
            status: delegationRecord.status,
          })),
          ...queue.map((item) => ({ id: `queue:${item.id}`, kind: "queue-item", label: item.prompt, status: item.status })),
        ],
        edges: [
          { from: hostNodeId, to: runtimeNodeId, kind: "binds" },
          ...UPSTREAMS.map((upstream) => ({ from: runtimeNodeId, to: `upstream:${upstream.id}`, kind: "routes" })),
          ...delegations.flatMap((delegationRecord) => {
            const edges = [];
            if (delegationRecord.origin?.interactionId) {
              edges.push({
                from: `interaction:${delegationRecord.origin.interactionId}`,
                to: `delegation:${delegationRecord.delegationId}`,
                kind: "delegates",
              });
            }
            if (delegationRecord.target?.upstream) {
              edges.push({
                from: `delegation:${delegationRecord.delegationId}`,
                to: `upstream:${delegationRecord.target.upstream}`,
                kind: "invokes",
              });
            }
            if (delegationRecord.rejoin?.interactionId) {
              edges.push({
                from: `delegation:${delegationRecord.delegationId}`,
                to: `interaction:${delegationRecord.rejoin.interactionId}`,
                kind: "rejoins",
              });
            }
            return edges;
          }),
          ...queue
            .filter((item) => item.interactionId)
            .map((item) => ({ from: `interaction:${item.interactionId}`, to: `queue:${item.id}`, kind: "contains" })),
        ],
      },
    };
  }

  function hostState(args = {}, options = {}) {
    const configuredProfile = config.adapterProfile || "generic-mcp";
    const profileId = args.profileId || configuredProfile;
    const limit = Number.isInteger(args.limit) ? Math.max(1, args.limit) : 25;
    const adapter = hostStateAdapter(profileId);
    const renderPacket = adapterRenderPacket(adapter.profileId);
    if (options.emitEvent !== false) {
      emit("host-state.bound", {
        profileId: adapter.profileId,
        scope: adapter.scope,
        storage: adapter.storage,
      });
    }
    const records = {
      sessions: [...state.sessions.values()].map((sessionRecord) => scrubPublicState(sessionRecord)),
      interactions: [...state.interactions.values()].map(publicInteraction),
      delegations: [...state.delegations.values()].map(publicDelegationSummary),
      queue: state.queue.map(publicQueueItem),
      routePlans: state.routePlans.slice(-limit).map((routePlan) => scrubPublicState(routePlan)),
      events: state.events.slice(-limit).map((event) => publicEvent({
        ...event,
        data: scrubPublicState(event.data || {}),
      })),
      credentialRefs: state.credentialRefs.map((ref) => scrubPublicState(ref)),
      projectWorkbenches: [...state.projectWorkbenches.values()].map((record) => {
        const { capabilityHash: _capabilityHash, ...publicRecord } = record;
        return scrubPublicState(publicRecord);
      }),
      projectRepresentations: [...state.projectRepresentations.values()]
        .map((record) => scrubPublicState(record)),
      projectOperationReceipts: [...state.projectOperationReceipts.values()]
        .map((record) => scrubPublicState(record)),
    };

    return {
      schema: "mousecat.host-state.binding/1",
      ok: true,
      profileId: adapter.profileId,
      hostProfile: config.hostProfile || null,
      adapterProfileSource: args.profileId ? "request" : "config",
      scope: adapter.scope,
      storage: adapter.storage,
      adapter,
      renderPacket,
      sync: adapter.sync,
      records,
      counts: Object.fromEntries(Object.entries(records).map(([key, value]) => [key, value.length])),
      limits: {
        events: limit,
        routePlans: limit,
      },
      commands: {
        reads: adapter.reads.tools,
        writes: adapter.writes.tools,
        host: adapter.commands,
      },
      boundaries: adapter.boundaries,
    };
  }

  function route(args = {}) {
    const upstream = resolveUpstream(args.upstream);
    if (!upstream) {
      return { schema: "mousecat.route/1", ok: false, code: "unknown-upstream", upstream: args.upstream };
    }
    const enabled = isUpstreamEnabled(upstream.id);
    const connector = routeConnectorPlan(config, upstream.id, args.capability || null, connectorOptions);
    const plan = {
      upstream: upstream.id,
      label: upstream.label,
      capability: args.capability || null,
      intent: args.intent || null,
      enabled,
      adapter: upstream.adapter,
      connector,
      invocationReady: enabled && connector.invocationReady,
      reason: enabled
        ? connector.configured
          ? connector.reason
          : "descriptor-available-connector-not-configured"
        : "upstream-disabled",
      requiredPermit: "tool-invocation",
      credentialPolicy: upstream.policy || "credential-reference-if-required",
    };
    const routeRecord = rememberRoutePlan(plan);
    emit("route.planned", { upstream: upstream.id, capability: plan.capability, enabled, routePlanId: routeRecord?.id || null });
    return {
      schema: "mousecat.route/1",
      ok: true,
      plan,
      routeCache: {
        id: routeRecord?.id || null,
        size: state.routePlans.length,
      },
    };
  }

  async function bridge(args = {}) {
    const upstream = args.upstream || "neo";
    const result = await readMousecatBridgeContract(config, upstream, {
      resourceName: args.resourceName,
      includeInputSchemas: args.includeInputSchemas === true,
    });
    emit(result.ok ? "bridge.read" : "bridge.blocked", {
      upstream,
      resourceName: args.resourceName || "mousecat_bridge_contract_v1",
      reason: result.ok ? "public-contract-summary" : result.code,
    });
    return result;
  }

  function invoke(args = {}) {
    const routeResult = route(args);
    if (!routeResult.ok) return { schema: "mousecat.invoke/1", ok: false, code: routeResult.code, route: routeResult };
    const permit = permitAllows(args.permit, "mousecat.invoke");
    if (!permit.allowed) {
      emit("invoke.blocked", { upstream: args.upstream, reason: permit.reason });
      return {
        schema: "mousecat.invoke/1",
        ok: false,
        code: "permit-required",
        reason: permit.reason,
        requiredPermit: "tool-invocation",
        route: routeResult.plan,
      };
    }
    if (!routeResult.plan.enabled) {
      emit("invoke.blocked", { upstream: args.upstream, reason: "upstream-disabled" });
      return { schema: "mousecat.invoke/1", ok: false, code: "upstream-disabled", route: routeResult.plan };
    }
    if (routeResult.plan.connector?.configurationError) {
      emit("invoke.blocked", { upstream: args.upstream, reason: routeResult.plan.connector.configurationError });
      return {
        schema: "mousecat.invoke/1",
        ok: false,
        code: routeResult.plan.connector.configurationError,
        route: routeResult.plan,
      };
    }
    if (
      args.capability
      && args.capability !== "tools/list"
      && routeResult.plan.connector?.configured
      && !routeResult.plan.connector.invocationReady
    ) {
      emit("invoke.blocked", { upstream: args.upstream, capability: args.capability, reason: routeResult.plan.connector.reason });
      return {
        schema: "mousecat.invoke/1",
        ok: false,
        code: routeResult.plan.connector.reason,
        route: routeResult.plan,
      };
    }
    if (routeResult.plan.connector?.configured && routeResult.plan.connector?.enabled) {
      const toolName = args.capability;
      if (!toolName || toolName === "tools/list") {
        return discoverConnectorTools(config, args.upstream, connectorOptions).then((discovered) => {
          emit(discovered.ok ? "connector.discovered" : "connector.blocked", {
            upstream: args.upstream,
            reason: discovered.ok ? "tools-list" : discovered.code,
          });
          return {
            schema: "mousecat.invoke/1",
            ok: discovered.ok,
            code: discovered.ok ? "connector-tools-listed" : discovered.code,
            ...connectorBoundaryFields(discovered),
            route: routeResult.plan,
            connector: discovered.connector,
            result: discovered,
          };
        });
      }

      const invoker = routeResult.plan.connector.integrationOwned ? defaultConnectorInvoker : connectorInvoker;
      return invoker(config, args.upstream, toolName, args.payload || {}).then((invoked) => {
        emit(invoked.ok ? "connector.invoked" : "connector.blocked", {
          upstream: args.upstream,
          capability: toolName,
          reason: invoked.ok ? "forwarded" : invoked.code,
        });
        return {
          schema: "mousecat.invoke/1",
          ok: invoked.ok,
          code: invoked.ok ? "connector-forwarded" : invoked.code,
          ...connectorBoundaryFields(invoked),
          route: routeResult.plan,
          connector: invoked.connector,
          result: invoked.result || invoked,
        };
      });
    }

    emit("invoke.blocked", { upstream: args.upstream, reason: "connector-not-configured" });
    return {
      schema: "mousecat.invoke/1",
      ok: false,
      code: "connector-not-configured",
      reason: "The route is recognized and permitted, but no local MCP connector is configured for this upstream.",
      route: routeResult.plan,
    };
  }

  function credentials(args = {}) {
    const action = args.action || "status";
    if (credentialValueLooksSecret(args)) {
      emit("credentials.rejected", { upstream: args.upstream || null, reason: "secret-value-present" });
      return {
        schema: "mousecat.credentials/1",
        ok: false,
        code: "secret-values-not-accepted",
        policy: "references-only",
      };
    }
    if (action === "register-reference") {
      const upstream = resolveUpstream(args.upstream);
      if (!upstream) return { schema: "mousecat.credentials/1", ok: false, code: "unknown-upstream" };
      const ref = {
        id: nextId("credref", state.credentialRefs.length),
        upstream: upstream.id,
        ref: String(args.ref || ""),
        kind: args.kind || "environment-variable",
        createdAt: nowIso(),
      };
      state.credentialRefs.push(ref);
      emit("credentials.reference-registered", { upstream: upstream.id, id: ref.id });
      return { schema: "mousecat.credentials/1", ok: true, ref };
    }
    return {
      schema: "mousecat.credentials/1",
      ok: true,
      action,
      policy: "references-only",
      refs: clone(state.credentialRefs),
    };
  }

  function registry(args = {}) {
    const action = args.action || "list";
    if (action === "list") {
      return {
        ...registrySnapshot(state),
        projectAdapters: projectAdapterRegistrySnapshot(state),
      };
    }
    if (!["register", "register-project-adapter"].includes(action)) {
      return { schema: "mousecat.error/1", ok: false, code: "unknown-registry-action", action };
    }
    const permission = permitAllows(args.permit, "mousecat.registry", "register");
    if (!permission.allowed) {
      return { schema: "mousecat.error/1", ok: false, code: "registry-permit-required", reason: permission.reason };
    }
    const namespace = String(args.namespace || "").trim().toLowerCase();
    const existingNamespaceHash = state.registryNamespaces.get(namespace);
    if (existingNamespaceHash && continuationTokenHash(args.namespaceToken) !== existingNamespaceHash) {
      return { schema: "mousecat.error/1", ok: false, code: "registry-namespace-capability-invalid" };
    }
    const namespaceToken = existingNamespaceHash ? null : nextId("registry-namespace");
    const registered = action === "register-project-adapter"
      ? registerProjectAdapterDescriptor(
        state,
        { ...args, namespace },
        resolveProjectConnectorCapability,
      )
      : registerFrameworkDescriptors(state, { ...args, namespace });
    if (registered.schema === "mousecat.error/1") return registered;
    if (namespaceToken) state.registryNamespaces.set(namespace, continuationTokenHash(namespaceToken));
    if (action === "register-project-adapter") {
      emit("registry.project-adapter-registered", {
        adapterRef: registered.adapter.adapterId,
        projectRef: registered.adapter.projectRef,
      });
    } else {
      emit("registry.registered", {
        frameworkRef: registered.framework?.id || null,
        skillRefs: registered.skills.map((candidate) => candidate.id),
      });
    }
    return { ...registered, ...(namespaceToken ? { namespaceToken } : {}) };
  }

  function threadSummary(interaction) {
    interaction = publicInteraction(interaction);
    const items = Array.isArray(interaction.items) ? interaction.items : [];
    return {
      interactionId: interaction.interactionId,
      title: interaction.title || null,
      source: interaction.source || null,
      projectRef: interaction.projectRef || null,
      status: interaction.status,
      createdAt: interaction.createdAt,
      updatedAt: interaction.updatedAt,
      itemCount: items.length,
      openCount: items.filter((item) => item.status === "open").length,
      deferredCount: items.filter((item) => item.status === "deferred").length,
      heldCount: items.filter((item) => item.status === "held").length,
      withdrawnCount: items.filter((item) => item.status === "withdrawn").length,
    };
  }

  function projectThreads(projectRef) {
    const associated = new Set([...state.projectSurfaces.values()]
      .filter(surface => surface.projectRef === projectRef).flatMap(surface => surface.interactionIds || []));
    const belongs = interaction => interaction.projectRef === projectRef || associated.has(interaction.interactionId);
    return {
      live: [...state.interactions.values()]
        .filter(belongs)
        .map(threadSummary),
      archived: [...state.archivedInteractions.values()]
        .filter(belongs)
        .map(threadSummary),
    };
  }

  function projectSurfaces(args = {}, context = {}) {
    const action = args.action || "list";
    if (!PROJECT_SURFACE_CONTRACT.actions.includes(action)) {
      return { schema: "mousecat.error/1", ok: false, code: "unknown-project-surface-action", action };
    }
    const permit = permitAllows(args.permit || context.permit, "mousecat.projects", action);
    if (!permit.allowed) {
      return {
        schema: "mousecat.error/1",
        ok: false,
        code: "project-surface-permit-required",
        action,
        requiredGrant: `mousecat.projects:${action}`,
      };
    }

    if (action === "list") {
      const registered = [...state.projectSurfaces.values()].map((surface) => clone(surface));
      const groups = [...state.projectGroups.values()].map((group) => ({
        ...clone(group),
        ...(group.projectRef ? { threads: projectThreads(group.projectRef) } : {}),
      }));
      return {
        schema: "mousecat.projects.list/1",
        ok: true,
        registered,
        groups,
      };
    }

    if (action === "discover") {
      const roots = Array.isArray(config.projects?.roots) ? config.projects.roots : [];
      const drafts = roots.flatMap((root) => discoverProjectSurfaceDrafts(root));
      return {
        schema: "mousecat.projects.discover/1",
        ok: true,
        drafts,
      };
    }

    if (action === "draft") {
      return generateProjectSurfaceDraft(args.root, { note: args.note });
    }

    if (action === "register") {
      if (args.group && typeof args.group === "object") {
        const groupValidated = validateProjectGroupDescriptor(args.group);
        if (!groupValidated.ok) return groupValidated;
        const missingMembers = groupValidated.value.memberSurfaceIds
          .filter((member) => !state.projectSurfaces.has(member));
        if (missingMembers.length > 0) {
          return {
            schema: "mousecat.error/1",
            ok: false,
            code: "project-group-member-unknown",
            groupId: groupValidated.value.groupId,
            missingMembers,
          };
        }
        state.projectGroups.set(groupValidated.value.groupId, groupValidated.value);
        emit("projects.group-registered", {
          groupId: groupValidated.value.groupId,
          memberCount: groupValidated.value.memberSurfaceIds.length,
        });
        return {
          schema: "mousecat.projects.group-register/1",
          ok: true,
          group: clone(groupValidated.value),
        };
      }
      const validated = validateProjectSurfaceDescriptor(args.surface);
      if (!validated.ok) return validated;
      state.projectSurfaces.set(validated.value.surfaceId, validated.value);
      emit("projects.surface-registered", {
        surfaceId: validated.value.surfaceId,
        projectRef: validated.value.projectRef,
      });
      return {
        schema: "mousecat.projects.register/1",
        ok: true,
        surface: clone(validated.value),
      };
    }

    if (action === "describe" || action === "threads") {
      if (args.groupId && action === "describe") {
        const group = state.projectGroups.get(args.groupId) || null;
        if (!group) {
          return {
            schema: "mousecat.error/1",
            ok: false,
            code: "unknown-project-group",
            groupId: args.groupId,
          };
        }
        const members = group.memberSurfaceIds.map((surfaceId) => {
          const surface = state.projectSurfaces.get(surfaceId) || null;
          if (!surface) {
            return { surfaceId, surface: null, page: null, threads: null, missing: true };
          }
          const page = readProjectSurfacePage(surface);
          return {
            surfaceId,
            surface: clone(surface),
            page: page.ok ? page.page : null,
            threads: projectThreads(surface.projectRef),
            missing: false,
          };
        });
        return {
          schema: "mousecat.projects.group-describe/1",
          ok: true,
          group: clone(group),
          members,
          ...(group.projectRef ? { threads: projectThreads(group.projectRef) } : {}),
        };
      }
      let surface = null;
      let projectRef = null;
      if (args.surfaceId) {
        surface = state.projectSurfaces.get(args.surfaceId) || null;
        if (!surface) {
          return {
            schema: "mousecat.error/1",
            ok: false,
            code: "unknown-project-surface",
            surfaceId: args.surfaceId,
          };
        }
        projectRef = surface.projectRef;
      } else if (args.projectRef) {
        projectRef = String(args.projectRef).slice(0, 512);
      } else if (action === "describe") {
        return { schema: "mousecat.error/1", ok: false, code: "project-surface-or-ref-required" };
      }
      const threads = projectRef
        ? projectThreads(projectRef)
        : {
          live: [...state.interactions.values()].filter((interaction) => interaction.projectRef || [...state.projectSurfaces.values()].some(surface => surface.interactionIds?.includes(interaction.interactionId))).map(threadSummary),
          archived: [...state.archivedInteractions.values()].filter((interaction) => interaction.projectRef || [...state.projectSurfaces.values()].some(surface => surface.interactionIds?.includes(interaction.interactionId))).map(threadSummary),
        };
      if (action === "threads") {
        return { schema: "mousecat.projects.threads/1", ok: true, projectRef, threads };
      }
      const page = readProjectSurfacePage(surface);
      if (!page.ok) return page;
      return {
        schema: "mousecat.projects.describe/1",
        ok: true,
        surface: clone(surface),
        page: page.page,
        threads,
      };
    }

    if (action === "data" || action === "graph") {
      if (!args.surfaceId) {
        return { schema: "mousecat.error/1", ok: false, code: "project-surface-required" };
      }
      const surface = state.projectSurfaces.get(args.surfaceId) || null;
      if (!surface) {
        return {
          schema: "mousecat.error/1",
          ok: false,
          code: "unknown-project-surface",
          surfaceId: args.surfaceId,
        };
      }
      return action === "graph" ? readDevelopmentGraph(surface, args.source) : summarizeProjectDataSource(surface, args.source);
    }

    return { schema: "mousecat.error/1", ok: false, code: "unknown-project-surface-action", action };
  }

  function handleTool(name, args = {}, context = {}) {
    switch (name) {
      case "mousecat.bulletin":
        return bulletinController.tool({ ...args, permit: args.permit || context.permit });
      case "mousecat.history": {
        const action = args.action || "query";
        if (!permitAllows(args.permit || context.permit, name, action).allowed) return { ok: false, code: "history-permit-required" };
        if (action === "query") return historyController.query(args);
        if (action === "register") return historyController.register(args.record);
        if (action === "index") return historyController.indexSource(args);
        return { ok: false, code: "unknown-history-action" };
      }
      case "mousecat.widget":
        return widget(args, context);
      case "mousecat.skill":
        return skill(args, context);
      case "mousecat.registry":
        return registry(args);
      case "mousecat.workbench":
        return projectWorkbenchController.handle(args, context);
      case "mousecat.projects":
        return projectSurfaces(args, context);
      case "mousecat.delegation":
        return delegation(args, context);
      case "mousecat.ask":
        return ask(args);
      case "mousecat.session":
        return session(args);
      case "mousecat.queue":
        return queue(args);
      case "mousecat.visualize":
        return visualize(args);
      case "mousecat.host-state":
        return hostState(args);
      case "mousecat.route":
        return route(args);
      case "mousecat.bridge":
        return bridge(args);
      case "mousecat.invoke":
        return invoke(args);
      case "mousecat.status":
        return status(args);
      case "mousecat.credentials":
        return credentials(args);
      default:
        return { schema: "mousecat.error/1", ok: false, code: "unknown-tool", tool: name };
    }
  }

  function readOperatorState(args = {}) {
    const limit = Number.isInteger(args.limit) ? Math.max(1, args.limit) : 25;
    return {
      binding: hostState({ ...(args.profileId ? { profileId: args.profileId } : {}), limit }, { emitEvent: false }),
      visualizer: visualize({ includeEvents: true, stream: "events", limit }, { emitEvent: false }),
      status: status(),
    };
  }

  return {
    catalog: () => catalogSnapshot({ integrationRegistry }),
    state,
    stateStore,
    emit,
    handleTool,
    readOperatorState,
    bulletinQuery: bulletinController.query,
    bulletinCommand: bulletinController.operator,
    status,
  };
}
