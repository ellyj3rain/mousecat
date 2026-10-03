import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateObservationGraph } from "../src/core/observation-graph.mjs";

const source = (recordId, worldHours = 2, capturedAtUnixMs = 0) => ({ name: "Native test receipt", recordId, worldHours, capturedAtUnixMs });
const metric = (key, value) => ({ key, label: key, value, unit: "", description: "" });
function node(id, kind, perspective, fields = {}) {
  return { id, kind, label: id, summary: "Explicit fixture receipt", perspective, actorId: "person-1",
    source: source(id), status: "recorded", ...fields };
}
function edge(id, from, to, relation, perspective = "private") {
  return { id, from, to, relation, label: relation, perspective, source: source("decision-1") };
}
function sample() {
  return { schema: "simulation.observation-graph/1", status: "available", message: "Private predictions with one observed result",
    capturedAtUnixMs: 1000, worldHours: 3, omittedNodes: 0, omittedEdges: 0,
    nodes: [
      node("person-1", "person", "observed", { source: source("person-1", 3), position: { x: 1000.25, y: 2000.75, z: -1.25, source: "native-body" } }),
      node("decision-1", "decision", "private", { metrics: [metric("episodeId", "decision-1"), metric("selectedActionId", "inspect")] }),
      node("inspect", "action", "private", { metrics: [metric("episodeId", "decision-1"), metric("actionId", "inspect"), metric("selected", true)] }),
      node("food", "action", "predicted", { metrics: [metric("episodeId", "decision-1"), metric("actionId", "food"), metric("selected", false)] }),
      node("prediction", "hypothesis", "predicted", { confidence: .6, metrics: [metric("probability", .75), metric("claim", "Inspecting may locate water")] }),
      node("outcome", "outcome", "observed", { source: source("native/inspection-1", 2.1), metrics: [metric("episodeId", "decision-1"), metric("actionId", "inspect"), metric("success", true)] }),
      node("missing", "unknown", "unknown", { source: source("missing-native-receipt", null), status: "unavailable" }),
    ],
    edges: [edge("reports-decision", "person-1", "decision-1", "reports"), edge("selected", "decision-1", "inspect", "selects"),
      edge("prediction-edge", "prediction", "inspect", "predicts", "predicted"), edge("result", "inspect", "outcome", "result", "observed"),
      edge("missing-evidence", "prediction", "missing", "reports")],
  };
}

test("typed graph preserves observed, private, predicted and unknown receipts without mutation", () => {
  const value = sample(), original = structuredClone(value);
  assert.equal(validateObservationGraph(value, { now: 1000 }), value); assert.deepEqual(value, original);
  assert.equal(value.nodes.find(item => item.id === "prediction").perspective, "predicted");
  assert.equal(value.nodes[0].position.z, -1.25); assert.equal(value.nodes[0].source.capturedAtUnixMs, 0);
});

test("unavailable and failed graph payloads are empty and have no world clock", () => {
  for (const status of ["unavailable", "failed"]) {
    const value = { ...sample(), status, worldHours: null, nodes: [], edges: [] }; validateObservationGraph(value);
    const withClock = { ...value, worldHours: 3 }; assert.throws(() => validateObservationGraph(withClock));
    value.nodes.push(sample().nodes[0]); assert.throws(() => validateObservationGraph(value), /facts/u);
  }
});

test("source clocks never become current publication time and newer or invalid clocks are rejected", () => {
  for (const mutate of [value => { value.nodes[0].source.capturedAtUnixMs = 1001; },
    value => { value.nodes[0].source.worldHours = 3.1; }, value => { value.edges[0].source.worldHours = -1; },
    value => { value.capturedAtUnixMs = 3001; }, value => { value.nodes[0].source.capturedAtUnixMs = "0"; }]) {
    const value = sample(); mutate(value); assert.throws(() => validateObservationGraph(value, { now: 1000 }));
  }
  const value = sample(); value.nodes[1].source = source("untimed-snapshot", null); validateObservationGraph(value);
});

test("native and durable positions retain numeric floor transitions and explicit provenance", () => {
  const value = sample(); value.nodes[0].position.source = "durable-record"; value.nodes[0].perspective = "unknown";
  validateObservationGraph(value);
  for (const mutate of [p => { p.z = 32; }, p => { p.z = -32.01; }, p => { p.x = "1000"; },
    p => { p.y = Infinity; }, p => { p.source = "region-center"; }]) {
    const changed = structuredClone(value); mutate(changed.nodes[0].position); assert.throws(() => validateObservationGraph(changed));
  }
  value.nodes[0].perspective = "observed"; assert.throws(() => validateObservationGraph(value), /provenance/u);
});

