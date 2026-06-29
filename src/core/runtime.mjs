import {
  ATOMIC_SKILLS,
  INTERACTION_SHAPES,
  OPERATOR_WIDGET_CONTRACT,
  SKILL_FRAMEWORKS,
  TOOL_BOUNDARIES,
  UPSTREAMS,
  WORK_PERMIT_PROFILES,
  catalogSnapshot,
  getPermitProfile,
  getUpstream,
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

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nextId(prefix, count) {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function credentialValueLooksSecret(args) {
  return ["value", "secret", "token", "password", "cookie", "privateKey", "apiKey"].some((key) => args[key]);
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
  return {
    id: String(raw.id || fallback.id || "item-1"),
    shape: normalizeShape(raw.shape || fallback.shape),
    prompt,
    title: raw.title || raw.header || null,
    options,
    buttons: optionButtons(options),
    required: raw.required !== false,
    sensitive: raw.sensitive === true,
    status: raw.status || "open",
    recommendedDefault: raw.recommendedDefault || null,
    metadata: raw.metadata && typeof raw.metadata === "object" ? clone(raw.metadata) : {},
  };
}

function summarizeInteraction(interaction) {
  return {
    interactionId: interaction.interactionId,
    sessionId: interaction.sessionId,
    source: interaction.source,
    status: interaction.status,
    itemCount: interaction.items.length,
    shapes: [...new Set(interaction.items.map((item) => item.shape))],
    parentInteractionId: interaction.parentInteractionId,
  };
}

function eventCategory(type) {
  if (type.startsWith("interaction.")) return "interaction";
  if (type.startsWith("queue.")) return "queue";
  if (type.startsWith("connector.")) return "connector";
  if (type.startsWith("invoke.")) return "invoke";
  if (type.startsWith("route.")) return "route";
  if (type.startsWith("credentials.")) return "credentials";
  if (type.startsWith("session.")) return "session";
  return "runtime";
}

function publicEvent(event) {
  return {
    id: event.id,
    type: event.type,
    category: eventCategory(event.type),
    at: event.at,
    data: clone(event.data || {}),
  };
}

function visualizerEvent(event) {
  const category = eventCategory(event.type);
  const data = event.data || {};
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
    data: clone(data),
  };
}

function responsePayloadFor(item, response = {}) {
  return {
    itemId: item.id,
    shape: item.shape,
    status: response.status || item.status || "answered",
    value: response.value ?? response.answer ?? null,
    selectedOption: response.selectedOption ?? response.option ?? null,
    ranking: Array.isArray(response.ranking) ? response.ranking : null,
    checklist: Array.isArray(response.checklist) ? response.checklist : null,
    notes: response.notes || response.reason || null,
  };
}

export function createMousecatRuntime(options = {}) {
  const config = options.config || defaultConfig();
  const state = {
    startedAt: nowIso(),
    sessions: new Map(),
    interactions: new Map(),
    queue: [],
    events: [],
    credentialRefs: [],
  };

  function emit(type, data = {}) {
    const event = {
      id: nextId("evt", state.events.length),
      type,
      at: nowIso(),
      data,
    };
    state.events.push(event);
    return event;
  }

  function isUpstreamEnabled(id) {
    const setting = config.upstreams?.[id];
    if (setting && typeof setting.enabled === "boolean") return setting.enabled;
    return getUpstream(id)?.defaultEnabled !== false;
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

  function status() {
    return {
      schema: "mousecat.status/1",
      ok: true,
      startedAt: state.startedAt,
      config: {
        hostProfile: config.hostProfile,
        credentialsPolicy: config.credentials?.policy || "references-only",
      },
      counts: {
        tools: TOOL_BOUNDARIES.length,
        atomicSkills: ATOMIC_SKILLS.length,
        skillFrameworks: SKILL_FRAMEWORKS.length,
        workPermitProfiles: WORK_PERMIT_PROFILES.length,
        sessions: state.sessions.size,
        interactions: state.interactions.size,
        queueItems: state.queue.length,
        credentialRefs: state.credentialRefs.length,
        events: state.events.length,
      },
      connectors: connectorSummaries(config),
      upstreams: UPSTREAMS.map((upstream) => ({
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
        maxItems: 20,
        maxQueueItems: 200,
        supportsLongChains: true,
      },
      presentation: {
        hostOwned: true,
        controls: widgetControls(),
        eventStream: "mousecat.visualize(stream=events)",
      },
    };
  }

  function ask(args = {}) {
    const legacyId = nextId("q", state.events.length);
    const source = String(args.source || args.skillRef || "mousecat.ask");
    const sessionId = args.sessionId || null;
    const interactionId = args.interactionId || legacyId;
    const rawItems = Array.isArray(args.items) && args.items.length > 0
      ? args.items
      : [{
        id: args.itemId || "item-1",
        prompt: args.prompt,
        shape: args.shape,
        options: args.options,
        recommendedDefault: args.recommendedDefault,
      }];
    const items = rawItems.map((item, index) => normalizeInteractionItem(item, {
      id: `item-${index + 1}`,
      prompt: args.prompt,
      shape: args.shape,
      options: args.options,
    }));
    const status = items.some((item) => item.status === "open") ? "open" : "answered";
    const interaction = {
      id: legacyId,
      interactionId,
      sessionId,
      parentInteractionId: args.parentInteractionId || null,
      source,
      title: args.title || null,
      status,
      items,
      constraints: publicConstraintSummary(args.constraints || {}),
      skillRef: args.skillRef || null,
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

  function widget(args = {}) {
    const action = args.action || "available";
    if (action === "available") {
      const availability = widgetAvailability();
      emit("widget.available", { status: availability.status });
      return availability;
    }

    if (action === "ask") {
      const request = args.request && typeof args.request === "object" ? args.request : args;
      const interactionResult = ask(request);
      emit("widget.requested", {
        interactionId: interactionResult.interaction.interactionId,
        source: interactionResult.interaction.source,
        itemCount: interactionResult.interaction.items.length,
      });
      return {
        schema: "mousecat.operator-widget.request/1",
        available: true,
        contract: OPERATOR_WIDGET_CONTRACT,
        interaction: interactionResult.interaction,
        controls: widgetControls(),
      };
    }

    if (action === "respond" || action === "hold") {
      const interactionId = args.interactionId || args.request?.interactionId;
      const interaction = state.interactions.get(interactionId);
      if (!interaction) {
        return {
          schema: "mousecat.operator-widget.result/1",
          interactionId: interactionId || null,
          status: "unavailable",
          responses: [],
          reason: "unknown-interaction",
        };
      }
      const rawResponses = Array.isArray(args.responses) && args.responses.length > 0
        ? args.responses
        : [{ ...(args.response || {}), itemId: args.itemId }];
      const responses = rawResponses.map((raw, index) => {
        const item = interaction.items.find((candidate) => candidate.id === raw.itemId) || interaction.items[index] || interaction.items[0];
        if (!item) return null;
        item.status = action === "hold" || raw.status === "held" ? "held" : "answered";
        item.response = responsePayloadFor(item, raw);
        item.updatedAt = nowIso();
        return item.response;
      }).filter(Boolean);
      interaction.status = responses.some((response) => response.status === "held") ? "held" : "answered";
      interaction.updatedAt = nowIso();
      emit(action === "hold" ? "widget.held" : "widget.answered", {
        interactionId,
        status: interaction.status,
        responseCount: responses.length,
      });
      return {
        schema: "mousecat.operator-widget.result/1",
        interactionId,
        status: interaction.status === "held" ? "held" : "answered",
        responses,
      };
    }

    if (action === "snapshot") {
      return {
        schema: "mousecat.widget.snapshot/1",
        availability: widgetAvailability(),
        interactions: [...state.interactions.values()].map((interaction) => clone(interaction)),
        queue: clone(state.queue),
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
        facts: args.facts && typeof args.facts === "object" ? clone(args.facts) : {},
      };
      state.sessions.set(id, record);
      emit("session.started", { sessionId: id });
      return { schema: "mousecat.session/1", action, session: record };
    }

    const snapshot = {
      sessions: [...state.sessions.values()],
      interactions: [...state.interactions.values()].map((interaction) => clone(interaction)),
      queue: clone(state.queue),
      openThreads: state.queue.filter((item) => item.status !== "answered" && item.status !== "ratified"),
      recentEvents: state.events.slice(-20).map(publicEvent),
    };

    if (action === "total-recall") {
      emit("session.total-recall", { openThreads: snapshot.openThreads.length });
      return {
        schema: "mousecat.total-recall/1",
        currentState: status(),
        openThreads: snapshot.openThreads,
        driftSensitiveFacts: [
          "upstream adapter availability",
          "host credential references",
          "local config enablement",
          "open decision queue",
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
        nextMove: "Render open questions through mousecat.ask or mousecat.queue before invoking upstream tools.",
      };
    }

    return { schema: "mousecat.session/1", action: "snapshot", snapshot };
  }

  function queue(args = {}) {
    const action = args.action || "list";
    if (action === "enqueue") {
      const rawItems = Array.isArray(args.items) && args.items.length > 0 ? args.items : [args.item || args];
      const enqueued = rawItems.map((raw, index) => {
        const normalized = normalizeInteractionItem(raw, {
          id: raw?.id || nextId("dq", state.queue.length + index),
          prompt: raw?.prompt || args.prompt,
          shape: raw?.shape || args.shape || "queue",
          options: raw?.options || args.options,
        });
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

  function visualize(args = {}) {
    const limit = Number.isInteger(args.limit) ? Math.max(1, args.limit) : 25;
    const stream = args.stream || "snapshot";
    emit("visualize.snapshot", { includeEvents: args.includeEvents === true, stream });
    const interactions = [...state.interactions.values()].map((interaction) => clone(interaction));
    const events = state.events.slice(-limit).map(publicEvent);
    return {
      schema: "mousecat.visualizer/1",
      stream,
      buttons: skillButtons(),
      widget: {
        availability: widgetAvailability(),
        controls: widgetControls(),
      },
      skillFrameworks: SKILL_FRAMEWORKS,
      workPermitProfiles: WORK_PERMIT_PROFILES,
      toolBoundaries: TOOL_BOUNDARIES,
      connectors: connectorSummaries(config),
      interactions,
      interactionSessions: [...new Set(interactions.map((interaction) => interaction.sessionId).filter(Boolean))].map((sessionId) => ({
        sessionId,
        interactions: interactions
          .filter((interaction) => interaction.sessionId === sessionId)
          .map((interaction) => summarizeInteraction(interaction)),
      })),
      queue: clone(state.queue),
      upstreams: status().upstreams,
      credentialRefs: clone(state.credentialRefs),
      events: args.includeEvents ? events : [],
      eventStream: state.events.slice(-limit).map(visualizerEvent),
      liveGraph: {
        nodes: [
          ...UPSTREAMS.map((upstream) => ({ id: `upstream:${upstream.id}`, kind: "upstream", label: upstream.label })),
          ...interactions.map((interaction) => ({ id: `interaction:${interaction.interactionId}`, kind: "interaction", label: interaction.title || interaction.source, status: interaction.status })),
          ...state.queue.map((item) => ({ id: `queue:${item.id}`, kind: "queue-item", label: item.prompt, status: item.status })),
        ],
        edges: state.queue
          .filter((item) => item.interactionId)
          .map((item) => ({ from: `interaction:${item.interactionId}`, to: `queue:${item.id}`, kind: "contains" })),
      },
    };
  }

  function route(args = {}) {
    const upstream = getUpstream(args.upstream);
    if (!upstream) {
      return { schema: "mousecat.route/1", ok: false, code: "unknown-upstream", upstream: args.upstream };
    }
    const enabled = isUpstreamEnabled(upstream.id);
    const connector = routeConnectorPlan(config, upstream.id, args.capability || null);
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
    emit("route.planned", { upstream: upstream.id, capability: plan.capability, enabled });
    return { schema: "mousecat.route/1", ok: true, plan };
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
    if (routeResult.plan.connector?.configured && routeResult.plan.connector?.enabled) {
      const toolName = args.capability;
      if (!toolName || toolName === "tools/list") {
        return discoverConnectorTools(config, args.upstream).then((discovered) => {
          emit(discovered.ok ? "connector.discovered" : "connector.blocked", {
            upstream: args.upstream,
            reason: discovered.ok ? "tools-list" : discovered.code,
          });
          return {
            schema: "mousecat.invoke/1",
            ok: discovered.ok,
            code: discovered.ok ? "connector-tools-listed" : discovered.code,
            route: routeResult.plan,
            connector: discovered.connector,
            result: discovered,
          };
        });
      }

      return invokeConnectorTool(config, args.upstream, toolName, args.payload || {}).then((invoked) => {
        emit(invoked.ok ? "connector.invoked" : "connector.blocked", {
          upstream: args.upstream,
          capability: toolName,
          reason: invoked.ok ? "forwarded" : invoked.code,
        });
        return {
          schema: "mousecat.invoke/1",
          ok: invoked.ok,
          code: invoked.ok ? "connector-forwarded" : invoked.code,
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
      const upstream = getUpstream(args.upstream);
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

  function handleTool(name, args = {}) {
    switch (name) {
      case "mousecat.widget":
        return widget(args);
      case "mousecat.ask":
        return ask(args);
      case "mousecat.session":
        return session(args);
      case "mousecat.queue":
        return queue(args);
      case "mousecat.visualize":
        return visualize(args);
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

  return {
    catalog: catalogSnapshot,
    state,
    emit,
    handleTool,
    status,
  };
}
