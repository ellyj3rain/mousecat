import { createHash } from "node:crypto";

import { normalizeMlReview } from "./ml-review.mjs";

const SKILL_ALIASES = Object.freeze({
  crucible: "crucible",
  "crucible.point": "crucible",
  "crucible.architecture": "crucible",
  "crucible.tree": "crucible",
  "crucible.continuum": "crucible",
  "total-recall": "total-recall",
  "total-recall.docket": "total-recall",
  total_recall: "total-recall",
  "mass-assault": "mass-assault",
  "mass-assault.queue": "mass-assault",
  mass_assault: "mass-assault",
});

const PUBLIC_SHAPES = new Set([
  "decision",
  "parameter",
  "ratification",
  "queue",
  "review",
  "freeform",
  "ranking",
  "checklist",
]);

const SHAPE_ALIASES = Object.freeze({
  point: "decision",
  architecture: "decision",
  tree: "queue",
  batch: "queue",
  continuum: "parameter",
});

function error(code, details = {}) {
  return { schema: "mousecat.error/1", ok: false, code, ...details };
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

export function continuationTokenHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizedTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf()) ? null : timestamp.toISOString();
}

function normalizedShape(raw = {}) {
  const requested = optionalString(raw.shape || raw.form) || "decision";
  return SHAPE_ALIASES[requested] || (PUBLIC_SHAPES.has(requested) ? requested : "decision");
}

function normalizedOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];
  const options = rawOptions.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { label: String(raw ?? `Option ${index + 1}`), value: raw ?? index + 1, description: null };
    }
    const label = String(raw.label ?? raw.value ?? `Option ${index + 1}`);
    const recommended = raw.recommended === true || /\(recommended\)/iu.test(label);
    return {
      label: recommended && !/\(recommended\)/iu.test(label) ? `${label} (Recommended)` : label,
      value: raw.value ?? raw.label ?? index + 1,
      description: optionalString(raw.description),
      recommended,
    };
  });
  return options
    .map((option, index) => ({ option, index }))
    .sort((left, right) => Number(right.option.recommended) - Number(left.option.recommended) || left.index - right.index)
    .map(({ option }) => {
      const { recommended: _recommended, ...publicOption } = option;
      return publicOption;
    });
}

function parameterMetadata(raw = {}) {
  const metadata = objectValue(raw.metadata);
  const parameter = objectValue(raw.parameter);
  return Object.fromEntries(
    ["min", "max", "step", "default", "unit"]
      .filter((key) => parameter[key] !== undefined || metadata[key] !== undefined)
      .map((key) => [key, parameter[key] ?? metadata[key]]),
  );
}

function sourceRecord(args = {}) {
  const raw = typeof args.source === "string" ? { host: args.source } : objectValue(args.source);
  return {
    host: optionalString(raw.host || args.host),
    sessionId: optionalString(raw.sessionId || args.sessionId),
    invocationId: optionalString(raw.invocationId || args.invocationId),
  };
}

function hasTranscriptPayload(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => hasTranscriptPayload(entry, seen));
  return Object.entries(value).some(([key, nested]) => (
    key === "transcript"
    || key === "messages"
    || hasTranscriptPayload(nested, seen)
  ));
}

function collectSeams(args, source) {
  const intake = objectValue(args.intake);
  if (hasTranscriptPayload(intake)) return error("raw-session-transcript-not-accepted");

  const collected = [];
  const sessions = Array.isArray(intake.sessions) ? intake.sessions : [];
  for (const [sessionIndex, rawSession] of sessions.entries()) {
    const session = objectValue(rawSession);
    if (hasTranscriptPayload(session)) return error("raw-session-transcript-not-accepted");
    const sessionId = optionalString(session.sessionId || session.id || source.sessionId);
    const sessionHost = optionalString(session.host) || source.host;
    const seams = Array.isArray(session.seams) ? session.seams : [];
    for (const [sessionOrder, seam] of seams.entries()) {
      if (hasTranscriptPayload(seam)) return error("raw-session-transcript-not-accepted");
      collected.push({
        raw: objectValue(seam),
        host: sessionHost,
        sessionId,
        sessionIndex,
        sessionOrder,
        inputIndex: collected.length,
      });
    }
  }

  const direct = [
    ...(Array.isArray(intake.seams) ? intake.seams : []),
  ];
  if (direct.length === 0 && optionalString(args.prompt)) direct.push({ prompt: args.prompt, shape: args.form });
  for (const [sessionOrder, seam] of direct.entries()) {
    if (hasTranscriptPayload(seam)) return error("raw-session-transcript-not-accepted");
    collected.push({
      raw: objectValue(seam),
      host: source.host,
      sessionId: source.sessionId,
      sessionIndex: sessions.length,
      sessionOrder,
      inputIndex: collected.length,
    });
  }
  return collected;
}

