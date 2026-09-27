#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { loadConfig } from "../src/core/config.mjs";
import {
  connectorSummary,
  discoverConnectorResources,
  discoverConnectorTools,
  readConnectorResource,
} from "../src/core/connectors.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";

export const REQUIRED_NEO_TOOLS = Object.freeze([
  "crucible_classify_v1",
  "neo_intent_v1",
  "datastore_query_v1",
]);

export const REQUIRED_NEO_RESOURCES = Object.freeze([
  "mousecat_bridge_contract_v1",
  "runtime_identity_v1",
  "runtime_capability_v1",
  "runtime_doctor_v1",
]);

function parseArgs(argv) {
  const options = {
    configPath: "mousecat.config.json",
    upstream: "neo",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config") {
      options.configPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--upstream") {
      options.upstream = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function parseJsonContent(readResult) {
  const text = readResult?.result?.contents?.find((item) => typeof item.text === "string")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function compactCounts(value) {
  const counts = value?.counts || value?.capabilityCounts || value?.capability?.counts || value?.capabilities?.counts || {};
  return {
    providers: Number.isInteger(counts.providers) ? counts.providers : null,
    models: Number.isInteger(counts.models) ? counts.models : null,
    topologies: Number.isInteger(counts.topologies) ? counts.topologies : null,
    roles: Number.isInteger(counts.roles) ? counts.roles : null,
  };
}

function sanitizeIdentity(value) {
  return {
    schema: value?.schema || null,
    runtimeId: value?.runtimeId || value?.id || null,
    version: value?.version || value?.identity?.version || null,
    rev: value?.rev || value?.source?.rev || value?.identity?.source?.rev || null,
    source: value?.source?.from || value?.source?.kind || value?.source?.source || null,
  };
}

function sanitizeDoctor(value) {
  const grounding = value?.grounding || value?.identity?.grounding || {};
  const groundingResult = grounding.grounding || {};
  return {
    schema: value?.schema || null,
    status: value?.status || null,
    version: value?.version || value?.identity?.version || null,
    branch: grounding.branch || value?.branch || null,
    head: grounding.head || value?.head || value?.source?.rev || null,
    worktreeKind: grounding.worktreeKind || value?.worktreeKind || null,
    groundingStatus: grounding.status || groundingResult.status || value?.groundingStatus || null,
    failClosed: typeof grounding.failClosed === "boolean"
      ? grounding.failClosed
      : typeof groundingResult.failClosed === "boolean"
        ? groundingResult.failClosed
        : value?.failClosed ?? null,
    capabilityCounts: compactCounts(value),
  };
}

function resourceStatus(readResult, sanitizer = (value) => value) {
  const parsed = parseJsonContent(readResult);
  return {
    ok: readResult?.ok === true && Boolean(parsed),
    code: readResult?.ok === true && parsed ? "read" : readResult?.code || "resource-json-unavailable",
    value: parsed ? sanitizer(parsed) : null,
  };
}

function requireNames(kind, names, presentNames, failures) {
  const present = {};
  for (const name of names) {
    present[name] = presentNames.includes(name);
    if (!present[name]) failures.push(`${kind}:${name}:missing`);
  }
  return present;
}

export async function buildNeoLiveSmokeReport(config, options = {}) {
  const upstream = options.upstream || "neo";
  const failures = [];
  const runtime = createMousecatRuntime({ config });

  const connector = connectorSummary(config, upstream);
  if (!connector.configured) failures.push("connector:not-configured");
  if (!connector.enabled) failures.push("connector:disabled");

  const tools = await discoverConnectorTools(config, upstream);
  const toolNames = tools.ok ? tools.tools.map((tool) => tool.name).filter(Boolean).sort() : [];
  if (!tools.ok) failures.push(`tools:${tools.code || "unavailable"}`);

  const resources = await discoverConnectorResources(config, upstream);
  const resourceNames = resources.ok ? resources.resources.map((resource) => resource.name).filter(Boolean).sort() : [];
  if (!resources.ok) failures.push(`resources:${resources.code || "unavailable"}`);

  const bridge = await runtime.handleTool("mousecat.bridge", { upstream });
  if (!bridge.ok) failures.push(`bridge:${bridge.code || "unavailable"}`);

  const route = runtime.handleTool("mousecat.route", { upstream, capability: "crucible_classify_v1" });
  if (!route.ok || route.plan?.invocationReady !== true) failures.push(`route:${route.code || route.plan?.reason || "not-ready"}`);

  const invocation = await runtime.handleTool("mousecat.invoke", {
    upstream,
    capability: "crucible_classify_v1",
    permit: { profileId: "tool-invocation" },
    payload: { question: "mousecat_neo_live_smoke", settled: true },
  });
  if (!invocation.ok) failures.push(`invoke:${invocation.code || "failed"}`);

  const identity = resourceStatus(
    await readConnectorResource(config, upstream, {
      name: "runtime_identity_v1",
      uri: "neo://resources/runtime_identity_v1",
    }),
    sanitizeIdentity,
  );
  if (!identity.ok) failures.push(`runtime_identity:${identity.code}`);

  const capability = resourceStatus(
    await readConnectorResource(config, upstream, {
      name: "runtime_capability_v1",
      uri: "neo://resources/runtime_capability_v1",
    }),
    compactCounts,
  );
  if (!capability.ok) failures.push(`runtime_capability:${capability.code}`);

  const doctor = resourceStatus(
    await readConnectorResource(config, upstream, {
      name: "runtime_doctor_v1",
      uri: "neo://resources/runtime_doctor_v1",
    }),
    sanitizeDoctor,
  );
  if (!doctor.ok) failures.push(`runtime_doctor:${doctor.code}`);

  const requiredTools = requireNames("tool", REQUIRED_NEO_TOOLS, toolNames, failures);
  const requiredResources = requireNames("resource", REQUIRED_NEO_RESOURCES, resourceNames, failures);

  return {
    schema: "mousecat.neo-live-smoke/1",
    ok: failures.length === 0,
    upstream,
    connector,
    tools: {
      ok: tools.ok === true,
      count: toolNames.length,
      required: requiredTools,
    },
    resources: {
      ok: resources.ok === true,
      count: resourceNames.length,
      required: requiredResources,
    },
    bridge: {
      ok: bridge.ok === true,
      contractVersion: bridge.summary?.contractVersion || null,
      counts: bridge.summary?.counts || null,
      boundaries: bridge.summary?.boundaries || [],
      server: bridge.summary?.server
        ? {
          name: bridge.summary.server.name || null,
          staleCode: bridge.summary.server.staleCode || null,
        }
        : null,
    },
    runtime: {
      identity: identity.value,
      doctor: doctor.value,
      capabilityCounts: capability.value,
    },
    route: {
      ok: route.ok === true,
      invocationReady: route.plan?.invocationReady === true,
      reason: route.plan?.reason || null,
      capability: route.plan?.capability || null,
      requiredPermit: route.plan?.requiredPermit || null,
    },
    invocation: {
      ok: invocation.ok === true,
      code: invocation.code || null,
      forwarded: invocation.code === "connector-forwarded",
    },
    failures,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const config = await loadConfig(options.configPath);
  const report = await buildNeoLiveSmokeReport(config, options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
