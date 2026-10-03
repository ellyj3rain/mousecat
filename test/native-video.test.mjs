import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateNativeVideo, validateVideoInit, validateVideoBytes } from "../src/core/native-video.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/native_video.json", import.meta.url), "utf8"));
const digest = data => createHash("sha256").update(data).digest("hex");
function sample() {
  const video = structuredClone(fixture.manifest); video.schema = "mousecat.native-video/1";
  return { video, init: Buffer.from(fixture.files[video.init.file], "base64"),
    media: Buffer.from(fixture.files[video.segments[0].file], "base64"), descriptor: video.segments[0] };
}
function rehash(data, descriptor) { descriptor.sha256 = digest(data); return data; }
function payload(data, kind) {
  const type = data.indexOf(Buffer.from(kind)); assert.ok(type >= 4, `Fixture box ${kind} exists`); return type + 4;
}
function firstPictureHeader(data) {
  let cursor = payload(data, "mdat");
  for (let index = 0; index < 1024; index += 1) {
    const size = data.readUInt32BE(cursor); cursor += 4;
    if ((data[cursor] & 31) === 5) return cursor;
    cursor += size;
  }
  throw new Error("Fixture keyframe unavailable");
}

test("real synthetic native producer fixture validates its AVC init and independently decodable fragment", () => {
  const { video, init, media, descriptor } = sample();
  assert.equal(validateNativeVideo(video, { now: descriptor.endCapturedAtUnixMs }), video);
  const defaults = validateVideoInit(init, video);
  assert.ok(Object.isFrozen(defaults)); assert.equal(defaults.track, 1); assert.equal(defaults.timescale, 1000);
  assert.equal(defaults.nalLengthSize, 4); assert.deepEqual(defaults.pictureIds, [0]);
  assert.deepEqual(validateVideoBytes(media, descriptor, video, defaults),
    { sampleCount: 15, ptsStartMs: 1433, durationMs: 417, independentlyDecodable: true });
  assert.match(fixture.provenance, /Synthetic RGB/u);
  assert.doesNotMatch(JSON.stringify(fixture), /[A-Za-z]:[\\/]|file:\/\//u);
});

test("unavailable states have no initialization or segments and running requires verified descriptors", () => {
  for (const state of ["starting", "ended", "failed"]) {
    const { video } = sample(); Object.assign(video, { state, init: null, codecs: null, segments: [], width: 0, height: 0 });
    assert.equal(validateNativeVideo(video), video);
    video.state = "running"; assert.throws(() => validateNativeVideo(video), /initialization/u);
  }
});

test("manifest rejects unsafe names, scalar coercions, dishonest counters, paths and extra fields", () => {
  const mutations = [
    video => { video.streamId = video.streamId.toUpperCase(); },
    video => { video.init.file = "../video-init.mp4"; },
    video => { video.segments[0].file = "../0000000000000001.m4s"; },
    video => { video.init.sha256 = "00"; },
    video => { video.fps = "60"; }, video => { video.fps = 29; }, video => { video.fps = 121; },
    video => { video.stats.encodedFrames = 181; }, video => { video.stats.droppedFrames = -1; },
    video => { video.segments[0].durationMs = 0; }, video => { video.segments[0].durationMs = 60001; },
    video => { video.segments[0].worldHours = NaN; }, video => { video.width = 4097; },
    video => { video.message = "Encoder failed at C:/private/encoder.exe"; },
    video => { video.segments[0].secret = "extra"; },
  ];
  for (const mutate of mutations) { const { video } = sample(); mutate(video); assert.throws(() => validateNativeVideo(video)); }
});

test("capture intervals, encoded intervals and frame receipt ordering remain independent and monotonic", () => {
  const { video, descriptor } = sample(), now = descriptor.endCapturedAtUnixMs;
  assert.throws(() => validateNativeVideo(video, { now: descriptor.capturedAtUnixMs - 2001 }), /clocks/u);
  const next = structuredClone(descriptor);
  Object.assign(next, { sequence: 6, file: `video-${video.streamId}-0000000000000006.m4s`, ptsStartMs: 1850,
    capturedAtUnixMs: descriptor.endCapturedAtUnixMs, endCapturedAtUnixMs: descriptor.endCapturedAtUnixMs + 400,
    worldHours: descriptor.endWorldHours, endWorldHours: descriptor.endWorldHours + .1,
    firstFrameSequence: descriptor.lastFrameSequence + 1, lastFrameSequence: descriptor.lastFrameSequence + 15 });
  video.segments.push(next); validateNativeVideo(video, { now: now + 400 });
  for (const [key, value] of [["sequence", 5], ["ptsStartMs", 1700], ["capturedAtUnixMs", descriptor.endCapturedAtUnixMs - 1],
    ["worldHours", descriptor.endWorldHours - .01], ["firstFrameSequence", descriptor.lastFrameSequence], ["lastFrameSequence", 181]]) {
    const changed = structuredClone(video); changed.segments[1][key] = value;
    assert.throws(() => validateNativeVideo(changed, { now: now + 400 }), undefined, key);
  }
  const changed = structuredClone(video); changed.segments = Array(9).fill(descriptor);
  assert.throws(() => validateNativeVideo(changed), /limit/u);
});

test("native crop geometry supports fractional basement floors and refuses overlap or fabricated pixels", () => {
  const { video } = sample(); video.segments[0].sites[0].z = -1.25; validateNativeVideo(video);
  const empty = structuredClone(video); empty.segments[0].sites = []; validateNativeVideo(empty);
  for (const mutation of [site => { site.z = 32; }, site => { site.z = -32.1; }, site => { site.width = 321; },
    site => { site.left = .5; }, site => { site.zoom = .001; }, site => { site.targetZoom = 101; }, site => { site.x = Infinity; }]) {
    const changed = structuredClone(video); mutation(changed.segments[0].sites[0]); assert.throws(() => validateNativeVideo(changed));
  }
  const changed = structuredClone(video); const site = { ...changed.segments[0].sites[0], id: "second", slot: 1 };
  changed.segments[0].sites.push(site); assert.throws(() => validateNativeVideo(changed), /overlap/u);
});

test("verified initialization is stream-bound and cannot be forged or reused after descriptor drift", () => {
  const { video, init, media, descriptor } = sample(), defaults = validateVideoInit(init, video);
  assert.throws(() => validateVideoBytes(media, descriptor, video, { ...defaults }), /verified initialization/u);
  const changed = structuredClone(video); changed.codecs = "avc1.640020";
  assert.throws(() => validateVideoBytes(media, changed.segments[0], changed, defaults), /verified initialization/u);
  assert.throws(() => validateVideoBytes(media, { ...descriptor, ptsStartMs: descriptor.ptsStartMs + 1 }, video, defaults), /manifest/u);
});

test("byte hashes and allocation limits are checked before parsing", () => {
  const { video, init, media, descriptor } = sample(), defaults = validateVideoInit(init, video);
  init[init.length - 1] ^= 1; assert.throws(() => validateVideoInit(init, video), /hash/u);
  media[media.length - 1] ^= 1; assert.throws(() => validateVideoBytes(media, descriptor, video, defaults), /hash/u);
  assert.throws(() => validateVideoInit(Buffer.alloc(2 * 1024 * 1024 + 1), video), /size/u);
  assert.throws(() => validateVideoBytes(Buffer.alloc(16 * 1024 * 1024 + 1), descriptor, video, defaults), /size/u);
});

test("complete box lengths and one-track initialization are required even with matching hashes", () => {
  for (const kind of ["truncate-init", "open-init", "oversized-init", "wrong-init-root", "truncate-media", "open-media", "wrong-media-root"]) {
    const { video, init, media, descriptor } = sample();
    if (kind.endsWith("init") || kind === "wrong-init-root") {
      let data = Buffer.from(init);
      if (kind === "truncate-init") data = data.subarray(0, data.length - 1);
      else if (kind === "open-init") data.writeUInt32BE(0, 0);
      else if (kind === "oversized-init") data.writeUInt32BE(data.length + 1, 0);
      else data.write("free", 4, "ascii");
      rehash(data, video.init); assert.throws(() => validateVideoInit(data, video));
    } else {
      const defaults = validateVideoInit(init, video); let data = Buffer.from(media);
      if (kind === "truncate-media") data = data.subarray(0, data.length - 1);
      else if (kind === "open-media") data.writeUInt32BE(0, 0);
      else data.write("free", 4, "ascii");
      rehash(data, descriptor); assert.throws(() => validateVideoBytes(data, descriptor, video, defaults));
    }
  }
});

test("AVC configuration, SPS geometry and MP4 dimensions must agree", () => {
  for (const mutation of ["codec", "entry-dimensions", "decoded-dimensions", "parameter-length", "NAL-length-width"]) {
    const { video, init } = sample(), data = Buffer.from(init), avcc = payload(data, "avcC"), avc1 = payload(data, "avc1");
    if (mutation === "codec") data[avcc + 2] ^= 1;
    if (mutation === "entry-dimensions") data.writeUInt16BE(318, avc1 + 24);
    if (mutation === "decoded-dimensions") { data.writeUInt16BE(318, avc1 + 24); video.width = 318; video.segments[0].sites[0].width = 318; }
    if (mutation === "parameter-length") data.writeUInt16BE(65535, avcc + 6);
    if (mutation === "NAL-length-width") data[avcc + 4] = 254;
    rehash(data, video.init); assert.throws(() => validateVideoInit(data, video), undefined, mutation);
  }
});

test("sync flags, actual IDR, data offset, media times and receipt sample count are all validated", () => {
  for (const mutation of ["sync-flags", "actual-keyframe", "data-offset", "PTS", "duration", "receipt-count", "sample-size", "sequence", "NAL-size"]) {
    const { video, init, media, descriptor } = sample(), defaults = validateVideoInit(init, video), data = Buffer.from(media);
    const run = payload(data, "trun");
    if (mutation === "sync-flags") data.writeUInt32BE(0x01010000, run + 12);
    if (mutation === "actual-keyframe") { const header = firstPictureHeader(data); data[header] = (data[header] & 224) | 1; }
    if (mutation === "data-offset") data.writeInt32BE(data.readInt32BE(run + 8) + 4, run + 8);
    if (mutation === "PTS") descriptor.ptsStartMs += 100;
    if (mutation === "duration") descriptor.durationMs += 100;
    if (mutation === "receipt-count") descriptor.lastFrameSequence = descriptor.firstFrameSequence + 13;
    if (mutation === "sample-size") data.writeUInt32BE(data.length, run + 20);
    if (mutation === "sequence") data.writeUInt32BE(descriptor.sequence + 1, payload(data, "mfhd") + 4);
    if (mutation === "NAL-size") data.writeUInt32BE(65535, payload(data, "mdat"));
    rehash(data, descriptor); assert.throws(() => validateVideoBytes(data, descriptor, video, defaults), undefined, mutation);
  }
});

test("source mutation controls flip codec, sync flag, actual keyframe, offset and timestamp rejection", async () => {
  const source = await readFile(new URL("../src/core/native-video.mjs", import.meta.url), "utf8");
  const controls = [
    { label: "codec", replacements: [['"avc1." + data.subarray(begin + 1, begin + 4).toString("hex") === video.codecs', "true"]],
      mutate(data) { data.init[payload(data.init, "avcC") + 2] ^= 1; }, init: true },
    { label: "sync", replacements: [['(currentFlags & 0x10000) === 0 && ((currentFlags >>> 24) & 3) === 2', "true"]],
      mutate(data) { data.media.writeUInt32BE(0x01010000, payload(data.media, "trun") + 12); } },
    { label: "keyframe", replacements: [['if (firstSample) requireValue(type === 5, "first sample has no AVC keyframe");', ""],
      ['(!firstSample || idr)', "true"]],
      mutate(data) { const header = firstPictureHeader(data.media); data.media[header] = (data.media[header] & 224) | 1; } },
    { label: "offset", replacements: [['moof.start + dataOffset === mdat.payload', "true"]],
      mutate(data) { const offset = payload(data.media, "trun") + 8; data.media.writeInt32BE(data.media.readInt32BE(offset) + 4, offset); } },
    { label: "time", replacements: [['Math.abs(ptsStartMs - descriptor.ptsStartMs) <= 1 && Math.abs(durationMs - descriptor.durationMs) <= 1', "true"]],
      mutate(data) { data.descriptor.ptsStartMs += 100; } },
  ];
  for (const control of controls) {
    let changed = source;
    for (const [before, after] of control.replacements) {
      assert.equal(changed.split(before).length - 1, 1, `Executable control target ${control.label} is unique`);
      changed = changed.replace(before, after);
    }
    assert.notEqual(changed, source);
    const mutated = await import("data:text/javascript;base64," + Buffer.from(changed).toString("base64"));
    const data = sample(); control.mutate(data); rehash(data.init, data.video.init); rehash(data.media, data.descriptor);
    if (control.init) {
      assert.throws(() => validateVideoInit(data.init, data.video), undefined, `Production rejects ${control.label}`);
      assert.doesNotThrow(() => mutated.validateVideoInit(data.init, data.video), `Mutated verdict flips ${control.label}`);
    } else {
      const productionDefaults = validateVideoInit(data.init, data.video), mutatedDefaults = mutated.validateVideoInit(data.init, data.video);
      assert.throws(() => validateVideoBytes(data.media, data.descriptor, data.video, productionDefaults), undefined, `Production rejects ${control.label}`);
      assert.doesNotThrow(() => mutated.validateVideoBytes(data.media, data.descriptor, data.video, mutatedDefaults), `Mutated verdict flips ${control.label}`);
    }
  }
  const unchanged = sample(); assert.equal(validateVideoBytes(unchanged.media, unchanged.descriptor, unchanged.video,
    validateVideoInit(unchanged.init, unchanged.video)).sampleCount, 15);
  assert.equal(await readFile(new URL("../src/core/native-video.mjs", import.meta.url), "utf8"), source);
});
