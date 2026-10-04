import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateDevelopmentGraph, readDevelopmentGraph, safeGraphMediaPath, MAX_GRAPH_BYTES } from "../src/core/development-graph.mjs";
import { validateProjectSurfaceDescriptor } from "../src/core/project-surfaces.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";
import { graphProjection, graphLayout, NODE_WIDTH, NODE_HEIGHT, reconcileGraphFilters } from "../src/operator/public/development-graph-model.js";
import { developmentGraph, graphSurface } from "../fixtures/development-graph.mjs";

test("development graph preserves supplied continuity, status, provenance and extensible relations", () => {
  const graph = developmentGraph(), before = structuredClone(graph);
  graph.edges[0].relation = "source-specific-relation";
  before.edges[0].relation = graph.edges[0].relation;
  assert.equal(validateDevelopmentGraph(graph, { projectRef: graph.projectRef }), graph);
  assert.deepEqual(graph, before);
  assert.throws(() => validateDevelopmentGraph(graph, { projectRef: "other" }), /project-mismatch/u);
  assert.equal(graph.nodes[0].status.implementation, "partial");
});

test("bounded optional provenance and contract details retain original measured meaning", () => {
  const graph = developmentGraph();
  graph.sourceVector = Array.from({ length: 343 }, (_, i) => ({ sourceRef: "source:" + i, revision: "pin:" + i }));
  Object.assign(graph.nodes[0], { recordedStatus: "Historical partial", measuredStatusNote: "No rendered acceptance",
    archiveRef: "archive/era", archivePath: "Batches/A1.md", blobRevision: "sha256:" + "a".repeat(64),
    ownerPath: "src/owner.js", remaining: ["Actual execution"], state: ["Durable record"], inputs: ["Observation"],
    outputs: ["Private fact"], recordedAt: "2026-01-01T00:00:00Z", proofApplicability: { productionPinsMatch: false, pinCount: 4 } });
  assert.equal(validateDevelopmentGraph(graph), graph);
  assert.equal(graph.nodes[0].status.implementation, "partial");
  graph.nodes[0].proofApplicability.pinCount = -1; assert.throws(() => validateDevelopmentGraph(graph));
});

test("graph controls refuse ambiguous identities, missing grounding, invalid statuses and endpoints", () => {
  const controls = [
    g => { g.nodes[1].id = g.nodes[0].id; },
    g => { g.edges[1].id = g.edges[0].id; },
    g => { g.edges[0].to = "missing"; },
    g => { g.nodes[0].sources = []; },
    g => { g.edges[0].provenance = []; },
    g => { g.nodes[0].status.verification = true; },
    g => { delete g.nodes[0].status.publication; },
    g => { g.edges[0].evidenceClass = "proved"; },
    g => { g.sourceVector = []; },
    g => { g.views[1].id = g.views[0].id; },
    g => { g.edges[0].relation = "<script>"; },
    g => { g.nodes[0].command = "run"; },
    g => { g.nodes[0].tags = ["same", "same"]; },
    g => { g.nodes[0].summary = "\u0000"; },
  ];
  for (const change of controls) {
    const graph = developmentGraph(); change(graph);
    assert.throws(() => validateDevelopmentGraph(graph), /invalid-development-graph/u);
  }
});

test("graph capacity accepts 10000 nodes and 30000 edges and refuses overflow", () => {
  const graph = developmentGraph(10_000);
  graph.edges = Array.from({ length: 30_000 }, (_, i) => ({ ...graph.edges[i % 9999], id: "edge:" + i }));
  assert.equal(validateDevelopmentGraph(graph), graph);
  graph.edges.push({ ...graph.edges[0], id: "overflow" });
  assert.throws(() => validateDevelopmentGraph(graph));
  graph.edges.pop(); graph.nodes.push({ ...graph.nodes[0], id: "overflow" });
  assert.throws(() => validateDevelopmentGraph(graph));
});

