import {
  callMcpTool,
  isHttpMcpTransport,
  listMcpResources,
  listMcpTools,
  readMcpResource,
} from "./mcp-client.mjs";
import { basename, isAbsolute } from "node:path";
import {
  integrationAdapter,
  integrationAdapterTools,
  sourceIntegrationAdapterRegistry,
} from "./integration-adapters.mjs";
import { invokeIntegrationAdapter } from "./integration-runner.mjs";

export const SUPPORTED_MCP_TRANSPORTS = Object.freeze(["stdio", "http", "streamable-http"]);
export const SUPPORTED_INTEGRATION_TRANSPORTS = Object.freeze(["cli-json"]);
export const SUPPORTED_CONNECTOR_TRANSPORTS = Object.freeze([...SUPPORTED_MCP_TRANSPORTS, ...SUPPORTED_INTEGRATION_TRANSPORTS]);

export const PUBLIC_CONNECTOR_KINDS = Object.freeze([
  {
    id: "external-mcp",
    label: "External MCP Server",
    purpose: "Bridge to a locally configured MCP server without bundling that server's tools or private runtime.",
    transports: SUPPORTED_MCP_TRANSPORTS,
  },
  {
    id: "integration-adapter",
    label: "Integration Adapter",
    purpose: "Translate a source-owned external API or CLI capability map into normalized Mousecat invocation results.",
    transports: SUPPORTED_INTEGRATION_TRANSPORTS,
  },
]);

function connectorConfig(config, upstreamId) {
  return config.connectors?.[upstreamId] || config.upstreams?.[upstreamId]?.connector || null;
}

function connectorTransport(connector) {
  return connector?.transport || "stdio";
}

function connectorEndpointConfigured(connector) {
  return Boolean(connector?.url || connector?.endpoint || connector?.baseUrl);
}

function integrationRegistry(options = {}) {
  return options.integrationRegistry || sourceIntegrationAdapterRegistry();
}

function integrationManifestForUpstream(upstreamId, registry) {
  return registry.manifests().adapters.find((adapter) => adapter.upstream === upstreamId) || null;
}

function connectorConfigured(connector, upstreamId, options = {}) {
  const transport = connectorTransport(connector);
  const registry = integrationRegistry(options);
  const upstreamManifest = integrationManifestForUpstream(upstreamId, registry);
  if (upstreamManifest && (connector?.kind !== "integration-adapter" || transport !== upstreamManifest.transport)) return false;
  if (SUPPORTED_INTEGRATION_TRANSPORTS.includes(transport)) {
    const adapter = integrationAdapter(connector?.adapter, registry);
    return Boolean(
      adapter
      && connector.kind === "integration-adapter"
      && adapter.upstream === upstreamId
      && adapter.transport === transport
      && isAbsolute(String(connector.executablePath || ""))
      && adapter.executable.acceptedNames.includes(basename(String(connector.executablePath)).toLowerCase())
      && /^[a-f0-9]{64}$/iu.test(String(connector.executableSha256 || ""))
    );
  }
  if (transport === "stdio") return Boolean(connector?.command);
  if (transport === "http" || transport === "streamable-http") return connectorEndpointConfigured(connector);
  return false;
}

function missingConnectorReason(transport) {
  if (SUPPORTED_INTEGRATION_TRANSPORTS.includes(transport)) return "integration-adapter-missing";
  return transport === "stdio" ? "connector-command-missing" : "connector-url-missing";
}

