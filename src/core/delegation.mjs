import { createHash } from "node:crypto";

const SECRET_FIELD_RE = /(secret|token|password|cookie|privatekey|apikey|authorization|credential|bearer)/u;

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex").slice(0, 16);
}

function error(code, details = {}) {
  return { schema: "mousecat.error/1", ok: false, code, ...details };
}

export function containsConversationPayload(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => containsConversationPayload(entry, seen));
  return Object.entries(value).some(([key, nested]) => (
    normalizedKey(key) === "transcript"
    || normalizedKey(key) === "messages"
    || containsConversationPayload(nested, seen)
  ));
}

export function containsSecretPayload(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => containsSecretPayload(entry, seen));
  return Object.entries(value).some(([key, nested]) => SECRET_FIELD_RE.test(normalizedKey(key)) || containsSecretPayload(nested, seen));
}

function normalizedTimeout(value) {
  if (value === undefined) return 120000;
  return Number.isInteger(value) && value >= 1000 && value <= 300000 ? value : null;
}

export function compileDelegationStart(args = {}, originInteraction) {
  const originInput = objectValue(args.origin);
  const originInteractionId = optionalString(originInput.interactionId || args.originInteractionId);
  const originItemId = optionalString(originInput.itemId || args.originItemId);
  if (!originInteractionId) return error("delegation-origin-interaction-required");
  if (!originItemId) return error("delegation-origin-item-required");
  if (!originInteraction || originInteraction.interactionId !== originInteractionId) {
    return error("unknown-delegation-origin", { interactionId: originInteractionId });
  }
  if (!originInteraction.invocation) return error("delegation-origin-skill-required", { interactionId: originInteractionId });

  const originItem = originInteraction.items?.find((item) => item.id === originItemId);
  if (!originItem) return error("unknown-delegation-origin-item", { interactionId: originInteractionId, itemId: originItemId });
  if (originItem.status !== "held") {
    return error("delegation-origin-item-not-held", { interactionId: originInteractionId, itemId: originItemId, status: originItem.status });
  }

  const lineage = objectValue(originItem.metadata?.lineage);
  const rawSource = objectValue(args.source);
  const source = {
    host: optionalString(rawSource.host),
    sessionId: optionalString(rawSource.sessionId || lineage.sessionId),
    invocationId: optionalString(rawSource.invocationId),
  };
  if (!source.host) return error("delegation-source-host-required");
  if (!source.invocationId) return error("delegation-invocation-id-required");
  if (lineage.host && source.host !== lineage.host) return error("delegation-source-host-mismatch");
  if (lineage.sessionId && source.sessionId !== lineage.sessionId) return error("delegation-source-session-mismatch");

  const rawTarget = objectValue(args.target);
  const target = {
    upstream: optionalString(rawTarget.upstream || args.upstream),
    capability: optionalString(rawTarget.capability || args.capability),
  };
  if (!target.upstream) return error("delegation-upstream-required");
  if (!target.capability) return error("delegation-capability-required");
  const payload = objectValue(args.payload);
  if (containsConversationPayload(payload)) return error("raw-session-transcript-not-accepted");
  if (containsSecretPayload(payload)) return error("delegation-secret-values-not-accepted");
  const timeoutMs = normalizedTimeout(args.timeoutMs);
  if (timeoutMs === null) return error("invalid-delegation-timeout", { minimum: 1000, maximum: 300000 });
  const origin = {
    interactionId: originInteractionId,
    itemId: originItemId,
    threadId: optionalString(lineage.threadId) || originItemId,
    parentThreadId: optionalString(lineage.parentThreadId),
    sequence: Number.isInteger(lineage.sequence) ? lineage.sequence : null,
  };
  const fingerprint = stableHash({ source, origin, target, payload, timeoutMs });
  const delegationId = optionalString(args.delegationId)
    || `delegation-${stableHash([source.host, source.sessionId, source.invocationId, originInteractionId, originItemId])}`;
  const createdAt = new Date().toISOString();
  return {
    schema: "mousecat.delegation.compiled/1",
    ok: true,
    record: {
      id: delegationId,
      delegationId,
      source,
      origin,
      target,
      status: "running",
      upstreamOutcome: "pending",
      fingerprint,
      timeoutMs,
      attempts: 0,
      activeAttempt: 0,
      sensitive: originItem.sensitive === true,
      continuationHash: null,
      resultAvailable: false,
      failure: null,
      cancellation: null,
      rejoin: null,
      reason: null,
      createdAt,
      startedAt: null,
      completedAt: null,
      updatedAt: createdAt,
    },
    payload: canonicalValue(payload),
  };
}

export function publicDelegationSummary(record) {
  const summary = {
    schema: "mousecat.delegation.summary/2",
    delegationId: record?.delegationId || null,
    status: record?.status || "unavailable",
    upstreamOutcome: record?.upstreamOutcome || "unknown",
    attempts: record?.attempts || 0,
    sensitive: record?.sensitive === true,
    resultAvailable: record?.resultAvailable === true,
    reason: record?.reason || null,
    cancellation: clone(record?.cancellation) || null,
    rejoin: clone(record?.rejoin) || null,
    createdAt: record?.createdAt || null,
    startedAt: record?.startedAt || null,
    completedAt: record?.completedAt || null,
    updatedAt: record?.updatedAt || null,
  };
  if (record?.sensitive === true) return summary;
  return {
    ...summary,
    source: clone(record?.source) || null,
    origin: clone(record?.origin) || null,
    target: clone(record?.target) || null,
  };
}

export function delegationEnvelope(action, record, options = {}) {
  const summary = publicDelegationSummary(record);
  let continuation = null;
  if (record?.status === "running") {
    continuation = {
      obligation: "await-delegation",
      tool: "mousecat.delegation",
      arguments: {
        action: "await",
        delegationId: record.delegationId,
        delegationToken: options.delegationToken || null,
        waitMs: 30000,
      },
    };
  } else if (record?.status === "completed" && !record.rejoin) {
    continuation = {
      obligation: "consume-delegation-result",
      recurse: true,
    };
  } else if (record?.status === "completed" && record.rejoin) {
    continuation = {
      obligation: "await-rejoined-interaction",
      tool: "mousecat.delegation",
      arguments: {
        action: "rejoin",
        delegationId: record.delegationId,
        delegationToken: options.delegationToken || null,
      },
      requires: ["original-rejoin-seam", "operator-interaction-permit"],
    };
  } else if (record?.status === "interrupted") {
    continuation = {
      obligation: "retry-delegation",
      tool: "mousecat.delegation",
      arguments: {
        action: "start",
        delegationId: record.delegationId,
        delegationToken: options.delegationToken || null,
        retry: true,
      },
      requires: [
        "original-start-arguments",
        "duplicate-side-effect-acknowledgement",
      ],
    };
  } else if (["failed", "cancelled"].includes(record?.status)) {
    continuation = {
      obligation: "retry-delegation",
      tool: "mousecat.delegation",
      arguments: {
        action: "start",
        delegationId: record.delegationId,
        delegationToken: options.delegationToken || null,
        retry: true,
      },
      requires: ["original-start-arguments"],
    };
  }
  return {
    schema: "mousecat.delegation/2",
    action,
    ...summary,
    idempotentReplay: options.idempotentReplay === true,
    result: options.includeResult === true && record?.status === "completed" ? clone(options.result) || null : null,
    failure: ["failed", "interrupted", "cancelled"].includes(record?.status) ? clone(record.failure) : null,
    continuation: clone(continuation),
  };
}
