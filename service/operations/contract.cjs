"use strict";
const CONTRACT_VERSION = "1.0.0";
const object = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: true });
const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const boolean = { type: "boolean" };
const sourcePin = object({ path: string, sha256: { type: "string", pattern: "^[a-f0-9]{64}$" } });
const binding = object({
  id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" }, label: string,
  kind: { enum: ["project", "repository", "runtime"] }, root: nullableString,
  responsibility: nullableString, authority: string,
  relationships: { type: "array", items: object({ kind: { enum: ["part-of", "uses", "associated-with", "runtime-of"] }, target: string, source: string }) },
  services: { type: "array", items: object({ id: string, port: { type: "integer", minimum: 1, maximum: 65535 } }) },
});
const observation = object({ status: string }, ["status"]);
const catalog = object({ schema: { const: "mc.operations.catalog/1" }, source: sourcePin, observedAt: string,
  objects: { type: "array", maxItems: 32, items: binding },
  runtime: object({ node: string, platform: string, arch: string }), consistency: string });
const continuity = object({ schema: { const: "mc.operations.continuity/1" }, status: { enum: ["unconfigured", "observed", "partial", "unavailable"] }, observedAt: string,
  records: { type: "array", maxItems: 128, items: { type: "object" } }, directives: { type: "array", maxItems: 128, items: { type: "object" } },
  sources: { type: "array", maxItems: 4, items: { type: "object" } }, heads: { type: "array", items: { type: "object" } }, issues: { type: "array", items: { type: "object" } } });
const project = object({ schema: { const: "mc.operations.object/1" }, observedAt: string, catalogSource: sourcePin, object: binding, continuity,
  source: { oneOf: [
    object({ status: { enum: ["unconfigured", "missing", "unavailable", "not-directory"] }, code: { type: ["string", "number"] } }, ["status"]),
    object({ status: { const: "observed" }, git: observation, version: nullableString,
      documents: { type: "array", items: object({ file: string, status: string }, ["file", "status"]) },
      dependencies: observation, versionAgreement: observation }),
  ] } }, ["schema", "observedAt", "catalogSource", "object", "source"]);
const services = object({ schema: { const: "mc.operations.services/1" }, observedAt: string, catalogSource: sourcePin,
  services: { type: "array", maxItems: 32, items: object({ objectId: string, id: string, port: { type: "integer" }, host: { const: "127.0.0.1" },
    status: { enum: ["reachable", "not-listening", "unavailable"] }, code: nullableString, elapsedMs: { type: "number" }, observedAt: string,
    applicationHealth: { const: "not-probed" }, start: { const: "not-exposed" } }) } });
const fleet = { oneOf: [
  object({ schema: { const: "mc.operations.fleet/1" }, status: { const: "unavailable" }, source: string, code: string, observedAt: string, sampleUsed: { const: false } }),
  object({ schema: { const: "mc.operations.fleet/1" }, status: { const: "observed" }, source: string, observedAt: string, generatedAt: string,
    ageSeconds: { type: "number" }, stale: boolean, catalogCoverage: observation,
    families: { type: "array", items: { type: "object" } },
    summary: object(Object.fromEntries(["risk", "attention", "neutral", "ok", "total"].map(key => [key, { type: "integer", minimum: 0 }]))),
    projects: { type: "array", items: object({ id: string, health: { type: "object" }, safety: { type: "array", items: { type: "object" } } }) } }),
] };
const outputSchemas = { mc_catalog: catalog, mc_project: project, mc_services: services, mc_fleet: fleet };
const tools = [
  ["mc_catalog", "Read the configured platform objects, responsibilities, source bindings and relationships."],
  ["mc_project", "Observe one catalog object's source evidence and configured source-attributed continuity; no assignment or authority inferred."],
  ["mc_services", "Probe declared loopback ports without sending bytes. Reachability does not establish application health."],
  ["mc_fleet", "Read live pb-core state through MC's shared interpretation. Unavailable and stale observations stay explicit."],
].map(([name, description]) => ({ name, description,
  inputSchema: { type: "object", properties: name === "mc_project" ? { id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" } } : {}, required: name === "mc_project" ? ["id"] : [], additionalProperties: false },
  // MCP requires an object at the output schema root; the fleet's variants live beneath it.
  outputSchema: name === "mc_fleet" ? { type: "object", ...fleet } : outputSchemas[name],
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));
const resources = { "mc://catalog": { mimeType: "application/json", contentSchema: catalog }, "mc://object/{id}": { mimeType: "application/json", contentSchema: project } };
module.exports = { CONTRACT_VERSION, tools, resources, outputSchemas };