export function connectorSummary(config, upstreamId, options = {}) {
  const connector = connectorConfig(config, upstreamId);
  if (!connector) {
    return {
      upstream: upstreamId,
      configured: false,
      enabled: false,
      kind: null,
      transport: null,
      discovery: "not-configured",
    };
  }

  const transport = connectorTransport(connector);
  const registry = integrationRegistry(options);
  const upstreamManifest = integrationManifestForUpstream(upstreamId, registry);
  const integrationOwned = Boolean(upstreamManifest);
  const integrationBindingMismatch = integrationOwned && (
    connector.kind !== "integration-adapter"
    || transport !== upstreamManifest.transport
    || connector.adapter !== upstreamManifest.id
  );
  const configured = connectorConfigured(connector, upstreamId, options);
  return {
    upstream: upstreamId,
    configured,
    enabled: connector.enabled !== false,
    kind: connector.kind || "external-mcp",
    transport,
    integrationOwned,
    adapterRef: connector.adapter || null,
    commandConfigured: SUPPORTED_INTEGRATION_TRANSPORTS.includes(transport) ? configured : Boolean(connector.command),
    endpointConfigured: connectorEndpointConfigured(connector),
    argsCount: Array.isArray(connector.args) ? connector.args.length : 0,
    cwdConfigured: Boolean(connector.cwd),
    tokenEnvConfigured: Boolean(connector.tokenEnv || connector.bearerTokenEnv || connector.auth?.tokenEnv),
    envKeys: connector.env ? Object.keys(connector.env) : [],
    timeoutMs: connector.timeoutMs || 10000,
    cancellationGraceMs: Number.isInteger(connector.cancellationGraceMs)
      ? Math.max(100, Math.min(connector.cancellationGraceMs, 5000))
      : 1000,
    cancellationHandshake: isHttpMcpTransport(transport)
      ? "notification-plus-negotiated-status"
      : SUPPORTED_INTEGRATION_TRANSPORTS.includes(transport)
        ? "process-termination-outcome-classified-by-access"
        : "process-termination-unacknowledged",
    authMode: integrationOwned ? upstreamManifest.auth : null,
    configurationError: integrationBindingMismatch ? "integration-connector-binding-mismatch" : null,
    discovery: configured
      ? SUPPORTED_INTEGRATION_TRANSPORTS.includes(transport) ? "source-owned-capability-map" : "dynamic-tools-list"
      : integrationBindingMismatch ? "integration-connector-binding-mismatch" : missingConnectorReason(transport),
  };
}

export function connectorSummaries(config, options = {}) {
  const ids = new Set([
    ...Object.keys(config.upstreams || {}),
    ...Object.keys(config.connectors || {}),
  ]);
  return [...ids].sort().map((id) => connectorSummary(config, id, options));
}

export function routeConnectorPlan(config, upstreamId, capability = null, options = {}) {
  const registry = integrationRegistry(options);
  const summary = connectorSummary(config, upstreamId, options);
  if (!summary.enabled) {
    return {
      ...summary,
      invocationReady: false,
      reason: summary.configured ? "connector-disabled" : "connector-not-configured",
      capability,
    };
  }
  if (!SUPPORTED_CONNECTOR_TRANSPORTS.includes(summary.transport)) {
    return {
      ...summary,
      invocationReady: false,
      reason: "unsupported-connector-transport",
      capability,
    };
  }
  if (!summary.configured) {
    return {
      ...summary,
      invocationReady: false,
      reason: summary.configurationError || missingConnectorReason(summary.transport),
      capability,
    };
  }
  if (SUPPORTED_INTEGRATION_TRANSPORTS.includes(summary.transport) && capability && capability !== "tools/list") {
    const available = integrationAdapterTools(summary.adapterRef, registry) || [];
    if (!available.some((candidate) => candidate.name === capability)) {
      return {
        ...summary,
        invocationReady: false,
        reason: "integration-capability-unknown",
        capability,
      };
    }
    return {
      ...summary,
      capabilityKnown: true,
      invocationReady: true,
      reason: "integration-capability-ready",
      capability,
    };
  }
  return {
    ...summary,
    invocationReady: Boolean(capability),
    reason: SUPPORTED_INTEGRATION_TRANSPORTS.includes(summary.transport)
      ? capability && capability !== "tools/list" ? "integration-capability-ready" : "integration-discovery-ready"
      : capability ? "external-mcp-tool-call-ready" : "external-mcp-discovery-ready",
    capability,
  };
}

export async function discoverConnectorTools(config, upstreamId, options = {}) {
  const connector = connectorConfig(config, upstreamId);
  const registry = integrationRegistry(options);
  const plan = routeConnectorPlan(config, upstreamId, null, options);
  if (!plan.enabled || !plan.configured || !SUPPORTED_CONNECTOR_TRANSPORTS.includes(plan.transport)) {
    return {
      ok: false,
      code: plan.reason,
      connector: plan,
    };
  }
  if (SUPPORTED_INTEGRATION_TRANSPORTS.includes(plan.transport)) {
    return {
      ok: true,
      schema: "mousecat.connector.tools/1",
      upstream: upstreamId,
      connector: plan,
      tools: integrationAdapterTools(connector.adapter, registry) || [],
      raw: null,
    };
  }
  const listed = await listMcpTools(connector);
  if (!listed.ok) return { ...listed, connector: plan };
  return {
    ok: true,
    schema: "mousecat.connector.tools/1",
    upstream: upstreamId,
    connector: plan,
    tools: listed.result?.tools || [],
    raw: listed.result,
  };
}

