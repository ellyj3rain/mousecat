import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { BULLETIN_LIMITS } from "../src/core/bulletin.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";
import { MousecatClient } from "../src/sdk/client.mjs";

const permit = { profileId: "operator-interaction" }, observer = { profileId: "observer" };
const source = { author: "Example author", host: "example-host", sessionId: "session-one", messageId: "message-one", at: "2026-10-04T10:00:00.000Z" };
const idea = (id = "idea-one", extra = {}) => ({ ideaId: id, projectRef: "project:example", title: "Retain physical context", proposition: "Keep source geometry attached to observations.", source, ...extra });
const call = (runtime, args) => runtime.handleTool("mousecat.bulletin", { permit, ...args });
const capture = (runtime, record = idea()) => call(runtime, { action: "capture", record });
const target = record => ({ ideaId: record.ideaId, projectRef: record.projectRef, expectedRevision: record.revision, source: { ...source, messageId: `correction-${record.revision}` } });

test("mapped capture is idempotent, collisions and raw chat payloads fail closed", () => {
  const runtime = createMousecatRuntime();
  assert.equal(capture(runtime).ok, true);
  assert.equal(capture(runtime).duplicate, true);
  assert.equal(capture(runtime, idea("idea-one", { proposition: "Changed proposition" })).code, "bulletin-identity-conflict");
  for (const record of [idea("raw", { messages: [] }), idea("raw", { source: { ...source, transcript: "raw" } }), idea("raw", { title: "x".repeat(241) }), idea("raw", { horizon: "long" })]) assert.equal(capture(runtime, record).code, "bulletin-record-invalid");
  assert.equal(call(runtime, { action: "capture", record: idea("raw"), transcript: "raw" }).code, "bulletin-input-invalid");
  assert.equal(runtime.state.interactions.size, 0, "capturing context does not create an assignment or question");
});

test("observer can query; MCP cannot change disposition or prune with any permit", () => {
  const runtime = createMousecatRuntime();
  assert.equal(call(runtime, { action: "capture", record: idea(), permit: observer }).code, "bulletin-permit-required");
  const record = capture(runtime).record;
  assert.equal(call(runtime, { action: "query", permit: observer }).records.length, 1);
  for (const action of ["prune", "disposition"]) assert.equal(call(runtime, { action, ...target(record), status: "addressed" }).ok, false);
  assert.equal(runtime.bulletinCommand({ action: "disposition", ...target(record), status: "parked" }).record.status, "parked");
});

test("amend preserves initial source and appends correction provenance, stale edits fail", () => {
  const runtime = createMousecatRuntime(), original = capture(runtime).record;
  const changed = call(runtime, { action: "amend", ...target(original), patch: { title: "Updated proposition", horizon: "mid" } }).record;
  assert.equal(changed.revision, 2); assert.deepEqual(changed.source, source);
  assert.equal(changed.history[1].source.messageId, "correction-1"); assert.equal(changed.history[0].title, original.title);
  assert.equal(call(runtime, { action: "amend", ...target(original), patch: { title: "Stale" } }).code, "bulletin-revision-conflict");
  assert.equal(call(runtime, { action: "amend", ...target(changed), patch: { projectRef: "project:other" } }).code, "bulletin-patch-invalid");
});

test("project/surface identity and explicit link endpoints remain scoped", () => {
  const runtime = createMousecatRuntime();
  capture(runtime); capture(runtime, idea("other", { projectRef: "project:other" }));
  for (const endpoint of ["missing", "other"]) assert.equal(capture(runtime, idea(`link-${endpoint}`, { links: [{ ideaId: endpoint, relation: "relates" }] })).code, "bulletin-link-unavailable");
  assert.equal(capture(runtime, idea("surface", { surfaceId: "missing" })).code, "bulletin-surface-unavailable");
  const linked = capture(runtime, idea("linked", { links: [{ ideaId: "idea-one", relation: "extends" }] })).record;
  assert.equal(linked.links.length, 1);
  assert.equal(call(runtime, { action: "query", projectRef: "project:example", query: "geometry", permit: observer }).records.length, 2);
  assert.equal(runtime.bulletinCommand({ action: "prune", ...target(linked), projectRef: "project:other" }).code, "bulletin-record-unavailable");
});

