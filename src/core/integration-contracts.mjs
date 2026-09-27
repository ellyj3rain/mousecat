function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
}

function publicCapability(capability) {
  return {
    id: capability.id,
    label: capability.label,
    description: capability.description,
    access: capability.access,
    inputSchema: capability.inputSchema,
  };
}

export function defineIntegrationAdapter(spec) {
  const id = requiredText(spec?.id, "adapter.id");
  const capabilities = Array.isArray(spec.capabilities) ? spec.capabilities : [];
  if (capabilities.length === 0) throw new TypeError("adapter.capabilities must not be empty");
  const ids = new Set();
  for (const capability of capabilities) {
    requiredText(capability?.id, "capability.id");
    if (ids.has(capability.id)) throw new TypeError(`duplicate integration capability: ${capability.id}`);
    if (typeof capability.compile !== "function") throw new TypeError(`${capability.id}.compile must be a function`);
    ids.add(capability.id);
  }
  return Object.freeze({
    schema: "mousecat.integration-adapter.definition/1",
    id,
    label: requiredText(spec.label, "adapter.label"),
    upstream: requiredText(spec.upstream, "adapter.upstream"),
    transport: requiredText(spec.transport, "adapter.transport"),
    auth: requiredText(spec.auth, "adapter.auth"),
    executable: Object.freeze({
      name: requiredText(spec.executable?.name, "adapter.executable.name"),
      acceptedNames: Object.freeze([...(spec.executable?.acceptedNames || [])]),
      pin: "sha256-required",
    }),
    allowedEnvKeys: Object.freeze([...(spec.allowedEnvKeys || [])]),
    buildArguments: spec.buildArguments,
    capabilities: Object.freeze(capabilities.map((capability) => Object.freeze({ ...capability }))),
    provenance: Object.freeze({
      source: spec.provenance?.source || "mousecat",
      version: spec.provenance?.version || "1",
    }),
  });
}

export function publicIntegrationManifest(adapter) {
  return {
    schema: "mousecat.integration-adapter/1",
    id: adapter.id,
    label: adapter.label,
    upstream: adapter.upstream,
    transport: adapter.transport,
    auth: adapter.auth,
    executable: {
      name: adapter.executable.name,
      acceptedNames: [...adapter.executable.acceptedNames],
      pin: adapter.executable.pin,
    },
    allowedEnvKeys: [...adapter.allowedEnvKeys],
    capabilities: adapter.capabilities.map(publicCapability),
    provenance: { ...adapter.provenance },
    boundaries: [
      "source-owned-command-templates",
      "shell-disabled",
      "host-managed-authentication",
      "sha256-pinned-executable",
      "allowlisted-environment",
      "permit-gated-invocation",
      "all-writes-confirmed",
      "secret-values-rejected",
    ],
  };
}

export function createIntegrationAdapterRegistry(adapters = []) {
  const byId = new Map();
  for (const adapter of adapters) {
    if (!adapter || adapter.schema !== "mousecat.integration-adapter.definition/1") {
      throw new TypeError("integration registry accepts defined adapters only");
    }
    if (byId.has(adapter.id)) throw new TypeError(`duplicate integration adapter: ${adapter.id}`);
    byId.set(adapter.id, adapter);
  }
  return Object.freeze({
    schema: "mousecat.integration-adapter-registry/1",
    get(adapterRef) {
      return byId.get(adapterRef) || null;
    },
    manifests() {
      return {
        schema: "mousecat.integration-adapters/1",
        adapters: [...byId.values()].map(publicIntegrationManifest),
      };
    },
    tools(adapterRef) {
      const adapter = byId.get(adapterRef);
      if (!adapter) return null;
      return adapter.capabilities.map((capability) => ({
        name: capability.id,
        description: capability.description,
        inputSchema: capability.inputSchema,
        annotations: {
          readOnlyHint: capability.access === "read",
          destructiveHint: capability.access === "consequential-write",
          idempotentHint: capability.access === "read",
        },
      }));
    },
  });
}
