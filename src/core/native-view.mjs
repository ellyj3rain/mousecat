import { createHash, randomUUID } from "node:crypto";
import { lstat, open, realpath, link, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { validCognitionControls, validateCognitionView } from "./cognition-view.mjs";

const MAX_JSON = 1024 * 1024;
const MAX_IMAGE = 16 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;
const ACTIONS = { pause: [], resume: [], speed: ["value"], zoom: ["value"], pan: ["dx", "dy"], focus: ["personId"], auto: [], stop: [], select: ["personId"], panel: ["panelId", "personId", "visible"], cognition: ["opponentShare", "opportunitiesPerHour", "maxDepth"] };

// These templates are the entire browser write surface. The source translates
// them into its own runtime commands; no arbitrary tool invocation is accepted.
export const nativeViewCommandPack = Object.freeze(Object.fromEntries(Object.entries(ACTIONS).map(([action, fields]) => [action, Object.freeze({
  operatorSafe: true, schema: "mousecat.native-view-command/1", action, fields: Object.freeze(fields),
})])));

function requireValue(condition, code = "invalid-native-view") {
  if (!condition) throw Object.assign(new Error(code), { code });
}
function object(value, required, optional = []) {
  requireValue(value && typeof value === "object" && !Array.isArray(value));
  requireValue(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}
function string(value, max, nonempty = false) {
  requireValue(typeof value === "string" && value.length <= max && (!nonempty || value.length > 0) && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value));
}
function integer(value, low = 0) { requireValue(Number.isSafeInteger(value) && value >= low); }
function scalar(value) { requireValue(typeof value === "number" && Number.isFinite(value) && value >= 0); }
function array(value, max) { requireValue(Array.isArray(value) && value.length <= max); }
function unique(values) { requireValue(new Set(values).size === values.length); }
function status(value) { requireValue(["available", "unavailable", "failed"].includes(value)); }
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function validatePng(bytes) {
  let offset = 8, header = false, data = false, end = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), kind = bytes.toString("ascii", offset + 4, offset + 8);
    requireValue(offset + length + 12 <= bytes.length, "native-image-incomplete");
    requireValue(crc32(bytes.subarray(offset + 4, offset + 8 + length)) === bytes.readUInt32BE(offset + 8 + length), "native-image-corrupt");
    if (!header) { requireValue(kind === "IHDR" && length === 13, "native-image-incomplete"); header = true; }
    else requireValue(kind !== "IHDR", "native-image-corrupt");
    if (kind === "IDAT" && length > 0) data = true;
    offset += length + 12;
    if (kind === "IEND") { requireValue(length === 0 && offset === bytes.length, "native-image-corrupt"); end = true; break; }
  }
  requireValue(header && data && end && offset === bytes.length, "native-image-incomplete");
}

function validateImageDescriptor(value) {
  object(value, ["file", "sha256", "width", "height"]);
  const name = value.file;
  requireValue(typeof name === "string" && name.length <= 128 && /^[a-z0-9][a-z0-9_.-]*\.png$/iu.test(name) && !name.includes("..") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./iu.test(name));
  requireValue(HASH.test(value.sha256));
  integer(value.width, 1); integer(value.height, 1);
  requireValue(value.width <= 4096 && value.height <= 2160);
}

function validateCamera(value, ids) {
  object(value, ["mode", "personIds", "summary"]);
  requireValue(["automatic", "manual"].includes(value.mode)); array(value.personIds, 5); unique(value.personIds);
  requireValue(value.personIds.every(id => ids.has(id))); string(value.summary, 512);
}

function validateOverlay(value, ids) {
  object(value, ["personId", "capturedAtUnixMs", "groups"]); string(value.personId, 128, true); requireValue(ids.has(value.personId));
  integer(value.capturedAtUnixMs);
  array(value.groups, 4); unique(value.groups.map(group => group.id));
  for (const group of value.groups) {
    object(group, ["id", "label", "rows"]);
    requireValue(["activity", "attention", "memory", "needs"].includes(group.id)); string(group.label, 80, true);
    array(group.rows, 4);
    for (const row of group.rows) { object(row, ["label", "value"]); string(row.label, 160, true); string(row.value, 384); }
  }
}

