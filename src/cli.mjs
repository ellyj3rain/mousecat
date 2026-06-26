#!/usr/bin/env node

import { catalogSnapshot } from "./core/catalog.mjs";
import { loadConfig } from "./core/config.mjs";
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
    return { value: raw };
  }
}

async function main(argv = process.argv.slice(2)) {
  const [command = "status", ...rest] = argv;

  if (command === "mcp") {
    if (rest.includes("--self-test")) {
      print(await selfTest());
      return;
    }
    await startStdioServer();
    return;
  }

  const config = await loadConfig();
  const runtime = createMousecatRuntime({ config });

  if (command === "status") {
    print(runtime.handleTool("mousecat.status", {}));
    return;
  }

  if (command === "catalog") {
    print(catalogSnapshot());
    return;
  }

  if (command === "buttons") {
    print(runtime.handleTool("mousecat.visualize", { includeEvents: false }).buttons);
    return;
  }

  if (command === "visualize") {
    print(runtime.handleTool("mousecat.visualize", { includeEvents: true }));
    return;
  }

  if (command === "ask") {
    const prompt = rest.join(" ") || "Decision required";
    print(runtime.handleTool("mousecat.ask", { prompt, shape: "point", skillRef: "crucible.point" }));
    return;
  }

  if (command === "queue") {
    const action = rest[0] || "list";
    const item = action === "enqueue"
      ? { prompt: rest.slice(1).join(" ") || "Decision required", shape: "point" }
      : undefined;
    print(runtime.handleTool("mousecat.queue", { action, item }));
    return;
  }

  if (command === "route") {
    const [upstream = "neo", capability = "status"] = rest;
    print(runtime.handleTool("mousecat.route", { upstream, capability }));
    return;
  }

  if (command === "invoke") {
    const [upstream = "neo", capability = "status", permitJson = ""] = rest;
    print(runtime.handleTool("mousecat.invoke", { upstream, capability, permit: readJsonArg(permitJson, {}) }));
    return;
  }

  if (command === "credentials") {
    print(runtime.handleTool("mousecat.credentials", readJsonArg(rest.join(" "), { action: "status" })));
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
    commands: ["status", "catalog", "buttons", "visualize", "ask", "queue", "route", "invoke", "credentials", "permits", "mcp"],
  });
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
