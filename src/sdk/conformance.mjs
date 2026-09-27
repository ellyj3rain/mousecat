import { createMousecatHostAdapter, readContextualContinuation } from "./adapters.mjs";

export const MOUSECAT_HOST_CONFORMANCE_SCHEMA = "mousecat.sdk-host-conformance/1";

export const HOST_CONFORMANCE_REQUIREMENTS = Object.freeze([
  "transport-session",
  "runtime-status",
  "bound-host-identity",
  "operator-decision-round-trip",
  "contextual-continuation",
  "provider-discovery-when-configured",
  "provider-read-when-configured",
  "host-session-closure",
]);

export class MousecatConformanceError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "MousecatConformanceError";
    this.code = code;
    Object.assign(this, details);
  }
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new MousecatConformanceError("conformance-field-required", { field });
  return value.trim();
}

function assertConformance(condition, code, details = {}) {
  if (!condition) throw new MousecatConformanceError(code, details);
}

function boundedInteger(value, fallback, minimum, maximum) {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(minimum, Math.min(value, maximum));
}

function referencedDeadline(timeoutMs, code = "conformance-lifecycle-timeout") {
  const controller = new AbortController();
  let elapsed = false;
  const timer = setTimeout(() => {
    elapsed = true;
    controller.abort(new MousecatConformanceError(code));
  }, timeoutMs);
  return {
    signal: controller.signal,
    elapsed: () => elapsed,
    dispose: () => clearTimeout(timer),
  };
}

function decisionSeam(options) {
  return {
    id: options.threadId || `${options.profileId}-conformance-decision`,
    prompt: options.prompt || `Confirm the ${options.profileId} reference host completed the Mousecat decision round trip.`,
    shape: "decision",
    selectionMode: "single",
    allowFreeform: true,
    options: [
      {
        label: "Observed (Recommended)",
        value: "observed",
        description: "The decision appeared in Mousecat and is correctly attributed to this host session.",
      },
      {
        label: "Report mismatch",
        value: "mismatch",
        description: "The surface, attribution, or return path did not match the conformance contract.",
      },
    ],
  };
}

