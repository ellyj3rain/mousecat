import {
  ATOMIC_SKILLS,
  SKILL_FRAMEWORKS,
  TOOL_BOUNDARIES,
  UPSTREAMS,
  WORK_PERMIT_PROFILES,
  catalogSnapshot,
  getPermitProfile,
  getUpstream,
  skillButtons,
} from "./catalog.mjs";
import { defaultConfig } from "./config.mjs";

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

export function createMousecatRuntime(options = {}) {
  const config = options.config || defaultConfig();
  const state = {
    startedAt: nowIso(),
    sessions: new Map(),
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
        queueItems: state.queue.length,
        credentialRefs: state.credentialRefs.length,
        events: state.events.length,
      },
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

  function ask(args = {}) {
    const question = {
      id: nextId("q", state.events.length),
      prompt: String(args.prompt || ""),
      shape: args.shape || "point",
      skillRef: args.skillRef || null,
      options: Array.isArray(args.options) ? args.options : [],
      buttons: optionButtons(args.options || []),
      skillButtons: skillButtons().filter((buttonSpec) => !args.skillRef || buttonSpec.skillRef === args.skillRef),
      createdAt: nowIso(),
    };
    emit("question.created", { questionId: question.id, shape: question.shape, skillRef: question.skillRef });
    return { schema: "mousecat.question/1", question };
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
      queue: clone(state.queue),
      openThreads: state.queue.filter((item) => item.status !== "answered" && item.status !== "ratified"),
      recentEvents: state.events.slice(-20),
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
        nextMove: "Render open questions through mousecat.ask or mousecat.queue before invoking upstream tools.",
      };
    }

    return { schema: "mousecat.session/1", action: "snapshot", snapshot };
  }

  function queue(args = {}) {
    const action = args.action || "list";
    if (action === "enqueue") {
      const item = {
        id: args.item?.id || nextId("dq", state.queue.length),
        prompt: args.item?.prompt || args.prompt || "Decision required",
        shape: args.item?.shape || args.shape || "point",
        options: Array.isArray(args.item?.options) ? args.item.options : [],
        recommendedDefault: args.item?.recommendedDefault || null,
        source: args.item?.source || "mousecat.queue",
        status: "open",
        createdAt: nowIso(),
      };
      state.queue.push(item);
      emit("queue.enqueued", { itemId: item.id, shape: item.shape });
      return { schema: "mousecat.queue/1", action, item, queueLength: state.queue.length };
    }

    if (action === "answer") {
      const item = state.queue.find((candidate) => candidate.id === args.itemId);
      if (!item) return { schema: "mousecat.queue/1", action, ok: false, error: "unknown-queue-item" };
      item.status = "answered";
      item.answer = args.answer || {};
      item.answeredAt = nowIso();
      emit("queue.answered", { itemId: item.id });
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
    emit("visualize.snapshot", { includeEvents: args.includeEvents === true });
    return {
      schema: "mousecat.visualizer/1",
      buttons: skillButtons(),
      skillFrameworks: SKILL_FRAMEWORKS,
      workPermitProfiles: WORK_PERMIT_PROFILES,
      toolBoundaries: TOOL_BOUNDARIES,
      queue: clone(state.queue),
      upstreams: status().upstreams,
      credentialRefs: clone(state.credentialRefs),
      events: args.includeEvents ? state.events.slice(-limit) : [],
    };
  }

  function route(args = {}) {
    const upstream = getUpstream(args.upstream);
    if (!upstream) {
      return { schema: "mousecat.route/1", ok: false, code: "unknown-upstream", upstream: args.upstream };
    }
    const enabled = isUpstreamEnabled(upstream.id);
    const plan = {
      upstream: upstream.id,
      label: upstream.label,
      capability: args.capability || null,
      intent: args.intent || null,
      enabled,
      adapter: upstream.adapter,
      invocationReady: false,
      reason: enabled ? "descriptor-available-adapter-not-wired" : "upstream-disabled",
      requiredPermit: "tool-invocation",
      credentialPolicy: upstream.policy || "credential-reference-if-required",
    };
    emit("route.planned", { upstream: upstream.id, capability: plan.capability, enabled });
    return { schema: "mousecat.route/1", ok: true, plan };
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
    emit("invoke.blocked", { upstream: args.upstream, reason: "adapter-not-wired" });
    return {
      schema: "mousecat.invoke/1",
      ok: false,
      code: "adapter-not-wired",
      reason: "The route is recognized and permitted, but no live adapter is implemented in A1.",
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
