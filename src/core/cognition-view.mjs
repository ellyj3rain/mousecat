const MODELS = ["ordinary", "associative"];
const ACTIONS = ["food", "water", "inspect", "continue"];

function requireValue(condition) {
  if (!condition) throw Object.assign(new Error("invalid-native-cognition"), { code: "invalid-native-cognition" });
}
function object(value, required, optional = []) {
  requireValue(value && typeof value === "object" && !Array.isArray(value));
  requireValue(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}
function string(value, max, nonempty = false) {
  requireValue(typeof value === "string" && value.length <= max && (!nonempty || value.length > 0) && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value));
}
function integer(value, low = 0, high = Number.MAX_SAFE_INTEGER) { requireValue(Number.isSafeInteger(value) && value >= low && value <= high); }
function scalar(value) { requireValue(Number.isFinite(value) && value >= 0); }
function probability(value) { requireValue(Number.isFinite(value) && value >= 0 && value <= 1); }
function boolean(value) { requireValue(typeof value === "boolean"); }
function array(value, max) { requireValue(Array.isArray(value) && value.length <= max); }
function unique(values) { requireValue(new Set(values).size === values.length); }
function textList(value, max, length) { array(value, max); for (const item of value) string(item, length, true); unique(value); }

export function validCognitionControls(value) {
  return Number.isFinite(value.opponentShare) && value.opponentShare >= 0 && value.opponentShare <= 1
    && Number.isInteger(value.opportunitiesPerHour) && value.opportunitiesPerHour >= 1 && value.opportunitiesPerHour <= 60
    && Number.isInteger(value.maxDepth) && value.maxDepth >= 1 && value.maxDepth <= 4;
}

function prediction(value, scored = false) {
  object(value, scored ? ["probability", "claim", "squaredError"] : ["probability", "claim"]);
  probability(value.probability); string(value.claim, 512);
  if (scored) probability(value.squaredError);
}

function frame(value, actorId, sourceHours) {
  object(value, ["id", "actorId", "worldHours", "hunger", "thirst", "fatigue", "eatAt", "drinkAt", "foodAllowed", "waterAllowed", "inspectionAllowed", "knownFood", "knownWater", "knownPlaces", "capabilities"], ["priorIntent"]);
  string(value.id, 128, true); requireValue(value.actorId === actorId); scalar(value.worldHours);
  requireValue(value.worldHours <= sourceHours);
  for (const field of ["hunger", "thirst", "fatigue", "eatAt", "drinkAt"]) probability(value[field]);
  for (const field of ["foodAllowed", "waterAllowed", "inspectionAllowed"]) boolean(value[field]);
  for (const field of ["knownFood", "knownWater", "knownPlaces"]) integer(value[field], 0, 100000);
  object(value.capabilities, ["cook", "forage", "treat"]);
  for (const field of ["cook", "forage", "treat"]) boolean(value.capabilities[field]);
  if (Object.hasOwn(value, "priorIntent")) string(value.priorIntent, 128);
}

function proposal(value) {
  object(value, ["modelId", "version", "actionId", "interpretation", "confidence", "predictions"], ["hypothesisId"]);
  requireValue(MODELS.includes(value.modelId) && ACTIONS.includes(value.actionId));
  string(value.version, 128, true); string(value.interpretation, 512); probability(value.confidence);
  object(value.predictions, ACTIONS);
  for (const action of ACTIONS) prediction(value.predictions[action]);
  if (Object.hasOwn(value, "hypothesisId")) string(value.hypothesisId, 128, true);
}

