import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { createNativeViews, parseNativeJson, validateNativeView } from "../src/core/native-view.mjs";
import { validateCognitionView } from "../src/core/cognition-view.mjs";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const commandName = sequence => `${String(sequence).padStart(16, "0")}.json`;

// A complete one-pixel RGBA PNG, including native-format chunk lengths/CRCs.
function png() {
  function chunk(type, bytes) {
    const content = Buffer.concat([Buffer.from(type), bytes]);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, content, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from([0, 30, 60, 90, 255]))), chunk("IEND", Buffer.alloc(0))]);
}
const PNG = png();

function manifest(sessionId, now = Date.now()) {
  return {
    schema: "mousecat.native-view/1", sessionId, sequence: 1, capturedAtUnixMs: now,
    image: { file: "frame-1.png", sha256: digest(PNG), width: 1, height: 1 },
    state: "running", title: "Example native world", summary: "Unreviewed observation.",
    people: [{ id: "person-1", label: "Avery", summary: "Walking near the shop.",
      sections: [{ id: "activity", label: "Activity", source: "native-observation", perspective: "observed", status: "available", message: "", rows: [{ label: "Action", value: "Walking" }] }],
      events: [{ id: "event-1", capturedAtUnixMs: now, worldHours: 2, source: "native-observation", stage: "movement", summary: "Started walking." }] },
    { id: "person-2", label: "Blair", summary: "Resting." }],
    lastCommandSequence: 0, camera: { mode: "automatic", personIds: ["person-1"], summary: "Current activity." },
    inspection: { sequence: 1, capturedAtUnixMs: now, worldHours: 2.1, status: "available", message: "", omittedPeople: 0, omittedEvents: 0, selectedPersonId: "person-1" },
    panels: [{ id: "activity", label: "Activity" }],
  };
}

function cognition(actorId = "person-1") {
  const predictions = probability => Object.fromEntries(["food", "water", "inspect", "continue"].map(action => [action, { probability, claim: `${action}: an actor-observed result follows.` }]));
  const proposals = [
    { modelId: "ordinary", version: "1", actionId: "food", interpretation: "Hunger supports seeking known food.", confidence: 0.7, predictions: predictions(0.7) },
    { modelId: "associative", version: "1", actionId: "inspect", interpretation: "An observed container may connect to food.", confidence: 0.6, predictions: predictions(0.4) },
  ];
  return {
    schema: "simulation.cognition/1", actorId, sequence: 1,
    settings: { enabled: true, opponentShare: 0.5, opportunitiesPerHour: 12, maxDepth: 3 },
    omittedEpisodes: 0, omittedExperiences: 0, rejectedExperiences: 0,
    episodes: [{ id: "episode-1", worldHours: 2, status: "observed", executionStatus: "observed",
      frame: { id: "frame-1", actorId, worldHours: 2, hunger: 0.6, thirst: 0.2, fatigue: 0.1, eatAt: 0.5, drinkAt: 0.4,
        foodAllowed: true, waterAllowed: true, inspectionAllowed: true, knownFood: 1, knownWater: 1, knownPlaces: 2,
        capabilities: { cook: false, forage: true, treat: false } },
      proposals, selectedModelId: "associative", selectedActionId: "inspect", selectionWeight: 0.5, selectionPolicy: "deterministic-balanced", disagreement: true,
      outcome: { eventId: "inspection-1", worldHours: 2.1, actionId: "inspect", status: "completed", success: true,
        revisions: { ordinary: "The inspected container provides new evidence.", associative: "The observed association gains support." },
        predictions: Object.fromEntries(proposals.map(proposal => [proposal.modelId, { ...proposal.predictions.inspect, squaredError: (1 - proposal.predictions.inspect.probability) ** 2 }])) } }],
    models: ["ordinary", "associative"].map(id => ({ id, version: "1", omittedBeliefs: 0, omittedHypotheses: 0,
      beliefs: [{ id: `${id}-belief`, label: "One inspected source is known.", confidence: 0.7, status: "observed" }],
      hypotheses: [{ id: `${id}-hypothesis`, label: "A container may preserve food.", branch: "logistics", depth: 1,
        confidence: 0.4, status: "hypothesis", evidenceIds: ["inspection-1"], parentIds: [], missing: ["An actual preservation experiment."] }] })),
  };
}

async function fixture(t) {
  const parent = await mkdtemp(join(tmpdir(), "mousecat-native-view-"));
  t.after(async () => {
    assert.equal(dirname(resolve(parent)), resolve(tmpdir()));
    assert.ok(basename(parent).startsWith("mousecat-native-view-"));
    await rm(parent, { recursive: true, force: true });
  });
  const directory = join(parent, "producer"), commands = join(directory, "commands"), registryPath = join(parent, "registry.json");
  await mkdir(commands, { recursive: true });
  const row = { id: "example", label: "Example simulation", projectRef: "example-project", directory, sessionId: randomUUID() };
  await writeFile(registryPath, JSON.stringify([row]));
  const view = manifest(row.sessionId);
  await writeFile(join(directory, view.image.file), PNG);
  const save = async value => writeFile(join(directory, "latest.json"), typeof value === "string" ? value : JSON.stringify(value));
  await save(view);
  const adapter = createNativeViews({ registryPath });
  return { parent, directory, commands, registryPath, row, view, adapter, save,
    async payload(fields = {}) {
      const snapshot = await adapter.snapshot(row.id);
      return { bindingId: snapshot.binding.bindingId, sessionId: row.sessionId, requestId: randomUUID(), action: "pause", ...fields };
    },
    async files() { return (await readdir(commands)).filter(name => /^\d{16}\.json$/u.test(name)).sort(); },
    async command(sequence) { return JSON.parse(await readFile(join(commands, commandName(sequence)), "utf8")); },
  };
}

function imageParams(snapshot) { return new URL(snapshot.imageUrl, "http://localhost").searchParams; }
async function appFor(t, f) {
  const app = await startOperatorServer({ runtime: createMousecatRuntime(), host: "127.0.0.1", port: 0,
    nativeViews: { registryPath: f.registryPath } });
  t.after(() => app.close());
  return app;
}
async function post(app, payload, headers = {}) {
  return fetch(`${app.url}/api/native-views/example/command`, { method: "POST",
    headers: { origin: app.url, "content-type": "application/json", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload) });
}

