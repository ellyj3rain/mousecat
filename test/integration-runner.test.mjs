import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { integrationAdapterManifest, integrationAdapterManifests } from "../src/core/integration-adapters.mjs";
import { createIntegrationAdapterRegistry, defineIntegrationAdapter } from "../src/core/integration-contracts.mjs";
import { invokeIntegrationAdapter } from "../src/core/integration-runner.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "fixtures", "glab");
const SHA256 = createHash("sha256").update(readFileSync(FIXTURE)).digest("hex");
const CA_FIXTURE = join(ROOT, "fixtures", "CAOfflineWorldAuthoring");
const CA_SHA256 = createHash("sha256").update(readFileSync(CA_FIXTURE)).digest("hex");

function connector(overrides = {}) {
  return {
    adapter: "gitlab-v4",
    executablePath: FIXTURE,
    executableSha256: SHA256,
    defaultProject: "open-ground/mousecat",
    hostname: "gitlab.example.com",
    timeoutMs: 5000,
    ...overrides,
  };
}

function caConnector(overrides = {}) {
  return {
    adapter: "colonist-awareness-world-authoring-v1",
    executablePath: CA_FIXTURE,
    executableSha256: CA_SHA256,
    atlasRoot: join(ROOT, "fixtures", "ca-atlases"),
    intentRoot: join(ROOT, "fixtures", "ca-intents"),
    timeoutMs: 5000,
    ...overrides,
  };
}

function runner(result, calls = []) {
  return async (executable, args, options) => {
    calls.push({ executable, args, options });
    return { code: 0, stdout: JSON.stringify(result), stderr: "" };
  };
}

function boundaryRegistry(overrides = {}) {
  const adapter = defineIntegrationAdapter({
    id: "boundary-v1",
    label: "Boundary Test",
    upstream: "boundary",
    transport: "cli-json",
    auth: "host-managed",
    executable: { name: "glab", acceptedNames: ["glab"] },
    allowedEnvKeys: [],
    buildArguments: overrides.buildArguments || (() => ["api", "boundary"]),
    capabilities: [{
      id: "boundary.read",
      label: "Boundary Read",
      description: "Exercise provider-neutral validation.",
      access: "read",
      inputSchema: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["open", "closed"] },
          page: { type: "integer", minimum: 1, maximum: 100 },
          note: { type: "string" },
        },
        additionalProperties: false,
      },
      compile: () => ({ method: "GET", path: "boundary", fields: {} }),
    }, {
      id: "boundary.write",
      label: "Boundary Write",
      description: "Exercise central confirmation.",
      access: "consequential-write",
      inputSchema: {
        type: "object",
        properties: { confirm: { type: "boolean" } },
        additionalProperties: false,
      },
      compile: () => ({ method: "POST", path: "boundary", fields: {} }),
    }],
    provenance: { source: "test", version: "1" },
  });
  return createIntegrationAdapterRegistry([adapter]);
}

function boundaryConnector() {
  return { adapter: "boundary-v1", executablePath: FIXTURE, executableSha256: SHA256 };
}

test("GitLab manifest exposes bounded capabilities without executable builders", () => {
  const registry = integrationAdapterManifests();
  const manifest = integrationAdapterManifest("gitlab-v4");

  assert.equal(registry.schema, "mousecat.integration-adapters/1");
  assert.equal(manifest.executable.pin, "sha256-required");
  assert.equal(manifest.auth, "host-managed");
  assert.ok(manifest.capabilities.some((item) => item.id === "gitlab.merge-requests.list" && item.access === "read"));
  assert.ok(manifest.capabilities.some((item) => item.id === "gitlab.merge-requests.merge" && item.access === "consequential-write"));
  assert.equal(manifest.capabilities.some((item) => Object.hasOwn(item, "compile")), false);
});

test("CA world-authoring manifest exposes only the current read and draft boundary", () => {
  const manifest = integrationAdapterManifest("colonist-awareness-world-authoring-v1");

  assert.equal(manifest.upstream, "colonist-awareness");
  assert.equal(manifest.executable.pin, "sha256-required");
  assert.deepEqual(
    manifest.capabilities.map((capability) => [capability.id, capability.access]),
    [
      ["cao.world-atlases.catalog", "read"],
      ["cao.area.inspect", "read"],
      ["cao.region.find", "read"],
      ["cao.region.compose", "read"],
    ],
  );
  assert.equal(manifest.capabilities.some((capability) => Object.hasOwn(capability, "compile")), false);
});