test("link normalization rejects padded duplicates and self links before persistence", () => {
  const runtime = createMousecatRuntime(), original = capture(runtime).record;
  assert.equal(capture(runtime, idea("duplicates", { links: [
    { ideaId: "idea-one", relation: "relates" }, { ideaId: " idea-one ", relation: "relates" },
  ] })).code, "bulletin-record-invalid");
  assert.equal(call(runtime, { action: "amend", ...target(original), patch: {
    links: [{ ideaId: " idea-one ", relation: "extends" }],
  } }).code, "bulletin-record-invalid");
  const linked = capture(runtime, idea("linked", { links: [{ ideaId: " idea-one ", relation: "relates" }] })).record;
  assert.deepEqual(linked.links, [{ ideaId: "idea-one", relation: "relates" }]);
  const restored = createMousecatRuntime({ state: { bulletin: [...runtime.state.bulletin.values()] } });
  assert.deepEqual(restored.bulletinQuery().records.map(record => record.ideaId).sort(), ["idea-one", "linked"]);
  assert.equal(restored.bulletinQuery().quarantined.length, 0);
});

test("retained ideas remain manageable after their source surface disappears", () => {
  const runtime = createMousecatRuntime();
  runtime.state.projectSurfaces.set("source", { surfaceId: "source", projectRef: "project:example" });
  let record = capture(runtime, idea("scoped", { surfaceId: "source" })).record;
  runtime.state.projectSurfaces.delete("source");
  assert.equal(capture(runtime, idea("new-scoped", { surfaceId: "source" })).code, "bulletin-surface-unavailable");
  record = call(runtime, { action: "amend", ...target(record), patch: { title: "Corrected retained idea" } }).record;
  record = runtime.bulletinCommand({ action: "disposition", ...target(record), status: "archived" }).record;
  assert.equal(record.status, "archived");
  assert.equal(record.surfaceId, "source");
  assert.equal(runtime.bulletinCommand({ action: "prune", ...target(record), projectRef: "project:other" }).code, "bulletin-record-unavailable");
  assert.equal(runtime.bulletinCommand({ action: "prune", ...target(record), expectedRevision: 1 }).code, "bulletin-revision-conflict");
  assert.equal(runtime.bulletinCommand({ action: "prune", ...target(record) }).record.status, "pruned");
});

test("archive retains text; prune removes all text revisions and prohibits resurrection", () => {
  const runtime = createMousecatRuntime(), original = capture(runtime).record;
  const archived = runtime.bulletinCommand({ action: "disposition", ...target(original), status: "archived" }).record;
  assert.equal(archived.proposition, original.proposition);
  const pruned = runtime.bulletinCommand({ action: "prune", ...target(archived) }).record;
  assert.equal(pruned.status, "pruned"); assert.equal(pruned.proposition, null);
  assert.ok(pruned.history.every(entry => !entry.title && !entry.proposition && /^[a-f0-9]{64}$/u.test(entry.contentHash)));
  assert.equal(call(runtime, { action: "amend", ...target(pruned), patch: { proposition: "Revive" } }).code, "bulletin-record-pruned");
  assert.equal(capture(runtime).record.status, "pruned", "original capture retry cannot revive");
});

