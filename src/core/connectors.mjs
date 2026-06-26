import { callMcpTool, listMcpResources, listMcpTools, readMcpResource } from "./mcp-client.mjs";

export const PUBLIC_CONNECTOR_KINDS = Object.freeze([
  {
    id: "external-mcp",
    label: "External MCP Server",
    purpose: "Bridge to a locally configured MCP server without bundling that server's tools or private runtime.",
    transports: ["stdio"],
  },
]);

function connectorConfig(config, upstreamId) {
  return config.connectors?.[upstreamId] || config.upstreams?.[upstreamId]?.connector || null;
}

export function connectorSummary(config, upstreamId) {
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

  return {
    upstream: upstreamId,
    configured: Boolean(connector.command),
    enabled: connector.enabled !== false,
    kind: connector.kind || "external-mcp",
    transport: connector.transport || "stdio",
    commandConfigured: Boolean(connector.command),
    argsCount: Array.isArray(connector.args) ? connector.args.length : 0,
    cwdConfigured: Boolean(connector.cwd),
    envKeys: connector.env ? Object.keys(connector.env) : [],
    timeoutMs: connector.timeoutMs || 10000,
    discovery: connector.command ? "dynamic-tools-list" : "missing-command",
  };
}

export function connectorSummaries(config) {
  const ids = new Set([
    ...Object.keys(config.upstreams || {}),
    ...Object.keys(config.connectors || {}),
  ]);
  return [...ids].sort().map((id) => connectorSummary(config, id));
}

export function routeConnectorPlan(config, upstreamId, capability = null) {
  const summary = connectorSummary(config, upstreamId);
  if (!summary.enabled) {
    return {
      ...summary,
      invocationReady: false,
      reason: summary.configured ? "connector-disabled" : "connector-not-configured",
      capability,
    };
  }
  if (summary.transport !== "stdio") {
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
      reason: "connector-command-missing",
      capability,
    };
  }
  return {
    ...summary,
    invocationReady: Boolean(capability),
    reason: capability ? "external-mcp-tool-call-ready" : "external-mcp-discovery-ready",
    capability,
  };
}

export async function discoverConnectorTools(config, upstreamId) {
  const connector = connectorConfig(config, upstreamId);
  const plan = routeConnectorPlan(config, upstreamId);
  if (!plan.enabled || !plan.configured || plan.transport !== "stdio") {
    return {
      ok: false,
      code: plan.reason,
      connector: plan,
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

export async function discoverConnectorResources(config, upstreamId) {
  const connector = connectorConfig(config, upstreamId);
  const plan = routeConnectorPlan(config, upstreamId);
  if (!plan.enabled || !plan.configured || plan.transport !== "stdio") {
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

export async function readConnectorResource(config, upstreamId, resourceRef = {}) {
  const connector = connectorConfig(config, upstreamId);
  const plan = routeConnectorPlan(config, upstreamId, resourceRef.name || resourceRef.uri || null);
  if (!plan.enabled || !plan.configured || plan.transport !== "stdio") {
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

export async function invokeConnectorTool(config, upstreamId, toolName, payload = {}) {
  const connector = connectorConfig(config, upstreamId);
  const plan = routeConnectorPlan(config, upstreamId, toolName);
  if (!plan.enabled || !plan.configured || plan.transport !== "stdio") {
    return {
      ok: false,
      code: plan.reason,
      connector: plan,
    };
  }
  const called = await callMcpTool(connector, toolName, payload);
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
