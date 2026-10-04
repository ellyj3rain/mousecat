export function developmentGraph(count = 3) {
  const source = { path: "Batches/A1.md", revision: "sha256:" + "1".repeat(64), locator: "line:12" };
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: "unit:" + i, kind: i % 2 ? "contract" : "batch", label: "Development " + i,
    summary: i === 0 ? "Original source record, retained with measured limits." : "Recorded continuity.",
    status: { implementation: i === 0 ? "partial" : "implemented", verification: "scoped", publication: "local" },
    sources: [{ ...source }], tags: ["era:a", i % 2 ? "concept" : "history"],
  }));
  return { schema: "development.continuity-graph/1", projectRef: "project:example", revision: "fixture-1",
    sourceVector: [{ sourceRef: "BATCH_LOG.md", revision: source.revision }],
    nodes, edges: nodes.slice(1).map((node, i) => ({ id: "edge:" + i, from: nodes[i].id, to: node.id,
      relation: i % 2 ? "depends-on" : "contributes-to", evidenceClass: "source-fact",
      provenance: [{ ...source }], rationale: "Explicit recorded connection." })),
    views: [{ id: "all", label: "Recorded development", nodeKinds: [], relations: [] },
      { id: "contracts", label: "Contract details", nodeKinds: ["contract"], relations: [] }] };
}
export function graphSurface(root) {
  return { schema: "mousecat.project-surface/1", surfaceId: "example", projectRef: "project:example",
    projectKind: "repository", root, identityMarkers: ["AGENTS.md"],
    governingDocuments: [{ role: "instructions", path: "AGENTS.md" }],
    dataSources: [{ name: "continuity", path: "continuity.json", format: "json",
      schema: "development.continuity-graph/1", maxBytes: 16 * 1024 * 1024 }] };
}

