#!/usr/bin/env node

import { createMousecatClient, runMousecatHostConformance } from "../src/sdk/index.mjs";

function argumentsMap(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function safeError(error) {
  return {
    schema: "mousecat.sdk-host-conformance.error/1",
    ok: false,
    code: error?.code || "conformance-runner-failed",
    ...(error?.field ? { field: error.field } : {}),
    ...(error?.status ? { status: error.status } : {}),
    ...(error?.cleanupFailureCode ? { cleanupFailureCode: error.cleanupFailureCode } : {}),
  };
}

const args = argumentsMap(process.argv.slice(2));
const profileId = String(args.profile || "");
const sessionId = String(args.session || "");
const client = createMousecatClient({
  endpoint: args.endpoint || "http://127.0.0.1:4317/mcp",
  clientInfo: {
    name: `mousecat-${profileId || "host"}-conformance`,
    version: "1.0.0",
  },
});
const controller = new AbortController();
const abort = () => controller.abort(new Error("conformance-runner-interrupted"));
process.once("SIGINT", abort);
process.once("SIGTERM", abort);

try {
  const report = await runMousecatHostConformance(client, {
    profileId,
    sessionId,
    invocationId: args.invocation || `${sessionId}-crucible`,
    ...(args.thread ? { threadId: String(args.thread) } : {}),
    ...(args.model ? { model: String(args.model) } : {}),
    ...(args.prompt ? { prompt: String(args.prompt) } : {}),
    ...(args["timeout-ms"] ? { timeoutMs: Number(args["timeout-ms"]) } : {}),
    callOptions: { signal: controller.signal },
    ...(args["gitlab-read"] ? {
      integration: {
        upstream: "gitlab",
        capability: "gitlab.user.get",
        permit: { profileId: "tool-invocation" },
      },
    } : {}),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify(safeError(error))}\n`);
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", abort);
  process.removeListener("SIGTERM", abort);
  await client.close({ signal: AbortSignal.timeout(5000) }).catch(() => {});
}