export function parseNativeJson(raw) {
  requireValue(Buffer.byteLength(raw) <= MAX_JSON, "native-view-too-large");
  const value = JSON.parse(raw);
  // JSON.parse validates syntax; this pass rejects duplicate keys and excess
  // nesting before any command or metadata can rely on ambiguous identity.
  const stack = [];
  for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/gu)) {
    const token = match[0];
    if (token === "{" || token === "[") {
      stack.push(token === "{" ? { keys: new Set(), key: true } : null);
      requireValue(stack.length <= 12, "native-view-too-deep");
    } else if (token === "}" || token === "]") stack.pop();
    else if (token === "," && stack.at(-1)) stack.at(-1).key = true;
    else if (token[0] === '"' && stack.at(-1)?.key) {
      const key = JSON.parse(token), current = stack.at(-1);
      requireValue(!current.keys.has(key), "duplicate-native-key");
      current.keys.add(key); current.key = false;
    }
  }
  return value;
}

export function validateNativeView(view) {
  object(view, ["schema", "sessionId", "sequence", "capturedAtUnixMs", "image", "state", "title", "summary", "people", "lastCommandSequence"], ["camera", "commandResult", "inspection", "panels", "viewport", "feeds"]);
  requireValue(view.schema === "mousecat.native-view/1" && UUID.test(view.sessionId));
  integer(view.sequence, 1); integer(view.capturedAtUnixMs); integer(view.lastCommandSequence);
  requireValue(["running", "paused", "ended"].includes(view.state));
  string(view.title, 160); string(view.summary, 4096);
  validateImageDescriptor(view.image);
  array(view.people, 2048);
  for (const person of view.people) {
    object(person, ["id", "label", "summary"], ["sections", "events", "cognition"]);
    string(person.id, 128, true); string(person.label, 160); string(person.summary, 4096);
    if (person.sections || person.events || person.cognition) requireValue(Boolean(view.inspection));
    if (Object.hasOwn(person, "cognition")) validateCognitionView(person.cognition, person.id, view.inspection?.worldHours);
    if (Object.hasOwn(person, "sections")) {
      array(person.sections, 10); unique(person.sections.map(section => section.id));
      for (const section of person.sections) {
        object(section, ["id", "label", "source", "perspective", "status", "message", "rows"]);
        string(section.id, 128, true); string(section.label, 160); string(section.source, 160); string(section.perspective, 160);
        status(section.status); string(section.message, 1024); array(section.rows, 48);
        for (const row of section.rows) { object(row, ["label", "value"]); string(row.label, 160); string(row.value, 384); }
      }
    }
    if (Object.hasOwn(person, "events")) {
      array(person.events, 24); unique(person.events.map(event => event.id));
      for (const event of person.events) {
        object(event, ["id", "capturedAtUnixMs", "worldHours", "source", "stage", "summary"], ["actorId", "recipientId", "correlationId"]);
        string(event.id, 128, true); string(event.source, 160); string(event.stage, 128); string(event.summary, 1024);
        integer(event.capturedAtUnixMs); scalar(event.worldHours);
        requireValue(event.capturedAtUnixMs <= view.inspection.capturedAtUnixMs);
        for (const key of ["actorId", "recipientId", "correlationId"]) if (Object.hasOwn(event, key)) string(event[key], 128);
      }
    }
  }
  const ids = new Set(view.people.map(person => person.id)); requireValue(ids.size === view.people.length);
  if (Object.hasOwn(view, "feeds")) {
    array(view.feeds, 8); unique(view.feeds.map(feed => feed.id));
    for (const feed of view.feeds) {
      object(feed, ["id", "label", "capturedAtUnixMs", "image", "camera"], ["overlay"]);
      string(feed.id, 128, true); string(feed.label, 160, true); integer(feed.capturedAtUnixMs);
      requireValue(feed.capturedAtUnixMs <= view.capturedAtUnixMs);
      validateImageDescriptor(feed.image); validateCamera(feed.camera, ids);
      if (Object.hasOwn(feed, "overlay")) {
        validateOverlay(feed.overlay, ids); requireValue(feed.overlay.capturedAtUnixMs <= feed.capturedAtUnixMs);
      }
    }
  }
  if (Object.hasOwn(view, "viewport")) {
    const viewport = view.viewport;
    object(viewport, ["zoom", "targetZoom", "zoomLevels"]); array(viewport.zoomLevels, 64);
    requireValue(viewport.zoomLevels.length > 0);
    for (const value of [viewport.zoom, viewport.targetZoom, ...viewport.zoomLevels]) requireValue(Number.isFinite(value) && value > 0 && value <= 16);
    requireValue(viewport.zoomLevels.every((value, index, values) => index === 0 || value > values[index - 1]));
    requireValue(viewport.zoom >= viewport.zoomLevels[0] - 0.0001 && viewport.zoom <= viewport.zoomLevels.at(-1) + 0.0001);
    requireValue(viewport.zoomLevels.some(value => Math.abs(value - viewport.targetZoom) < 0.0001));
  }
  if (Object.hasOwn(view, "camera")) {
    validateCamera(view.camera, ids);
  }
  if (Object.hasOwn(view, "commandResult")) {
    object(view.commandResult, ["sequence", "status", "message"]);
    integer(view.commandResult.sequence, 1); requireValue(view.commandResult.sequence === view.lastCommandSequence);
    requireValue(["applied", "rejected"].includes(view.commandResult.status)); string(view.commandResult.message, 512);
  }
  if (Object.hasOwn(view, "inspection")) {
    const detail = view.inspection;
    object(detail, ["sequence", "capturedAtUnixMs", "worldHours", "status", "message", "omittedPeople", "omittedEvents"], ["selectedPersonId"]);
    integer(detail.sequence); integer(detail.capturedAtUnixMs); scalar(detail.worldHours); status(detail.status); string(detail.message, 1024);
    integer(detail.omittedPeople); integer(detail.omittedEvents);
    requireValue(detail.sequence > 0 || (detail.capturedAtUnixMs === 0 && detail.status !== "available"));
    if (Object.hasOwn(detail, "selectedPersonId")) requireValue(ids.has(detail.selectedPersonId));
    const inspected = view.people.filter(person => person.sections || person.events || person.cognition);
    const detailBytes = inspected.reduce((total, person) => total + Buffer.byteLength(JSON.stringify({
      sections: person.sections || [], events: person.events || [], ...(person.cognition ? { cognition: person.cognition } : {}),
    }) + "\n"), 0);
    requireValue(detailBytes <= 256 * 1024, "native-inspection-too-large");
  }
  if (Object.hasOwn(view, "panels")) {
    array(view.panels, 8); unique(view.panels.map(panel => panel.id));
    for (const panel of view.panels) { object(panel, ["id", "label"]); string(panel.id, 128, true); string(panel.label, 160); }
  }
  return view;
}

