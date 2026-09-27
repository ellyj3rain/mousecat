#!/usr/bin/env node

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../core/config.mjs";
import { createMousecatRuntime } from "../core/runtime.mjs";
import { startOperatorServer } from "../operator/server.mjs";

const SERVICE_ID = "mousecat-operator";
const recordPath = resolve(homedir(), ".mousecat", "user-service.json");

function options(argv) {
  const parsed = { port: 4317, configPath: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--port") parsed.port = Number(argv[++index]);
    else if (argv[index] === "--config") parsed.configPath = argv[++index];
  }
  if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) throw new Error("Invalid Mousecat service port.");
  return parsed;
}

const serviceOptions = options(process.argv.slice(2));
const config = await loadConfig(serviceOptions.configPath);
const runtime = createMousecatRuntime({ config });
const app = await startOperatorServer({ runtime, port: serviceOptions.port, nativeViews: config.nativeViews });
mkdirSync(dirname(recordPath), { recursive: true });
writeFileSync(recordPath, `${JSON.stringify({
  schema: "mousecat.user-service-record/1",
  serviceId: SERVICE_ID,
  pid: process.pid,
  runnerPath: fileURLToPath(import.meta.url),
  configPath: resolve(serviceOptions.configPath || "mousecat.config.json"),
  workingDirectory: process.cwd(),
  persistence: { enabled: config.state?.enabled === true, path: resolve(config.state?.path || ".mousecat/state.json") },
  port: app.port,
  startedAt: new Date().toISOString(),
})}\n`, "utf8");

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  rmSync(recordPath, { force: true });
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