export async function discoverConnectorResources(config, upstreamId, options = {}) {
  const connector = connectorConfig(config, upstreamId);
  const plan = routeConnectorPlan(config, upstreamId, null, options);
  if (SUPPORTED_INTEGRATION_TRANSPORTS.includes(plan.transport)) {
    return { ok: false, code: "integration-resources-unsupported", connector: plan };
  }
  if (!plan.enabled || !plan.configured || !SUPPORTED_MCP_TRANSPORTS.includes(plan.transport)) {
    return {
      ok: false,
      code: plan.reason,
      connector: plan,
    };
  }
  const listed = await listMcpResources(connector);
  if (!listed.ok) return { ...listed, connector: plan };
  return {
    ok: true,
    schema: "mousecat.connector.resources/1",
    upstream: upstreamId,
    connector: plan,
    resources: listed.result?.resources || [],
    raw: listed.result,
  };
}

export async function readConnectorResource(config, upstreamId, resourceRef = {}, options = {}) {
  const connector = connectorConfig(config, upstreamId);
  const plan = routeConnectorPlan(config, upstreamId, resourceRef.name || resourceRef.uri || null, options);
  if (SUPPORTED_INTEGRATION_TRANSPORTS.includes(plan.transport)) {
    return { ok: false, code: "integration-resources-unsupported", connector: plan };
  }
  if (!plan.enabled || !plan.configured || !SUPPORTED_MCP_TRANSPORTS.includes(plan.transport)) {
    return {
      ok: false,
      code: plan.reason,
      connector: plan,
    };
  }
  const read = await readMcpResource(connector, resourceRef);
  if (!read.ok) return { ...read, connector: plan };
  return {
    ok: true,
    schema: "mousecat.connector.resource/1",
    upstream: upstreamId,
    connector: plan,
    resource: {
      name: resourceRef.name || null,
      uri: resourceRef.uri || null,
    },
    result: read.result,
  };
}

export async function invokeConnectorTool(config, upstreamId, toolName, payload = {}, options = {}) {
  const configuredConnector = connectorConfig(config, upstreamId);
  const connector = configuredConnector && Number.isInteger(options.timeoutMs)
    ? { ...configuredConnector, timeoutMs: options.timeoutMs }
    : configuredConnector;
  const plan = routeConnectorPlan(config, upstreamId, toolName, options);
  if (!plan.enabled || !plan.configured || !SUPPORTED_CONNECTOR_TRANSPORTS.includes(plan.transport)) {
    return {
      ok: false,
      code: plan.reason,
      connector: plan,
    };
  }
  if (SUPPORTED_INTEGRATION_TRANSPORTS.includes(plan.transport)) {
    const called = await invokeIntegrationAdapter(connector, toolName, payload, {
      timeoutMs: options.timeoutMs,
      commandRunner: options.commandRunner,
      registry: integrationRegistry(options),
    });
    if (!called.ok) return { ...called, connector: plan };
    return {
      ok: true,
      schema: "mousecat.connector.invoke/1",
      upstream: upstreamId,
      tool: toolName,
      connector: plan,
      result: called,
    };
  }
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : connector?.timeoutMs;
  const deadlineAt = Number.isFinite(options.deadlineAt)
    ? options.deadlineAt
    : Date.now() + (Number.isFinite(timeoutMs) ? timeoutMs : 10000);
  const called = await callMcpTool(connector, toolName, payload, {
    deadlineAt,
    cancellationGraceMs: options.cancellationGraceMs ?? connector?.cancellationGraceMs,
  });
  if (!called.ok) return { ...called, connector: plan };
  return {
    ok: true,
    schema: "mousecat.connector.invoke/1",
    upstream: upstreamId,
    tool: toolName,
    connector: plan,
    result: called.result,
  };
}