function orderSeams(collected) {
  const prepared = collected.map((entry) => ({
    ...entry,
    occurredAt: normalizedTimestamp(entry.raw.occurredAt || entry.raw.createdAt),
    ordinal: Number.isInteger(entry.raw.order) ? entry.raw.order : Number.isInteger(entry.raw.ordinal) ? entry.raw.ordinal : null,
  }));
  let mode = "input";
  if (prepared.length > 1 && prepared.every((entry) => entry.occurredAt)) mode = "occurred-at";
  else if (prepared.length > 1 && prepared.every((entry) => entry.ordinal !== null)) mode = "ordinal";
  if (mode === "input" && prepared.length > 1) {
    return error("incomplete-skill-chronology", {
      seamCount: prepared.length,
      requirement: "supply occurredAt for every seam or order for every seam",
    });
  }
  if (mode === "input") return { mode, entries: prepared };
  const chronology = prepared.map((entry) => mode === "occurred-at" ? entry.occurredAt : entry.ordinal);
  if (new Set(chronology).size !== chronology.length) {
    return error("ambiguous-skill-chronology", {
      basis: mode,
      requirement: "chronology values must be unique; use explicit order when timestamps tie",
    });
  }
  const entries = [...prepared].sort((left, right) => {
    const comparison = mode === "occurred-at"
      ? left.occurredAt.localeCompare(right.occurredAt)
      : left.ordinal - right.ordinal;
    return comparison || left.inputIndex - right.inputIndex;
  });
  return { mode, entries };
}

function normalizeSeam(entry, skillRef, sequence) {
  const raw = entry.raw;
  const prompt = optionalString(raw.prompt || raw.question);
  if (!prompt) return error("skill-seam-prompt-required", { seamIndex: entry.inputIndex });
  const threadId = optionalString(raw.threadId || raw.id);
  if (!threadId) return error("skill-seam-id-required", { seamIndex: entry.inputIndex });
  const itemId = optionalString(raw.itemId) || `seam-${stableHash([
    skillRef,
    entry.host,
    entry.sessionId,
    threadId,
  ])}`;
  const mlReview = normalizeMlReview(raw.mlReview);
  if (!mlReview.ok) return error(mlReview.code, {
    seamIndex: entry.inputIndex,
    field: mlReview.field,
    reason: mlReview.reason,
  });
  const lineage = {
    host: entry.host,
    sessionId: entry.sessionId,
    threadId,
    parentThreadId: optionalString(raw.parentThreadId),
    evidenceRef: optionalString(raw.evidenceRef || raw.evidence),
    originInteractionId: optionalString(raw.originInteractionId),
    originItemId: optionalString(raw.originItemId),
    delegationId: optionalString(raw.delegationId),
    delegationAttempt: Number.isInteger(raw.delegationAttempt) ? raw.delegationAttempt : null,
    occurredAt: entry.occurredAt,
    ordinal: entry.ordinal,
    sourceIndex: entry.inputIndex,
    sequence,
  };
  return {
    id: itemId,
    shape: normalizedShape(raw),
    prompt,
    title: optionalString(raw.title || raw.header),
    options: normalizedOptions(raw.options),
    required: raw.required !== false,
    sensitive: raw.sensitive === true,
    recommendedDefault: raw.recommendedDefault ?? null,
    selectionMode: raw.selectionMode === "multiple" || raw.multiple === true ? "multiple" : "single",
    allowFreeform: raw.allowFreeform !== false,
    description: optionalString(raw.description),
    mlReview: mlReview.value,
    metadata: {
      ...parameterMetadata(raw),
      lineage,
    },
  };
}

function canonicalSkillRef(value, descriptor = null) {
  const normalized = optionalString(value)?.toLowerCase().replaceAll(" ", "-");
  if (!normalized) return null;
  if (descriptor?.id === normalized || descriptor?.moduleRefs?.includes(normalized)) return descriptor.id;
  return SKILL_ALIASES[normalized] || null;
}