function episode(value, actorId, sourceHours) {
  object(value, ["id", "worldHours", "status", "frame", "proposals", "selectedModelId", "selectedActionId", "selectionWeight", "selectionPolicy", "disagreement"], ["reason", "outcome", "executionStatus"]);
  string(value.id, 128, true); scalar(value.worldHours);
  requireValue(value.worldHours <= sourceHours);
  requireValue(["proposed", "attempted", "observed", "censored"].includes(value.status));
  if (Object.hasOwn(value, "executionStatus")) requireValue(["queued", "attempted", "observed", "censored"].includes(value.executionStatus));
  frame(value.frame, actorId, sourceHours); requireValue(value.frame.worldHours === value.worldHours);
  array(value.proposals, 2); requireValue(value.proposals.length === 2);
  unique(value.proposals.map(item => item.modelId)); value.proposals.forEach(proposal);
  const chosen = value.proposals.find(item => item.modelId === value.selectedModelId);
  requireValue(Boolean(chosen) && chosen.actionId === value.selectedActionId);
  probability(value.selectionWeight); requireValue(value.selectionPolicy === "deterministic-balanced"); boolean(value.disagreement);
  requireValue(value.disagreement === (value.proposals[0].actionId !== value.proposals[1].actionId));
  requireValue(value.status !== "observed" || Object.hasOwn(value, "outcome"));
  if (Object.hasOwn(value, "reason")) string(value.reason, 512);
  if (Object.hasOwn(value, "outcome")) {
    const result = value.outcome;
    object(result, ["eventId", "worldHours", "actionId", "status"], ["detail", "success", "revisions", "predictions"]);
    string(result.eventId, 128, true); scalar(result.worldHours);
    requireValue(result.worldHours >= value.worldHours && result.worldHours <= sourceHours && result.actionId === value.selectedActionId);
    requireValue(["completed", "no-effect", "interrupted", "unavailable"].includes(result.status));
    if (Object.hasOwn(result, "detail")) string(result.detail, 512);
    if (Object.hasOwn(result, "success")) {
      boolean(result.success);
      requireValue(value.status === "observed" && ["completed", "no-effect"].includes(result.status));
    }
    if (Object.hasOwn(result, "revisions")) {
      object(result.revisions, MODELS);
      for (const model of MODELS) string(result.revisions[model], 512);
    }
    if (Object.hasOwn(result, "predictions")) {
      object(result.predictions, MODELS);
      requireValue(value.status === "observed" && typeof result.success === "boolean");
      for (const model of MODELS) {
        prediction(result.predictions[model], true);
        const before = value.proposals.find(item => item.modelId === model).predictions[value.selectedActionId];
        requireValue(result.predictions[model].probability === before.probability && result.predictions[model].claim === before.claim);
        requireValue(Math.abs(result.predictions[model].squaredError - (before.probability - Number(result.success)) ** 2) <= 0.000001);
      }
    }
  }
}

function model(value) {
  object(value, ["id", "version", "beliefs", "hypotheses"], ["omittedBeliefs", "omittedHypotheses"]);
  requireValue(MODELS.includes(value.id)); string(value.version, 128, true);
  array(value.beliefs, 64); unique(value.beliefs.map(item => item.id));
  for (const belief of value.beliefs) {
    object(belief, ["id", "label", "confidence", "status"]);
    string(belief.id, 128, true); string(belief.label, 512); probability(belief.confidence); string(belief.status, 64);
  }
  array(value.hypotheses, 12); unique(value.hypotheses.map(item => item.id));
  for (const hypothesis of value.hypotheses) {
    object(hypothesis, ["id", "label", "branch", "depth", "confidence", "status", "evidenceIds", "parentIds", "missing"]);
    string(hypothesis.id, 128, true); string(hypothesis.label, 512); string(hypothesis.branch, 160);
    integer(hypothesis.depth, 1, 4); probability(hypothesis.confidence);
    requireValue(["hypothesis", "supported", "refined", "falsified"].includes(hypothesis.status));
    textList(hypothesis.evidenceIds, 8, 128); textList(hypothesis.parentIds, 4, 128); textList(hypothesis.missing, 8, 256);
  }
  for (const key of ["omittedBeliefs", "omittedHypotheses"]) if (Object.hasOwn(value, key)) integer(value[key]);
}

export function validateCognitionView(value, actorId, sourceHours) {
  // Inspection owns the county clock, including history before native world age.
  scalar(sourceHours);
  object(value, ["schema", "settings", "actorId", "sequence", "omittedEpisodes", "omittedExperiences", "episodes", "models"], ["rejectedExperiences"]);
  requireValue(value.schema === "simulation.cognition/1" && value.actorId === actorId);
  string(value.actorId, 128, true); integer(value.sequence); integer(value.omittedEpisodes); integer(value.omittedExperiences);
  if (Object.hasOwn(value, "rejectedExperiences")) integer(value.rejectedExperiences);
  object(value.settings, ["enabled", "opponentShare", "opportunitiesPerHour", "maxDepth"]);
  boolean(value.settings.enabled); requireValue(validCognitionControls(value.settings));
  array(value.episodes, 8); unique(value.episodes.map(item => item.id)); value.episodes.forEach(item => episode(item, actorId, sourceHours));
  array(value.models, 2); requireValue(value.models.length === 2 || (value.models.length === 0 && value.episodes.length === 0));
  unique(value.models.map(item => item.id)); value.models.forEach(model);
  requireValue(Buffer.byteLength(JSON.stringify(value)) <= 64 * 1024);
  return value;
}
