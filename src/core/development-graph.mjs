import { closeSync, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

export const DEVELOPMENT_GRAPH_SCHEMA = "development.continuity-graph/1";
export const MAX_GRAPH_BYTES = 16 * 1024 * 1024;
const EVIDENCE = new Set(["source-fact", "deterministic-projection", "derived-summary", "illustration", "unknown"]);
const TYPE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/u;

function requireValue(condition, code = "invalid-development-graph") {
  if (!condition) throw Object.assign(new Error(code), { code });
}
function object(value, required, optional = []) {
  requireValue(value && typeof value === "object" && !Array.isArray(value)
    && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}
function text(value, maximum = 512, empty = false) {
  requireValue(typeof value === "string" && value.length <= maximum
    && (empty || value.trim().length > 0) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value));
}
function list(value, maximum, minimum = 0) {
  requireValue(Array.isArray(value) && value.length >= minimum && value.length <= maximum);
}
function type(value) { requireValue(typeof value === "string" && TYPE.test(value)); }
function uniqueTexts(value, maximum, itemMaximum = 160) {
  list(value, maximum);
  for (const item of value) text(item, itemMaximum);
  requireValue(new Set(value).size === value.length);
}
function sources(value) {
  list(value, 128, 1);
  for (const source of value) {
    object(source, ["path", "revision"], ["locator"]);
    text(source.path, 2048); text(source.revision);
    if (source.locator !== undefined) text(source.locator, 1024);
  }
}
export function safeGraphMediaPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 2048
    && !value.startsWith("/") && !value.includes("\\") && !value.includes(":")
    && !value.includes("%") && !/[?#\x00-\x1f\x7f]/u.test(value)
    && value.split("/").every(part => part && part !== "." && part !== "..");
}

// Validation preserves the source graph exactly. Presentation adds no semantic edges.
export function validateDevelopmentGraph(value, { projectRef } = {}) {
  object(value, ["schema", "projectRef", "revision", "sourceVector", "nodes", "edges", "views"]);
  requireValue(value.schema === DEVELOPMENT_GRAPH_SCHEMA);
  text(value.projectRef); text(value.revision);
  requireValue(projectRef === undefined || value.projectRef === projectRef, "development-graph-project-mismatch");
  list(value.sourceVector, 10_000, 1);
  for (const source of value.sourceVector) {
    object(source, ["sourceRef", "revision"]);
    text(source.sourceRef, 2048); text(source.revision);
  }
  list(value.nodes, 10_000); list(value.edges, 30_000); list(value.views, 64, 1);
  const nodes = new Set(), edges = new Set(), views = new Set();
  for (const node of value.nodes) {
    object(node, ["id", "kind", "label", "summary", "status", "sources", "tags"], ["mediaRefs", "recordedStatus", "measuredStatusNote", "archiveRef", "archivePath", "blobRevision", "ownerPath", "remaining", "state", "inputs", "outputs", "recordedAt", "proofApplicability"]);
    text(node.id, 256); type(node.kind); text(node.label, 512); text(node.summary, 16_384, true);
    requireValue(!nodes.has(node.id)); nodes.add(node.id);
    object(node.status, ["implementation", "verification", "publication"]);
    for (const status of Object.values(node.status)) text(status, 1024);
    sources(node.sources); uniqueTexts(node.tags, 128, 512);
    for (const key of ["recordedStatus", "measuredStatusNote", "archiveRef", "archivePath", "ownerPath", "recordedAt"]) {
      if (node[key] !== undefined) text(node[key], 8192);
    }
    if (node.blobRevision !== undefined) requireValue(/^sha256:[a-f0-9]{64}$/u.test(node.blobRevision));
    for (const key of ["remaining", "state", "inputs", "outputs"]) {
      if (node[key] !== undefined) { list(node[key], 128); for (const item of node[key]) text(item, 8192); }
    }
    if (node.proofApplicability !== undefined) {
      object(node.proofApplicability, ["productionPinsMatch", "pinCount"]);
      requireValue(typeof node.proofApplicability.productionPinsMatch === "boolean"
        && Number.isSafeInteger(node.proofApplicability.pinCount) && node.proofApplicability.pinCount >= 0);
    }
    if (node.mediaRefs !== undefined) {
      list(node.mediaRefs, 32);
      for (const media of node.mediaRefs) {
        object(media, ["kind", "href"], ["label", "mimeType"]);
        requireValue(["image", "video", "audio"].includes(media.kind) && safeGraphMediaPath(media.href));
        if (media.label !== undefined) text(media.label, 512);
        if (media.mimeType !== undefined) requireValue(/^(image|video|audio)\/[a-zA-Z0-9.+-]+$/u.test(media.mimeType)
          && media.mimeType.startsWith(media.kind + "/"));
      }
    }
  }
  for (const edge of value.edges) {
    object(edge, ["id", "from", "to", "relation", "evidenceClass", "provenance", "rationale"]);
    text(edge.id, 256); text(edge.from, 256); text(edge.to, 256); type(edge.relation);
    text(edge.rationale, 16_384, true);
    requireValue(!edges.has(edge.id) && nodes.has(edge.from) && nodes.has(edge.to));
    requireValue(EVIDENCE.has(edge.evidenceClass)); sources(edge.provenance); edges.add(edge.id);
  }
  for (const view of value.views) {
    object(view, ["id", "label", "nodeKinds", "relations"]);
    text(view.id, 256); text(view.label, 512);
    uniqueTexts(view.nodeKinds, 256); uniqueTexts(view.relations, 256);
    for (const item of [...view.nodeKinds, ...view.relations]) type(item);
    requireValue(!views.has(view.id)); views.add(view.id);
  }
  return value;
}

export function readDevelopmentGraph(surface, sourceName) {
  let fd;
  try {
    const source = surface?.dataSources?.find(item => item.name === sourceName);
    requireValue(source?.format === "json" && source.schema === DEVELOPMENT_GRAPH_SCHEMA,
      "development-graph-source-unavailable");
    const root = realpathSync(surface.root);
    const target = realpathSync(join(root, source.path));
    const beneath = relative(root, target);
    requireValue(beneath && !isAbsolute(beneath) && beneath !== ".."
      && !beneath.startsWith("../") && !beneath.startsWith("..\\"), "development-graph-source-outside-root");
    fd = openSync(target, "r");
    const stat = fstatSync(fd);
    const maximum = Math.min(source.maxBytes || MAX_GRAPH_BYTES, MAX_GRAPH_BYTES);
    requireValue(stat.isFile() && stat.size <= maximum, "development-graph-source-too-large");
    // Read one extra byte so a growing file cannot silently become a partial graph.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, maximum + 1));
    let count = 0;
    while (count < buffer.length) {
      const read = readSync(fd, buffer, count, buffer.length - count, null);
      if (!read) break;
      count += read;
    }
    const after = fstatSync(fd);
    requireValue(count === stat.size && after.size === stat.size && after.mtimeMs === stat.mtimeMs,
      "development-graph-source-changed");
    const graph = validateDevelopmentGraph(JSON.parse(buffer.subarray(0, count).toString("utf8")),
      { projectRef: surface.projectRef });
    return { schema: "mousecat.project-graph/1", ok: true, surfaceId: surface.surfaceId, source: source.name, graph };
  } catch (error) {
    const code = /^(invalid-development-graph|development-graph-[a-z-]+)$/u.test(error.code || "")
      ? error.code : "development-graph-source-unavailable";
    return { schema: "mousecat.error/1", ok: false, code };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

