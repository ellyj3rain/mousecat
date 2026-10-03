import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const VERIFIED_INITS = new WeakSet();
const MAX_INIT = 2 * 1024 * 1024, MAX_MEDIA = 16 * 1024 * 1024;

function requireValue(condition, message) {
  if (!condition) throw Object.assign(new Error(`invalid-native-video: ${message}`), { code: "invalid-native-video" });
}
function object(value, required) {
  requireValue(value && typeof value === "object" && !Array.isArray(value)
    && required.length === Object.keys(value).length && required.every(key => Object.hasOwn(value, key)), "fields differ");
}
function integer(value, low = 0, high = Number.MAX_SAFE_INTEGER) {
  requireValue(Number.isSafeInteger(value) && value >= low && value <= high, "invalid integer");
}
function number(value, low = 0, high = Number.MAX_SAFE_INTEGER) {
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= low && value <= high, "invalid number");
}
function text(value, maximum, empty = false) {
  requireValue(typeof value === "string" && value.length <= maximum && (empty || value.length > 0)
    && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value), "invalid text");
}
function array(value, maximum) { requireValue(Array.isArray(value) && value.length <= maximum, "collection limit"); }

/** Validate immutable video descriptors, capture receipts and composite crops. */
export function validateNativeVideo(value, { now = Date.now() } = {}) {
  object(value, ["schema", "streamId", "state", "mimeType", "codecs", "width", "height", "fps", "init", "segments", "stats", "message"]);
  requireValue(value.schema === "mousecat.native-video/1" && UUID.test(value.streamId), "schema or stream identity differs");
  requireValue(["starting", "running", "ended", "failed"].includes(value.state) && value.mimeType === "video/mp4", "state or media type differs");
  integer(now); integer(value.fps, 30, 120); integer(value.width, 0, 4096); integer(value.height, 0, 2160);
  text(value.message, 512, true);
  requireValue(!/(?:[A-Za-z]:[\\/]|file:\/\/|\/(?:Users|home|tmp)\/)/u.test(value.message), "message contains a local path");
  object(value.stats, ["capturedFrames", "encodedFrames", "droppedFrames"]);
  for (const count of Object.values(value.stats)) integer(count);
  requireValue(value.stats.encodedFrames + value.stats.droppedFrames <= value.stats.capturedFrames, "frame counters differ");
  array(value.segments, 8);
  if (value.init === null) {
    requireValue(value.codecs === null && value.state !== "running" && value.segments.length === 0, "initialization is unavailable");
  } else {
    object(value.init, ["file", "sha256"]);
    requireValue(value.init.file === `video-${value.streamId}-init.mp4` && HASH.test(value.init.sha256)
      && typeof value.codecs === "string" && /^avc1\.[0-9a-f]{6}$/u.test(value.codecs)
      && value.width > 0 && value.height > 0, "initialization descriptor differs");
  }
  let previous = null;
  for (const segment of value.segments) {
    object(segment, ["sequence", "file", "sha256", "ptsStartMs", "durationMs", "capturedAtUnixMs", "endCapturedAtUnixMs",
      "observerSequence", "worldHours", "endWorldHours", "firstFrameSequence", "lastFrameSequence", "sites"]);
    integer(segment.sequence, 1);
    requireValue(segment.file === `video-${value.streamId}-${String(segment.sequence).padStart(16, "0")}.m4s`
      && HASH.test(segment.sha256), "fragment identity differs");
    number(segment.ptsStartMs); number(segment.durationMs, Number.MIN_VALUE, 60000);
    number(segment.worldHours); number(segment.endWorldHours);
    for (const key of ["capturedAtUnixMs", "endCapturedAtUnixMs", "observerSequence", "firstFrameSequence", "lastFrameSequence"])
      integer(segment[key], ["firstFrameSequence", "lastFrameSequence"].includes(key) ? 1 : 0);
    requireValue(segment.capturedAtUnixMs <= segment.endCapturedAtUnixMs && segment.endCapturedAtUnixMs <= now + 2000
      && segment.worldHours <= segment.endWorldHours && segment.firstFrameSequence <= segment.lastFrameSequence
      && segment.lastFrameSequence <= value.stats.capturedFrames, "capture receipt clocks differ");
    if (previous) requireValue(segment.sequence > previous.sequence && segment.ptsStartMs >= previous.ptsStartMs + previous.durationMs - 1
      && segment.capturedAtUnixMs >= previous.endCapturedAtUnixMs && segment.worldHours >= previous.endWorldHours
      && segment.firstFrameSequence > previous.lastFrameSequence, "fragment order differs");
    array(segment.sites, 4); const ids = new Set(), slots = new Set(), rectangles = [];
    for (const site of segment.sites) {
      object(site, ["id", "label", "slot", "x", "y", "z", "left", "top", "width", "height", "zoom", "targetZoom"]);
      requireValue(typeof site.id === "string" && /^[a-z][a-z0-9-]{0,47}$/u.test(site.id) && !ids.has(site.id), "site identity differs");
      ids.add(site.id); text(site.label, 160); integer(site.slot, 0, 3);
      requireValue(!slots.has(site.slot), "duplicate site slot"); slots.add(site.slot);
      number(site.x, -(2 ** 31), 2 ** 31); number(site.y, -(2 ** 31), 2 ** 31); number(site.z, -32);
      requireValue(site.z < 32, "floor exceeds native range");
      integer(site.left); integer(site.top); integer(site.width, 1); integer(site.height, 1);
      requireValue(site.left + site.width <= value.width && site.top + site.height <= value.height, "crop exceeds composite pixels");
      const rectangle = [site.left, site.top, site.left + site.width, site.top + site.height];
      requireValue(rectangles.every(other => rectangle[2] <= other[0] || rectangle[0] >= other[2]
        || rectangle[3] <= other[1] || rectangle[1] >= other[3]), "composite crops overlap");
      rectangles.push(rectangle); number(site.zoom, .01, 100); number(site.targetZoom, .01, 100);
    }
    previous = segment;
  }
  return value;
}

