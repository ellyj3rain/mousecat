import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMousecatRuntime } from "../src/core/runtime.mjs";
import {
  OPERATOR_BATCH_BYTES,
  operatorCommandBodyBytes,
  planResponseBatches,
  recordKey,
  reviewAttention,
  resolveActiveSkillRef,
  shapeUsesOptionSelection,
} from "../src/operator/public/operator-model.js";
import {
  seedOperatorDemo,
  selfTestOperatorServer,
  startOperatorServer,
} from "../src/operator/server.mjs";

const MCP_PROTOCOL_VERSION = "2025-06-18";

test("operator snapshot carries registered project surfaces", async () => {
  const parent = mkdtempSync(join(tmpdir(), "mousecat-projects-snapshot-"));
  let app;
  try {
    const root = join(parent, "example-project");
    mkdirSync(join(root, ".git"), { recursive: true });
    mkdirSync(join(root, "decisions"), { recursive: true });
    writeFileSync(join(root, "AGENTS.md"), "# Example\n");
    writeFileSync(join(root, "BATCH_LOG.md"), "# Batch log\n");
    writeFileSync(join(root, "SESSION_STATE.md"), "# Session state\n\n**As of** today, the example stands.\n");
    writeFileSync(join(root, "VERSION"), "1.2.3-alpha\n");
    writeFileSync(join(root, "decisions", "rows.jsonl"), `${JSON.stringify({ id: 1, word: "watch" })}\n`);

    const runtime = createMousecatRuntime();
    const draft = runtime.handleTool("mousecat.projects", {
      action: "draft",
      root,
      permit: { profileId: "observer" },
    });
    assert.equal(draft.ok, true);
    const registered = runtime.handleTool("mousecat.projects", {
      action: "register",
      surface: draft.draft,
      permit: { profileId: "operator-interaction" },
    });
    assert.equal(registered.ok, true);

    app = await startOperatorServer({ runtime, host: "127.0.0.1", port: 0 });
    const snapshot = await (await fetch(`${app.url}/api/snapshot`)).json();
    assert.equal(snapshot.projects.length, 1);
    assert.equal(snapshot.projects[0].surface.surfaceId, "example-project");
    const stateDocument = snapshot.projects[0].page.governingDocuments.find((document) => document.role === "state");
    assert.equal(stateDocument.exists, true);
    assert.ok(stateDocument.excerpt[0].startsWith("# Session state"));
    const dataSource = snapshot.projects[0].page.dataSources.find((source) => source.path === "decisions");
    assert.equal(dataSource.exists, true);
  } finally {
    if (app) await app.close();
    rmSync(parent, { recursive: true, force: true });
  }
});

test("operator decision identity preserves arbitrary namespace boundaries", () => {
  const keys = [
    recordKey("a", "b:c"),
    recordKey("a:b", "c"),
    recordKey("a/b", "c"),
    recordKey("a-b", "c"),
  ];

  assert.equal(new Set(keys).size, keys.length);
});

test("review attention counts actionable items independently of prepared drafts", () => {
  const interactions = [{ interactionId: "review-1", projectRef: "project:test", items: [
    { id: "open", status: "open" }, { id: "later", status: "deferred" }, { id: "done", status: "answered" },
  ] }];
  const state = reviewAttention(interactions, [recordKey("review-1", "open")]);
  assert.deepEqual(state, { waiting: 2, prepared: 1, unprepared: 1,
    first: { key: recordKey("review-1", "open"), interactionId: "review-1",
      projectRef: "project:test", itemId: "open", prepared: true } });
});

