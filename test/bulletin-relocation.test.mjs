import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { BULLETIN_LIMITS, createBulletinController, restoreBulletinRecords } from "../src/core/bulletin.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";
import { MousecatClient } from "../src/sdk/client.mjs";

const permit = { profileId: "operator-interaction" };
const source = { author: "Project owner", host: "test-client", sessionId: "ownership-correction", messageId: "original", at: "2026-10-04T10:00:00.000Z" };
const correction = { ...source, messageId: "authorized-owner-correction", at: "2026-10-04T11:00:00.000Z" };
const idea = (id, extra = {}) => ({ ideaId: id, projectRef: "project:old", surfaceId: "old", title: "Source-bound idea", proposition: "Retain its meaning and original attribution.", source, ...extra });
const call = (runtime, args) => runtime.handleTool("mousecat.bulletin", { permit, ...args });
const target = record => ({ ideaId: record.ideaId, projectRef: record.projectRef, expectedRevision: record.revision });
const request = records => ({ action: "relocate", records: records.map(target), targetProjectRef: "project:canonical", targetSurfaceId: "canonical", source: correction });
function register(runtime, surfaceId, projectRef) {
  const result = runtime.handleTool("mousecat.projects", { action: "register", permit, surface: {
    surfaceId, projectRef, projectKind: "repository", root: process.cwd(), identityMarkers: ["package.json"],
    governingDocuments: [{ role: "readme", path: "README.md" }], dataSources: [],
  } });
  assert.equal(result.ok, true);
}
function fixture(config) {
  const runtime = createMousecatRuntime({ config });
  register(runtime, "old", "project:old"); register(runtime, "canonical", "project:canonical");
  return runtime;
}
function captured(runtime, raw) { const result = call(runtime, { action: "capture", record: raw }); assert.equal(result.ok, true); return result.record; }
const reseal = record => { const { integrity: _integrity, ...content } = record; return { ...content, integrity: createHash("sha256").update(JSON.stringify(content)).digest("hex") }; };

test("ownership correction preserves exact origins/history and joins canonical queries across restart", t => {
  const root = mkdtempSync(join(tmpdir(), "mousecat-relocation-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "state.json"), config = { state: { enabled: true, path } };
  let runtime = fixture(config), one = captured(runtime, idea("one"));
  one = call(runtime, { action: "amend", ...target(one), source: correction, patch: { title: "An earlier correction" } }).record;
  const two = captured(runtime, idea("two", { links: [{ ideaId: "one", relation: "extends" }] }));
  const originals = structuredClone([one, two]);
  // An owner may repair a surface descriptor before correcting its retained ideas.
  register(runtime, "old", "project:canonical");
  const moved = call(runtime, request(originals)); assert.equal(moved.ok, true);
  for (const [index, record] of moved.records.entries()) {
    const old = originals[index];
    assert.deepEqual(record.origin, { projectRef: old.projectRef, surfaceId: old.surfaceId });
    assert.deepEqual(record.source, old.source); assert.equal(record.createdAt, old.createdAt); assert.equal(record.captureHash, old.captureHash);
    assert.deepEqual(record.history.slice(0, -1), old.history); assert.deepEqual(record.links, old.links);
    assert.equal(record.ideaId, old.ideaId); assert.equal(record.status, old.status);
    assert.equal(record.revision, old.revision + 1); assert.equal(record.history.at(-1).action, "relocate");
    assert.deepEqual(record.history.at(-1).source, correction);
    assert.deepEqual(record.history.at(-1).ownership, { from: record.origin,
      to: { projectRef: "project:canonical", surfaceId: "canonical" }, expectedRevision: old.revision,
      authority: { kind: "work-permit", profileId: permit.profileId, grant: "mousecat.bulletin:relocate" } });
  }
  assert.equal(call(runtime, { action: "query", projectRef: "project:old" }).records.length, 0);
  assert.equal(call(runtime, { action: "query", projectRef: "project:canonical" }).records.length, 2);
  runtime = createMousecatRuntime({ config });
  assert.deepEqual(runtime.bulletinQuery().records, moved.records);
  assert.equal(runtime.bulletinQuery().quarantined.length, 0);
  const retry = call(runtime, { action: "capture", record: idea("one") });
  assert.equal(retry.duplicate, true); assert.equal(retry.record.projectRef, "project:canonical");
  assert.equal(retry.record.revision, moved.records[0].revision);
  assert.equal(call(runtime, { action: "capture", record: idea("one", { projectRef: "project:canonical", surfaceId: "canonical" }) }).code, "bulletin-identity-conflict");
  let amended = call(runtime, { action: "amend", ...target(retry.record), source: correction, patch: { horizon: "mid" } }).record;
  assert.deepEqual(amended.origin, moved.records[0].origin);
  amended = runtime.bulletinCommand({ action: "disposition", ...target(amended), status: "archived" }).record;
  assert.equal(amended.status, "archived"); assert.deepEqual(amended.origin, moved.records[0].origin);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).bulletin.length, 2);
  assert.equal(createMousecatRuntime({ config }).bulletinQuery().quarantined.length, 0);
});