function bytes(value, descriptor, maximum) {
  requireValue(value instanceof Uint8Array && value.byteLength >= 16 && value.byteLength <= maximum, "byte size exceeds bound");
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  requireValue(createHash("sha256").update(data).digest("hex") === descriptor.sha256, "byte hash differs");
  return data;
}
function boxes(data, start = 0, end = data.length) {
  const result = [];
  while (start < end) {
    requireValue(start + 8 <= end, "truncated box header");
    let size = data.readUInt32BE(start), header = 8;
    const kind = data.toString("ascii", start + 4, start + 8);
    requireValue(/^[A-Za-z0-9 ]{4}$/u.test(kind), "invalid box type");
    if (size === 1) {
      requireValue(start + 16 <= end, "truncated extended box");
      const extended = data.readBigUInt64BE(start + 8);
      requireValue(extended <= BigInt(Number.MAX_SAFE_INTEGER), "box length exceeds integer bound");
      size = Number(extended); header = 16;
    }
    requireValue(size >= header && start + size <= end, "incomplete box");
    result.push({ kind, start, payload: start + header, end: start + size }); start += size;
    requireValue(result.length <= 1024, "box collection limit");
  }
  return result;
}
function child(data, parent, kind, skip = 0) {
  requireValue(parent.payload + skip <= parent.end, "truncated parent box");
  const found = boxes(data, parent.payload + skip, parent.end).filter(box => box.kind === kind);
  requireValue(found.length === 1, "required box differs");
  return found[0];
}
function full(data, box, version, flags = 0) {
  requireValue(box.end - box.payload >= 4 && data[box.payload] === version
    && data.readUIntBE(box.payload + 1, 3) === flags, "box version or flags differs");
}

function rbsp(nal) {
  requireValue(nal.length > 1 && !(nal[0] & 128), "invalid AVC NAL header");
  // Slice validation consumes only a header; retain no expanded frame payload.
  let cursor = 1, zeroes = 0, current = 0, remaining = 0;
  const nextByte = () => {
    while (cursor < nal.length) {
      const byte = nal[cursor++];
      if (zeroes >= 2 && byte === 3) {
        requireValue(cursor < nal.length && nal[cursor] <= 3, "invalid AVC emulation prevention");
        zeroes = 0; continue;
      }
      zeroes = byte === 0 ? zeroes + 1 : 0;
      return byte;
    }
    requireValue(false, "truncated AVC syntax");
  };
  const read = count => {
    requireValue(count <= 32, "AVC read exceeds bound");
    let value = 0;
    for (let i = 0; i < count; i += 1) {
      if (remaining === 0) { current = nextByte(); remaining = 8; }
      remaining -= 1; value = value * 2 + ((current >> remaining) & 1);
    }
    return value;
  };
  const ue = () => {
    let zeroBits = 0;
    while (read(1) === 0) { zeroBits += 1; requireValue(zeroBits <= 30, "AVC value exceeds bound"); }
    return (2 ** zeroBits) - 1 + read(zeroBits);
  };
  return { read, ue, se() { const value = ue(); return value & 1 ? (value + 1) / 2 : -value / 2; } };
}