test("operator snapshot and shell carry concrete ML review context", async (t) => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "ml-review-shell",
      items: [{
        id: "retriever-target",
        prompt: "Choose the retriever target policy.",
        mlReview: {
          schema: "mousecat.ml-review/1",
          subject: "Retriever relevance target policy",
          scenario: "Ada owns several claims when the player asks about failed communications. The retriever needs a supervised target for the claims that matter now.",
          systemRole: "This sits between the complete person-owned claim catalogue and the speaker's fenced input.",
          causalPath: [
            { label: "Catalogue", value: "SAO supplies Ada's current owned claims." },
            { label: "Target", value: "The selected policy labels relevant claim identifiers." },
            { label: "Speech", value: "The trained retriever supplies bounded claims to the speaker." },
          ],
          playerImpact: "NPCs recall relevant owned facts during conversation while remaining unable to invent facts.",
          decisionPrecedent: "The answer sets the target-authoring rule for every future retriever row.",
          actualInput: [{ label: "Catalogue", value: "Ada's current owned claims plus conversation context." }],
          proposedLearning: [{ label: "Target", value: "Relevant claim identifiers for this moment." }],
          approvalEffects: ["Set the corpus-wide retriever target-authoring policy."],
          remainingExclusions: ["Model dimensions and latency remain measurement decisions."],
          evidence: [{ label: "Architecture", value: "training/ARCHITECTURE.md:49-60" }],
        },
      }],
    },
  });
  const { app } = await startTestApp(t, { runtime });
  const [snapshot, script, style] = await Promise.all([
    fetch(`${app.url}/api/snapshot`).then((response) => response.json()),
    fetch(`${app.url}/operator.js`).then((response) => response.text()),
    fetch(`${app.url}/operator.css`).then((response) => response.text()),
  ]);

  assert.equal(snapshot.widget.interaction.items[0].mlReview.subject, "Retriever relevance target policy");
  assert.match(script, /function createMlReview/u);
  assert.match(script, /How this reaches the game/u);
  assert.match(script, /Player-visible consequence/u);
  assert.match(script, /What your answer sets/u);
  assert.match(script, /Actual input/u);
  assert.match(script, /review\.proposedLearning/u);
  assert.match(script, /Effect of this review/u);
  assert.match(script, /Still excluded/u);
  assert.match(style, /\.ml-review-panel/u);
  assert.match(style, /\.ml-review-comparison/u);
});

test("operator model preserves exact skill identity and shape-specific option semantics", () => {
  const controlPlane = { skills: [{ id: "vendor" }, { id: "vendor.review" }, { id: "mass-assault" }] };
  assert.equal(resolveActiveSkillRef(controlPlane, [{ skillRef: "vendor.review" }]), "vendor.review");
  assert.equal(resolveActiveSkillRef(controlPlane, [{ skillRef: "mass-assault.queue" }]), "mass-assault");
  assert.equal(shapeUsesOptionSelection({ shape: "ratification" }), true);
  assert.equal(shapeUsesOptionSelection({ shape: "ranking" }), false);
  assert.equal(shapeUsesOptionSelection({ shape: "parameter" }), false);
  assert.equal(shapeUsesOptionSelection({ shape: "continuum" }), false);
});

test("operator model chunks maximal decision sets below the browser command ceiling", () => {
  const answer = "x".repeat(4000);
  const records = Array.from({ length: 125 }, (_unused, index) => ({
    interactionId: "large-interaction",
    key: `decision-${index + 1}`,
    response: { itemId: `item-${index + 1}`, status: "answered", notes: answer, value: answer },
  }));
  const batches = planResponseBatches(records);
  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flatMap((batch) => batch.keys), records.map((record) => record.key));
  for (const batch of batches) {
    assert.ok(operatorCommandBodyBytes("respond", { interactionId: batch.interactionId, responses: batch.responses }) <= OPERATOR_BATCH_BYTES);
  }
});

async function startTestApp(t, options = {}) {
  const runtime = options.runtime || createMousecatRuntime();
  const app = await startOperatorServer({ runtime, port: 0, maxBodyBytes: options.maxBodyBytes });
  t.after(() => app.close());
  return { runtime, app };
}

