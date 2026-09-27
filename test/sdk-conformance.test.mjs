import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";
import {
  MousecatConformanceError,
  createMousecatClient,
  runMousecatHostConformance,
} from "../src/sdk/index.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GLAB_FIXTURE = join(ROOT, "fixtures", "glab");
const GLAB_SHA256 = createHash("sha256").update(readFileSync(GLAB_FIXTURE)).digest("hex");
const execFileAsync = promisify(execFile);

async function startConformanceFixture(t, runtime = createMousecatRuntime()) {
  const app = await startOperatorServer({ runtime, port: 0 });
  const client = createMousecatClient({
    endpoint: app.mcpUrl,
    clientInfo: { name: "mousecat-conformance-test", version: "1.0.0" },
  });
  t.after(async () => {
    await client.close().catch(() => {});
    await app.close();
  });
  return { runtime, client };
}

function gitlabRuntime() {
  return createMousecatRuntime({
    config: {
      hostProfile: "test",
      adapterProfile: "generic-mcp",
      credentials: { policy: "references-only" },
      upstreams: { gitlab: { enabled: true } },
      connectors: { gitlab: {
        enabled: true,
        kind: "integration-adapter",
        transport: "cli-json",
        adapter: "gitlab-v4",
        executablePath: GLAB_FIXTURE,
        executableSha256: GLAB_SHA256,
        hostname: "gitlab.example.com",
      } },
    },
    integrationCommandRunner: async () => ({
      code: 0,
      stdout: JSON.stringify({ id: 17, username: "conformance-user" }),
      stderr: "",
    }),
  });
}