test("relocation refuses absent authority, stale/foreign targets and malformed or partial sets without writes", () => {
  const runtime = fixture(), one = captured(runtime, idea("one")), two = captured(runtime, idea("two"));
  const good = request([one, two]), before = JSON.stringify([...runtime.state.bulletin.values()]);
  const cases = [
    [{ ...good, permit: undefined }, "bulletin-permit-required"],
    [{ ...good, permit: { profileId: "observer" } }, "bulletin-permit-required"],
    [{ ...good, permit: { profileId: "tool-invocation" } }, "bulletin-permit-required"],
    [{ ...good, authority: { kind: "operator" } }, "bulletin-relocation-invalid"],
    [{ ...good, source: undefined }, "bulletin-source-invalid"],
    [{ ...good, source: { ...correction, transcript: "not an anchor" } }, "bulletin-source-invalid"],
    [{ ...good, targetSurfaceId: "missing" }, "bulletin-surface-unavailable"],
    [{ ...good, targetSurfaceId: "old" }, "bulletin-surface-unavailable"],
    [{ ...good, targetProjectRef: undefined, targetSurfaceId: undefined }, "bulletin-surface-unavailable"],
    [{ ...good, records: [] }, "bulletin-relocation-invalid"],
    [{ ...good, records: [target(one), target(one)] }, "bulletin-relocation-invalid"],
    [{ ...good, records: [target(one), { ...target(two), projectRef: "project:foreign" }] }, "bulletin-record-unavailable"],
    [{ ...good, records: [target(one), { ...target(two), expectedRevision: 2 }] }, "bulletin-revision-conflict"],
    [{ ...good, records: [target(one), { ...target(two), expectedRevision: "1" }] }, "bulletin-relocation-invalid"],
    [{ ...good, records: [{ ...target(one), status: "addressed" }] }, "bulletin-relocation-invalid"],
    [{ ...good, status: "addressed" }, "bulletin-relocation-invalid"],
    [{ ...good, targetProjectRef: "project:old", targetSurfaceId: "old" }, "bulletin-ownership-unchanged"],
  ];
  for (const [args, code] of cases) {
    assert.equal(call(runtime, args).code, code);
    assert.equal(JSON.stringify([...runtime.state.bulletin.values()]), before, code);
  }
  assert.equal(runtime.bulletinCommand(good).code, "bulletin-operator-command-required", "no graphical bypass exists");
});