test("media references are bounded relative metadata and reject active or escaping URLs", () => {
  for (const href of ["https://example.org/a.png", "javascript:x", "../a", "/a", "a/../b", "a\\b", "%2e%2e/a", "a?b", "a#b"]) {
    assert.equal(safeGraphMediaPath(href), false);
    const graph = developmentGraph(); graph.nodes[0].mediaRefs = [{ kind: "image", href }];
    assert.throws(() => validateDevelopmentGraph(graph));
  }
  const graph = developmentGraph();
  graph.nodes[0].mediaRefs = [{ kind: "image", href: "evidence/a.png", label: "Recorded image", mimeType: "image/png" }];
  assert.equal(validateDevelopmentGraph(graph), graph);
});

test("registered graph read refuses unknown, untyped, oversized, malformed, foreign and escaped sources", () => {
  const parent = mkdtempSync(join(tmpdir(), "mousecat-continuity-"));
  try {
    const root = join(parent, "project"); mkdirSync(root);
    const graph = developmentGraph(), surface = graphSurface(root), path = join(root, "continuity.json");
    writeFileSync(path, JSON.stringify(graph));
    assert.deepEqual(readDevelopmentGraph(surface, "continuity").graph, graph);
    assert.equal(readDevelopmentGraph(surface, "unknown").ok, false);
    assert.equal(readDevelopmentGraph({ ...surface, projectRef: "other" }, "continuity").code, "development-graph-project-mismatch");
    assert.equal(readDevelopmentGraph({ ...surface, dataSources: [{ ...surface.dataSources[0], schema: undefined }] }, "continuity").ok, false);
    assert.equal(readDevelopmentGraph({ ...surface, dataSources: [{ ...surface.dataSources[0], maxBytes: 10 }] }, "continuity").code, "development-graph-source-too-large");
    writeFileSync(path, Buffer.alloc(MAX_GRAPH_BYTES + 1));
    assert.equal(readDevelopmentGraph(surface, "continuity").code, "development-graph-source-too-large");
    writeFileSync(path, "{"); assert.equal(readDevelopmentGraph(surface, "continuity").ok, false);
    const outside = join(parent, "outside"); mkdirSync(outside); writeFileSync(join(outside, "data.json"), JSON.stringify(graph));
    symlinkSync(outside, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
    const escaped = { ...surface, dataSources: [{ ...surface.dataSources[0], path: "escape/data.json" }] };
    assert.equal(readDevelopmentGraph(escaped, "continuity").code, "development-graph-source-outside-root");
    assert.doesNotMatch(JSON.stringify(readDevelopmentGraph(escaped, "continuity")), new RegExp(parent.replace(/[.*+?^$()[\]\\]/gu, "\\$&"), "u"));
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("graph descriptors preserve legacy data and explicitly mark graph discovery", () => {
  const surface = graphSurface("/example");
  assert.equal(validateProjectSurfaceDescriptor(surface).value.dataSources[0].schema, "development.continuity-graph/1");
  assert.equal(validateProjectSurfaceDescriptor({ ...surface, dataSources: [{ ...surface.dataSources[0], format: "jsonl" }] }).ok, false);
  assert.equal(validateProjectSurfaceDescriptor({ ...surface, dataSources: [{ ...surface.dataSources[0], maxBytes: MAX_GRAPH_BYTES + 1 }] }).ok, false);
  delete surface.dataSources[0].schema;
  assert.equal(validateProjectSurfaceDescriptor(surface).ok, true);
});

test("continuous projection preserves all matching relations across former page boundaries", () => {
  const graph = developmentGraph(125), before = structuredClone(graph);
  const first = graphProjection(graph);
  assert.equal(first.nodes.length, 125); assert.equal(first.edges.length, 124);
  assert.ok(first.edges.some(edge => edge.from === "unit:119" && edge.to === "unit:120"));
  const filtered = graphProjection(graph, { query: "Development 124", kind: "batch" });
  assert.deepEqual(filtered.nodes.map(n => n.id), ["unit:124"]); assert.equal(filtered.edges.length, 0);
  const contracts = graphProjection(graph, { view: "contracts" });
  assert.ok(contracts.nodes.every(n => n.kind === "contract"));
  assert.ok(graphProjection(graph, { relation: "depends-on" }).edges.every(e => e.relation === "depends-on"));
  const layout = graphLayout(first.nodes);
  assert.equal(layout.positions.size, 125);
  assert.ok(new Set([...layout.positions.values()].map(point => point.x)).size > 2);
  for (const [id, a] of layout.positions) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + NODE_WIDTH <= layout.width && a.y + NODE_HEIGHT <= layout.height);
    for (const [other, b] of layout.positions) if (other !== id) {
      assert.ok(a.x + NODE_WIDTH <= b.x || b.x + NODE_WIDTH <= a.x || a.y + NODE_HEIGHT <= b.y || b.y + NODE_HEIGHT <= a.y, "overlap: " + id + "/" + other);
    }
  }
  const neighbourhood = graphProjection(graph, { focus: "unit:120" });
  assert.deepEqual(neighbourhood.nodes.map(node => node.id), ["unit:119", "unit:120", "unit:121"]);
  assert.equal(neighbourhood.edges.length, 2);
  assert.deepEqual(graph, before);
});

test("observer MCP and browser graph route share a registered read contract with no write route", async () => {
  const parent = mkdtempSync(join(tmpdir(), "mousecat-graph-api-"));
  let app;
  try {
    const graph = developmentGraph(); writeFileSync(join(parent, "continuity.json"), JSON.stringify(graph));
    writeFileSync(join(parent, "AGENTS.md"), "# Synthetic project\n");
    const runtime = createMousecatRuntime();
    assert.equal(runtime.handleTool("mousecat.projects", { action: "register", surface: graphSurface(parent), permit: { profileId: "operator-interaction" } }).ok, true);
    assert.equal(runtime.handleTool("mousecat.projects", { action: "graph", surfaceId: "example", source: "continuity" }).ok, false);
    const result = runtime.handleTool("mousecat.projects", { action: "graph", surfaceId: "example", source: "continuity", permit: { profileId: "observer" } });
    assert.deepEqual(result.graph, graph);
    app = await startOperatorServer({ runtime, host: "127.0.0.1", port: 0 });
    const response = await fetch(app.url + "/api/project-graphs/example/continuity");
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
    assert.equal((await fetch(app.url + "/api/project-graphs/example/continuity", { method: "POST" })).status, 405);
    assert.equal((await fetch(app.url + "/api/project-graphs/example/missing")).status, 404);
    const snapshot = await (await fetch(app.url + "/api/snapshot")).json();
    assert.equal(snapshot.projects[0].page.dataSources[0].schema, graph.schema);
  } finally {
    await app?.close(); rmSync(parent, { recursive: true, force: true });
  }
});


test("source refresh clears only vanished filter identities and labels use natural numeric order", () => {
  const graph = developmentGraph(12);
  assert.deepEqual(reconcileGraphFilters(graph, { view: "contracts", kind: "contract", relation: "depends-on" }),
    { view: "contracts", kind: "contract", relation: "depends-on" });
  assert.deepEqual(reconcileGraphFilters(graph, { view: "removed", kind: "removed", relation: "removed" }),
    { view: "", kind: "", relation: "" });
  assert.deepEqual(reconcileGraphFilters(graph, { view: "all", kind: "removed", relation: "depends-on" }),
    { view: "all", kind: "", relation: "depends-on" });
  const before = structuredClone(graph);
  graph.nodes.reverse();
  assert.deepEqual(graphProjection(graph).nodes.map(node => node.id), before.nodes.map(node => node.id));
  assert.equal(graph.nodes[0].id, "unit:11");
});