test("registered native view returns bounded public identity and the exact PNG", async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.adapter.list(), [{ id: f.row.id, label: f.row.label, projectRef: f.row.projectRef }]);
  const snapshot = await f.adapter.snapshot(f.row.id);
  assert.equal(snapshot.schema, "mousecat.native-view-response/1");
  assert.equal(snapshot.connection, "live");
  assert.equal(snapshot.view.people[0].sections[0].rows[0].value, "Walking");
  assert.match(snapshot.binding.bindingId, /^[a-f0-9]{64}$/u);
  assert.ok(!JSON.stringify(snapshot).includes(f.directory));
  assert.equal(Object.hasOwn(snapshot.binding, "directory"), false);
  assert.deepEqual(await f.adapter.image(f.row.id, imageParams(snapshot)), PNG);
  assert.equal(digest(await f.adapter.image(f.row.id, imageParams(snapshot))), snapshot.view.image.sha256);
  await assert.rejects(f.adapter.snapshot("unregistered"));
  await assert.rejects(f.adapter.snapshot(f.directory));
});

test("one native session exposes bounded recent activity feeds through immutable images", async t => {
  const f = await fixture(t), name = "frame-feed.png";
  await writeFile(join(f.directory, name), PNG);
  f.view.feeds = [{ id: "person-2", label: "Blair", capturedAtUnixMs: f.view.capturedAtUnixMs - 25,
    image: { file: name, sha256: digest(PNG), width: 1, height: 1 },
    camera: { mode: "automatic", personIds: ["person-2"], summary: "Watching Blair" },
    overlay: { personId: "person-2", capturedAtUnixMs: f.view.capturedAtUnixMs - 40, groups: [
      { id: "attention", label: "Attention", rows: [{ label: "Phase", value: "orienting" }] },
      { id: "memory", label: "Memory", rows: [{ label: "Threats", value: "3" }] },
    ] } }];
  await f.save(f.view);
  const snapshot = await f.adapter.snapshot(f.row.id);
  assert.deepEqual(snapshot.view.feeds, f.view.feeds);
  assert.deepEqual(snapshot.feedImages.map(value => value.id), ["person-2"]);
  assert.deepEqual(await f.adapter.image(f.row.id, new URL(snapshot.feedImages[0].imageUrl, "http://localhost").searchParams), PNG);
  for (const mutate of [
    value => { value.feeds[0].capturedAtUnixMs = value.capturedAtUnixMs + 1; },
    value => { value.feeds[0].camera.personIds = ["unknown"]; },
    value => { value.feeds.push(structuredClone(value.feeds[0])); },
    value => { value.feeds[0].image.file = "../other.png"; },
    value => { value.feeds[0].overlay.personId = "unknown"; },
    value => { value.feeds[0].overlay.capturedAtUnixMs = value.feeds[0].capturedAtUnixMs + 1; },
    value => { value.feeds[0].overlay.groups[0].id = "private-state"; },
    value => { value.feeds[0].overlay.groups[0].rows.push(...Array(4).fill({ label: "Too", value: "many" })); },
  ]) {
    const invalid = structuredClone(f.view); mutate(invalid);
    assert.throws(() => validateNativeView(invalid));
  }
});

test("registration pins the expected native session even on the first read", async t => {
  const f = await fixture(t);
  await f.save({ ...f.view, sessionId: randomUUID() });
  await assert.rejects(f.adapter.snapshot(f.row.id));
  await f.save(f.view);
  assert.equal((await f.adapter.snapshot(f.row.id)).view.sessionId, f.row.sessionId);
  await writeFile(f.registryPath, JSON.stringify([{ ...f.row, sessionId: "not-a-session" }]));
  await assert.rejects(f.adapter.list());
});

