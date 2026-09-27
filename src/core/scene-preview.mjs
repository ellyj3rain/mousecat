// A bounded, declarative scene. The caller owns facts; Mousecat owns rendering.
export const SCENE_PREVIEW_SCHEMA_ID = "mousecat.scene-preview/1";
const string = (maxLength) => ({ type: "string", minLength: 1, maxLength });
const array = (items, maxItems, minItems = 1) => ({ type: "array", items, minItems, maxItems });
const object = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const id = string(80);
export const SCENE_PREVIEW_JSON_SCHEMA = object({
  schema: { type: "string", enum: [SCENE_PREVIEW_SCHEMA_ID] },
  provenance: object({ kind: { type: "string", enum: ["authored", "recorded", "projected"] }, label: string(1024) }),
  coordinateSystem: { type: "string", enum: ["schematic"] },
  locations: array(object({ id, label: string(96), x: { type: "number", minimum: 0, maximum: 100 }, y: { type: "number", minimum: 0, maximum: 100 } }), 24),
  actors: array(object({ id, label: string(96) }), 12),
  frames: array(object({
    id, label: string(160), elapsedSeconds: { type: "number", minimum: 0 },
    states: array(object({ actorId: id, locationId: id, activity: string(320), knowledge: array(string(1024), 16, 0) }), 12),
    communications: array(object({ id, fromId: id, toId: id, status: { type: "string", enum: ["heard", "unheard"] }, summary: string(1024) }), 24, 0),
  }), 24),
  decision: object({ frameId: id, actorId: id }),
});

function error(field, reason) { return { ok: false, code: "invalid-scene-preview", field, reason }; }

function check(value, schema, path) {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return error(path, "must be an object");
    if (Object.keys(value).length !== schema.required.length || schema.required.some(key => !Object.hasOwn(value, key))) return error(path, "fields differ from the scene contract");
    for (const [key, child] of Object.entries(schema.properties)) {
      const failure = check(value[key], child, `${path}.${key}`);
      if (failure) return failure;
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) return error(path, "array length outside scene bounds");
    for (const [index, item] of value.entries()) {
      const failure = check(item, schema.items, `${path}[${index}]`);
      if (failure) return failure;
    }
  } else if (schema.type === "string") {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > (schema.maxLength || 1024)) return error(path, "must be bounded nonempty text");
  } else if (typeof value !== "number" || !Number.isFinite(value) || value < schema.minimum || (schema.maximum !== undefined && value > schema.maximum)) {
    return error(path, "number outside scene bounds");
  }
  if (schema.enum && !schema.enum.includes(value)) return error(path, "unsupported scene value");
  return null;
}

export function normalizeScenePreview(value) {
  if (value === undefined) return { ok: true, value: null };
  const failure = check(value, SCENE_PREVIEW_JSON_SCHEMA, "mlReview.scenePreview");
  if (failure) return failure;
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 40 * 1024) return error("mlReview.scenePreview", "scene exceeds 40 KiB");
  const unique = rows => new Set(rows.map(row => row.id)).size === rows.length;
  if (![value.locations, value.actors, value.frames].every(unique)) return error("mlReview.scenePreview", "scene ids must be unique within their collection");
  const actors = new Set(value.actors.map(row => row.id));
  const locations = new Set(value.locations.map(row => row.id));
  let previous = -1;
  for (const frame of value.frames) {
    if (frame.elapsedSeconds <= previous) return error("mlReview.scenePreview.frames", "frame times must increase");
    previous = frame.elapsedSeconds;
    if (frame.states.length !== actors.size || new Set(frame.states.map(row => row.actorId)).size !== actors.size
        || frame.states.some(row => !actors.has(row.actorId) || !locations.has(row.locationId))) return error("mlReview.scenePreview.frames", "each frame must locate every actor exactly once");
    if (!unique(frame.communications) || frame.communications.some(row => !actors.has(row.fromId) || !actors.has(row.toId) || row.fromId === row.toId)) return error("mlReview.scenePreview.frames", "communication references differ from scene actors");
  }
  if (value.decision.frameId !== value.frames.at(-1).id || !actors.has(value.decision.actorId)) return error("mlReview.scenePreview.decision", "preview must end at its declared decision");
  return { ok: true, value: JSON.parse(JSON.stringify(value)) };
}
