import { normalizeScenePreview, SCENE_PREVIEW_JSON_SCHEMA } from "./scene-preview.mjs";

export const ML_REVIEW_SCHEMA_ID = "mousecat.ml-review/1";

const MAX_REVIEW_BYTES = 48 * 1024;
const MAX_FACTS = 12;
const MAX_EFFECTS = 12;
const MAX_LABEL_LENGTH = 96;
const MAX_VALUE_LENGTH = 4096;
const MAX_SUBJECT_LENGTH = 320;
const MAX_EFFECT_LENGTH = 1400;
const MAX_NARRATIVE_LENGTH = 4096;

const FACT_KEYS = new Set(["label", "value"]);
const REVIEW_KEYS = new Set([
  "schema",
  "subject",
  "scenario",
  "systemRole",
  "causalPath",
  "playerImpact",
  "decisionPrecedent",
  "actualInput",
  "proposedLearning",
  "approvalEffects",
  "remainingExclusions",
  "evidence",
  "scenePreview",
]);

export const ML_REVIEW_FACT_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    label: { type: "string", minLength: 1, maxLength: MAX_LABEL_LENGTH },
    value: { type: "string", minLength: 1, maxLength: MAX_VALUE_LENGTH },
  },
  required: ["label", "value"],
  additionalProperties: false,
});

export const ML_REVIEW_JSON_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    schema: { type: "string", enum: [ML_REVIEW_SCHEMA_ID] },
    scenePreview: SCENE_PREVIEW_JSON_SCHEMA,
    subject: { type: "string", minLength: 1, maxLength: MAX_SUBJECT_LENGTH },
    scenario: { type: "string", minLength: 1, maxLength: MAX_NARRATIVE_LENGTH },
    systemRole: { type: "string", minLength: 1, maxLength: MAX_EFFECT_LENGTH },
    causalPath: { type: "array", minItems: 2, maxItems: MAX_FACTS, items: ML_REVIEW_FACT_SCHEMA },
    playerImpact: { type: "string", minLength: 1, maxLength: MAX_EFFECT_LENGTH },
    decisionPrecedent: { type: "string", minLength: 1, maxLength: MAX_EFFECT_LENGTH },
    actualInput: { type: "array", minItems: 1, maxItems: MAX_FACTS, items: ML_REVIEW_FACT_SCHEMA },
    proposedLearning: { type: "array", minItems: 1, maxItems: MAX_FACTS, items: ML_REVIEW_FACT_SCHEMA },
    approvalEffects: { type: "array", minItems: 1, maxItems: MAX_EFFECTS, items: { type: "string", minLength: 1, maxLength: MAX_EFFECT_LENGTH } },
    remainingExclusions: { type: "array", maxItems: MAX_EFFECTS, items: { type: "string", minLength: 1, maxLength: MAX_EFFECT_LENGTH } },
    evidence: { type: "array", minItems: 1, maxItems: MAX_FACTS, items: ML_REVIEW_FACT_SCHEMA },
  },
  required: ["schema", "subject", "scenario", "systemRole", "causalPath", "playerImpact", "decisionPrecedent", "actualInput", "proposedLearning", "approvalEffects", "remainingExclusions", "evidence"],
  additionalProperties: false,
});

function invalid(field, reason) {
  return { ok: false, code: "invalid-ml-review", field, reason };
}

function boundedText(value, maximum) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function exactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function normalizeFacts(value, field, { minimum = 1 } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > MAX_FACTS) {
    return invalid(field, `must contain ${minimum}-${MAX_FACTS} facts`);
  }
  const facts = [];
  for (const [index, fact] of value.entries()) {
    if (!fact || typeof fact !== "object" || Array.isArray(fact) || !exactKeys(fact, FACT_KEYS)) {
      return invalid(`${field}[${index}]`, "must contain only label and value");
    }
    const label = boundedText(fact.label, MAX_LABEL_LENGTH);
    const factValue = boundedText(fact.value, MAX_VALUE_LENGTH);
    if (!label) return invalid(`${field}[${index}].label`, `must be 1-${MAX_LABEL_LENGTH} characters`);
    if (!factValue) return invalid(`${field}[${index}].value`, `must be 1-${MAX_VALUE_LENGTH} characters`);
    facts.push({ label, value: factValue });
  }
  return { ok: true, value: facts };
}