async function boundedFile(root, name, max) {
  requireValue(basename(name) === name && !name.includes("\\"));
  const file = resolve(root, name), info = await lstat(file);
  requireValue(info.isFile() && !info.isSymbolicLink() && info.size <= max && dirname(await realpath(file)) === root, "unsafe-native-file");
  const handle = await open(file, "r");
  try {
    const size = (await handle.stat()).size;
    requireValue(size <= max, "native-file-too-large");
    const bytes = Buffer.alloc(size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    requireValue(bytesRead === size, "native-file-changing");
    requireValue(bytesRead <= max, "native-file-too-large");
    return bytes.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

export function createNativeViews(config = {}) {
  const retained = new Map();
  const queues = new Map(), requests = new Map();
  async function bindings() {
    if (!config.registryPath) return [];
    const file = resolve(config.registryPath);
    const rows = parseNativeJson((await boundedFile(await realpath(dirname(file)), basename(file), MAX_JSON)).toString("utf8"));
    array(rows, 32); unique(rows.map(row => row.id));
    for (const row of rows) {
      object(row, ["id", "label", "directory", "sessionId"], ["projectRef"]);
      requireValue(/^[a-z0-9][a-z0-9-]{0,79}$/u.test(row.id)); string(row.label, 160, true); string(row.directory, 4096, true);
      requireValue(UUID.test(row.sessionId), "invalid-native-session");
      if (row.projectRef) string(row.projectRef, 160);
    }
    return rows;
  }
  async function binding(id) {
    const row = (await bindings()).find(value => value.id === id);
    requireValue(row, "native-view-not-registered");
    const root = await realpath(resolve(row.directory)), info = await lstat(root);
    requireValue(info.isDirectory(), "native-view-unavailable");
    const bindingId = createHash("sha256").update(`${root}\n${info.birthtimeMs}\n${row.sessionId}`).digest("hex");
    return { ...row, root, bindingId };
  }
  function publicBinding(row) { return { id: row.id, label: row.label, ...(row.projectRef ? { projectRef: row.projectRef } : {}) }; }
  async function snapshot(id) {
    const bound = await binding(id);
    const raw = await boundedFile(bound.root, "latest.json", MAX_JSON);
    const digest = createHash("sha256").update(raw).digest("hex");
    const old = retained.get(id);
    const sameBinding = old?.bindingId === bound.bindingId;
    const view = sameBinding && old.digest === digest ? old.view : validateNativeView(parseNativeJson(raw.toString("utf8")));
    requireValue(view.sessionId === bound.sessionId, "native-session-changed");
    requireValue(view.capturedAtUnixMs <= Date.now() + 2000, "future-native-frame");
    if (sameBinding) {
      requireValue(view.sessionId === old.view.sessionId, "native-session-changed");
      requireValue(view.sequence >= old.view.sequence && view.capturedAtUnixMs >= old.view.capturedAtUnixMs && view.lastCommandSequence >= old.view.lastCommandSequence, "native-view-regressed");
      requireValue(view.sequence !== old.view.sequence || digest === old.digest, "native-sequence-reused");
      if (view.inspection && old.inspection) requireValue(view.inspection.sequence >= old.inspection.sequence && view.inspection.capturedAtUnixMs >= old.inspection.capturedAtUnixMs, "native-inspection-regressed");
      if (view.commandResult && old.result?.sequence === view.commandResult.sequence) requireValue(JSON.stringify(old.result) === JSON.stringify(view.commandResult), "native-result-reused");
    }
    const frames = sameBinding ? old.frames : new Map();
    for (const descriptor of [view.image, ...(view.feeds || []).map(feed => feed.image)]) {
      if (frames.has(descriptor.file)) requireValue(JSON.stringify(frames.get(descriptor.file)) === JSON.stringify(descriptor), "native-image-name-reused");
      frames.set(descriptor.file, descriptor);
    }
    while (frames.size > 24) frames.delete(frames.keys().next().value);
    const record = { ...bound, view, digest, frames, images: sameBinding ? old.images : new Map(), result: view.commandResult || (sameBinding ? old.result : null), inspection: view.inspection || (sameBinding ? old.inspection : null) };
    retained.set(id, record);
    while (retained.size > 32) retained.delete(retained.keys().next().value);
    const ageMs = Math.max(0, Date.now() - view.capturedAtUnixMs);
    const imageUrl = descriptor => `/api/native-views/${id}/image?binding=${bound.bindingId}&file=${encodeURIComponent(descriptor.file)}&sha256=${descriptor.sha256}`;
    return { schema: "mousecat.native-view-response/1", binding: { ...publicBinding(bound), bindingId: bound.bindingId }, view,
      connection: view.state === "ended" ? "ended" : ageMs > 10000 ? "disconnected" : ageMs > 3000 ? "stale" : "live", ageMs,
      imageUrl: imageUrl(view.image), feedImages: (view.feeds || []).map(feed => ({ id: feed.id, imageUrl: imageUrl(feed.image) })) };
  }
  async function image(id, params) {
    const bound = await binding(id), record = retained.get(id);
    requireValue(params.get("binding") === bound.bindingId && record?.bindingId === bound.bindingId, "native-binding-changed");
    const name = params.get("file"), hash = params.get("sha256"), key = `${name}:${hash}`;
    if (record.images.has(key)) return record.images.get(key);
    const expected = record.frames.get(name);
    requireValue(expected?.sha256 === hash, "native-frame-unavailable");
    const bytes = await boundedFile(bound.root, name, MAX_IMAGE);
    requireValue(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && createHash("sha256").update(bytes).digest("hex") === hash, "native-image-differs");
    requireValue(bytes.readUInt32BE(16) === expected.width && bytes.readUInt32BE(20) === expected.height, "native-image-dimensions-differ");
    validatePng(bytes);
    record.images.set(key, bytes); while (record.images.size > 2) record.images.delete(record.images.keys().next().value);
    return bytes;
  }
  async function publishCommand(id, payload) {
    const current = await snapshot(id), view = current.view;
    object(payload, ["bindingId", "sessionId", "requestId", "action"], ["value", "dx", "dy", "personId", "panelId", "visible", "opponentShare", "opportunitiesPerHour", "maxDepth"]);
    requireValue(UUID.test(payload.requestId), "invalid-native-request");
    requireValue(payload.bindingId === current.binding.bindingId && payload.sessionId === view.sessionId, "native-binding-changed");
    const requestKey = `${payload.bindingId}:${payload.requestId}`;
    const signature = JSON.stringify(Object.keys(payload).sort().map(key => [key, payload[key]]));
    if (requests.has(requestKey)) {
      const previous = requests.get(requestKey);
      requireValue(previous.signature === signature, "native-request-id-reused");
      return previous.result;
    }
    requireValue(current.connection === "live" && view.state !== "ended", "native-view-not-live");
    const template = nativeViewCommandPack[payload.action];
    requireValue(template?.operatorSafe === true, "native-command-not-allowed");
    object(payload, ["bindingId", "sessionId", "requestId", "action", ...template.fields]);
    if (payload.action === "speed") requireValue([1, 2, 3].includes(payload.value), "invalid-native-speed");
    if (payload.action === "zoom") requireValue([-1, 1].includes(payload.value) && Boolean(view.viewport), "invalid-native-zoom");
    if (payload.action === "pan") requireValue([payload.dx, payload.dy].every(value => Number.isInteger(value) && Math.abs(value) <= 8) && Boolean(payload.dx || payload.dy), "invalid-native-pan");
    if (template.fields.includes("personId")) requireValue(view.people.some(person => person.id === payload.personId), "native-person-unavailable");
    if (payload.action === "panel") requireValue(view.panels?.some(panel => panel.id === payload.panelId) && typeof payload.visible === "boolean", "native-panel-unavailable");
    if (payload.action === "cognition") requireValue(validCognitionControls(payload) && view.people.some(person => person.cognition), "invalid-native-cognition-command");
    const bound = await binding(id); requireValue(bound.bindingId === payload.bindingId, "native-binding-changed");
    const commands = resolve(bound.root, "commands"), info = await lstat(commands);
    requireValue(info.isDirectory() && !info.isSymbolicLink() && await realpath(commands) === commands, "unsafe-native-command-directory");
    // Fill from the processed cursor; exclusive hard-link publication makes a
    // complete immutable file visible without replacing a concurrent writer.
    for (let sequence = view.lastCommandSequence + 1; sequence <= view.lastCommandSequence + 128; sequence += 1) {
      integer(sequence, 1);
      const value = { schema: template.schema, sessionId: view.sessionId, sequence, action: template.action };
      for (const key of template.fields) value[key] = payload[key];
      const target = resolve(commands, `${String(sequence).padStart(16, "0")}.json`), temporary = resolve(commands, `.request-${randomUUID()}.tmp`);
      const handle = await open(temporary, "wx");
      try { await handle.writeFile(JSON.stringify(value) + "\n"); await handle.sync(); } finally { await handle.close(); }
      try {
        await link(temporary, target);
        const result = { ok: true, sequence, status: "requested" };
        requests.set(requestKey, { signature, result });
        while (requests.size > 1024) requests.delete(requests.keys().next().value);
        return result;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const existing = parseNativeJson((await boundedFile(commands, basename(target), 8192)).toString("utf8"));
        requireValue(existing.schema === template.schema && existing.sessionId === view.sessionId && existing.sequence === sequence, "native-command-collision");
        const priorTemplate = nativeViewCommandPack[existing.action];
        requireValue(priorTemplate?.operatorSafe === true, "native-command-collision");
        object(existing, ["schema", "sessionId", "sequence", "action", ...priorTemplate.fields]);
        if (existing.action === "speed") requireValue([1, 2, 3].includes(existing.value), "native-command-collision");
        if (existing.action === "zoom") requireValue([-1, 1].includes(existing.value), "native-command-collision");
        if (existing.action === "pan") requireValue([existing.dx, existing.dy].every(value => Number.isInteger(value) && Math.abs(value) <= 8) && Boolean(existing.dx || existing.dy), "native-command-collision");
        if (priorTemplate.fields.includes("personId")) string(existing.personId, 128, true);
        if (existing.action === "panel") { string(existing.panelId, 128, true); requireValue(typeof existing.visible === "boolean", "native-command-collision"); }
        if (existing.action === "cognition") requireValue(validCognitionControls(existing), "native-command-collision");
      }
      finally { await unlink(temporary); }
    }
    throw Object.assign(new Error("native-command-queue-full"), { code: "native-command-queue-full" });
  }
  function command(id, payload) {
    const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(() => publishCommand(id, payload));
    queues.set(id, task);
    task.finally(() => { if (queues.get(id) === task) queues.delete(id); }).catch(() => {});
    return task;
  }
  return { list: async () => (await bindings()).map(publicBinding), snapshot, image, command };
}
