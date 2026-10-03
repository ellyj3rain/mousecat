import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { startOperatorServer } from "../src/operator/server.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/native_video.json", import.meta.url), "utf8"));

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "mousecat-video-route-"));
  t.after(async () => { assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true }); });
  const producer = join(root, "source"); await mkdir(producer); await mkdir(join(producer, "commands"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwS2n6DwAETAIsoJ1HtQAAAABJRU5ErkJggg==", "base64");
  await writeFile(join(producer, "frame.png"), png);
  for (const [file, encoded] of Object.entries(fixture.files)) await writeFile(join(producer, file), Buffer.from(encoded, "base64"));
  const sessionId = randomUUID(), image = { file: "frame.png", sha256: createHash("sha256").update(png).digest("hex"), width: 1, height: 1 };
  const video = structuredClone(fixture.manifest); video.schema = "mousecat.native-video/1";
  const view = { schema: "mousecat.native-view/1", sessionId, sequence: 1, capturedAtUnixMs: Date.now(),
    image, state: "running", title: "Source video test", summary: fixture.provenance, people: [], lastCommandSequence: 0, video };
  const registry = join(root, "registry.json");
  await writeFile(registry, JSON.stringify([{ id: "video", label: "Encoded fixture", directory: producer, sessionId }]));
  await writeFile(join(producer, "latest.json"), JSON.stringify(view));
  const app = await startOperatorServer({ port: 0, nativeViews: { registryPath: registry } }); t.after(() => app.close());
  const snapshot = await fetch(app.url + "/api/native-views/video/snapshot").then(response => response.json());
  assert.equal(snapshot.schema, "mousecat.native-view-response/1");
  return { app, producer, view, snapshot, write: () => writeFile(join(producer, "latest.json"), JSON.stringify(view)) };
}

test("video HTTP authority serves complete actual init and media with exact source hashes", async t => {
  const { app, snapshot } = await setup(t);
  for (const url of [snapshot.videoUrls.initUrl, snapshot.videoUrls.segments[0].url]) {
    const response = await fetch(app.url + url); assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "video/mp4");
    const bytes = Buffer.from(await response.arrayBuffer()); const expectedHash = new URL(url, app.url).searchParams.get("sha256");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash);
  }
});

test("video refuses unknown descriptors, traversal and expired source bindings", async t => {
  const { app, snapshot } = await setup(t);
  for (const change of [params => params.set("binding", "0".repeat(64)), params => params.set("file", "../outside.m4s"),
    params => params.set("sha256", "0".repeat(64))]) {
    const url = new URL(snapshot.videoUrls.segments[0].url, app.url); change(url.searchParams);
    const response = await fetch(url); assert.notEqual(response.status, 200);
  }
});

test("corrupt complete media fails independently while PNG fallback stays usable", async t => {
  const { app, producer, snapshot, view } = await setup(t);
  const file = view.video.segments[0].file;
  const bytes = Buffer.from(fixture.files[file], "base64"); bytes[bytes.length - 1] ^= 1; await writeFile(join(producer, file), bytes);
  const response = await fetch(app.url + snapshot.videoUrls.segments[0].url); assert.notEqual(response.status, 200);
  assert.equal((await fetch(app.url + snapshot.imageUrl)).status, 200);
});

test("video camera identity requires the retained native epoch, site and acquisition clock", async t => {
  const { app, view, write } = await setup(t); const segment = view.video.segments[0];
  view.sequence += 1; view.people = [{ id: "person", label: "Person", summary: "Declared actor." }];
  const camera = { mode: "automatic", personIds: ["person"], summary: "Following person" };
  view.feeds = [{ id: "site:subject", siteId: "subject", label: "Person", capturedAtUnixMs: view.capturedAtUnixMs,
    image: view.image, camera, videoCamera: { camera, capturedAtUnixMs: segment.endCapturedAtUnixMs, observerSequence: segment.observerSequence } }];
  await write(); assert.equal((await fetch(app.url + "/api/native-views/video/snapshot")).status, 200);
  view.sequence += 1; view.feeds[0].videoCamera.observerSequence += 1; await write();
  const response = await fetch(app.url + "/api/native-views/video/snapshot"); assert.notEqual(response.status, 200);
  assert.equal((await response.json()).code, "native-video-camera-unacknowledged");
});

test("native video regression cannot manufacture a newer source receipt", async t => {
  const { app, view, write } = await setup(t); view.sequence += 1; view.video.stats.encodedFrames -= 1;
  await write(); const response = await fetch(app.url + "/api/native-views/video/snapshot");
  assert.notEqual(response.status, 200); assert.equal((await response.json()).code, "native-video-regressed");
});

test("initialized stream format stays immutable after init and media are cached", async t => {
  const { app, view, write, snapshot } = await setup(t);
  for (const url of [snapshot.videoUrls.initUrl, snapshot.videoUrls.segments[0].url])
    assert.equal((await fetch(app.url + url)).status, 200);
  const original = structuredClone(view.video);
  for (const [key, value] of [["codecs", "avc1.42001f"], ["width", original.width + 1],
    ["height", original.height + 1], ["fps", original.fps === 120 ? 60 : 120]]) {
    view.sequence += 1; view.video = { ...structuredClone(original), [key]: value };
    await write();
    const response = await fetch(app.url + "/api/native-views/video/snapshot");
    assert.notEqual(response.status, 200, key);
    assert.equal((await response.json()).code, "native-video-format-reused", key);
  }
  view.sequence += 1; view.video = original; await write();
  assert.equal((await fetch(app.url + "/api/native-views/video/snapshot")).status, 200);
  assert.equal((await fetch(app.url + snapshot.videoUrls.initUrl)).status, 200);
});