function normalizeEffects(value, field, { allowEmpty = false } = {}) {
  const minimum = allowEmpty ? 0 : 1;
  if (!Array.isArray(value) || value.length < minimum || value.length > MAX_EFFECTS) {
    return invalid(field, `must contain ${minimum}-${MAX_EFFECTS} statements`);
  }
  const statements = [];
  for (const [index, entry] of value.entries()) {
    const statement = boundedText(entry, MAX_EFFECT_LENGTH);
    if (!statement) return invalid(`${field}[${index}]`, `must be 1-${MAX_EFFECT_LENGTH} characters`);
    statements.push(statement);
  }
  return { ok: true, value: statements };
}

export function normalizeMlReview(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("mlReview", "must be an object");
  if (!exactKeys(value, REVIEW_KEYS)) return invalid("mlReview", "contains unsupported fields");
  if (value.schema !== ML_REVIEW_SCHEMA_ID) return invalid("mlReview.schema", `must equal ${ML_REVIEW_SCHEMA_ID}`);
  const scenePreview = normalizeScenePreview(value.scenePreview);
  if (!scenePreview.ok) return scenePreview;
  const subject = boundedText(value.subject, MAX_SUBJECT_LENGTH);
  if (!subject) return invalid("mlReview.subject", `must be 1-${MAX_SUBJECT_LENGTH} characters`);
  const scenario = boundedText(value.scenario, MAX_NARRATIVE_LENGTH);
  if (!scenario) return invalid("mlReview.scenario", `must be 1-${MAX_NARRATIVE_LENGTH} characters`);
  const systemRole = boundedText(value.systemRole, MAX_EFFECT_LENGTH);
  if (!systemRole) return invalid("mlReview.systemRole", `must be 1-${MAX_EFFECT_LENGTH} characters`);
  const causalPath = normalizeFacts(value.causalPath, "mlReview.causalPath", { minimum: 2 });
  if (!causalPath.ok) return causalPath;
  const playerImpact = boundedText(value.playerImpact, MAX_EFFECT_LENGTH);
  if (!playerImpact) return invalid("mlReview.playerImpact", `must be 1-${MAX_EFFECT_LENGTH} characters`);
  const decisionPrecedent = boundedText(value.decisionPrecedent, MAX_EFFECT_LENGTH);
  if (!decisionPrecedent) return invalid("mlReview.decisionPrecedent", `must be 1-${MAX_EFFECT_LENGTH} characters`);

  const actualInput = normalizeFacts(value.actualInput, "mlReview.actualInput");
  if (!actualInput.ok) return actualInput;
  const proposedLearning = normalizeFacts(value.proposedLearning, "mlReview.proposedLearning");
  if (!proposedLearning.ok) return proposedLearning;
  const approvalEffects = normalizeEffects(value.approvalEffects, "mlReview.approvalEffects");
  if (!approvalEffects.ok) return approvalEffects;
  const remainingExclusions = normalizeEffects(value.remainingExclusions, "mlReview.remainingExclusions", { allowEmpty: true });
  if (!remainingExclusions.ok) return remainingExclusions;
  const evidence = normalizeFacts(value.evidence, "mlReview.evidence");
  if (!evidence.ok) return evidence;

  const normalized = {
    schema: ML_REVIEW_SCHEMA_ID,
    ...(scenePreview.value ? { scenePreview: scenePreview.value } : {}),
    subject,
    scenario,
    systemRole,
    causalPath: causalPath.value,
    playerImpact,
    decisionPrecedent,
    actualInput: actualInput.value,
    proposedLearning: proposedLearning.value,
    approvalEffects: approvalEffects.value,
    remainingExclusions: remainingExclusions.value,
    evidence: evidence.value,
  };
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAX_REVIEW_BYTES) {
    return invalid("mlReview", `must not exceed ${MAX_REVIEW_BYTES} bytes`);
  }
  return { ok: true, value: normalized };
}