// H.264 7.3.2.1.1 and 7.4.2.1.1: read the sequence geometry and crop units.
// Decoded dimensions cannot be established from the MP4 sample entry alone.
function sequenceInfo(nal, video) {
  requireValue((nal[0] & 31) === 7, "AVC sequence parameter set missing");
  const bits = rbsp(nal), profile = bits.read(8), compatibility = bits.read(8), level = bits.read(8);
  const codec = "avc1." + Buffer.from([profile, compatibility, level]).toString("hex");
  requireValue(codec === video.codecs, "AVC sequence codec differs");
  const id = bits.ue(); requireValue(id <= 31, "AVC sequence identity exceeds bound");
  let chroma = 1, separate = 0, lumaDepth = 0, chromaDepth = 0;
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
    chroma = bits.ue(); requireValue(chroma <= 3, "AVC chroma format differs");
    if (chroma === 3) separate = bits.read(1);
    lumaDepth = bits.ue(); chromaDepth = bits.ue(); requireValue(lumaDepth <= 6 && chromaDepth <= 6, "AVC bit depth differs");
    bits.read(1);
    if (bits.read(1)) {
      for (let index = 0; index < (chroma !== 3 ? 8 : 12); index += 1) {
        if (!bits.read(1)) continue;
        let last = 8, next = 8;
        for (let item = 0; item < (index < 6 ? 16 : 64); item += 1) {
          if (next !== 0) next = ((last + bits.se()) % 256 + 256) % 256;
          last = next === 0 ? last : next;
        }
      }
    }
  }
  requireValue(bits.ue() <= 12, "AVC frame numbering exceeds bound");
  const order = bits.ue(); requireValue(order <= 2, "AVC picture ordering differs");
  if (order === 0) requireValue(bits.ue() <= 12, "AVC picture numbering exceeds bound");
  if (order === 1) {
    bits.read(1); bits.se(); bits.se(); const cycle = bits.ue(); requireValue(cycle <= 255, "AVC order cycle exceeds bound");
    for (let index = 0; index < cycle; index += 1) bits.se();
  }
  requireValue(bits.ue() <= 16, "AVC reference count exceeds bound"); bits.read(1);
  const columns = bits.ue() + 1, rows = bits.ue() + 1, frameOnly = bits.read(1);
  if (!frameOnly) bits.read(1);
  bits.read(1);
  let left = 0, right = 0, top = 0, bottom = 0;
  if (bits.read(1)) { left = bits.ue(); right = bits.ue(); top = bits.ue(); bottom = bits.ue(); }
  const chromaArray = separate ? 0 : chroma;
  const cropX = chromaArray === 0 || chromaArray === 3 ? 1 : 2;
  const cropY = (chromaArray === 1 ? 2 : 1) * (2 - frameOnly);
  const width = columns * 16 - (left + right) * cropX;
  const height = rows * 16 * (2 - frameOnly) - (top + bottom) * cropY;
  requireValue(width === video.width && height === video.height, "AVC decoded dimensions differ");
  return { id, chroma, lumaDepth, chromaDepth };
}

