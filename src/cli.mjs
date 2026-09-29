#!/usr/bin/env node

import { randomUUID } from "node:crypto";

import { catalogSnapshot } from "./core/catalog.mjs";
import { defaultConfig, loadConfig } from "./core/config.mjs";
import { connectorSummaries, discoverConnectorResources, discoverConnectorTools } from "./core/connectors.mjs";
import { createMousecatRuntime } from "./core/runtime.mjs";
import { selfTest, startStdioServer } from "./mcp/server.mjs";
import { selfTestOperatorServer, startOperatorServer } from "./operator/server.mjs";
import { manageUserService } from "./service/user-service.mjs";

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readJsonArg(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    const pair = /^([A-Za-z0-9_.-]+)=(.*)$/.exec(raw);
    if (pair) return { [pair[1]]: pair[2] };
    return { value: raw };
  }
}

function parseGlobalOptions(argv) {
  const rest = [];
  let configPath;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config") {
      configPath = argv[index + 1];
      index += 1;
      continue;
    }
    rest.push(value);
  }
  return { argv: rest, configPath };
}

function parseOperatorOptions(argv) {
  let port = 4317;
  let demo = false;
  let selfTest = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--port") {
      const parsed = Number(argv[index + 1]);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new Error("--port must be an integer from 0 through 65535");
      }
      port = parsed;
      index += 1;
      continue;
    }
    if (value === "--demo") {
      demo = true;
      continue;
    }
    if (value === "--self-test") {
      selfTest = true;
      continue;
    }
    throw new Error(`Unknown operator option: ${value}`);
  }
  return { port, demo, selfTest };
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseGlobalOptions(argv);
  const [command = "status", ...rest] = parsed.argv;

  if (command === "service") {
    const action = rest[0] || "status";
    const portIndex = rest.indexOf("--port");
    const port = portIndex >= 0 ? Number(rest[portIndex + 1]) : 4317;
    print(await manageUserService(action, { configPath: parsed.configPath, port }));
    return;
  }

  if (command === "mcp") {
    if (rest.includes("--self-test")) {
      print(await selfTest({ configPath: parsed.configPath }));
      return;
    }
    await startStdioServer({ configPath: parsed.configPath });
    return;
  }

  const operatorOptions = command === "operator" ? parseOperatorOptions(rest) : null;
  const demo = operatorOptions?.demo === true;
  const config = demo ? defaultConfig() : await loadConfig(parsed.configPath);
  const runtime = createMousecatRuntime({ config });

  if (command === "operator") {
    if (operatorOptions.selfTest) {
      print(await selfTestOperatorServer({ config }));
      return;
    }
    const app = await startOperatorServer({
      runtime,
      nativeViews: demo ? undefined : config.nativeViews,
      port: operatorOptions.port,
      demo: operatorOptions.demo,
    });
    print({ schema: app.schema, ok: true, url: app.url, mcpUrl: app.mcpUrl, host: app.host, port: app.port });
    const close = async () => {
      await app.close();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    return;
  }

  if (command === "status") {
    print(await runtime.handleTool("mousecat.status", {}));
    return;
  }

  if (command === "catalog") {
    print(catalogSnapshot());
    return;
  }

  if (command === "registry") {
    print(await runtime.handleTool("mousecat.registry", readJsonArg(rest.join(" "), { action: "list" })));
    return;
  }

  if (command === "connectors") {
    print(connectorSummaries(config));
    return;
  }

  if (command === "tools") {
    const [upstream = "neo"] = rest;
    print(await discoverConnectorTools(config, upstream));
    return;
  }

  if (command === "resources") {
    const [upstream = "neo"] = rest;
    print(await discoverConnectorResources(config, upstream));
    return;
  }

  if (command === "bridge") {
    const [upstream = "neo", resourceName = ""] = rest;
    print(await runtime.handleTool("mousecat.bridge", { upstream, resourceName: resourceName || undefined }));
    return;
  }

  if (command === "buttons") {
    const visual = await runtime.handleTool("mousecat.visualize", { includeEvents: false });
    print(visual.buttons);
    return;
  }

  if (command === "adapters") {
    print(catalogSnapshot().adapterRenderPackets);
    return;
  }

  if (command === "host-state") {
    const [profileId = "", limitRaw = ""] = rest;
    const limit = /^\d+$/u.test(limitRaw) ? Number(limitRaw) : undefined;
    print(await runtime.handleTool("mousecat.host-state", {
      ...(profileId ? { profileId } : {}),
      ...(limit ? { limit } : {}),
    }));
    return;
  }

  if (command === "visualize") {
    print(await runtime.handleTool("mousecat.visualize", { includeEvents: true }));
    return;
  }

  if (command === "widget") {
    const [action = "available", payload = ""] = rest;
    print(await runtime.handleTool("mousecat.widget", {
      action,
      ...(payload ? readJsonArg(payload, {}) : {}),
    }));
    return;
  }

  if (command === "skill") {
    const [skillRef = "crucible", ...promptParts] = rest;
    const prompt = promptParts.join(" ") || "Decision required";
    print(await runtime.handleTool("mousecat.skill", {
      action: "invoke",
      skillRef,
      source: { host: "cli", invocationId: randomUUID() },
      intake: { seams: [{ id: "cli-seam", prompt }] },
    }));
    return;
  }

  if (command === "ask") {
    const prompt = rest.join(" ") || "Decision required";
    print(await runtime.handleTool("mousecat.ask", { prompt, shape: "point", skillRef: "crucible.point" }));
    return;
  }

  if (command === "session") {
    const [action = "snapshot", sessionId = ""] = rest;
    print(await runtime.handleTool("mousecat.session", {
      action,
      ...(sessionId ? { sessionId } : {}),
    }));
    return;
  }

  if (command === "queue") {
    const action = rest[0] || "list";
    const item = action === "enqueue"
      ? { prompt: rest.slice(1).join(" ") || "Decision required", shape: "point" }
      : undefined;
    print(await runtime.handleTool("mousecat.queue", { action, item }));
    return;
  }

  if (command === "route") {
    const [upstream = "neo", capability = "status"] = rest;
    print(await runtime.handleTool("mousecat.route", { upstream, capability }));
    return;
  }

  if (command === "invoke") {
    const [upstream = "neo", capability = "tools/list", permitJson = "", payloadJson = ""] = rest;
    print(await runtime.handleTool("mousecat.invoke", {
      upstream,
      capability,
      permit: readJsonArg(permitJson, {}),
      payload: readJsonArg(payloadJson, {}),
    }));
    return;
  }

  if (command === "credentials") {
    print(await runtime.handleTool("mousecat.credentials", readJsonArg(rest.join(" "), { action: "status" })));
    return;
  }

  if (command === "permits") {
    print(catalogSnapshot().workPermitProfiles);
    return;
  }

  print({
    ok: false,
    code: "unknown-command",
    command,
    commands: ["status", "catalog", "registry", "connectors", "tools", "resources", "bridge", "buttons", "adapters", "host-state", "visualize", "widget", "skill", "ask", "session", "queue", "route", "invoke", "credentials", "permits", "operator", "service", "mcp"],
  });
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