test("incoming and outgoing connections require one atomic same-project correction set", () => {
  const runtime = fixture(), one = captured(runtime, idea("one"));
  const two = captured(runtime, idea("two", { links: [{ ideaId: "one", relation: "depends-on" }] }));
  assert.equal(call(runtime, request([one])).code, "bulletin-relocation-links-cross-project", "incoming link cannot be left behind");
  assert.equal(call(runtime, request([two])).code, "bulletin-relocation-links-cross-project", "outgoing link cannot be detached");
  const moved = call(runtime, request([one, two])); assert.equal(moved.ok, true);
  register(runtime, "third", "project:third");
  const again = call(runtime, { ...request(moved.records), targetProjectRef: "project:third", targetSurfaceId: "third" });
  assert.equal(again.ok, true);
  for (const record of again.records) {
    assert.deepEqual(record.origin, { projectRef: "project:old", surfaceId: "old" });
    assert.deepEqual(record.history.at(-1).ownership.from, { projectRef: "project:canonical", surfaceId: "canonical" });
  }
  assert.equal(restoreBulletinRecords(again.records).valid.size, 2);
});

test("ownership history rejects broken origin, authority, expected revision and final owner on reload", () => {
  const runtime = fixture(), initial = captured(runtime, idea("one"));
  const moved = call(runtime, request([initial])).records[0];
  const changes = [
    record => { delete record.origin; },
    record => { record.origin.projectRef = "project:foreign"; },
    record => { record.origin = {}; },
    record => { record.projectRef = "project:foreign"; },
    record => { record.history.at(-1).ownership.expectedRevision = 99; },
    record => { record.history.at(-1).ownership.authority.grant = "mousecat.bulletin:query"; },
    record => { delete record.history.at(-1).ownership.authority.profileId; },
    record => { record.history.at(-1).status = record.status = "addressed"; },
    record => { record.history.at(-1).contentHash = "0".repeat(64); },
    record => { record.history[0].ownership = record.history.at(-1).ownership; },
  ];
  for (const change of changes) {
    const malformed = structuredClone(moved); change(malformed);
    const restored = restoreBulletinRecords([reseal(malformed)]);
    assert.equal(restored.valid.size, 0); assert.equal(restored.quarantined.length, 1);
  }
  assert.equal(restoreBulletinRecords([initial]).valid.size, 1, "unchanged legacy record remains compatible");
});

test("sensitive history and pruned tombs retain ownership provenance without content resurrection", () => {
  const runtime = fixture(), privateIdea = idea("private", { sensitive: true, proposition: "A private proposition" });
  const initial = captured(runtime, privateIdea), moved = call(runtime, request([initial])).records[0];
  assert.equal(moved.history.at(-1).ownership.to.projectRef, "project:canonical");
  assert.doesNotMatch(JSON.stringify([...runtime.state.bulletin.values()]), /A private proposition/u);
  const pruned = runtime.bulletinCommand({ action: "prune", ...target(moved) }).record;
  assert.equal(call(runtime, { ...request([pruned]), targetProjectRef: "project:old", targetSurfaceId: "old" }).code, "bulletin-record-pruned");
  const retry = call(runtime, { action: "capture", record: privateIdea });
  assert.equal(retry.duplicate, true); assert.equal(retry.record.status, "pruned");
  assert.equal(retry.record.projectRef, "project:canonical");
  const restored = createMousecatRuntime({ state: { bulletin: [...runtime.state.bulletin.values()] } });
  assert.equal(restored.bulletinQuery().quarantined.length, 0);
  assert.equal(restored.bulletinQuery().records[0].history[1].ownership.to.projectRef, "project:canonical");
});

test("revision limit reserves prune and ownership correction never adds records", () => {
  const runtime = fixture(); let record = captured(runtime, idea("one"));
  while (record.revision < BULLETIN_LIMITS.revisions - 1) record = call(runtime, { action: "amend", ...target(record), source: correction, patch: { title: `Revision ${record.revision}` } }).record;
  assert.equal(call(runtime, request([record])).code, "bulletin-revision-capacity-reached");
  assert.equal(runtime.bulletinCommand({ action: "prune", ...target(record) }).record.revision, BULLETIN_LIMITS.revisions);
  assert.equal(runtime.state.bulletin.size, 1);
  assert.equal(call(runtime, { ...request([]), records: Array.from({ length: BULLETIN_LIMITS.records + 1 }, () => target(record)) }).code, "bulletin-relocation-invalid");
});

