const KINDS = new Set(["person", "belief", "hypothesis", "decision", "action", "outcome", "event", "need", "unknown", "externality"]);
const PERSPECTIVES = new Set(["observed", "private", "predicted", "unknown"]);
const RELATIONS = new Set(["reports", "considers", "selects", "predicts", "result", "supports", "refutes", "correlates", "observes", "precedes"]);

function requireValue(condition, message) {
  if (!condition) throw Object.assign(new Error(`invalid-observation-graph: ${message}`), { code: "invalid-observation-graph" });
}
function object(value, required, optional = []) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "expected object");
  requireValue(required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), "fields differ");
}
function text(value, limit, empty = false) {
  requireValue(typeof value === "string" && value.length <= limit && (empty || value.length > 0)
    && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value), "invalid text");
}
function integer(value, low = 0) { requireValue(Number.isSafeInteger(value) && value >= low, "invalid integer"); }
function number(value, low = -Infinity, high = Infinity) {
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= low && value <= high, "invalid number");
}
function array(value, maximum) { requireValue(Array.isArray(value) && value.length <= maximum, "collection limit"); }
function metric(node, key) { return node.metrics?.find(item => item.key === key)?.value; }

/** Validate observations and private reasoning without deriving additional facts. */
export function validateObservationGraph(value, { now = Date.now() } = {}) {
  object(value, ["schema", "status", "message", "capturedAtUnixMs", "worldHours", "nodes", "edges", "omittedNodes", "omittedEdges"]);
  requireValue(value.schema === "simulation.observation-graph/1" && ["available", "unavailable", "failed"].includes(value.status), "schema or status differs");
  text(value.message, 512, true); integer(value.capturedAtUnixMs); integer(value.omittedNodes); integer(value.omittedEdges);
  integer(now); requireValue(value.capturedAtUnixMs <= now + 2000, "future publication clock");
  const available = value.status === "available";
  if (available) number(value.worldHours, 0);
  else requireValue(value.worldHours === null, "unavailable graph has a world clock");
  array(value.nodes, 128); array(value.edges, 256);
  requireValue(available || (value.nodes.length === 0 && value.edges.length === 0), "unavailable graph has facts");

  function source(record) {
    object(record, ["name", "recordId", "worldHours", "capturedAtUnixMs"]);
    text(record.name, 160); text(record.recordId, 180); integer(record.capturedAtUnixMs);
    requireValue(record.capturedAtUnixMs <= value.capturedAtUnixMs, "future source acquisition clock");
    if (record.worldHours !== null) number(record.worldHours, 0, value.worldHours);
  }
  const nodes = new Map();
  for (const node of value.nodes) {
    object(node, ["id", "kind", "label", "summary", "perspective", "actorId", "source", "status"], ["position", "confidence", "metrics"]);
    for (const [key, limit] of [["id", 180], ["label", 160], ["summary", 512], ["actorId", 128], ["status", 80]]) text(node[key], limit, key === "summary");
    requireValue(KINDS.has(node.kind) && PERSPECTIVES.has(node.perspective), "unknown node type");
    requireValue(!nodes.has(node.id), "duplicate node identity"); nodes.set(node.id, node); source(node.source);
    if (Object.hasOwn(node, "confidence")) number(node.confidence, 0, 1);
    if (Object.hasOwn(node, "position")) {
      const position = node.position;
      object(position, ["x", "y", "z", "source"]); number(position.x); number(position.y); number(position.z, -32);
      requireValue(position.z < 32 && node.kind === "person" && ["native-body", "durable-record"].includes(position.source), "position provenance differs");
      requireValue((position.source === "native-body" && node.perspective === "observed")
        || (position.source === "durable-record" && node.perspective === "unknown"), "position perspective differs from provenance");
    }
    if (Object.hasOwn(node, "metrics")) {
      array(node.metrics, 16); const keys = new Set();
      for (const item of node.metrics) {
        object(item, ["key", "label", "value", "unit", "description"]);
        text(item.key, 80); text(item.label, 160); text(item.unit, 80, true); text(item.description, 512, true);
        requireValue(!keys.has(item.key), "duplicate metric key"); keys.add(item.key);
        if (typeof item.value === "string") text(item.value, 512, true);
        else if (typeof item.value !== "boolean") number(item.value);
      }
    }
  }
  const edges = new Set();
  for (const edge of value.edges) {
    object(edge, ["id", "from", "to", "relation", "label", "perspective", "source"], ["confidence"]);
    text(edge.id, 180); text(edge.label, 160);
    requireValue(!edges.has(edge.id), "duplicate edge identity"); edges.add(edge.id);
    requireValue(nodes.has(edge.from) && nodes.has(edge.to), "missing edge endpoint");
    requireValue(RELATIONS.has(edge.relation) && PERSPECTIVES.has(edge.perspective), "unknown edge type"); source(edge.source);
    if (Object.hasOwn(edge, "confidence")) number(edge.confidence, 0, 1);
    const origin = nodes.get(edge.from), target = nodes.get(edge.to);
    if (edge.relation === "selects") {
      requireValue(origin.kind === "decision" && target.kind === "action" && origin.actorId === target.actorId
        && typeof metric(origin, "selectedActionId") === "string" && typeof metric(origin, "episodeId") === "string"
        && metric(origin, "selectedActionId") === metric(target, "actionId")
        && metric(origin, "episodeId") === metric(target, "episodeId"), "selected action differs from decision receipt");
    }
    if (edge.relation === "result") {
      requireValue(origin.kind === "action" && target.kind === "outcome" && origin.actorId === target.actorId
        && typeof metric(origin, "actionId") === "string" && typeof metric(origin, "episodeId") === "string"
        && metric(origin, "actionId") === metric(target, "actionId") && metric(origin, "episodeId") === metric(target, "episodeId")
        && metric(origin, "selected") === true, "outcome attached to an unexecuted alternative");
    }
  }
  return value;
}