function avcConfiguration(data, box, video) {
  requireValue(box.end - box.payload >= 7 && data[box.payload] === 1, "AVC configuration truncated");
  const begin = box.payload;
  requireValue("avc1." + data.subarray(begin + 1, begin + 4).toString("hex") === video.codecs, "AVC codec differs");
  requireValue((data[begin + 4] & 252) === 252 && (data[begin + 5] & 224) === 224, "AVC reserved bits differ");
  const nalLengthSize = (data[begin + 4] & 3) + 1;
  requireValue([1, 2, 4].includes(nalLengthSize), "AVC NAL length width differs");
  let cursor = begin + 6;
  const takeNal = () => {
    requireValue(cursor + 2 <= box.end, "AVC parameter length truncated");
    const length = data.readUInt16BE(cursor); cursor += 2;
    requireValue(length > 1 && cursor + length <= box.end, "AVC parameter bytes truncated");
    const nal = data.subarray(cursor, cursor + length); cursor += length; return nal;
  };
  const sequences = [], sequenceIds = new Set(), parameterHashes = [];
  const sequenceCount = data[begin + 5] & 31;
  requireValue(sequenceCount > 0, "AVC sequence parameters unavailable");
  for (let index = 0; index < sequenceCount; index += 1) {
    const nal = takeNal(), info = sequenceInfo(nal, video);
    requireValue(!sequenceIds.has(info.id), "duplicate AVC sequence identity"); sequenceIds.add(info.id); sequences.push(info);
    parameterHashes.push(createHash("sha256").update(nal).digest("hex"));
  }
  requireValue(cursor < box.end, "AVC picture parameters unavailable");
  const pictureCount = data[cursor++], pictureIds = [];
  requireValue(pictureCount > 0, "AVC picture parameters unavailable");
  for (let index = 0; index < pictureCount; index += 1) {
    const nal = takeNal(); requireValue((nal[0] & 31) === 8, "AVC picture parameter type differs");
    const bits = rbsp(nal), id = bits.ue(), sequenceId = bits.ue();
    requireValue(id <= 255 && !pictureIds.includes(id) && sequenceIds.has(sequenceId), "AVC picture identity differs");
    pictureIds.push(id); parameterHashes.push(createHash("sha256").update(nal).digest("hex"));
  }
  if (cursor < box.end) {
    requireValue([100, 110, 122, 144].includes(data[begin + 1]) && cursor + 4 <= box.end, "AVC configuration tail differs");
    requireValue((data[cursor] & 252) === 252 && (data[cursor + 1] & 248) === 248 && (data[cursor + 2] & 248) === 248,
      "AVC extended reserved bits differ");
    requireValue((data[cursor] & 3) === sequences[0].chroma && (data[cursor + 1] & 7) === sequences[0].lumaDepth
      && (data[cursor + 2] & 7) === sequences[0].chromaDepth, "AVC extended parameters differ");
    const count = data[cursor + 3]; cursor += 4;
    for (let index = 0; index < count; index += 1) requireValue((takeNal()[0] & 31) === 13, "AVC sequence extension type differs");
  }
  requireValue(cursor === box.end, "AVC configuration tail differs");
  return { nalLengthSize, pictureIds: Object.freeze(pictureIds), parameterHashes: Object.freeze(parameterHashes) };
}

/** Return immutable, stream-bound defaults from a hashed AVC initialization. */
export function validateVideoInit(input, video) {
  validateNativeVideo(video); requireValue(video.init !== null, "initialization unavailable");
  const data = bytes(input, video.init, MAX_INIT), root = boxes(data);
  requireValue(root.length === 2 && root[0].kind === "ftyp" && root[1].kind === "moov", "initialization boxes differ");
  requireValue(root[0].end - root[0].payload >= 8 && (root[0].end - root[0].payload) % 4 === 0, "file type box differs");
  const tracks = boxes(data, root[1].payload, root[1].end).filter(box => box.kind === "trak");
  requireValue(tracks.length === 1, "video track count differs");
  const tkhd = child(data, tracks[0], "tkhd"), tkVersion = data[tkhd.payload];
  requireValue([0, 1].includes(tkVersion) && tkhd.end - tkhd.payload >= (tkVersion ? 96 : 84), "track header truncated");
  const track = data.readUInt32BE(tkhd.payload + (tkVersion ? 20 : 12)); requireValue(track > 0, "track identity differs");
  const mdia = child(data, tracks[0], "mdia"), mdhd = child(data, mdia, "mdhd"), hdlr = child(data, mdia, "hdlr");
  requireValue(hdlr.end - hdlr.payload >= 12 && data.toString("ascii", hdlr.payload + 8, hdlr.payload + 12) === "vide", "track is not video");
  const timeVersion = data[mdhd.payload]; requireValue([0, 1].includes(timeVersion), "media time version differs");
  const timeOffset = mdhd.payload + (timeVersion ? 20 : 12);
  requireValue(timeOffset + 4 <= mdhd.end, "media time truncated");
  const timescale = data.readUInt32BE(timeOffset); requireValue(timescale > 0, "timescale differs");
  const stbl = child(data, child(data, mdia, "minf"), "stbl"), stsd = child(data, stbl, "stsd");
  full(data, stsd, 0); requireValue(stsd.payload + 8 <= stsd.end && data.readUInt32BE(stsd.payload + 4) === 1, "sample description count differs");
  const entries = boxes(data, stsd.payload + 8, stsd.end);
  requireValue(entries.length === 1 && entries[0].kind === "avc1", "sample codec differs");
  const avc1 = entries[0]; requireValue(avc1.payload + 78 <= avc1.end, "visual sample entry truncated");
  requireValue(data.readUInt16BE(avc1.payload + 24) === video.width && data.readUInt16BE(avc1.payload + 26) === video.height, "sample dimensions differ");
  const configuration = avcConfiguration(data, child(data, avc1, "avcC", 78), video);
  const trex = child(data, child(data, root[1], "mvex"), "trex");
  full(data, trex, 0); requireValue(trex.end - trex.payload === 24 && data.readUInt32BE(trex.payload + 4) === track
    && data.readUInt32BE(trex.payload + 8) === 1, "fragment defaults differ");
  const defaults = Object.freeze({ streamId: video.streamId, initHash: video.init.sha256, codecs: video.codecs,
    width: video.width, height: video.height, track, timescale, duration: data.readUInt32BE(trex.payload + 12),
    size: data.readUInt32BE(trex.payload + 16), flags: data.readUInt32BE(trex.payload + 20), ...configuration });
  VERIFIED_INITS.add(defaults); return defaults;
}