test("unknown endpoints, duplicate identities and extra machine fields are rejected", () => {
  for (const mutate of [value => { value.edges[0].to = "absent"; }, value => { value.nodes.push(value.nodes[0]); },
    value => { value.edges.push(value.edges[0]); }, value => { value.nodes[0].hiddenWorldTruth = true; },
    value => { value.edges[0].causes = true; }, value => { value.nodes[0].source.path = "local"; },
    value => { value.nodes[0].kind = "predicted-outcome"; }, value => { value.edges[0].relation = "causes"; }]) {
    const value = sample(); mutate(value); assert.throws(() => validateObservationGraph(value));
  }
});

test("selection and results cannot attach to unexecuted alternatives or absent episode references", () => {
  for (const mutate of [value => { value.edges.find(item => item.relation === "selects").to = "food"; },
    value => { value.edges.find(item => item.relation === "result").from = "food"; },
    value => { value.nodes.find(item => item.id === "inspect").metrics = []; },
    value => { value.nodes.find(item => item.id === "outcome").metrics.find(item => item.key === "episodeId").value = "other-episode"; },
    value => { value.nodes.find(item => item.id === "outcome").actorId = "other-person"; },
    value => { value.nodes.find(item => item.id === "decision-1").metrics = []; }]) {
    const value = sample(); mutate(value); assert.throws(() => validateObservationGraph(value));
  }
});

test("metric types, confidence, identity lengths and finite numbers are bounded", () => {
  for (const mutate of [value => { value.nodes[4].confidence = 1.1; }, value => { value.nodes[4].metrics[0].value = NaN; },
    value => { value.nodes[4].metrics[0].value = {}; }, value => { value.nodes[4].metrics[0].value = null; },
    value => { value.nodes[4].metrics.push(value.nodes[4].metrics[0]); }, value => { value.nodes[4].metrics = Array(17).fill(metric("m", 1)); },
    value => { value.nodes[4].summary = "x".repeat(513); }, value => { value.nodes[4].source.recordId = "x".repeat(181); },
    value => { value.omittedNodes = -.1; }]) {
    const value = sample(); mutate(value); assert.throws(() => validateObservationGraph(value));
  }
});

test("bounded projections may honestly omit receipts while every retained edge still resolves", () => {
  const value = sample(); value.nodes = value.nodes.slice(0, 1); value.edges = []; value.omittedNodes = 100; value.omittedEdges = 150;
  validateObservationGraph(value);
  const oversizedNodes = { ...value, nodes: Array(129).fill(value.nodes[0]) }; assert.throws(() => validateObservationGraph(oversizedNodes), /limit/u);
  const oversizedEdges = { ...sample(), edges: Array(257).fill(sample().edges[0]) }; assert.throws(() => validateObservationGraph(oversizedEdges), /limit/u);
});

test("validation retains explicit correlations without adding causal or externality claims", () => {
  const value = sample(); value.nodes.push(node("event1", "event", "observed"), node("event2", "event", "observed"));
  value.edges.push(edge("correlation", "event1", "event2", "correlates", "observed"));
  const original = structuredClone(value); validateObservationGraph(value); assert.deepEqual(value, original);
  assert.equal(value.edges.filter(item => item.relation === "correlates").length, 1);
  assert.equal(value.nodes.filter(item => item.kind === "externality").length, 0);
});

test("source mutation controls flip fabricated selection, alternative outcome, acquisition time and provenance verdicts", async () => {
  const sourceBytesText = await readFile(new URL("../src/core/observation-graph.mjs", import.meta.url), "utf8");
  const sourceText = sourceBytesText.replaceAll("\r\n", "\n");
  const controls = [
    ["selected", 'if (edge.relation === "selects") {', "if (false) {", value => { value.edges.find(item => item.relation === "selects").to = "food"; }],
    ["outcome", 'if (edge.relation === "result") {', "if (false) {", value => { value.edges.find(item => item.relation === "result").from = "food"; }],
    ["clock", "record.capturedAtUnixMs <= value.capturedAtUnixMs", "true", value => { value.nodes[0].source.capturedAtUnixMs = 1001; }],
    ["provenance", '(position.source === "native-body" && node.perspective === "observed")\n        || (position.source === "durable-record" && node.perspective === "unknown")', "true",
      value => { value.nodes[0].position.source = "durable-record"; }],
  ];
  for (const [label, before, after, mutate] of controls) {
    assert.equal(sourceText.split(before).length - 1, 1, `Executable control target ${label} is unique`);
    const changed = sourceText.replace(before, after); assert.notEqual(changed, sourceText);
    const module = await import("data:text/javascript;base64," + Buffer.from(changed).toString("base64"));
    const value = sample(); mutate(value);
    assert.throws(() => validateObservationGraph(value, { now: 1000 }), undefined, `Production rejects ${label}`);
    assert.doesNotThrow(() => module.validateObservationGraph(value, { now: 1000 }), `Mutated verdict flips ${label}`);
  }
  validateObservationGraph(sample(), { now: 1000 });
  assert.equal(await readFile(new URL("../src/core/observation-graph.mjs", import.meta.url), "utf8"), sourceBytesText);
});