async function postCommand(app, commandId, values, headers = {}) {
  return fetch(`${app.url}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ commandId, values }),
  });
}

function rawRequest(app, path) {
  const target = new URL(app.url);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path,
      method: "GET",
      headers: { Host: target.host },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
}

test("operator server serves the graphical shell and redacted runtime snapshot", async (t) => {
  const runtime = createMousecatRuntime();
  const tokenKey = "to" + "ken";
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "private-interaction",
      items: [{ id: "private-note", prompt: "do-not-render", shape: "freeform", sensitive: true }],
    },
  });
  runtime.handleTool("mousecat.session", {
    action: "heartbeat",
    sessionId: "sdk-session",
    facts: { host: "custom-sdk", provider: "openai", model: "example-model", objective: "Render shared context" },
  });
  runtime.handleTool("mousecat.registry", {
    action: "register",
    namespace: "sdk-test",
    revision: 1,
    permit: { profileId: "operator-interaction" },
    framework: { id: "sdk-loop", label: "SDK Loop" },
    skills: [
      { id: "sdk-map", label: "SDK Map", presentation: { grammar: "source-map", accent: "cyan" } },
      { id: "sdk-review", label: "SDK Review", intakeMode: "single-seam" },
    ],
  });
  runtime.emit("connector.blocked", { upstream: "neo", [tokenKey]: "do-not-expose" });
  const { app } = await startTestApp(t, { runtime });

  const [pageResponse, scriptResponse, modelResponse, styleResponse, iconResponse, snapshotResponse] = await Promise.all([
    fetch(`${app.url}/`),
    fetch(`${app.url}/operator.js`),
    fetch(`${app.url}/operator-model.js`),
    fetch(`${app.url}/operator.css`),
    fetch(`${app.url}/vendor/lucide.js`),
    fetch(`${app.url}/api/snapshot?limit=20`),
  ]);
  const page = await pageResponse.text();
  const script = await scriptResponse.text();
  const model = await modelResponse.text();
  const style = await styleResponse.text();
  const icons = await iconResponse.text();
  const snapshotText = await snapshotResponse.text();
  const snapshot = JSON.parse(snapshotText);

  assert.equal(pageResponse.status, 200);
  assert.match(page, /<title>Mousecat<\/title>/);
  assert.match(pageResponse.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(pageResponse.headers.get("access-control-allow-origin"), null);
  assert.equal(scriptResponse.status, 200);
  assert.equal(modelResponse.status, 200);
  assert.match(modelResponse.headers.get("content-type"), /^text\/javascript/u);
  assert.match(model, /planResponseBatches/u);
  assert.match(script, /\/api\/snapshot/);
  assert.match(script, /\/api\/command/);
  assert.doesNotMatch(script, /queueAnswer|queueHold|queueRatify|renderQueue/u);
  assert.doesNotMatch(script, /mousecat\.invoke|registerCredentialReference|queueClear/u);
  assert.doesNotMatch(script, /renderTopology|routePreview|renderConnectors|renderActivity/u);
  assert.match(script, /collectResponse/u);
  assert.match(script, /groupDecisionItems/u);
  assert.match(script, /renderDecisionWall/u);
  assert.match(script, /renderDecisionAtlas/u);
  assert.match(script, /atlasStateFor/u);
  assert.match(script, /setAtlasRovingFocus/u);
  assert.match(script, /normalizeAtlasRovingFocus/u);
  assert.match(script, /dataset\.familyKey/u);
  assert.match(script, /focusWallElement/u);
  assert.match(script, /preserveManagedFocus: quiet/u);
  assert.match(script, /focusIdleAfterTransition/u);
  assert.match(script, /draftStateStatus\.textContent !== draftStateMessage/u);
  assert.match(script, /reviewRenderSignature/u);
  assert.match(script, /returnPreparedResponses/u);
  assert.match(script, /planResponseBatches/u);
  assert.match(script, /renderDraftReview/u);
  assert.match(script, /evaluatedDrafts/u);
  assert.match(script, /recommendedOptionIndex/u);
  assert.match(script, /applySkillPresentation/u);
  assert.match(script, /resolveActiveSkillRef/u);
  assert.match(script, /shapeUsesOptionSelection/u);
  assert.match(script, /showModal/u);
  assert.match(script, /captureWallViewState/u);
  assert.match(script, /restoreWallViewState/u);
  assert.match(script, /output\.setAttribute\("for", input\.id\)/u);
  assert.match(script, /preferredScrollBehavior/u);
  assert.match(script, /renderSkillMap/u);
  assert.match(script, /renderFrameworkPicker/u);
  assert.match(script, /scrollIntoView/u);
  assert.match(script, /renderSessions/u);
  assert.match(script, /renderThreads/u);
  assert.doesNotMatch(script, /renderDocket|renderSequence|selectDecision/u);
  assert.doesNotMatch(script, /pinDecision|decisionImportance|renderTopology/u);
  assert.match(script, /sendCommand\("defer"/u);
  assert.match(script, /captureForm\(key, form, false\)[\s\S]+sendCommand\("defer"/u);
  assert.match(script, /value: optionValue\(item\.options/u);
  assert.match(script, /item\.selectionMode === "multiple"/u);
  assert.match(script, /recordKey\(interaction\.interactionId, item\.id\)/u);
  assert.doesNotMatch(script, /slugify/u);
  assert.match(script, /new AbortController\(\)/u);
  assert.match(script, /responses: \[response\]/u);
  assert.match(script, /responses: batch\.responses/u);
  assert.match(script, /wallFingerprint/u);
  assert.match(script, /input\?\.type === "range"[\s\S]+Number\(value\)/u);
  assert.doesNotMatch(script, /pendingLabel|source\.slice/u);
  assert.match(scriptResponse.headers.get("content-type"), /^text\/javascript/u);
  assert.equal(styleResponse.status, 200);
  assert.match(styleResponse.headers.get("content-type"), /^text\/css/u);
  assert.match(style, /\.widget/u);
  assert.match(style, /\.decision-workspace/u);
  assert.match(style, /\.decision-wall/u);
  assert.match(style, /\.decision-card/u);
  assert.match(style, /\.family-grid/u);
  assert.match(style, /\.atlas-cell\[data-state="ready"\]/u);
  assert.match(style, /\.draft-review-dialog::backdrop/u);
  assert.match(style, /data-accent="rose"/u);
  assert.match(style, /@media \(pointer: coarse\)/u);
  assert.match(style, /@media \(min-width: 760px\)/u);
  assert.match(style, /@media \(min-width: 960px\)/u);
  assert.match(style, /@media \(min-width: 1240px\)/u);
  assert.match(style, /@media \(forced-colors: active\)/u);
  assert.match(style, /\.card-disclosure > summary:focus-visible[\s\S]+outline: 3px solid var\(--accent\)/u);
  assert.doesNotMatch(style, /#connection-label/u);
  assert.doesNotMatch(style, /\.docket-list|\.docket-item|\.sequence-map/u);
  assert.doesNotMatch(style, /\.topology-map|\.route-form|\.connector-list|\.activity-list|\.queue-list|\.segmented-control/u);
  assert.equal(iconResponse.status, 200);
  assert.match(icons, /createIcons/u);
  assert.doesNotMatch(page, /id="queue-dialog"|id="queue-list"/u);
  assert.doesNotMatch(page, /id="topology"|id="route-form"|id="connector-list"|id="activity-list"/u);
  assert.match(page, /id="skill-map"/u);
  assert.match(page, /id="framework-picker"/u);
  assert.match(page, /id="session-list"/u);
  assert.match(page, /id="thread-list"/u);
  assert.match(page, /id="decision-wall"/u);
  assert.match(page, /id="outline-list"/u);
  assert.match(page, /id="decision-search"/u);
  assert.match(page, /id="return-prepared-button"/u);
  assert.match(page, /id="draft-review-dialog"/u);
  assert.match(page, /id="draft-review-list"/u);
  assert.match(page, /id="return-drafts-button"/u);
  assert.match(page, /id="draft-state-status"/u);
  assert.match(page, /id="draft-review-status"/u);
  assert.match(page, /aria-describedby="draft-review-summary draft-review-boundary"/u);
  assert.match(page, /aria-label="Resolution progress"/u);
  assert.match(page, /id="context-details"/u);
  assert.doesNotMatch(page, /id="docket-list"|id="sequence-map"|id="response-form"/u);
  assert.doesNotMatch(page, /class="eyebrow"|id="work-heading"|id="pending-label"|id="idle-detail"/u);
  assert.equal(snapshot.schema, "mousecat.operator-snapshot/2");
  assert.equal(snapshot.surface, "summoned-widget");
  assert.equal(snapshot.widget.schema, "mousecat.operator-widget.snapshot/1");
  assert.equal(snapshot.controlPlane.schema, "mousecat.control-plane.snapshot/1");
  assert.equal(snapshot.controlPlane.framework.id, "recursive-deliberation");
  assert.deepEqual(snapshot.controlPlane.frameworks.map((framework) => framework.id), ["recursive-deliberation", "sdk-loop"]);
  assert.deepEqual(snapshot.controlPlane.skills.map((skill) => skill.id), ["crucible", "total-recall", "mass-assault", "sdk-map", "sdk-review"]);
  assert.equal(snapshot.controlPlane.sessions[0].host, "custom-sdk");
  assert.equal(snapshot.controlPlane.sessions[0].provider, "openai");
  assert.equal(snapshot.widget.interaction.items[0].prompt, "[sensitive-redacted]");
  assert.equal(snapshot.widget.interactions.length, 1);
  assert.doesNotMatch(snapshotText, /do-not-render|do-not-expose/);
});

test("operator server delegates widget response writes and returns a refreshed binding", async (t) => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "operator-response",
      items: [{ id: "choice", prompt: "Choose host", shape: "decision", options: [{ label: "Codex", value: "codex" }] }],
    },
  });
  const { app } = await startTestApp(t, { runtime });

  const widgetResponse = await postCommand(app, "respond", {
    interactionId: "operator-response",
    responses: [{ itemId: "choice", selectedOption: "Codex", value: "codex" }],
  });
  const widgetPayload = await widgetResponse.json();
  assert.equal(widgetResponse.status, 200);
  assert.equal(widgetPayload.ok, true);
  assert.equal(widgetPayload.commandId, "respond");
  assert.equal(widgetPayload.result, undefined);
  assert.equal(widgetPayload.snapshot.widget.interaction, null);
});

test("operator server returns a prepared decision batch without imposing item order", async (t) => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "decision-wall-batch",
      items: ["first", "second", "third"].map((id) => ({
        id,
        prompt: `Resolve ${id}`,
        shape: "decision",
        options: [{ label: "Accept", value: "accept" }],
      })),
    },
  });
  const { app } = await startTestApp(t, { runtime });

  const response = await postCommand(app, "respond", {
    interactionId: "decision-wall-batch",
    responses: ["third", "first"].map((itemId) => ({
      itemId,
      selectedOption: "accept",
      selectedOptions: ["accept"],
      value: "accept",
    })),
  });
  const payload = await response.json();
  const items = payload.snapshot.widget.interaction.items;

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.deepEqual(items.map((item) => [item.id, item.status]), [
    ["first", "answered"],
    ["second", "open"],
    ["third", "answered"],
  ]);
});

test("operator snapshot exposes every pending interaction and defer keeps work available", async (t) => {
  const runtime = createMousecatRuntime();
  for (const [interactionId, source, sessionId] of [
    ["codex-work", "codex.crucible", "codex-session"],
    ["claude-work", "claude.mass-assault", "claude-session"],
  ]) {
    runtime.handleTool("mousecat.widget", {
      action: "ask",
      request: { interactionId, source, sessionId, items: [{ id: "decision", prompt: `${source} decision` }] },
    });
  }
  const { app } = await startTestApp(t, { runtime });

  const before = await (await fetch(`${app.url}/api/snapshot`)).json();
  const deferred = await postCommand(app, "defer", {
    interactionId: "claude-work",
    responses: [{ itemId: "decision", status: "deferred", notes: "operator-deferred" }],
  });
  const after = await deferred.json();

  assert.deepEqual(before.widget.interactions.map((item) => item.interactionId), ["claude-work", "codex-work"]);
  assert.equal(before.widget.interaction.interactionId, "claude-work");
  assert.equal(before.widget.pendingItems, 2);
  assert.equal(deferred.status, 200);
  assert.equal(after.snapshot.widget.interactions.length, 2);
  assert.equal(after.snapshot.widget.interactions[0].items[0].status, "deferred");
});

test("operator snapshot reads do not append observation events", async (t) => {
  const runtime = createMousecatRuntime();
  const { app } = await startTestApp(t, { runtime });

  await fetch(`${app.url}/api/snapshot`);
  await fetch(`${app.url}/api/snapshot`);

  assert.equal(runtime.status().counts.events, 0);
});

test("operator server rejects machine commands, cross-origin writes, and oversized requests", async (t) => {
  const { app } = await startTestApp(t, { maxBodyBytes: 96 });

  const invokeResponse = await postCommand(app, "invoke", { upstream: "neo", capability: "tools/list" });
  const credentialResponse = await postCommand(app, "registerCredentialReference", { upstream: "neo" });
  const queueResponse = await postCommand(app, "queueAnswer", { itemId: "fifo-item", answer: { value: "bypass" } });
  const routeResponse = await postCommand(app, "routePreview", { upstream: "neo", capability: "status" });
  const originResponse = await postCommand(
    app,
    "respond",
    { interactionId: "missing", responses: [] },
    { Origin: "http://example.com" },
  );
  const typeResponse = await fetch(`${app.url}/api/command`, { method: "POST", body: "{}" });
  const invalidTypeResponse = await fetch(`${app.url}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/jsonx" },
    body: "{}",
  });
  const largeResponse = await fetch(`${app.url}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commandId: "routePreview", values: { upstream: "neo", capability: "status", intent: "x".repeat(200) } }),
  });

  assert.equal(invokeResponse.status, 403);
  assert.equal((await invokeResponse.json()).code, "command-not-allowed");
  assert.equal(credentialResponse.status, 403);
  assert.equal(queueResponse.status, 403);
  assert.equal(routeResponse.status, 403);
  assert.equal(originResponse.status, 403);
  assert.equal((await originResponse.json()).code, "same-origin-required");
  assert.equal(typeResponse.status, 415);
  assert.equal(invalidTypeResponse.status, 415);
  assert.equal(largeResponse.status, 413);
});

test("operator server normalizes stale action failures", async (t) => {
  const { app } = await startTestApp(t);

  const widgetResponse = await postCommand(app, "respond", {
    interactionId: "missing-interaction",
    responses: [{ itemId: "missing-item", value: "stale" }],
  });
  const widgetPayload = await widgetResponse.json();

  assert.equal(widgetResponse.status, 409);
  assert.equal(widgetPayload.ok, false);
  assert.equal(widgetPayload.code, "unknown-interaction");
  assert.equal(widgetPayload.snapshot.schema, "mousecat.operator-snapshot/2");
});

test("operator action envelopes never return raw sensitive interaction records", async (t) => {
  const runtime = createMousecatRuntime();
  runtime.handleTool("mousecat.widget", {
    action: "ask",
    request: {
      interactionId: "sensitive-interaction",
      items: [{
        id: "sensitive-item",
        prompt: "private interaction prompt",
        title: "private interaction title",
        shape: "freeform",
        sensitive: true,
        metadata: { privateContext: "private interaction metadata" },
      }],
    },
  });
  const { app } = await startTestApp(t, { runtime });

  const answerResponse = await postCommand(app, "respond", {
    interactionId: "sensitive-interaction",
    responses: [{ itemId: "sensitive-item", value: "private interaction answer" }],
  });
  const answerText = await answerResponse.text();

  assert.equal(answerResponse.status, 200);
  assert.doesNotMatch(answerText, /private interaction prompt|private interaction title|private interaction metadata|private interaction answer/);
  assert.equal(JSON.parse(answerText).snapshot.widget.interaction, null);
});

test("malformed request targets return an error without terminating the server", async (t) => {
  const { app } = await startTestApp(t);

  const malformed = await rawRequest(app, "//");
  const followup = await fetch(`${app.url}/api/snapshot`);

  assert.equal(malformed.status, 400);
  assert.match(malformed.body, /invalid-request-target/);
  assert.equal(followup.status, 200);
});

test("operator server formats and accepts the IPv6 loopback URL", async (t) => {
  let app;
  try {
    app = await startOperatorServer({ runtime: createMousecatRuntime(), host: "::1", port: 0 });
  } catch (error) {
    if (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT") {
      t.skip("IPv6 loopback is unavailable on this host.");
      return;
    }
    throw error;
  }
  t.after(() => app.close());

  const response = await fetch(`${app.url}/api/snapshot`);
  assert.match(app.url, /^http:\/\/\[::1\]:\d+$/u);
  assert.equal(response.status, 200);
});

test("HTTP MCP and the graphical operator share one runtime for a complete decision round trip", async (t) => {
  const { app } = await startTestApp(t);
  const initialize = await fetch(app.mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {} } }),
  });
  const sessionId = initialize.headers.get("mcp-session-id");
  assert.equal(initialize.status, 200);
  assert.ok(sessionId);

  const call = (id, name, args) => fetch(app.mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId, "MCP-Protocol-Version": MCP_PROTOCOL_VERSION },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  });
  const requested = await (await call(2, "mousecat.widget", {
    action: "ask",
    request: {
      source: "neo.crucible",
      interactionId: "round-trip",
      items: [{
        id: "choice",
        shape: "decision",
        selectionMode: "multiple",
        prompt: "Choose the live paths",
        options: [{ label: "Neo", value: "neo" }, { label: "Codex", value: "codex" }],
      }],
    },
  })).json();
  assert.equal(requested.result.structuredContent.interaction.interactionId, "round-trip");

  const snapshot = await (await fetch(`${app.url}/api/snapshot`)).json();
  assert.equal(snapshot.widget.interaction.source, "neo.crucible");

  const waitingResponse = call(3, "mousecat.widget", { action: "await", interactionId: "round-trip", waitMs: 3000 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const answerResponse = await postCommand(app, "respond", {
    interactionId: "round-trip",
    responses: [{ itemId: "choice", selectedOption: "neo", selectedOptions: ["neo", "codex"] }],
  });
  assert.equal(answerResponse.status, 200);

  const waiting = await (await waitingResponse).json();
  assert.equal(waiting.result.structuredContent.status, "answered");
  assert.deepEqual(waiting.result.structuredContent.responses[0].selectedOptions, ["neo", "codex"]);
});

test("HTTP MCP skill intake returns browser-submitted Mass Assault results to the caller", async (t) => {
  const { app } = await startTestApp(t);
  const initialize = await fetch(app.mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION } }),
  });
  const sessionId = initialize.headers.get("mcp-session-id");
  const call = (id, name, args) => fetch(app.mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId, "MCP-Protocol-Version": MCP_PROTOCOL_VERSION },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  });
  const requested = await (await call(2, "mousecat.skill", {
    action: "invoke",
    skillRef: "mass-assault",
    source: { host: "codex", invocationId: "http-recall-1" },
    intake: {
      sessions: [{
        sessionId: "codex-session-1",
        startedAt: "2026-07-10T01:00:00Z",
        seams: [{
          id: "host-contract",
          prompt: "Choose the host contract",
          options: [{ label: "Skill adapter (Recommended)", value: "skill-adapter" }],
        }],
      }],
    },
  })).json();
  const invocation = requested.result.structuredContent;
  assert.equal(invocation.schema, "mousecat.skill-invocation/2");
  assert.equal(invocation.status, "pending");

  const snapshot = await (await fetch(`${app.url}/api/snapshot`)).json();
  assert.equal(snapshot.widget.interaction.source, "codex.mass-assault");
  assert.equal(snapshot.widget.interaction.title, "Mass Assault");

  const waitingResponse = call(3, "mousecat.skill", {
    action: "await",
    interactionId: invocation.interactionId,
    continuationToken: invocation.continuation.arguments.continuationToken,
    waitMs: 3000,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const answerResponse = await postCommand(app, "respond", {
    interactionId: invocation.interactionId,
    responses: [{ itemId: invocation.items[0].id, selectedOption: "skill-adapter", value: "skill-adapter" }],
  });
  assert.equal(answerResponse.status, 200);

  const returned = await (await waitingResponse).json();
  assert.equal(returned.result.structuredContent.status, "answered");
  assert.equal(returned.result.structuredContent.responses[0].value, "skill-adapter");
  assert.equal(returned.result.structuredContent.responses[0].lineage.sessionId, "codex-session-1");
  assert.equal(returned.result.structuredContent.continuation.recurse, true);
});

test("HTTP MCP enforces sessions and cancels early, active, disconnected, and closing waiters", async (t) => {
  const { app } = await startTestApp(t);
  const preInitialize = await fetch(app.mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(preInitialize.status, 400);

  const initialize = await fetch(app.mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION } }),
  });
  const sessionId = initialize.headers.get("mcp-session-id");
  assert.ok(sessionId);
  const sessionHeaders = {
    "Content-Type": "application/json",
    "Mcp-Session-Id": sessionId,
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
  };
  const post = (body, signal) => fetch(app.mcpUrl, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  const missingVersion = await fetch(app.mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
  });
  assert.equal(missingVersion.status, 400);

  await post({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "mousecat.widget",
      arguments: {
        action: "ask",
        request: { interactionId: "cancel-http", items: [{ id: "one", shape: "freeform", prompt: "Wait" }] },
      },
    },
  });
  const earlyCancellation = await post({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 8, reason: "early" } });
  assert.equal(earlyCancellation.status, 202);
  const earlyWaiting = await (await post({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "mousecat.widget", arguments: { action: "await", interactionId: "cancel-http", waitMs: 3000 } },
  })).json();
  assert.equal(earlyWaiting.result.structuredContent.reason, "request-cancelled");

  const activeWaitingResponse = post({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "mousecat.widget", arguments: { action: "await", interactionId: "cancel-http", waitMs: 3000 } },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const activeCancellation = await post({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 9, reason: "active" } });
  assert.equal(activeCancellation.status, 202);
  const activeWaiting = await (await activeWaitingResponse).json();
  assert.equal(activeWaiting.result.structuredContent.reason, "request-cancelled");

  const disconnectedController = new AbortController();
  const disconnected = post({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: { name: "mousecat.widget", arguments: { action: "await", interactionId: "cancel-http", waitMs: 3000 } },
  }, disconnectedController.signal);
  await new Promise((resolve) => setTimeout(resolve, 20));
  disconnectedController.abort();
  await assert.rejects(disconnected, (error) => error.name === "AbortError");

  const closingResponse = post({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "mousecat.widget", arguments: { action: "await", interactionId: "cancel-http", waitMs: 30000 } },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const closingStarted = Date.now();
  await app.close();
  const closing = await (await closingResponse).json();
  assert.equal(closing.result.structuredContent.reason, "request-cancelled");
  assert.ok(Date.now() - closingStarted < 1000);
});

test("failed demo startup leaves a caller-owned runtime unchanged", async (t) => {
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => blocker.close(resolve)));
  const address = blocker.address();
  const runtime = createMousecatRuntime();

  await assert.rejects(
    startOperatorServer({ runtime, host: "127.0.0.1", port: address.port, demo: true }),
    (error) => error.code === "EADDRINUSE",
  );

  const status = runtime.status();
  assert.equal(status.counts.sessions, 0);
  assert.equal(status.counts.interactions, 0);
  assert.equal(status.counts.queueItems, 0);
  assert.equal(status.counts.routePlans, 0);
});

test("operator demo and CLI smoke path use the real runtime", async () => {
  const runtime = createMousecatRuntime();
  seedOperatorDemo(runtime);
  const status = runtime.status();
  const selfTest = await selfTestOperatorServer();

  assert.equal(status.counts.interactions, 4);
  assert.equal(status.counts.queueItems, 2);
  assert.equal(status.counts.routePlans, 0);
  const observed = runtime.handleTool("mousecat.history", { ref: "source:operator-demo:observations.jsonl", permit: { profileId: "observer" } });
  assert.equal(observed.ok, true);
  assert.match(observed.record.body, /"synthetic":true/);
  const result = runtime.handleTool("mousecat.history", { ref: "note:demo/trial-result", permit: { profileId: "observer" } });
  assert.equal(result.links[0].status, "resolved");
  const boundary = runtime.handleTool("mousecat.history", { ref: "demo-evidence-boundary", permit: { profileId: "observer" } });
  assert.equal(boundary.record.standing, "answered");
  assert.equal(boundary.record.items[0].response.selectedOption, "unknown");
  seedOperatorDemo(runtime);
  assert.equal(runtime.status().counts.interactions, 4);
  assert.equal(selfTest.schema, "mousecat.operator-self-test/1");
  assert.equal(selfTest.ok, true);
  assert.ok(selfTest.checks.interactions > 0);
  assert.ok(selfTest.checks.queueItems > 0);
});