function sampleInfo(data, start, size, defaults, firstSample) {
  const end = start + size; let cursor = start, nalCount = 0, slices = 0, idr = false;
  while (cursor < end) {
    requireValue(cursor + defaults.nalLengthSize <= end, "sample NAL length truncated");
    const length = data.readUIntBE(cursor, defaults.nalLengthSize); cursor += defaults.nalLengthSize;
    requireValue(length > 1 && cursor + length <= end && ++nalCount <= 1024, "sample NAL payload differs");
    const nal = data.subarray(cursor, cursor + length), type = nal[0] & 31;
    requireValue(!(nal[0] & 128) && [1, 5, 6, 7, 8, 9, 10, 11, 12].includes(type), "unsupported AVC NAL type");
    if (type === 1 || type === 5) {
      const bits = rbsp(nal); bits.ue(); const sliceType = bits.ue(), pictureId = bits.ue();
      requireValue(sliceType <= 9 && sliceType % 5 !== 1 && defaults.pictureIds.includes(pictureId), "reordered or unknown AVC slice");
      if (type === 5) { requireValue([2, 4].includes(sliceType % 5), "IDR slice type differs"); idr = true; }
      if (firstSample) requireValue(type === 5, "first sample has no AVC keyframe");
      slices += 1;
    }
    if (type === 7 || type === 8) requireValue(defaults.parameterHashes.includes(createHash("sha256").update(nal).digest("hex")), "in-band AVC parameters changed");
    cursor += length;
  }
  requireValue(cursor === end && slices > 0 && (!firstSample || idr), "sample has no decodable picture");
}