async function awaitTerminal(adapter, invocation, options) {
  const timeoutMs = boundedInteger(options.timeoutMs, 300000, 1000, 900000);
  const pollWaitMs = boundedInteger(options.pollWaitMs, 30000, 250, 30000);
  const deadline = Date.now() + timeoutMs;
  let result = invocation;
  while (result?.status === "pending" && Date.now() < deadline) {
    result = await adapter.awaitSkill(invocation, {
      waitMs: Math.min(pollWaitMs, Math.max(1, deadline - Date.now())),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  }
  if (result?.status === "pending") {
    throw new MousecatConformanceError("conformance-decision-timeout", { interactionId: invocation.interactionId });
  }
  return result;
}

async function runIntegrationProbe(client, probe, callOptions = {}) {
  if (!probe) return null;
  const upstream = requiredString(probe.upstream, "integration.upstream");
  const capability = requiredString(probe.capability, "integration.capability");
  const permit = probe.permit;
  assertConformance(
    permit && typeof permit === "object" && permit.profileId === "tool-invocation",
    "conformance-provider-permit-required",
    { upstream, capability },
  );
  const listed = await client.callTool("mousecat.invoke", {
    upstream,
    capability: "tools/list",
    permit,
  }, callOptions);
  assertConformance(
    listed.connector?.integrationOwned === true && listed.result?.connector?.integrationOwned === true,
    "conformance-provider-not-integration-owned",
    { upstream, capability },
  );
  const tools = listed.result?.tools || [];
  const discovered = tools.find((tool) => tool.name === capability);
  assertConformance(
    Boolean(discovered),
    "conformance-provider-capability-missing",
    { upstream, capability },
  );
  assertConformance(
    discovered.annotations?.readOnlyHint === true,
    "conformance-provider-capability-not-read-only",
    { upstream, capability },
  );
  const invoked = await client.callTool("mousecat.invoke", {
    upstream,
    capability,
    payload: probe.payload || {},
    permit,
  }, callOptions);
  assertConformance(
    invoked.ok === true && invoked.result?.access === "read",
    "conformance-provider-invocation-failed",
    { upstream, capability },
  );
  return {
    upstream,
    capability,
    discoveredCapabilities: tools.length,
    adapterRef: invoked.result?.adapterRef || null,
    access: invoked.result?.access || null,
  };
}

export async function runMousecatHostConformance(client, options = {}) {
  if (!client || typeof client.callTool !== "function" || typeof client.initialize !== "function") {
    throw new TypeError("A Mousecat SDK client is required");
  }
  const profileId = requiredString(options.profileId, "profileId");
  const sessionId = requiredString(options.sessionId, "sessionId");
  const invocationId = requiredString(options.invocationId || `${sessionId}-crucible`, "invocationId");
  const timeoutMs = boundedInteger(options.timeoutMs, 300000, 1000, 900000);
  const callerSignal = options.callOptions?.signal || options.signal;
  const lifecycleDeadline = referencedDeadline(timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, lifecycleDeadline.signal]) : lifecycleDeadline.signal;
  const adapter = createMousecatHostAdapter(client, {
    profileId,
    sessionId,
    ...(options.threadId ? { threadId: options.threadId } : {}),
    ...(options.host ? { host: options.host } : {}),
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.model ? { model: options.model } : {}),
  });

  const callOptions = { ...(options.callOptions || {}), signal };
  let hostSessionStarted = false;
  let hostSessionClosed = false;
  let result;
  let failure;
  try {
    const transport = await client.initialize(callOptions);
    assertConformance(Boolean(transport.sessionId), "conformance-transport-session-missing");
    const status = await client.callTool("mousecat.status", {}, callOptions);
    assertConformance(status.ok === true, "conformance-runtime-unhealthy");
    hostSessionStarted = true;
    const heartbeat = await adapter.heartbeat({
      objective: options.objective || "Mousecat SDK host conformance",
      conformanceSchema: MOUSECAT_HOST_CONFORMANCE_SCHEMA,
    }, callOptions);
    assertConformance(heartbeat.session?.facts?.host === adapter.descriptor.host, "conformance-host-identity-mismatch");
    assertConformance(heartbeat.session?.id === sessionId, "conformance-session-identity-mismatch");

    const integration = await runIntegrationProbe(client, options.integration, callOptions);
    const invocation = await adapter.invokeSkill({
      skillRef: "crucible",
      invocationId,
      intake: { seams: [decisionSeam({ ...options, profileId })] },
    }, callOptions);
    assertConformance(invocation.status === "pending", "conformance-decision-not-pending");
    assertConformance(invocation.intake?.source?.host === adapter.descriptor.host, "conformance-invocation-host-mismatch");
    assertConformance(invocation.intake?.source?.sessionId === sessionId, "conformance-invocation-session-mismatch");

    const terminal = await awaitTerminal(adapter, invocation, { ...options, timeoutMs, signal });
    assertConformance(terminal.status === "answered", "conformance-decision-not-answered", { status: terminal.status });
    const response = terminal.responses?.[0];
    const selected = Array.isArray(response?.value) ? response.value : [response?.value];
    assertConformance(selected.includes("observed"), "conformance-operator-reported-mismatch");
    const continuation = readContextualContinuation(terminal);
    assertConformance(continuation.previousSkillRef === "crucible", "conformance-continuation-skill-mismatch");
    assertConformance(continuation.fixedNextSkill === null, "conformance-fixed-transition-detected");
    result = { terminal, continuation, integration };
  } catch (error) {
    failure = lifecycleDeadline.elapsed() && !callerSignal?.aborted
      ? new MousecatConformanceError("conformance-lifecycle-timeout")
      : error;
  } finally {
    lifecycleDeadline.dispose();
    if (hostSessionStarted) {
      const cleanupDeadline = referencedDeadline(
        boundedInteger(options.cleanupTimeoutMs, 5000, 250, 30000),
        "conformance-host-session-close-timeout",
      );
      try {
        const closed = await adapter.closeSession({ ...(options.callOptions || {}), signal: cleanupDeadline.signal });
        hostSessionClosed = closed.action === "close" && closed.session?.status === "closed";
        if (!hostSessionClosed && !failure) {
          failure = new MousecatConformanceError("conformance-host-session-close-failed");
        }
      } catch (error) {
        if (!failure) failure = error;
        else failure.cleanupFailureCode = error?.code || "conformance-host-session-close-failed";
      } finally {
        cleanupDeadline.dispose();
      }
    }
  }
  if (failure) throw failure;

  const checkedRequirements = HOST_CONFORMANCE_REQUIREMENTS.filter((requirement) => (
    result.integration || !requirement.includes("provider-")
  ));

  return {
    schema: MOUSECAT_HOST_CONFORMANCE_SCHEMA,
    ok: true,
    profileId: adapter.descriptor.profileId,
    host: adapter.descriptor.host,
    provider: adapter.descriptor.provider,
    sessionId,
    interactionId: result.terminal.interactionId,
    decisionStatus: result.terminal.status,
    continuation: {
      frameworkRef: result.continuation.frameworkRef,
      previousSkillRef: result.continuation.previousSkillRef,
      availableSkillRefs: result.continuation.availableSkillRefs,
      fixedNextSkill: result.continuation.fixedNextSkill,
    },
    integration: result.integration,
    hostSessionClosed,
    checkedRequirements,
    skippedRequirements: HOST_CONFORMANCE_REQUIREMENTS.filter((requirement) => !checkedRequirements.includes(requirement)),
  };
}