test("native image reads reject hash, dimension, size and PNG structure mismatches", async t => {
  const cases = [
    ["wrong hash", async (f, v) => { v.image.sha256 = "0".repeat(64); }],
    ["wrong dimensions", async (f, v) => { v.image.width = 2; }],
    ["non PNG", async (f, v) => { const data = Buffer.alloc(40); v.image.sha256 = digest(data); await writeFile(join(f.directory, v.image.file), data); }],
    ["truncated PNG", async (f, v) => { const data = PNG.subarray(0, 24); v.image.sha256 = digest(data); await writeFile(join(f.directory, v.image.file), data); }],
    ["truncated end chunk", async (f, v) => { const data = PNG.subarray(0, PNG.length - 1); v.image.sha256 = digest(data); await writeFile(join(f.directory, v.image.file), data); }],
    ["oversized PNG", async (f, v) => { const data = Buffer.alloc(16 * 1024 * 1024 + 1); PNG.copy(data); v.image.sha256 = digest(data); await writeFile(join(f.directory, v.image.file), data); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async inner => {
    const f = await fixture(inner), v = structuredClone(f.view);
    await mutate(f, v); await f.save(v);
    const snapshot = await f.adapter.snapshot(f.row.id);
    await assert.rejects(f.adapter.image(f.row.id, imageParams(snapshot)));
  });
});

test("frame-bound image URLs cannot substitute an arbitrary path or another image", async t => {
  const f = await fixture(t), snapshot = await f.adapter.snapshot(f.row.id);
  for (const name of ["../registry.json", "nested/frame.png", "C:frame.png", "other.png"]) {
    const params = imageParams(snapshot); params.set("file", name);
    await assert.rejects(f.adapter.image(f.row.id, params));
  }
  const wrongBinding = imageParams(snapshot); wrongBinding.set("binding", "0".repeat(64));
  await assert.rejects(f.adapter.image(f.row.id, wrongBinding));
  const wrongHash = imageParams(snapshot); wrongHash.set("sha256", "0".repeat(64));
  await assert.rejects(f.adapter.image(f.row.id, wrongHash));
});

test("validated image retention stays immutable while newer snapshots advance", async t => {
  const f = await fixture(t), first = await f.adapter.snapshot(f.row.id);
  await f.adapter.image(f.row.id, imageParams(first));
  await writeFile(join(f.directory, f.view.image.file), "partially replaced producer bytes");
  const next = structuredClone(f.view); next.sequence = 2; next.image.file = "frame-2.png";
  await writeFile(join(f.directory, next.image.file), PNG); await f.save(next);
  const second = await f.adapter.snapshot(f.row.id);
  assert.deepEqual(await f.adapter.image(f.row.id, imageParams(first)), PNG);
  assert.deepEqual(await f.adapter.image(f.row.id, imageParams(second)), PNG);
});

test("native JSON rejects duplicate escaped keys, nested duplicates and excessive depth", () => {
  for (const raw of ['{"sequence":1,"sequence":2}', '{"s\\u0065quence":1,"sequence":2}',
    '{"nested":{"id":1,"id":2}}', '[{"id":1,"id":2}]']) {
    assert.throws(() => parseNativeJson(raw), { code: "duplicate-native-key" });
  }
  assert.deepEqual(parseNativeJson('{"one":{"id":1},"two":{"id":2}}'), { one: { id: 1 }, two: { id: 2 } });
  assert.equal(parseNativeJson("[".repeat(12) + "0" + "]".repeat(12)).length, 1);
  assert.throws(() => parseNativeJson("[".repeat(13) + "0" + "]".repeat(13)));
  assert.throws(() => parseNativeJson(" ".repeat(1024 * 1024) + "{}"));
});

test("cognition preserves both pre-outcome predictions and actual selected-action evidence", async t => {
  const f = await fixture(t); f.view.people[0].cognition = cognition(); await f.save(f.view);
  const snapshot = await f.adapter.snapshot(f.row.id), observed = snapshot.view.people[0].cognition;
  assert.deepEqual(observed, f.view.people[0].cognition);
  assert.deepEqual(parseNativeJson(JSON.stringify(snapshot.view)).people[0].cognition, observed, "nested predictions must pass the real JSON boundary");
  assert.equal(observed.episodes[0].outcome.actionId, "inspect");
  assert.equal(observed.episodes[0].proposals[0].actionId, "food");
  assert.deepEqual(Object.keys(observed.episodes[0].outcome.predictions).sort(), ["associative", "ordinary"]);
  assert.equal(Object.hasOwn(observed.episodes[0].outcome, "food"), false, "unexecuted food has no outcome");
  const empty = structuredClone(f.view); empty.people[0].cognition.models = []; empty.people[0].cognition.episodes = [];
  assert.doesNotThrow(() => validateNativeView(empty));
  const censored = structuredClone(f.view), episode = censored.people[0].cognition.episodes[0];
  episode.status = "censored"; episode.executionStatus = "censored";
  episode.outcome = { eventId: "refusal-1", worldHours: 2.1, actionId: "inspect", status: "unavailable", detail: "Route became unavailable." };
  assert.doesNotThrow(() => validateNativeView(censored));
});

test("cognition admits the exact inspection county-time boundary including prior years", async t => {
  const f = await fixture(t), nativeWorldAge = 2.1, priorCountyHours = 365 * 24 * 20;
  const sourceHours = priorCountyHours + nativeWorldAge;
  f.view.inspection.worldHours = sourceHours;
  f.view.people[0].cognition = cognition();
  const episode = f.view.people[0].cognition.episodes[0];
  episode.worldHours = sourceHours; episode.frame.worldHours = sourceHours; episode.outcome.worldHours = sourceHours;
  await f.save(f.view);
  const snapshot = await f.adapter.snapshot(f.row.id);
  assert.deepEqual(snapshot.view.people[0].cognition, f.view.people[0].cognition);
  assert.ok(episode.worldHours > nativeWorldAge, "county evidence is not bounded by the newly loaded world's native age");
  episode.worldHours = sourceHours - 0.25; episode.frame.worldHours = sourceHours - 0.25;
  assert.doesNotThrow(() => validateNativeView(f.view), "earlier decisions may have an outcome at the source boundary");
  const zero = cognition();
  zero.episodes[0].worldHours = 0; zero.episodes[0].frame.worldHours = 0; zero.episodes[0].outcome.worldHours = 0;
  assert.doesNotThrow(() => validateCognitionView(zero, "person-1", 0), "zero is a valid source clock");
});

test("cognition rejects future episode frame and outcome evidence relative to inspection", () => {
  const base = manifest(randomUUID()); base.people[0].cognition = cognition();
  const future = base.inspection.worldHours + 0.000001;
  const mutations = [
    ["episode and frame", episode => {
      episode.status = "proposed"; episode.executionStatus = "queued"; delete episode.outcome;
      episode.worldHours = future; episode.frame.worldHours = future;
    }],
    ["frame", episode => { episode.frame.worldHours = future; }],
    ["outcome", episode => { episode.outcome.worldHours = future; }],
  ];
  for (const [name, mutate] of mutations) {
    const view = structuredClone(base); mutate(view.people[0].cognition.episodes[0]);
    assert.throws(() => validateNativeView(view), { code: "invalid-native-cognition" }, `${name} is beyond the source clock`);
  }
});

test("cognition requires a valid inspection source clock even for empty model history", () => {
  const base = manifest(randomUUID()); base.people[0].cognition = cognition();
  for (const sourceHours of [undefined, null, -1, NaN, Infinity, "2.1", true]) {
    const view = structuredClone(base); view.inspection.worldHours = sourceHours;
    assert.throws(() => validateNativeView(view), { code: "invalid-native-cognition" });
    const empty = cognition(); empty.episodes = []; empty.models = [];
    assert.throws(() => validateCognitionView(empty, "person-1", sourceHours), { code: "invalid-native-cognition" });
  }
  const missing = structuredClone(base); delete missing.inspection;
  assert.throws(() => validateNativeView(missing), { code: "invalid-native-view" });
});

test("cognition rejects identity drift, invented outcomes, malformed models and unbounded projections", () => {
  const base = manifest(randomUUID()); base.people[0].cognition = cognition();
  const mutations = [
    ["actor identity", c => { c.actorId = "person-2"; }],
    ["frame actor", c => { c.episodes[0].frame.actorId = "person-2"; }],
    ["unknown schema", c => { c.schema = "other"; }],
    ["private extra field", c => { c.hiddenWorldStock = 7; }],
    ["duplicate model", c => { c.models[1].id = "ordinary"; }],
    ["missing model", c => { c.models.pop(); }],
    ["unreported models with episodes", c => { c.models = []; }],
    ["duplicate proposal", c => { c.episodes[0].proposals[1].modelId = "ordinary"; }],
    ["false randomized policy", c => { c.episodes[0].selectionPolicy = "random"; }],
    ["missing deterministic policy", c => { delete c.episodes[0].selectionPolicy; }],
    ["unknown selected model", c => { c.episodes[0].selectedModelId = "missing"; }],
    ["changed selected action", c => { c.episodes[0].selectedActionId = "food"; }],
    ["unknown action", c => { c.episodes[0].proposals[0].actionId = "invent"; }],
    ["missing prediction", c => { delete c.episodes[0].proposals[0].predictions.water; }],
    ["label on unexecuted action", c => { c.episodes[0].outcome.actionId = "food"; }],
    ["retrospective probability", c => { c.episodes[0].outcome.predictions.ordinary.probability = 0.8; }],
    ["retrospective claim", c => { c.episodes[0].outcome.predictions.associative.claim = "Claim changed after seeing the result."; }],
    ["fabricated score", c => { c.episodes[0].outcome.predictions.ordinary.squaredError = 0; }],
    ["censored success", c => { c.episodes[0].status = "censored"; }],
    ["unavailable success", c => { c.episodes[0].outcome.status = "unavailable"; }],
    ["observed without outcome", c => { delete c.episodes[0].outcome; }],
    ["concealed disagreement", c => { c.episodes[0].disagreement = false; }],
    ["invented disagreement", c => { c.episodes[0].proposals[0].actionId = "inspect"; }],
    ["unknown execution state", c => { c.episodes[0].executionStatus = "succeeded"; }],
    ["invalid need", c => { c.episodes[0].frame.thirst = 1.1; }],
    ["invalid known count", c => { c.episodes[0].frame.knownFood = -1; }],
    ["invalid share", c => { c.settings.opponentShare = "0.5"; }],
    ["invalid rate", c => { c.settings.opportunitiesPerHour = 61; }],
    ["invalid depth", c => { c.settings.maxDepth = 5; }],
    ["missing enable state", c => { delete c.settings.enabled; }],
    ["numeric version", c => { c.models[0].version = 1; }],
    ["large interpretation", c => { c.episodes[0].proposals[0].interpretation = "x".repeat(513); }],
    ["large prediction", c => { c.episodes[0].proposals[0].predictions.food.claim = "x".repeat(513); }],
    ["large revision", c => { c.episodes[0].outcome.revisions.ordinary = "x".repeat(513); }],
    ["unknown hypothesis state", c => { c.models[0].hypotheses[0].status = "technology-unlocked"; }],
    ["large hypothesis", c => { c.models[0].hypotheses[0].label = "x".repeat(513); }],
    ["excess evidence", c => { c.models[0].hypotheses[0].evidenceIds = Array.from({ length: 9 }, (_, i) => `e${i}`); }],
    ["duplicate evidence", c => { c.models[0].hypotheses[0].evidenceIds = ["e1", "e1"]; }],
    ["large missing requirement", c => { c.models[0].hypotheses[0].missing = ["x".repeat(257)]; }],
    ["excess episodes", c => { c.episodes = Array.from({ length: 9 }, (_, i) => ({ ...c.episodes[0], id: `episode-${i}` })); }],
    ["large actor projection", c => { for (const model of c.models) model.beliefs = Array.from({ length: 64 }, (_, i) => ({ id: `b${i}`, label: "x".repeat(512), confidence: 0.5, status: "hypothesis" })); }],
  ];
  for (const [name, mutate] of mutations) {
    const value = structuredClone(base); mutate(value.people[0].cognition);
    assert.throws(() => validateNativeView(value), undefined, name);
  }
  const oversized = structuredClone(base);
  oversized.people = Array.from({ length: 8 }, (_, i) => {
    const id = `person-${i + 1}`, data = cognition(id);
    data.models[0].beliefs = Array.from({ length: 64 }, (_, j) => ({ id: `b${j}`, label: "x".repeat(512), confidence: 0.5, status: "observed" }));
    return { id, label: id, summary: "", cognition: data };
  });
  assert.throws(() => validateNativeView(oversized), { code: "native-inspection-too-large" });
});

test("inspection budget counts normalized details independently of person summaries and envelope metadata", () => {
  const value = manifest(randomUUID());
  value.people = Array.from({ length: 8 }, (_, index) => ({ id: `person-${index + 1}`, label: "P", summary: "s".repeat(4096),
    sections: Array.from({ length: 2 }, (_, section) => ({ id: `section-${section}`, label: "Details", source: "observation", perspective: "private", status: "available", message: "",
      rows: Array.from({ length: 48 }, () => ({ label: "Field", value: "" })) })), events: [],
  }));
  const normalizedSize = () => value.people.reduce((total, person) => total + Buffer.byteLength(JSON.stringify({ sections: person.sections, events: person.events }) + "\n"), 0);
  let remaining = 256 * 1024 - normalizedSize(), last;
  for (const person of value.people) for (const section of person.sections) for (const row of section.rows) {
    const count = Math.min(384, remaining); row.value = "x".repeat(count); remaining -= count;
    if (row.value.length < 384) last = row;
  }
  assert.equal(remaining, 0); assert.equal(normalizedSize(), 256 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(value)) > 256 * 1024, "identity and summary bytes are outside the detail budget");
  assert.doesNotThrow(() => validateNativeView(parseNativeJson(JSON.stringify(value))));
  last.value += "x";
  assert.equal(normalizedSize(), 256 * 1024 + 1);
  assert.throws(() => validateNativeView(value), { code: "native-inspection-too-large" });
});

test("cognition commands remain bounded, immutable and separate from applied source settings", async t => {
  const f = await fixture(t);
  const fields = { action: "cognition", opponentShare: 0.75, opportunitiesPerHour: 48, maxDepth: 4 };
  await assert.rejects(f.adapter.command(f.row.id, await f.payload(fields)), { code: "invalid-native-cognition-command" });
  f.view.sequence += 1; f.view.people[0].cognition = cognition(); await f.save(f.view);
  const payload = await f.payload(fields), result = await f.adapter.command(f.row.id, payload);
  assert.deepEqual(await f.command(result.sequence), { schema: "mousecat.native-view-command/1", sessionId: f.row.sessionId, sequence: result.sequence, ...fields });
  assert.deepEqual(await f.adapter.command(f.row.id, payload), result, "retry reuses request receipt");
  assert.equal((await f.adapter.snapshot(f.row.id)).view.people[0].cognition.settings.opportunitiesPerHour, 12, "request publication cannot claim application");
  for (const change of [{ opponentShare: -0.01 }, { opponentShare: 1.01 }, { opponentShare: "0.5" },
    { opportunitiesPerHour: 0 }, { opportunitiesPerHour: 61 }, { opportunitiesPerHour: 1.5 },
    { maxDepth: 0 }, { maxDepth: 5 }, { maxDepth: 1.5 }, { enabled: true }, { personId: "person-1" }]) {
    await assert.rejects(f.adapter.command(f.row.id, await f.payload({ ...fields, ...change })));
  }
  await assert.rejects(f.adapter.command(f.row.id, { ...payload, maxDepth: 2 }), { code: "native-request-id-reused" });
  assert.deepEqual(await f.files(), [commandName(1)]);
  await writeFile(join(f.commands, commandName(2)), JSON.stringify({ schema: "mousecat.native-view-command/1", sessionId: f.row.sessionId, sequence: 2, ...fields, opportunitiesPerHour: 61 }));
  await assert.rejects(f.adapter.command(f.row.id, await f.payload(fields)), { code: "native-command-collision" });
  assert.deepEqual(await f.files(), [commandName(1), commandName(2)]);
});

test("view and inspection schemas reject invalid types, fields and collection overflow", () => {
  const base = manifest(randomUUID());
  assert.deepEqual(validateNativeView(structuredClone(base)), base);
  const mutations = [
    v => { v.schema = "other"; }, v => { v.sequence = 0; }, v => { v.sequence = 2 ** 53; },
    v => { v.sequence = 1.5; }, v => { v.capturedAtUnixMs = Infinity; }, v => { v.lastCommandSequence = -1; },
    v => { v.extra = true; }, v => { v.image.width = 4097; }, v => { v.image.height = 2161; },
    v => { v.image.file = "../frame.png"; }, v => { v.image.file = "CON.png"; },
    v => { v.people = Array.from({ length: 2049 }, (_, n) => ({ id: `person-${n}`, label: "P", summary: "" })); },
    v => { v.people.push(structuredClone(v.people[0])); },
    v => { v.people[0].summary = "x".repeat(4097); },
    v => { v.people[0].sections = Array.from({ length: 11 }, (_, n) => ({ ...v.people[0].sections[0], id: `s-${n}` })); },
    v => { v.people[0].sections[0].rows = Array.from({ length: 49 }, () => ({ label: "L", value: "V" })); },
    v => { v.people[0].sections[0].rows[0].value = "v".repeat(385); },
    v => { v.people[0].events = Array.from({ length: 25 }, (_, n) => ({ ...v.people[0].events[0], id: `e-${n}` })); },
    v => { v.people[0].events[0].capturedAtUnixMs = v.inspection.capturedAtUnixMs + 1; },
    v => { delete v.inspection; }, v => { v.camera.personIds = ["unknown"]; },
    v => { v.camera.personIds = ["person-1", "person-1"]; }, v => { v.inspection.selectedPersonId = "unknown"; },
    v => { v.commandResult = { sequence: 1, status: "applied", message: "" }; },
    v => { v.camera = null; }, v => { v.inspection = false; }, v => { v.panels = ""; },
    v => { v.commandResult = null; }, v => { v.people[0].sections = null; }, v => { v.people[0].events = false; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const value = structuredClone(base); mutate(value);
    assert.throws(() => validateNativeView(value), undefined, `schema mutation ${index}`);
  }
});

test("snapshots enforce monotonic frame, observation and processed command cursors", async t => {
  const mutations = [
    ["frame sequence", v => { v.sequence = 1; }],
    ["capture timestamp", v => { v.capturedAtUnixMs -= 1; }],
    ["processed cursor", v => { v.lastCommandSequence = 1; delete v.commandResult; }],
    ["inspection sequence", v => { v.inspection.sequence = 1; }],
    ["inspection timestamp", v => { v.inspection.capturedAtUnixMs -= 1; v.people[0].events = []; }],
    ["session identity", v => { v.sessionId = randomUUID(); }],
    ["reused frame identity", v => { v.sequence = 2; v.summary = "changed under the same frame"; }],
    ["reused outcome", v => { v.commandResult.status = "rejected"; }],
  ];
  for (const [name, mutate] of mutations) await t.test(name, async inner => {
    const f = await fixture(inner), base = structuredClone(f.view);
    base.sequence = 2; base.lastCommandSequence = 2; base.inspection.sequence = 2;
    base.commandResult = { sequence: 2, status: "applied", message: "Paused." };
    await f.save(base); await f.adapter.snapshot(f.row.id);
    const value = structuredClone(base); value.sequence = 3; mutate(value); await f.save(value);
    await assert.rejects(f.adapter.snapshot(f.row.id));
    await f.save(base);
    assert.equal((await f.adapter.snapshot(f.row.id)).view.sequence, 2);
  });
});

test("omitting inspection for one frame does not erase its monotonic floor", async t => {
  const f = await fixture(t), base = structuredClone(f.view); base.inspection.sequence = 20;
  await f.save(base); await f.adapter.snapshot(f.row.id);
  const absent = structuredClone(base); absent.sequence = 2; delete absent.inspection;
  for (const person of absent.people) { delete person.sections; delete person.events; }
  await f.save(absent); await f.adapter.snapshot(f.row.id);
  const regressed = structuredClone(base); regressed.sequence = 3; regressed.inspection.sequence = 1;
  await f.save(regressed); await assert.rejects(f.adapter.snapshot(f.row.id));
});

test("native commands retain exact producer schema and consecutive immutable sequence", async t => {
  const f = await fixture(t);
  const existing = JSON.stringify({ schema: "mousecat.native-view-command/1", sessionId: f.row.sessionId, sequence: 1, action: "pause" }) + "\n";
  await writeFile(join(f.commands, commandName(1)), existing);
  const requests = [
    { action: "resume" }, { action: "speed", value: 3 }, { action: "pan", dx: -8, dy: 8 },
    { action: "focus", personId: "person-2" }, { action: "auto" }, { action: "select", personId: "person-1" },
    { action: "panel", personId: "person-1", panelId: "activity", visible: true }, { action: "stop" },
  ];
  for (const [index, fields] of requests.entries()) {
    const payload = await f.payload(fields), result = await f.adapter.command(f.row.id, payload);
    assert.equal(result.ok, true); assert.equal(result.status, "requested"); assert.equal(result.sequence, index + 2);
    assert.deepEqual(await f.command(result.sequence), { schema: "mousecat.native-view-command/1", sessionId: f.row.sessionId, sequence: result.sequence, ...fields });
  }
  assert.equal(await readFile(join(f.commands, commandName(1)), "utf8"), existing);
  assert.deepEqual(await f.files(), Array.from({ length: 9 }, (_, n) => commandName(n + 1)));
  assert.equal((await readdir(f.commands)).filter(name => name.endsWith(".tmp")).length, 0);
});

test("native zoom uses advertised engine levels and publishes only bounded steps", async t => {
  const f = await fixture(t);
  await assert.rejects(f.adapter.command(f.row.id, await f.payload({ action: "zoom", value: 1 })), /invalid-native-zoom/u);
  f.view.sequence += 1;
  f.view.viewport = { zoom: 1, targetZoom: 1, zoomLevels: [0.5, 0.75, 1, 1.5, 2.5] };
  await f.save(f.view);
  for (const [index, value] of [1, -1].entries()) {
    const result = await f.adapter.command(f.row.id, await f.payload({ action: "zoom", value }));
    assert.equal(result.sequence, index + 1);
    assert.deepEqual(await f.command(result.sequence), { schema: "mousecat.native-view-command/1", sessionId: f.row.sessionId, sequence: result.sequence, action: "zoom", value });
  }
  for (const value of [0, 2, -2, 0.5, "1", null]) {
    await assert.rejects(f.adapter.command(f.row.id, await f.payload({ action: "zoom", value })));
  }
  assert.equal((await f.adapter.snapshot(f.row.id)).view.viewport.zoom, 1, "publication must not fabricate a changed camera");
  for (const viewport of [null, {}, { ...f.view.viewport, zoom: 0 }, { ...f.view.viewport, zoomLevels: [] },
    { ...f.view.viewport, zoomLevels: [1, 0.5] }, { ...f.view.viewport, zoomLevels: [1, 1] },
    { ...f.view.viewport, targetZoom: 3 }, { ...f.view.viewport, zoom: 3 }, { ...f.view.viewport, internalPath: "private" }]) {
    assert.throws(() => validateNativeView({ ...f.view, viewport }));
  }
});

test("concurrent publishers cannot replace one another or leave command gaps", async t => {
  const f = await fixture(t), other = createNativeViews({ registryPath: f.registryPath });
  const payloads = await Promise.all(Array.from({ length: 16 }, (_, n) => f.payload({ action: "pan", dx: n % 8 + 1, dy: 0 })));
  const results = await Promise.all(payloads.map((payload, index) => (index % 2 ? other : f.adapter).command(f.row.id, payload)));
  assert.deepEqual(results.map(result => result.sequence).sort((a, b) => a - b), Array.from({ length: 16 }, (_, n) => n + 1));
  for (const [index, result] of results.entries()) assert.equal((await f.command(result.sequence)).dx, payloads[index].dx);
  assert.deepEqual(await f.files(), Array.from({ length: 16 }, (_, n) => commandName(n + 1)));
});

test("malformed existing command collisions block further publication without replacement", async t => {
  const mutations = [
    ["schema", value => { value.schema = "other"; }],
    ["session", value => { value.sessionId = randomUUID(); }],
    ["sequence", value => { value.sequence = 2; }],
    ["action", value => { value.action = "exec"; }],
    ["fields", value => { value.action = "speed"; value.value = 20; }],
    ["extra field", value => { value.script = "arbitrary invocation"; }],
  ];
  for (const [name, mutate] of mutations) await t.test(name, async inner => {
    const f = await fixture(inner), payload = await f.payload();
    const existing = { schema: "mousecat.native-view-command/1", sessionId: f.row.sessionId, sequence: 1, action: "pause" };
    mutate(existing); const raw = JSON.stringify(existing);
    await writeFile(join(f.commands, commandName(1)), raw);
    await assert.rejects(f.adapter.command(f.row.id, payload));
    assert.deepEqual(await f.files(), [commandName(1)]);
    assert.equal(await readFile(join(f.commands, commandName(1)), "utf8"), raw);
  });
});

test("processed cursor advances new commands and a full pending window refuses publication", async t => {
  const f = await fixture(t), view = structuredClone(f.view);
  view.lastCommandSequence = 7; view.commandResult = { sequence: 7, status: "rejected", message: "Source refused." };
  await f.save(view);
  const result = await f.adapter.command(f.row.id, await f.payload());
  assert.equal(result.sequence, 8);
  for (let sequence = 9; sequence <= 135; sequence += 1) {
    await writeFile(join(f.commands, commandName(sequence)), JSON.stringify({ schema: "mousecat.native-view-command/1", sessionId: f.row.sessionId, sequence, action: "pause" }));
  }
  await assert.rejects(f.adapter.command(f.row.id, await f.payload()), { code: "native-command-queue-full" });
  assert.equal((await f.files()).length, 128);
  assert.equal((await readdir(f.commands)).filter(name => name.endsWith(".tmp")).length, 0);
});

test("request identity deduplicates retries and refuses a changed action under the same request", async t => {
  const f = await fixture(t), payload = await f.payload({ action: "pan", dx: 3, dy: 0 });
  const results = await Promise.all(Array.from({ length: 8 }, () => f.adapter.command(f.row.id, payload)));
  assert.ok(results.every(result => result.sequence === results[0].sequence));
  assert.deepEqual(await f.files(), [commandName(1)]);
  await assert.rejects(f.adapter.command(f.row.id, { ...payload, dx: 4 }));
  assert.equal((await f.adapter.command(f.row.id, payload)).sequence, 1);
});

test("an acknowledged request retry returns its receipt after liveness or person changes", async t => {
  for (const scenario of ["processed", "ended", "stale", "person departed"]) await t.test(scenario, async inner => {
    const realNow = Date.now; let now = realNow();
    Date.now = () => now;
    inner.after(() => { Date.now = realNow; });
    const f = await fixture(inner), payload = await f.payload({ action: "focus", personId: "person-2" });
    const first = await f.adapter.command(f.row.id, payload);
    const view = structuredClone(f.view); view.sequence = 2; view.lastCommandSequence = first.sequence;
    view.commandResult = { sequence: first.sequence, status: "applied", message: "Focused." };
    if (scenario === "ended") view.state = "ended";
    if (scenario === "person departed") view.people = view.people.filter(person => person.id !== payload.personId);
    await f.save(view);
    if (scenario === "stale") now += 32000;
    const repeated = await f.adapter.command(f.row.id, payload);
    assert.deepEqual(repeated, first);
    assert.deepEqual(await f.files(), [commandName(1)]);
    await assert.rejects(f.adapter.command(f.row.id, { ...payload, action: "pause" }));
    if (scenario !== "processed") await assert.rejects(f.adapter.command(f.row.id, { ...payload, requestId: randomUUID() }));
  });
});

test("native command payloads fail closed before any queue publication", async t => {
  const f = await fixture(t), valid = await f.payload();
  const invalid = [
    { ...valid, action: "exec", value: "do something" }, { ...valid, action: "__proto__" },
    { ...valid, schema: "mousecat.native-view-command/1" }, { ...valid, sequence: 4 },
    { ...valid, bindingId: "0".repeat(64) }, { ...valid, sessionId: randomUUID() },
    { ...valid, requestId: "not-a-uuid" }, { ...valid, requestId: undefined },
    { ...valid, action: "speed", value: 4 }, { ...valid, action: "speed", value: "2" },
    { ...valid, action: "pan", dx: 9, dy: 0 }, { ...valid, action: "pan", dx: 1.5, dy: 0 },
    { ...valid, action: "pan", dx: 0 }, { ...valid, personId: "person-1" },
    { ...valid, action: "focus", personId: "unknown" },
    { ...valid, action: "panel", personId: "person-1", panelId: "unknown", visible: true },
    { ...valid, action: "panel", personId: "person-1", panelId: "activity", visible: "true" },
  ];
  for (const payload of invalid) await assert.rejects(f.adapter.command(f.row.id, payload));
  assert.deepEqual(await f.files(), []);
});

test("ended, disconnected and future frames cannot admit commands", async t => {
  for (const [name, age, state] of [["ended", 0, "ended"],
    ["disconnected", 31000, "running"], ["future", -60000, "running"]]) await t.test(name, async inner => {
    const f = await fixture(inner), payload = await f.payload();
    // A fresh adapter distinguishes a stale producer from an ordinary regression.
    const view = manifest(f.row.sessionId, Date.now() - age); view.state = state;
    await f.save(view);
    const adapter = createNativeViews({ registryPath: f.registryPath });
    await assert.rejects(adapter.command(f.row.id, payload));
    assert.deepEqual(await f.files(), []);
  });
});

test("delayed running frames and deliberately paused sessions remain controllable", async t => {
  for (const [name, age, state, connection] of [["delayed", 5000, "running", "stale"],
    ["long pause", 24 * 60 * 60 * 1000, "paused", "stale"]]) await t.test(name, async inner => {
    const now = Date.now(), f = await fixture(inner), view = manifest(f.row.sessionId, now - age);
    view.state = state; await f.save(view);
    const adapter = createNativeViews({ registryPath: f.registryPath });
    const snapshot = await adapter.snapshot(f.row.id);
    assert.equal(snapshot.connection, connection);
    const result = await adapter.command(f.row.id, { bindingId: snapshot.binding.bindingId, sessionId: f.row.sessionId,
      requestId: randomUUID(), action: state === "paused" ? "resume" : "pause" });
    assert.equal(result.status, "requested");
  });
});

test("durable study sessions checkpoint, configure and continue through exact commands", async t => {
  const f = await fixture(t), studyId = randomUUID();
  f.view.study = { id: studyId, label: "Survival simulation", status: "running", attempt: 2,
    attemptDurationSeconds: 3600, autoContinue: false, worldHours: 18.5, accumulatedWorldHours: 16.5,
    canCheckpoint: true, canContinue: false, updatedAtUnixMs: Date.now(), lastStopReason: null,
    reviewStatus: "pending", reviewMessage: "Preparing completed outcomes for human review." };
  await f.save(f.view);
  const adapter = createNativeViews({ registryPath: f.registryPath });
  const snapshot = await adapter.snapshot(f.row.id);
  const payload = fields => ({ bindingId: snapshot.binding.bindingId, sessionId: f.row.sessionId,
    requestId: randomUUID(), ...fields });
  await adapter.command(f.row.id, payload({ action: "checkpoint" }));
  await adapter.command(f.row.id, payload({ action: "configure", attemptDurationSeconds: 7200, autoContinue: true }));
  assert.deepEqual(await f.command(1), { schema: "mousecat.native-view-command/1", sessionId: f.row.sessionId, sequence: 1, action: "checkpoint" });
  assert.deepEqual(await f.command(2), { schema: "mousecat.native-view-command/1", sessionId: f.row.sessionId, sequence: 2,
    action: "configure", attemptDurationSeconds: 7200, autoContinue: true });
  const ended = structuredClone(f.view); ended.sequence = 2; ended.state = "ended"; ended.lastCommandSequence = 2;
  ended.study = { ...ended.study, status: "saved", canCheckpoint: false, canContinue: true,
    updatedAtUnixMs: Date.now(), lastStopReason: "wall-time-limit", reviewStatus: "queued",
    reviewMessage: "Two trajectories await human disposition.", reviewInteractionId: "skill-review" };
  await f.save(ended); await adapter.snapshot(f.row.id);
  await adapter.command(f.row.id, payload({ action: "continue" }));
  assert.equal((await f.command(3)).action, "continue");
  await assert.rejects(adapter.command(f.row.id, payload({ action: "checkpoint" })));
  for (const change of [
    { attemptDurationSeconds: 29 }, { attemptDurationSeconds: 604801 }, { autoContinue: 1 },
  ]) await assert.rejects(adapter.command(f.row.id, payload({ action: "configure", attemptDurationSeconds: 3600, autoContinue: false, ...change })));
  for (const mutate of [
    value => { value.study.status = "saved"; },
    value => { value.study.attemptDurationSeconds = 29; },
    value => { value.study.canContinue = true; },
    value => { value.study.lastStopReason = "x".repeat(81); },
    value => { value.study.reviewStatus = "queued"; },
    value => { value.study.reviewMessage = "x".repeat(513); },
  ]) {
    const invalid = structuredClone(f.view); mutate(invalid);
    assert.throws(() => validateNativeView(invalid));
  }
});

test("a stale image cannot lock out the durable save request", async t => {
  const f = await fixture(t), studyId = randomUUID();
  const staleAt = Date.now() - 60_000;
  f.view.capturedAtUnixMs = staleAt;
  f.view.inspection.capturedAtUnixMs = staleAt;
  for (const person of f.view.people) for (const event of person.events || []) event.capturedAtUnixMs = staleAt;
  for (const feed of f.view.feeds || []) {
    feed.capturedAtUnixMs = staleAt;
    if (feed.overlay) feed.overlay.capturedAtUnixMs = staleAt;
  }
  f.view.study = { id: studyId, label: "Survival simulation", status: "running", attempt: 2,
    attemptDurationSeconds: 3600, autoContinue: false, worldHours: 18.5, accumulatedWorldHours: 16.5,
    canCheckpoint: true, canContinue: false, updatedAtUnixMs: Date.now(), lastStopReason: null };
  await f.save(f.view);
  const adapter = createNativeViews({ registryPath: f.registryPath }), snapshot = await adapter.snapshot(f.row.id);
  assert.equal(snapshot.connection, "disconnected");
  const result = await adapter.command(f.row.id, { bindingId: snapshot.binding.bindingId,
    sessionId: f.row.sessionId, requestId: randomUUID(), action: "checkpoint" });
  assert.equal(result.status, "requested");
  assert.equal((await f.command(1)).action, "checkpoint");
});

test("registry rebinding invalidates the old browser binding", async t => {
  const f = await fixture(t), payload = await f.payload(), replacement = join(f.parent, "replacement");
  await mkdir(join(replacement, "commands"), { recursive: true });
  await writeFile(join(replacement, "latest.json"), JSON.stringify(f.view));
  await writeFile(join(replacement, f.view.image.file), PNG);
  await writeFile(f.registryPath, JSON.stringify([{ ...f.row, directory: replacement }]));
  await assert.rejects(f.adapter.command(f.row.id, payload));
  assert.deepEqual(await f.files(), []);
  assert.deepEqual(await readdir(join(replacement, "commands")), []);
});

test("image and command symlinks are rejected without following the target", async t => {
  for (const kind of ["image", "command-file", "command-directory"]) await t.test(kind, async inner => {
    const f = await fixture(inner), outside = join(f.parent, "outside"); await mkdir(outside);
    const destination = kind === "image" ? join(outside, "image.png") : join(outside, "command.json");
    const original = kind === "image" ? PNG : Buffer.from('{"outside":"unchanged"}');
    await writeFile(destination, original);
    const snapshot = await f.adapter.snapshot(f.row.id), payload = await f.payload();
    try {
      if (kind === "image") {
        await unlink(join(f.directory, f.view.image.file)); await symlink(destination, join(f.directory, f.view.image.file), "file");
      } else if (kind === "command-file") await symlink(destination, join(f.commands, commandName(1)), "file");
      else {
        await rename(f.commands, join(f.directory, "original-commands"));
        await symlink(outside, f.commands, process.platform === "win32" ? "junction" : "dir");
      }
    } catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) { inner.skip("OS denied creation of this symlink fixture"); return; }
      throw error;
    }
    if (kind === "image") await assert.rejects(f.adapter.image(f.row.id, imageParams(snapshot)));
    else await assert.rejects(f.adapter.command(f.row.id, payload));
    assert.deepEqual(await readFile(destination), original);
    if (kind === "command-file") assert.deepEqual((await f.files()).filter(name => name !== commandName(1)), []);
  });
});