async function resolvePending(runtime, sessionId, value = "observed") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const interaction = [...runtime.state.interactions.values()]
      .find((candidate) => candidate.invocation?.source?.sessionId === sessionId);
    if (interaction) {
      runtime.handleTool("mousecat.widget", {
        action: "respond",
        interactionId: interaction.interactionId,
        responses: [{ itemId: interaction.items[0].id, selectedOption: value, value }],
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Conformance interaction did not appear for ${sessionId}`);
}

async function runResolved(runtime, client, options, value = "observed") {
  const running = runMousecatHostConformance(client, options);
  await resolvePending(runtime, options.sessionId, value);
  return running;
}

test("host conformance proves the full decision lifecycle without leaking capabilities", async (t) => {
  const { runtime, client } = await startConformanceFixture(t);
  const report = await runResolved(runtime, client, {
    profileId: "codex",
    sessionId: "codex-conformance",
    threadId: "sdk-contract",
  });

  assert.equal(report.ok, true);
  assert.equal(report.host, "codex");
  assert.equal(report.provider, "openai");
  assert.equal(report.decisionStatus, "answered");
  assert.equal(report.continuation.previousSkillRef, "crucible");
  assert.equal(report.continuation.fixedNextSkill, null);
  assert.equal(report.hostSessionClosed, true);
  assert.ok(report.checkedRequirements.includes("operator-decision-round-trip"));
  assert.deepEqual(report.skippedRequirements, [
    "provider-discovery-when-configured",
    "provider-read-when-configured",
  ]);
  assert.equal(runtime.state.sessions.get("codex-conformance").status, "closed");
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /continuationToken|namespaceToken|resultToken/u);
});

test("host conformance preserves construction-bound host identity", async (t) => {
  const { runtime, client } = await startConformanceFixture(t);
  const report = await runResolved(runtime, client, {
    profileId: "claude",
    sessionId: "claude-conformance",
    host: "spoofed-host",
    provider: "spoofed-provider",
  });

  assert.equal(report.profileId, "claude");
  assert.equal(report.host, "spoofed-host");
  assert.equal(report.provider, "spoofed-provider");
  const interaction = runtime.state.interactions.get(report.interactionId);
  assert.equal(interaction.invocation.source.host, "spoofed-host");
  assert.equal(interaction.invocation.source.sessionId, "claude-conformance");
});

test("host conformance discovers and executes an optional provider read", async (t) => {
  const runtime = gitlabRuntime();
  const { client } = await startConformanceFixture(t, runtime);
  const report = await runResolved(runtime, client, {
    profileId: "generic-mcp",
    sessionId: "provider-conformance",
    integration: {
      upstream: "gitlab",
      capability: "gitlab.user.get",
      permit: { profileId: "tool-invocation" },
    },
  });

  assert.equal(report.integration.upstream, "gitlab");
  assert.equal(report.integration.capability, "gitlab.user.get");
  assert.ok(report.integration.discoveredCapabilities > 1);
  assert.ok(report.checkedRequirements.includes("provider-discovery-when-configured"));
  assert.ok(report.checkedRequirements.includes("provider-read-when-configured"));
  assert.deepEqual(report.skippedRequirements, []);
});

test("an operator mismatch fails conformance and still closes the host session", async (t) => {
  const { runtime, client } = await startConformanceFixture(t);

  await assert.rejects(
    runResolved(runtime, client, {
      profileId: "generic-mcp",
      sessionId: "mismatch-conformance",
    }, "mismatch"),
    (error) => error instanceof MousecatConformanceError && error.code === "conformance-operator-reported-mismatch",
  );
  assert.equal(runtime.state.sessions.get("mismatch-conformance").status, "closed");
});

test("provider conformance rejects write capabilities before dispatch", async (t) => {
  const runtime = gitlabRuntime();
  const { client } = await startConformanceFixture(t, runtime);

  await assert.rejects(
    runMousecatHostConformance(client, {
      profileId: "generic-mcp",
      sessionId: "write-rejection",
      integration: {
        upstream: "gitlab",
        capability: "gitlab.merge-requests.create",
        payload: { sourceBranch: "feature", targetBranch: "main", title: "No dispatch", confirm: true },
        permit: { profileId: "tool-invocation" },
      },
    }),
    (error) => error instanceof MousecatConformanceError && error.code === "conformance-provider-capability-not-read-only",
  );
  assert.equal(runtime.state.sessions.get("write-rejection").status, "closed");
});

test("provider conformance rejects non-integration discovery before capability dispatch", async () => {
  let capabilityCalls = 0;
  const client = {
    async initialize() {
      return { sessionId: "transport-session" };
    },
    async heartbeat(sessionId, facts) {
      return this.callTool("mousecat.session", { action: "heartbeat", sessionId, facts });
    },
    async callTool(name, args) {
      if (name === "mousecat.status") return { ok: true };
      if (name === "mousecat.session" && args.action === "heartbeat") {
        return { action: "heartbeat", session: { id: args.sessionId, facts: args.facts } };
      }
      if (name === "mousecat.session" && args.action === "close") {
        return { action: "close", session: { id: args.sessionId, status: "closed" } };
      }
      if (name === "mousecat.invoke" && args.capability === "tools/list") {
        return {
          connector: { integrationOwned: false },
          result: {
            connector: { integrationOwned: false },
            tools: [{ name: "external.write", annotations: { readOnlyHint: true } }],
          },
        };
      }
      capabilityCalls += 1;
      return { ok: true, result: { access: "read" } };
    },
  };

  await assert.rejects(
    runMousecatHostConformance(client, {
      profileId: "generic-mcp",
      sessionId: "external-rejection",
      integration: {
        upstream: "external",
        capability: "external.write",
        permit: { profileId: "tool-invocation" },
      },
    }),
    (error) => error instanceof MousecatConformanceError && error.code === "conformance-provider-not-integration-owned",
  );
  assert.equal(capabilityCalls, 0);
});

test("a lost heartbeat response still triggers independent host-session cleanup", async (t) => {
  const runtime = createMousecatRuntime();
  const app = await startOperatorServer({ runtime, port: 0 });
  let dropped = false;
  const client = createMousecatClient({
    endpoint: app.mcpUrl,
    fetch: async (url, init) => {
      const payload = init.body ? JSON.parse(init.body) : null;
      const response = await fetch(url, init);
      if (
        !dropped
        && payload?.method === "tools/call"
        && payload.params?.name === "mousecat.session"
        && payload.params?.arguments?.action === "heartbeat"
      ) {
        dropped = true;
        throw new Error("simulated-lost-heartbeat-response");
      }
      return response;
    },
  });
  t.after(async () => {
    await client.close().catch(() => {});
    await app.close();
  });

  await assert.rejects(
    runMousecatHostConformance(client, {
      profileId: "generic-mcp",
      sessionId: "lost-heartbeat-response",
    }),
    /Mousecat request could not reach the service/u,
  );
  assert.equal(runtime.state.sessions.get("lost-heartbeat-response").status, "closed");
});

test("one lifecycle deadline also bounds transport initialization", async () => {
  const client = createMousecatClient({
    fetch: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    }),
  });

  await assert.rejects(
    runMousecatHostConformance(client, {
      profileId: "generic-mcp",
      sessionId: "bounded-initialize",
      timeoutMs: 1000,
    }),
    (error) => error instanceof MousecatConformanceError && error.code === "conformance-lifecycle-timeout",
  );
});

test("packaged runner emits one redacted receipt after a real child-process round trip", async (t) => {
  const runtime = createMousecatRuntime();
  const app = await startOperatorServer({ runtime, port: 0 });
  t.after(() => app.close());
  const child = execFileAsync(process.execPath, [
    join(ROOT, "scripts", "host-conformance.mjs"),
    "--profile", "cli",
    "--session", "runner-conformance",
    "--endpoint", app.mcpUrl,
    "--timeout-ms", "5000",
  ], { cwd: ROOT, timeout: 10000 });

  await resolvePending(runtime, "runner-conformance");
  const { stdout, stderr } = await child;
  const report = JSON.parse(stdout);

  assert.equal(stderr, "");
  assert.equal(report.schema, "mousecat.sdk-host-conformance/1");
  assert.equal(report.profileId, "cli");
  assert.equal(report.hostSessionClosed, true);
  assert.doesNotMatch(stdout, /continuationToken|namespaceToken|resultToken/u);
});
