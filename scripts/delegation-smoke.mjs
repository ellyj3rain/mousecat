#!/usr/bin/env node

import assert from "node:assert/strict";

import { createMousecatRuntime } from "../src/core/runtime.mjs";

const config = {
  hostProfile: "smoke",
  credentials: { policy: "references-only" },
  upstreams: { neo: { enabled: true } },
  connectors: {
    neo: {
      enabled: true,
      kind: "external-mcp",
      transport: "http",
      url: "http://127.0.0.1:9/mcp",
      timeoutMs: 5000,
    },
  },
};
const runtime = createMousecatRuntime({
  config,
  connectorInvoker: async () => ({
    ok: true,
    result: { structuredContent: { recommendation: "rejoin" } },
  }),
});
const origin = await runtime.handleTool("mousecat.skill", {
  action: "invoke",
  skillRef: "crucible",
  source: { host: "cli", sessionId: "delegation-smoke", invocationId: "origin" },
  intake: { seams: [{ id: "held-seam", prompt: "Delegate this seam", shape: "freeform" }] },
});
runtime.handleTool("mousecat.widget", {
  action: "hold",
  interactionId: origin.interactionId,
  responses: [{ itemId: origin.items[0].id, reason: "Council" }],
});
const started = runtime.handleTool("mousecat.delegation", {
  action: "start",
  source: { host: "cli", sessionId: "delegation-smoke", invocationId: "council" },
  origin: { interactionId: origin.interactionId, itemId: origin.items[0].id },
  originContinuationToken: origin.continuation.arguments.continuationToken,
  target: { upstream: "neo", capability: "run_topology_v1" },
  payload: { topology: "peer-review-ring", prompt: "Smoke council" },
  permit: { profileId: "tool-invocation" },
});
const delegationToken = started.continuation.arguments.delegationToken;
const completed = await runtime.handleTool("mousecat.delegation", {
  action: "await",
  delegationId: started.delegationId,
  delegationToken,
  waitMs: 1000,
});
const rejoined = await runtime.handleTool("mousecat.delegation", {
  action: "rejoin",
  delegationId: started.delegationId,
  delegationToken,
  permit: { profileId: "operator-interaction" },
  seam: {
    id: "rejoin",
    prompt: "Adopt the council result?",
    options: [{ label: "Adopt", value: "adopt", recommended: true }],
  },
});

assert.equal(started.status, "running");
assert.equal(completed.status, "completed");
assert.equal(rejoined.schema, "mousecat.delegation-rejoin/1");
assert.equal(rejoined.interaction.items[0].lineage.originItemId, origin.items[0].id);
process.stdout.write(`${JSON.stringify({
  schema: "mousecat.delegation-smoke/1",
  status: "passed",
  delegationId: started.delegationId,
  rejoinInteractionId: rejoined.interaction.interactionId,
})}\n`);