export function compileSkillInvocation(args = {}, options = {}) {
  const descriptor = options.descriptor || null;
  const skillRef = canonicalSkillRef(args.skillRef || args.skill, descriptor);
  if (!skillRef) return error("unsupported-skill-ref", { supportedSkillRefs: options.availableSkillRefs || ["crucible", "total-recall", "mass-assault"] });
  const source = sourceRecord(args);
  if (!source.host) return error("skill-source-host-required");
  if (!source.invocationId) return error("skill-invocation-id-required");
  if (skillRef === "total-recall") {
    if (hasTranscriptPayload(args.intake)) return error("raw-session-transcript-not-accepted");
    const fingerprint = stableHash({ skillRef, source });
    return {
      schema: "mousecat.skill-invocation.compiled/2",
      ok: true,
      mode: "recall",
      skillRef,
      intake: {
        schema: "mousecat.skill-intake/2",
        skillRef,
        source,
        sessionIds: source.sessionId ? [source.sessionId] : [],
        seamCount: 0,
        ordering: "runtime-chronology",
        fingerprint,
        rawTranscriptAccepted: false,
        returnExpectation: "chronological-open-seam-map",
        frameworkRef: options.frameworkRef || "recursive-deliberation",
        availableSkillRefs: options.availableSkillRefs || ["crucible", "total-recall", "mass-assault"],
      },
    };
  }
  const collected = collectSeams(args, source);
  if (!Array.isArray(collected)) return collected;
  if (collected.length === 0) return error("skill-intake-seam-required", { skillRef });
  if ((skillRef === "crucible" || descriptor?.intakeMode === "single-seam") && collected.length !== 1) {
    return error(skillRef === "crucible" ? "crucible-requires-one-seam" : "skill-requires-one-seam", {
      skillRef,
      seamCount: collected.length,
    });
  }

  const ordered = orderSeams(collected);
  if (ordered.schema === "mousecat.error/1") return ordered;
  const items = ordered.entries.map((entry, index) => normalizeSeam(entry, skillRef, index + 1));
  const invalid = items.find((item) => item.schema === "mousecat.error/1");
  if (invalid) return invalid;
  if (new Set(items.map((item) => item.id)).size !== items.length) return error("duplicate-skill-seam-id");

  const sessionIds = [...new Set(items.map((item) => item.metadata.lineage.sessionId).filter(Boolean))];
  const projectRef = optionalString(args.projectRef);
  if (args.projectRef !== undefined && (!projectRef || projectRef.length > 512)) return error("skill-project-ref-invalid");
  const fingerprint = stableHash({ skillRef, items, ...(projectRef ? { projectRef } : {}) });
  const interactionId = optionalString(args.interactionId)
    || (source.invocationId ? `skill-${stableHash([skillRef, source.host, source.sessionId, source.invocationId])}` : undefined);
  const intake = {
    schema: "mousecat.skill-intake/2",
    skillRef,
    source,
    sessionIds,
    seamCount: items.length,
    ordering: ordered.mode,
    fingerprint,
    rawTranscriptAccepted: false,
    returnExpectation: "typed-responses-with-lineage",
    frameworkRef: options.frameworkRef || descriptor?.frameworkRefs?.[0] || "recursive-deliberation",
    availableSkillRefs: options.availableSkillRefs || ["crucible", "total-recall", "mass-assault"],
  };
  return {
    schema: "mousecat.skill-invocation.compiled/2",
    ok: true,
    skillRef,
    intake,
    request: {
      source: `${source.host}.${skillRef}`,
      sessionId: source.sessionId || (sessionIds.length === 1 ? sessionIds[0] : null),
      ...(interactionId ? { interactionId } : {}),
      parentInteractionId: optionalString(args.parentInteractionId),
      title: optionalString(args.title) || descriptor?.label || (skillRef === "crucible" ? "Crucible" : "Mass Assault"),
      skillRef,
      items,
      ...(projectRef ? { projectRef } : {}),
      constraints: {
        recommendationFirst: true,
        allowFreeform: true,
        ...objectValue(args.constraints),
      },
      invocation: intake,
    },
  };
}

function responseLineage(item) {
  const lineage = objectValue(item?.metadata?.lineage);
  if (item?.sensitive !== true) return lineage;
  return {
    host: lineage.host || null,
    sessionId: lineage.sessionId || null,
    threadId: lineage.threadId || item.id || null,
    sequence: lineage.sequence || null,
  };
}

export function skillInvocationEnvelope(action, interaction, result, options = {}) {
  const intake = objectValue(interaction?.invocation);
  const { continuationHash: _continuationHash, ...publicIntake } = intake;
  const skillRef = optionalString(intake.skillRef || interaction?.skillRef);
  const status = result?.status || "unavailable";
  const responses = Array.isArray(result?.responses)
    ? result.responses.map((response) => {
      const item = interaction?.items?.find((candidate) => candidate.id === response.itemId);
      return { ...response, lineage: responseLineage(item) };
    })
    : [];
  const continuation = status === "pending"
    ? {
      obligation: "await-operator",
      tool: "mousecat.skill",
      arguments: {
        action: "await",
        interactionId: result?.interactionId || interaction?.interactionId,
        continuationToken: options.continuationToken || null,
        waitMs: 30000,
      },
    }
    : ["answered", "held"].includes(status)
      ? {
        obligation: "route-framework-context",
        recurse: true,
        framework: {
          frameworkRef: optionalString(intake.frameworkRef) || "recursive-deliberation",
          routing: "contextual-capability-routing",
          previousSkillRef: skillRef,
          availableSkillRefs: Array.isArray(intake.availableSkillRefs)
            ? intake.availableSkillRefs
            : ["crucible", "total-recall", "mass-assault"],
          fixedNextSkill: null,
        },
      }
      : null;
  return {
    schema: "mousecat.skill-invocation/2",
    action,
    skillRef,
    interactionId: result?.interactionId || interaction?.interactionId || null,
    status,
    idempotentReplay: options.idempotentReplay === true,
    intake: Object.keys(publicIntake).length > 0 ? publicIntake : null,
    items: Array.isArray(interaction?.items)
      ? interaction.items.map((item) => ({ id: item.id, shape: item.shape, lineage: responseLineage(item) }))
      : [],
    responses,
    progress: result?.progress || null,
    reason: result?.reason || null,
    continuation,
  };
}
