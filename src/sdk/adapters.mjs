import { adapterProfiles } from "../core/catalog.mjs";

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

export function referenceHostAdapters() {
  return adapterProfiles().map((profile) => Object.freeze({
    id: profile.id,
    label: profile.label,
    host: profile.id,
    provider: profile.provider,
    hostKind: profile.hostKind,
    transport: "streamable-http",
  }));
}

export function resolveReferenceHostAdapter(profileId, overrides = {}) {
  const id = requiredString(profileId || "generic-mcp", "profileId");
  const known = adapterProfiles().find((profile) => profile.id === id);
  return Object.freeze({
    schema: "mousecat.sdk-host-adapter/1",
    profileId: id,
    label: known?.label || id,
    hostKind: known?.hostKind || "custom-mcp-host",
    host: overrides.host || id,
    provider: overrides.provider === undefined ? known?.provider ?? null : overrides.provider,
    transport: overrides.transport || "streamable-http",
    ...(overrides.model ? { model: overrides.model } : {}),
  });
}

export function readContextualContinuation(result) {
  const invocation = result?.schema === "mousecat.framework-handoff/1" ? result.result : result;
  const framework = invocation?.continuation?.framework;
  if (!framework?.resultRef || !framework?.resultToken || !framework?.frameworkRef) {
    throw new TypeError("A terminal Mousecat skill result with a contextual continuation is required");
  }
  return {
    schema: "mousecat.sdk-contextual-continuation/1",
    previousSkillRef: invocation.skillRef,
    previousResultRef: framework.resultRef,
    previousResultToken: framework.resultToken,
    frameworkRef: framework.frameworkRef,
    availableSkillRefs: [...(framework.availableSkillRefs || [])],
    fixedNextSkill: framework.fixedNextSkill ?? null,
  };
}

export function createMousecatHostAdapter(client, options = {}) {
  if (!client || typeof client.callTool !== "function") throw new TypeError("A Mousecat client is required");
  const descriptor = resolveReferenceHostAdapter(options.profileId, options);
  const sessionId = requiredString(options.sessionId, "sessionId");
  const sourceDefaults = Object.freeze({
    host: descriptor.host,
    sessionId,
    ...(options.threadId ? { threadId: options.threadId } : {}),
  });

  return Object.freeze({
    descriptor,
    sessionId,
    heartbeat(facts = {}, callOptions = {}) {
      return client.heartbeat(sessionId, {
        ...facts,
        host: descriptor.host,
        provider: descriptor.provider,
        transport: descriptor.transport,
        ...(descriptor.model ? { model: descriptor.model } : {}),
        ...(options.threadId ? { threadId: options.threadId } : {}),
      }, callOptions);
    },
    registerFramework(registration, callOptions = {}) {
      return client.registerFramework(registration, callOptions);
    },
    registerProjectAdapter(registration, callOptions = {}) {
      return client.registerProjectAdapter(registration, callOptions);
    },
    openProjectWorkbench(request, callOptions = {}) {
      return client.openProjectWorkbench({
        ...request,
        hostSessionRef: request?.hostSessionRef || `${descriptor.host}:${sessionId}`,
      }, callOptions);
    },
    snapshotProjectWorkbench(workbench, callOptions = {}) {
      return client.snapshotProjectWorkbench(workbench, callOptions);
    },
    operateProjectWorkbench(workbench, operation, callOptions = {}) {
      return client.operateProjectWorkbench(workbench, operation, callOptions);
    },
    closeProjectWorkbench(workbench, callOptions = {}) {
      return client.closeProjectWorkbench(workbench, callOptions);
    },
    invokeSkill(invocation, callOptions = {}) {
      const invocationId = requiredString(invocation?.invocationId || invocation?.source?.invocationId, "invocationId");
      return client.invokeSkill({
        ...invocation,
        source: { ...invocation.source, ...sourceDefaults, invocationId },
      }, callOptions);
    },
    awaitSkill(invocationOrContinuation, callOptions = {}) {
      return client.awaitSkill(invocationOrContinuation, callOptions);
    },
    handoffSkill(previousResult, next, callOptions = {}) {
      const continuation = readContextualContinuation(previousResult);
      const invocationId = requiredString(next?.invocationId || next?.source?.invocationId, "invocationId");
      return client.handoffSkill({
        ...next,
        previousSkillRef: continuation.previousSkillRef,
        previousResultRef: continuation.previousResultRef,
        previousResultToken: continuation.previousResultToken,
        frameworkRef: continuation.frameworkRef,
        skillRef: requiredString(next?.skillRef, "skillRef"),
        route: {
          selectedBy: next?.route?.selectedBy || descriptor.host,
          reason: requiredString(next?.route?.reason, "route.reason"),
          ...(next?.route?.contextRef ? { contextRef: next.route.contextRef } : {}),
        },
        source: { ...next.source, ...sourceDefaults, invocationId },
      }, callOptions);
    },
    closeSession(callOptions = {}) {
      return client.callTool("mousecat.session", { action: "close", sessionId }, callOptions);
    },
  });
}
