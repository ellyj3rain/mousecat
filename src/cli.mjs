#!/usr/bin/env node

import { catalogSnapshot } from "./core/catalog.mjs";
import { loadConfig } from "./core/config.mjs";
import { connectorSummaries, discoverConnectorResources, discoverConnectorTools } from "./core/connectors.mjs";
import { createMousecatRuntime } from "./core/runtime.mjs";
import { selfTest, startStdioServer } from "./mcp/server.mjs";

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

async function main(argv = process.argv.slice(2)) {
  const parsed = parseGlobalOptions(argv);
  const [command = "status", ...rest] = parsed.argv;

  if (command === "mcp") {
    if (rest.includes("--self-test")) {
      print(await selfTest({ configPath: parsed.configPath }));
      return;
    }
    await startStdioServer({ configPath: parsed.configPath });
    return;
  }

  const config = await loadConfig(parsed.configPath);
  const runtime = createMousecatRuntime({ config });

  if (command === "status") {
    print(await runtime.handleTool("mousecat.status", {}));
    return;
  }

  if (command === "catalog") {
    print(catalogSnapshot());
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

  if (command === "ask") {
    const prompt = rest.join(" ") || "Decision required";
    print(await runtime.handleTool("mousecat.ask", { prompt, shape: "point", skillRef: "crucible.point" }));
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
    commands: ["status", "catalog", "connectors", "tools", "resources", "bridge", "buttons", "visualize", "widget", "ask", "queue", "route", "invoke", "credentials", "permits", "mcp"],
  });
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