/** Verify a hashed fragment against its manifest and previously verified init. */
export function validateVideoBytes(input, descriptor, video, defaults) {
  validateNativeVideo(video);
  requireValue(VERIFIED_INITS.has(defaults) && defaults.streamId === video.streamId && defaults.initHash === video.init?.sha256
    && defaults.codecs === video.codecs && defaults.width === video.width && defaults.height === video.height, "verified initialization differs");
  requireValue(video.segments.some(segment => isDeepStrictEqual(segment, descriptor)), "fragment is not in the manifest");
  const data = bytes(input, descriptor, MAX_MEDIA), root = boxes(data);
  requireValue(root.length === 2 && root[0].kind === "moof" && root[1].kind === "mdat", "media boxes differ");
  const [moof, mdat] = root, moofChildren = boxes(data, moof.payload, moof.end);
  requireValue(moofChildren.length === 2 && moofChildren.filter(box => box.kind === "traf").length === 1
    && moofChildren.filter(box => box.kind === "mfhd").length === 1, "fragment tracks differ");
  const mfhd = child(data, moof, "mfhd"); full(data, mfhd, 0);
  requireValue(mfhd.end - mfhd.payload === 8 && data.readUInt32BE(mfhd.payload + 4) === descriptor.sequence, "fragment sequence differs");
  const traf = child(data, moof, "traf"), children = boxes(data, traf.payload, traf.end);
  requireValue(children.length === 3 && new Set(children.map(box => box.kind)).size === 3
    && children.every(box => ["tfhd", "tfdt", "trun"].includes(box.kind)), "fragment structure differs");
  const tfhd = child(data, traf, "tfhd");
  requireValue(tfhd.end - tfhd.payload >= 8 && data[tfhd.payload] === 0, "fragment header truncated");
  const flags = data.readUIntBE(tfhd.payload + 1, 3);
  requireValue((flags & 0x20000) !== 0 && (flags & ~0x2003a) === 0 && data.readUInt32BE(tfhd.payload + 4) === defaults.track, "fragment base or track differs");
  let cursor = tfhd.payload + 8, duration = defaults.duration, size = defaults.size, sampleFlags = defaults.flags;
  for (const [bit, key] of [[2, "description"], [8, "duration"], [16, "size"], [32, "flags"]]) {
    if (!(flags & bit)) continue;
    requireValue(cursor + 4 <= tfhd.end, "fragment defaults truncated"); const item = data.readUInt32BE(cursor); cursor += 4;
    if (key === "description") requireValue(item === 1, "sample description differs");
    if (key === "duration") duration = item;
    if (key === "size") size = item;
    if (key === "flags") sampleFlags = item;
  }
  requireValue(cursor === tfhd.end, "fragment defaults tail differs");
  const tfdt = child(data, traf, "tfdt"), timeVersion = data[tfdt.payload];
  requireValue([0, 1].includes(timeVersion) && tfdt.end - tfdt.payload === (timeVersion ? 12 : 8), "decode time differs"); full(data, tfdt, timeVersion);
  const pts = timeVersion ? data.readBigUInt64BE(tfdt.payload + 4) : BigInt(data.readUInt32BE(tfdt.payload + 4));
  requireValue(pts <= BigInt(Number.MAX_SAFE_INTEGER), "decode time exceeds integer bound");
  const trun = child(data, traf, "trun"); requireValue(trun.end - trun.payload >= 8 && [0, 1].includes(data[trun.payload]), "sample run truncated");
  const runFlags = data.readUIntBE(trun.payload + 1, 3), count = data.readUInt32BE(trun.payload + 4);
  requireValue(count >= 1 && count <= 7200 && count <= video.stats.encodedFrames && (runFlags & 1) !== 0
    && (runFlags & ~0xf05) === 0 && !((runFlags & 4) && (runFlags & 1024)), "sample count or flags differs");
  cursor = trun.payload + 8; requireValue(cursor + 4 <= trun.end, "sample offset truncated");
  const dataOffset = data.readInt32BE(cursor); cursor += 4;
  requireValue(moof.start + dataOffset === mdat.payload, "sample data offset differs");
  let firstFlags = null;
  if (runFlags & 4) { requireValue(cursor + 4 <= trun.end, "first sample flags truncated"); firstFlags = data.readUInt32BE(cursor); cursor += 4; }
  let payload = mdat.payload, durations = 0;
  for (let index = 0; index < count; index += 1) {
    let currentDuration = duration, currentSize = size, currentFlags = index === 0 && firstFlags !== null ? firstFlags : sampleFlags;
    for (const [bit, key] of [[256, "duration"], [512, "size"], [1024, "flags"], [2048, "composition"]]) {
      if (!(runFlags & bit)) continue;
      requireValue(cursor + 4 <= trun.end, "sample fields truncated"); const item = data.readUInt32BE(cursor); cursor += 4;
      if (key === "duration") currentDuration = item;
      if (key === "size") currentSize = item;
      if (key === "flags") currentFlags = item;
      if (key === "composition") requireValue(item === 0, "reordered sample composition refused");
    }
    requireValue(currentDuration > 0 && currentSize > 0 && payload + currentSize <= mdat.end, "empty or truncated sample");
    if (index === 0) requireValue((currentFlags & 0x10000) === 0 && ((currentFlags >>> 24) & 3) === 2, "fragment sync sample missing");
    sampleInfo(data, payload, currentSize, defaults, index === 0); payload += currentSize; durations += currentDuration;
  }
  requireValue(cursor === trun.end && payload === mdat.end, "sample payload or run tail differs");
  const ptsStartMs = Number(pts) * 1000 / defaults.timescale, durationMs = durations * 1000 / defaults.timescale;
  requireValue(Math.abs(ptsStartMs - descriptor.ptsStartMs) <= 1 && Math.abs(durationMs - descriptor.durationMs) <= 1, "encoded time differs from manifest");
  requireValue(count <= descriptor.lastFrameSequence - descriptor.firstFrameSequence + 1, "native frame receipts differ");
  return Object.freeze({ sampleCount: count, ptsStartMs, durationMs, independentlyDecodable: true });
}