test("CA world-authoring requests compile to literal, root-contained CLI arguments", async () => {
  const calls = [];
  const composed = await invokeIntegrationAdapter(caConnector(), "cao.region.compose", {
    atlasId: "mass-driver-ain-xii",
    rootTileId: 29606,
    extent: 12,
    orientation: 3,
    arrivalTileId: 29606,
    localMapSize: 350,
  }, { commandRunner: runner({ realizedExtent: 12 }, calls) });
  const inspected = await invokeIntegrationAdapter(caConnector(), "cao.area.inspect", {
    atlasId: "mass-driver-ain-xii",
    tileId: 29606,
  }, { commandRunner: runner({ tileId: 29606 }, calls) });

  assert.equal(composed.ok, true);
  assert.equal(inspected.ok, true);
  assert.deepEqual(calls[0].args, [
    "compose",
    "--atlas", join(ROOT, "fixtures", "ca-atlases", "mass-driver-ain-xii"),
    "--root", "29606",
    "--extent", "12",
    "--orientation", "3",
    "--arrival", "29606",
    "--map-size", "350",
  ]);
  assert.deepEqual(calls[1].args, [
    "inspect",
    "--atlas", join(ROOT, "fixtures", "ca-atlases", "mass-driver-ain-xii"),
    "--tile", "29606",
  ]);
  assert.equal(calls.every((call) => call.options.shell === false), true);
});

test("CA world-authoring identifiers and extents fail closed before dispatch", async () => {
  let calls = 0;
  const commandRunner = async () => {
    calls += 1;
    return { code: 0, stdout: "{}", stderr: "" };
  };
  const traversedAtlas = await invokeIntegrationAdapter(caConnector(), "cao.area.inspect", {
    atlasId: "../outside",
    tileId: 1,
  }, { commandRunner });
  const traversedIntent = await invokeIntegrationAdapter(caConnector(), "cao.region.find", {
    atlasId: "mass-driver-ain-xii",
    intentId: "../../private",
  }, { commandRunner });
  const unsupportedExtent = await invokeIntegrationAdapter(caConnector(), "cao.region.compose", {
    atlasId: "mass-driver-ain-xii",
    rootTileId: 29606,
    extent: 5,
  }, { commandRunner });

  assert.deepEqual(
    [traversedAtlas.code, traversedIntent.code, unsupportedExtent.code],
    ["integration-project-identifier-invalid", "integration-project-identifier-invalid", "integration-payload-invalid"],
  );
  assert.equal(calls, 0);
});

test("GitLab requests use source-owned literal arguments without a shell", async () => {
  const calls = [];
  const result = await invokeIntegrationAdapter(connector(), "gitlab.merge-requests.list", {
    state: "opened",
    sourceBranch: "@local-file-must-remain-literal",
    perPage: 25,
  }, { commandRunner: runner([{ iid: 23 }], calls) });

  assert.equal(result.ok, true);
  assert.deepEqual(result.result, [{ iid: 23 }]);
  assert.deepEqual(calls[0].args, [
    "api", "--hostname", "gitlab.example.com",
    "projects/open-ground%2Fmousecat/merge_requests", "--method", "GET",
    "--raw-field", "state=opened",
    "--raw-field", "source_branch=@local-file-must-remain-literal",
    "--raw-field", "per_page=25",
  ]);
});

test("GitLab writes require confirmation and execution provenance", async () => {
  const never = async () => assert.fail("runner must not execute");
  const cases = await Promise.all([
    invokeIntegrationAdapter(connector(), "gitlab.merge-requests.merge", { iid: 23 }, { commandRunner: never }),
    invokeIntegrationAdapter(connector(), "gitlab.project.get", { accessToken: "secret" }, { commandRunner: never }),
    invokeIntegrationAdapter(connector({ executablePath: join(dirname(FIXTURE), "arbitrary-command") }), "gitlab.user.get", {}, { commandRunner: never }),
    invokeIntegrationAdapter(connector({ executableSha256: "0".repeat(64) }), "gitlab.user.get", {}, { commandRunner: never }),
    invokeIntegrationAdapter(connector({ env: { UNREVIEWED_KEY: "value" } }), "gitlab.user.get", {}, { commandRunner: never }),
  ]);

  assert.deepEqual(cases.map((item) => item.code), [
    "integration-confirmation-required",
    "integration-secret-values-rejected",
    "integration-executable-invalid",
    "integration-executable-digest-mismatch",
    "integration-environment-key-rejected",
  ]);
  assert.ok(cases.every((item) => item.outcome === "not-dispatched" || item.outcome === undefined));
});

