import test from "node:test";
import assert from "node:assert/strict";

import {
  createIntegrationAdapterRegistry,
  defineIntegrationAdapter,
  publicIntegrationManifest,
} from "mousecat/integration";

function exampleAdapter() {
  return defineIntegrationAdapter({
    id: "example-v1",
    label: "Example API",
    upstream: "example",
    transport: "cli-json",
    auth: "host-managed",
    executable: { name: "example", acceptedNames: ["example", "example.exe"] },
    allowedEnvKeys: ["HOME"],
    buildArguments: (_connector, request) => [request.path],
    capabilities: [{
      id: "example.record.get",
      label: "Example Record",
      description: "Read one example record.",
      access: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      compile: () => ({ method: "GET", path: "records/1", fields: {} }),
    }],
    provenance: { source: "test-package", version: "1" },
  });
}

test("public integration contract defines immutable provider manifests", () => {
  const adapter = exampleAdapter();
  const manifest = publicIntegrationManifest(adapter);

  assert.equal(adapter.schema, "mousecat.integration-adapter.definition/1");
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(manifest.schema, "mousecat.integration-adapter/1");
  assert.equal(manifest.capabilities[0].id, "example.record.get");
  assert.equal(Object.hasOwn(manifest.capabilities[0], "compile"), false);
  assert.equal(manifest.executable.pin, "sha256-required");
});

test("provider-neutral registry projects manifests and MCP-style tools", () => {
  const registry = createIntegrationAdapterRegistry([exampleAdapter()]);

  assert.equal(registry.get("example-v1").upstream, "example");
  assert.equal(registry.manifests().adapters[0].provenance.source, "test-package");
  assert.deepEqual(registry.tools("example-v1")[0].annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  });
});

test("integration definitions reject empty capabilities and duplicate registry ids", () => {
  assert.throws(() => defineIntegrationAdapter({
    id: "empty",
    label: "Empty",
    upstream: "empty",
    transport: "cli-json",
    auth: "host-managed",
    executable: { name: "empty", acceptedNames: ["empty"] },
    capabilities: [],
  }), /must not be empty/u);
  const adapter = exampleAdapter();
  assert.throws(() => createIntegrationAdapterRegistry([adapter, adapter]), /duplicate integration adapter/u);
});