test("restart retains revisions, no review date silently expires, corruption is quarantined", t => {
  const root = mkdtempSync(join(tmpdir(), "mousecat-bulletin-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "state.json"), config = { state: { enabled: true, path } };
  let runtime = createMousecatRuntime({ config });
  capture(runtime, idea("idea-one", { reviewAt: "2000-01-01T00:00:00Z" }));
  const original = call(runtime, { action: "query" }).records[0];
  call(runtime, { action: "amend", ...target(original), patch: { title: "Retained revision" } });
  runtime = createMousecatRuntime({ config });
  assert.equal(call(runtime, { action: "query" }).records[0].revision, 2);
  assert.equal(call(runtime, { action: "query" }).records[0].status, "open");
  const disk = JSON.parse(readFileSync(path, "utf8")); disk.bulletin[0].proposition = "tampered"; writeFileSync(path, JSON.stringify(disk));
  runtime = createMousecatRuntime({ config });
  assert.equal(call(runtime, { action: "query" }).records.length, 0);
  assert.equal(call(runtime, { action: "query" }).quarantined.length, 1);
  assert.equal(capture(runtime).code, "bulletin-identity-quarantined");
  assert.equal(call(runtime, { action: "query", projectRef: "project:other" }).quarantined.length, 0);
  capture(runtime, idea("new"));
  assert.equal(call(createMousecatRuntime({ config }), { action: "query" }).quarantined.length, 1);
});

test("duplicate persisted identities are withheld rather than choosing a winner", () => {
  const initial = createMousecatRuntime(); capture(initial);
  const stored = initial.state.bulletin.get("idea-one");
  for (const count of [2, 3, 4, 5]) {
    const restored = createMousecatRuntime({ state: { bulletin: Array.from({ length: count }, () => structuredClone(stored)) } });
    assert.equal(call(restored, { action: "query" }).records.length, 0, `${count} occurrences stay withheld`);
    assert.equal(call(restored, { action: "query" }).quarantined.length, 1);
    assert.equal(capture(restored).code, "bulletin-identity-quarantined");
    const restarted = createMousecatRuntime({ state: { bulletin: [stored], bulletinQuarantine: restored.state.bulletinQuarantine } });
    assert.equal(restarted.bulletinQuery().records.length, 0, "a retained quarantine prevents later reintroduction");
  }
  const invalidFirst = createMousecatRuntime({ state: { bulletin: [{ ...stored, proposition: "Corrupt" }, stored] } });
  assert.equal(invalidFirst.bulletinQuery().records.length, 0);
});

test("sensitive context and secret-shaped textual capabilities are redacted before persistence", t => {
  const root = mkdtempSync(join(tmpdir(), "mousecat-bulletin-private-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "state.json"), config = { state: { enabled: true, path } }, runtime = createMousecatRuntime({ config });
  capture(runtime, idea("private", { sensitive: true, proposition: "private content", title: "private title" }));
  capture(runtime, idea("cap", { proposition: "Bearer abcdef123456 sk-abcdefghijklmnopqrstuv continuation-12345678-1234-1234-1234-123456789012" }));
  const disk = readFileSync(path, "utf8"); assert.doesNotMatch(disk, /private content|private title|abcdef123456|sk-abcdefghijklmnopqrstuv|continuation-12345678/u);
  const restarted = call(createMousecatRuntime({ config }), { action: "query" });
  assert.equal(restarted.records.length, 2); assert.equal(restarted.quarantined.length, 0);
});

test("bounded revision retention refuses more edits while reserving an explicit prune", () => {
  const runtime = createMousecatRuntime(); let record = capture(runtime).record;
  while (record.revision < BULLETIN_LIMITS.revisions - 1) record = call(runtime, { action: "amend", ...target(record), patch: { title: `Revision ${record.revision}` } }).record;
  assert.equal(call(runtime, { action: "amend", ...target(record), patch: { title: "Overflow" } }).code, "bulletin-revision-capacity-reached");
  assert.equal(runtime.bulletinCommand({ action: "prune", ...target(record) }).record.revision, BULLETIN_LIMITS.revisions);
  assert.equal(call(runtime, { action: "query", query: "x".repeat(257) }).code, "bulletin-query-invalid");
});

test("failed persistence rolls back memory and reports the real boundary", () => {
  const runtime = createMousecatRuntime({ config: { state: { enabled: true, path: "\u0000invalid" } } });
  assert.equal(capture(runtime).code, "bulletin-persistence-failed");
  assert.equal(call(runtime, { action: "query" }).records.length, 0);
});

test("actual HTTP MCP capture/query and safe graphical commands share one runtime", async t => {
  const runtime = createMousecatRuntime(), app = await startOperatorServer({ runtime, port: 0 });
  const client = new MousecatClient({ endpoint: `${app.url}/mcp` });
  t.after(async () => { await client.close(); await app.close(); });
  const result = await client.callTool("mousecat.bulletin", { action: "capture", record: idea(), permit });
  assert.equal(result.ok, true);
  const queried = await client.callTool("mousecat.bulletin", { action: "query", projectRef: "project:example", permit: observer }); assert.equal(queried.records.length, 1);
  const get = await fetch(`${app.url}/api/bulletin?projectRef=project%3Aexample&query=geometry`); assert.equal((await get.json()).records.length, 1);
  const post = values => fetch(`${app.url}/api/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
  const changed = await post({ commandId: "bulletin-disposition", values: { ...target(result.record), status: "addressed" } }); assert.equal(changed.status, 200);
  const snapshot = (await changed.json()).snapshot; assert.equal(snapshot.bulletin.records[0].status, "addressed");
  const created = await post({ commandId: "bulletin-capture", values: { record: { ...idea("operator"), source: { ...source, author: "forged" } } } }); assert.equal(created.status, 200);
  assert.equal((await created.json()).snapshot.bulletin.records.find(record => record.ideaId === "operator").source.author, "Operator");
  assert.equal((await post({ commandId: "mousecat.invoke", values: {} })).status, 403);
  const unsafe = await fetch(`${app.url}/api/command`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://other.example" }, body: JSON.stringify({ commandId: "bulletin-prune", values: target(result.record) }) }); assert.equal(unsafe.status, 403);
});

test("graphical capture retries reuse persisted server provenance across restart and pruning", async t => {
  const root = mkdtempSync(join(tmpdir(), "mousecat-bulletin-retry-"));
  const config = { state: { enabled: true, path: join(root, "state.json") } };
  let runtime = createMousecatRuntime({ config }), app = await startOperatorServer({ runtime, port: 0 });
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  const draft = { ...idea("operator-retry"), source: { ...source, author: "Forged browser author" } };
  const post = async record => {
    const response = await fetch(`${app.url}/api/command`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandId: "bulletin-capture", values: { record } }) });
    return { status: response.status, ...(await response.json()) };
  };
  assert.equal((await post(draft)).status, 200);
  const anchor = structuredClone(runtime.state.bulletin.get(draft.ideaId).source);
  assert.equal(anchor.author, "Operator"); assert.equal(anchor.host, "mousecat-graphical");
  assert.notEqual(anchor.messageId, source.messageId);
  assert.equal((await post(draft)).status, 200, "an unobserved successful capture can be retried");
  assert.equal(runtime.state.bulletin.size, 1); assert.equal(runtime.state.bulletin.get(draft.ideaId).revision, 1);
  await app.close(); runtime = createMousecatRuntime({ config }); app = await startOperatorServer({ runtime, port: 0 });
  assert.equal((await post(draft)).status, 200);
  assert.deepEqual(runtime.state.bulletin.get(draft.ideaId).source, anchor);
  const conflict = await post({ ...draft, proposition: "Changed retry payload" });
  assert.equal(conflict.status, 409); assert.equal(conflict.code, "bulletin-identity-conflict");
  assert.equal((await post({ ...draft, ideaId: "operator-fresh-draft" })).status, 200);
  assert.equal(runtime.state.bulletin.size, 2);
  assert.notEqual(runtime.state.bulletin.get("operator-fresh-draft").source.messageId, anchor.messageId);
  runtime.bulletinCommand({ action: "prune", ...target(runtime.state.bulletin.get(draft.ideaId)) });
  await app.close(); runtime = createMousecatRuntime({ config }); app = await startOperatorServer({ runtime, port: 0 });
  assert.equal((await post(draft)).status, 200);
  assert.equal(runtime.state.bulletin.get(draft.ideaId).status, "pruned");
  assert.equal(runtime.state.bulletin.get(draft.ideaId).revision, 2);
  assert.deepEqual(runtime.state.bulletin.get(draft.ideaId).source, anchor);
});