test("runner classifies post-dispatch write uncertainty and rejects scalar JSON", async () => {
  const write = { sourceBranch: "feature", targetBranch: "main", title: "MR", confirm: true };
  const timeout = await invokeIntegrationAdapter(connector(), "gitlab.merge-requests.create", write, {
    commandRunner: async () => ({ timedOut: true }),
  });
  const failed = await invokeIntegrationAdapter(connector(), "gitlab.merge-requests.create", write, {
    commandRunner: async () => ({ code: 1, stdout: "", stderr: "request outcome unavailable" }),
  });
  const scalar = await invokeIntegrationAdapter(connector(), "gitlab.user.get", {}, {
    commandRunner: async () => ({ code: 0, stdout: "true", stderr: "" }),
  });

  assert.equal(timeout.outcome, "unknown");
  assert.equal(failed.outcome, "unknown");
  assert.equal(scalar.code, "integration-invalid-json");
  assert.equal(scalar.outcome, "not-observed");
});

test("provider-neutral writes and schemas are enforced before dispatch", async () => {
  const calls = [];
  const options = { registry: boundaryRegistry(), commandRunner: runner({ ok: true }, calls) };
  const unconfirmed = await invokeIntegrationAdapter(boundaryConnector(), "boundary.write", {}, options);
  const invalidEnum = await invokeIntegrationAdapter(boundaryConnector(), "boundary.read", { state: "unknown" }, options);
  const invalidRange = await invokeIntegrationAdapter(boundaryConnector(), "boundary.read", { page: 101 }, options);
  const unknownField = await invokeIntegrationAdapter(boundaryConnector(), "boundary.read", { extra: true }, options);
  const secretValue = await invokeIntegrationAdapter(boundaryConnector(), "boundary.read", { note: "glpat-sensitive-value" }, options);

  assert.equal(unconfirmed.code, "integration-confirmation-required");
  assert.deepEqual([invalidEnum.code, invalidRange.code, unknownField.code], [
    "integration-payload-invalid",
    "integration-payload-invalid",
    "integration-payload-invalid",
  ]);
  assert.equal(secretValue.code, "integration-secret-values-rejected");
  assert.equal(calls.length, 0);
});

test("provider output and rejected runners cannot leak credential material", async () => {
  const registry = boundaryRegistry();
  const redacted = await invokeIntegrationAdapter(boundaryConnector(), "boundary.read", {}, {
    registry,
    commandRunner: runner(Object.fromEntries([
      ["token", ["plain", "secret"].join("-")],
      ["nested", { note: "Bearer sensitive-value" }],
    ])),
  });
  const rejected = await invokeIntegrationAdapter(boundaryConnector(), "boundary.read", {}, {
    registry,
    commandRunner: async () => { throw new Error(["authorization", "plain-secret"].join("=")); },
  });

  assert.equal(redacted.ok, true);
  assert.equal(redacted.result.token, "[credential-redacted]");
  assert.equal(redacted.result.nested.note, "[credential-redacted]");
  assert.equal(rejected.code, "integration-command-failed");
  assert.equal(rejected.outcome, "not-observed");
  assert.equal(rejected.message.includes("plain-secret"), false);
});

test("invalid argument builders fail before dispatch", async () => {
  let calls = 0;
  const result = await invokeIntegrationAdapter(boundaryConnector(), "boundary.read", {}, {
    registry: boundaryRegistry({ buildArguments: () => { throw new Error("builder failed"); } }),
    commandRunner: async () => { calls += 1; },
  });

  assert.equal(result.code, "integration-arguments-invalid");
  assert.equal(result.outcome, "not-dispatched");
  assert.equal(calls, 0);
});
