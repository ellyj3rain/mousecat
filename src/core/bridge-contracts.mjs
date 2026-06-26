import { discoverConnectorResources, readConnectorResource } from "./connectors.mjs";

export const MOUSECAT_BRIDGE_RESOURCE_NAME = "mousecat_bridge_contract_v1";
export const MOUSECAT_BRIDGE_SUMMARY_SCHEMA = "mousecat.bridge.summary/1";

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function parseResourceJson(readResult) {
  const content = readResult?.result?.contents?.[0] || null;
  const text = content?.text;
  if (!text) {
    return {
      ok: false,
      code: "bridge-resource-empty",
      message: "The bridge resource did not return JSON text content.",
    };
  }

  try {
    return {
      ok: true,
      data: JSON.parse(text),
      mimeType: content.mimeType || null,
      uri: content.uri || null,
    };
  } catch (error) {
    return {
      ok: false,
      code: "bridge-resource-invalid-json",
      error: {
        name: error.name,
        message: error.message,
      },
    };
  }
}

export function summarizeBridgeContract(upstream, resource, contract) {
  const publicSurface = contract.publicSurface || {};
  const tools = Array.isArray(publicSurface.tools) ? publicSurface.tools : [];
  const resources = Array.isArray(publicSurface.resources) ? publicSurface.resources : [];
  const prompts = Array.isArray(publicSurface.prompts) ? publicSurface.prompts : [];
  const skillButtons = Array.isArray(publicSurface.skillButtons) ? publicSurface.skillButtons : [];
  const skillRoutes = Array.isArray(publicSurface.skillRoutes) ? publicSurface.skillRoutes : [];

  return {
    schema: MOUSECAT_BRIDGE_SUMMARY_SCHEMA,
    upstream,
    present: true,
    resource: {
      name: resource?.name || MOUSECAT_BRIDGE_RESOURCE_NAME,
      uri: resource?.uri || null,
      schemaVersion: resource?.schema_version || contract.schema_version || null,
    },
    contractSchema: contract.schema || null,
    contractVersion: contract.schema_version || null,
    consumer: contract.consumer || null,
    role: contract.role || null,
    server: {
      name: contract.server?.name || null,
      transport: contract.server?.transport || null,
      methods: Array.isArray(contract.server?.methods) ? contract.server.methods : [],
      staleCode: contract.server?.staleCode || null,
    },
    counts: {
      tools: tools.length,
      resources: resources.length,
      prompts: prompts.length,
      skillButtons: skillButtons.length,
      skillRoutes: skillRoutes.length,
    },
    toolNames: tools.map((tool) => tool.name).filter(Boolean).sort(),
    resourceNames: resources.map((item) => item.name).filter(Boolean).sort(),
    promptNames: prompts.map((prompt) => prompt.name).filter(Boolean).sort(),
    boundaries: unique(tools.map((tool) => tool.boundary)),
    skillButtons,
    skillRoutes,
    exported: Array.isArray(contract.exportPolicy?.exported) ? contract.exportPolicy.exported : [],
    withheld: Array.isArray(contract.exportPolicy?.withheld) ? contract.exportPolicy.withheld : [],
    policy: {
      invocation: contract.contract?.invocation || null,
      catalog: contract.contract?.catalog || null,
      update: contract.contract?.update || null,
      permissionBoundary: contract.contract?.permissionBoundary || null,
      auditBoundary: contract.contract?.auditBoundary || null,
    },
  };
}

export async function readMousecatBridgeContract(config, upstream = "neo", options = {}) {
  const resourceName = options.resourceName || MOUSECAT_BRIDGE_RESOURCE_NAME;
  const listed = await discoverConnectorResources(config, upstream);
  if (!listed.ok) {
    return {
      schema: "mousecat.bridge/1",
      ok: false,
      code: listed.code,
      upstream,
      connector: listed.connector,
    };
  }

  const resource = listed.resources.find((candidate) => candidate.name === resourceName || candidate.uri === options.uri);
  if (!resource) {
    return {
      schema: "mousecat.bridge/1",
      ok: false,
      code: "bridge-resource-not-found",
      upstream,
      resourceName,
      resources: listed.resources.map((candidate) => ({
        name: candidate.name,
        uri: candidate.uri || null,
        schemaVersion: candidate.schema_version || null,
      })),
    };
  }

  const read = await readConnectorResource(config, upstream, {
    name: resource.name,
    uri: resource.uri,
    arguments: {
      includeInputSchemas: options.includeInputSchemas === true,
    },
  });
  if (!read.ok) {
    return {
      schema: "mousecat.bridge/1",
      ok: false,
      code: read.code,
      upstream,
      resource,
      connector: read.connector,
    };
  }

  const parsed = parseResourceJson(read);
  if (!parsed.ok) {
    return {
      schema: "mousecat.bridge/1",
      ok: false,
      upstream,
      resource,
      ...parsed,
    };
  }

  return {
    schema: "mousecat.bridge/1",
    ok: true,
    upstream,
    connector: listed.connector,
    summary: summarizeBridgeContract(upstream, resource, parsed.data),
  };
}