test("atomic relocation rolls every member back when persistence fails", () => {
  const runtime = fixture(), one = captured(runtime, idea("one")), two = captured(runtime, idea("two"));
  const before = JSON.stringify([...runtime.state.bulletin.values()]); let attempts = 0;
  const controller = createBulletinController({ state: runtime.state, persist: () => { attempts++; return false; },
    permitAllows: () => ({ allowed: true, profile: { id: permit.profileId } }) });
  assert.equal(controller.tool({ ...request([one, two]), permit }).code, "bulletin-persistence-failed");
  assert.equal(attempts, 1); assert.equal(JSON.stringify([...runtime.state.bulletin.values()]), before);
});

test("ownership history respects the byte ceiling atomically before attempting persistence", () => {
  const runtime = fixture(), original = captured(runtime, idea("full-0", { proposition: "x".repeat(6000) }));
  let bytes = JSON.stringify([original]).length;
  for (let index = 1; index < BULLETIN_LIMITS.records; index++) {
    const record = reseal({ ...structuredClone(original), ideaId: `full-${index}` });
    const size = JSON.stringify(record).length + 1;
    if (bytes + size > BULLETIN_LIMITS.bytes - 2000) break;
    runtime.state.bulletin.set(record.ideaId, record); bytes += size;
  }
  const before = JSON.stringify([...runtime.state.bulletin.values()]); let attempts = 0;
  const controller = createBulletinController({ state: runtime.state, persist: () => { attempts++; return true; },
    permitAllows: () => ({ allowed: true, profile: { id: permit.profileId } }) });
  assert.equal(runtime.state.bulletinQuarantine.length, 0);
  assert.ok(Buffer.byteLength(before) < BULLETIN_LIMITS.bytes);
  assert.equal(controller.tool({ ...request([...runtime.state.bulletin.values()]), permit }).code, "bulletin-storage-capacity-reached");
  assert.equal(attempts, 0); assert.equal(JSON.stringify([...runtime.state.bulletin.values()]), before);
});

test("HTTP MCP schema and SDK expose revision-bound relocation with observer refusal", async t => {
  const runtime = fixture(), original = captured(runtime, idea("one"));
  const app = await startOperatorServer({ runtime, port: 0 }), client = new MousecatClient({ endpoint: `${app.url}/mcp` });
  t.after(async () => { await client.close(); await app.close(); });
  const session = await client.initialize();
  const listed = await fetch(`${app.url}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    "Mcp-Session-Id": session.sessionId, "MCP-Protocol-Version": session.protocolVersion }, body: JSON.stringify({ jsonrpc: "2.0", id: "ownership-schema", method: "tools/list" }) });
  const tools = (await listed.json()).result, definition = tools.tools.find(tool => tool.name === "mousecat.bulletin");
  assert.ok(definition.inputSchema.properties.action.enum.includes("relocate"));
  assert.equal(definition.inputSchema.properties.records.items.additionalProperties, false);
  await assert.rejects(client.callTool("mousecat.bulletin", { ...request([original]), permit: { profileId: "observer" } }), { code: "bulletin-permit-required" });
  const result = await client.callTool("mousecat.bulletin", { ...request([original]), permit });
  assert.equal(result.ok, true); assert.equal(result.records[0].projectRef, "project:canonical");
  const response = await fetch(`${app.url}/api/bulletin?projectRef=project%3Acanonical`);
  assert.equal((await response.json()).records[0].ideaId, original.ideaId);
  assert.equal((await client.callTool("mousecat.bulletin", { action: "capture", record: idea("one"), permit })).duplicate, true);
  await assert.rejects(client.callTool("mousecat.bulletin", { action: "disposition", ...target(result.records[0]), source: correction, status: "addressed", permit }), { code: "bulletin-permit-required" });
});