test("operator HTTP exposes the registered feed while withholding local paths", async t => {
  const f = await fixture(t), app = await appFor(t, f);
  const list = await fetch(`${app.url}/api/native-views`); assert.equal(list.status, 200);
  const publicRows = await list.json(); assert.equal(publicRows.views[0].id, f.row.id);
  assert.ok(!JSON.stringify(publicRows).includes(f.directory));
  const response = await fetch(`${app.url}/api/native-views/example/snapshot`); assert.equal(response.status, 200);
  const snapshot = await response.json();
  const image = await fetch(`${app.url}${snapshot.imageUrl}`); assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /^image\/png/u);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);
  const unknown = await fetch(`${app.url}/api/native-views/unknown/snapshot`); assert.equal(unknown.status, 409);
  const error = await unknown.text(); assert.ok(!error.includes(f.parent)); assert.ok(!error.includes("ENOENT"));
  const global = await (await fetch(`${app.url}/api/snapshot`)).json();
  assert.equal(global.nativeViews[0].id, f.row.id);
});

test("operator HTTP commands require same origin, JSON, bounded exact bodies and request identity", async t => {
  const f = await fixture(t), app = await appFor(t, f), payload = await f.payload();
  assert.equal((await post(app, payload, { origin: "http://elsewhere.invalid" })).status, 403);
  assert.equal((await post(app, payload, { origin: "null" })).status, 403);
  const missingOrigin = await fetch(`${app.url}/api/native-views/example/command`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(missingOrigin.status, 403);
  assert.equal((await post(app, payload, { "content-type": "text/plain" })).status, 415);
  assert.equal((await post(app, { ...payload, unknown: true })).status, 409);
  const oversized = await post(app, JSON.stringify({ ...payload, padding: "x".repeat(9000) }));
  assert.ok(oversized.status >= 400);
  assert.deepEqual(await f.files(), []);
  const accepted = await post(app, payload); assert.equal(accepted.status, 202);
  const result = await accepted.json(); assert.equal(result.status, "requested");
  const replay = await post(app, payload); assert.equal(replay.status, 202);
  assert.equal((await replay.json()).sequence, result.sequence);
  assert.deepEqual(await f.files(), [commandName(1)]);
});

test("duplicate command keys are rejected at the actual HTTP JSON boundary", async t => {
  const f = await fixture(t), app = await appFor(t, f), payload = await f.payload();
  const raw = JSON.stringify(payload).replace('"action":"pause"', '"action":"stop","action":"pause"');
  const result = await post(app, raw);
  assert.ok(result.status >= 400, `duplicate command was admitted with HTTP ${result.status}`);
  assert.deepEqual(await f.files(), []);
});
