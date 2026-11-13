/* ESM entry for engine/model.js (DR-002 bridge contract, ESM half).
 *
 * The named/default `export` surface lives HERE, not in model.js, so that model.js
 * stays a valid CLASSIC <script> (the standalone app/index.html loads it that way over
 * file:// or a plain static server — an `export` in model.js is a SyntaxError that
 * kills the whole file and leaves globalThis.MCModel unset, blanking the app).
 *
 * This module imports model.js for its side effect — the IIFE attaches MCModel to
 * globalThis (and, in Node, to module.exports) — then re-exports that same real API.
 * ESM consumers (the agent-facing MCP bridge, the vite/React app's model loader) import
 * from here; CommonJS consumers keep using require("./model.js").
 */
import "./model.js";

const __MC = globalThis.MCModel;
export default __MC;
export const clamp = __MC.clamp;
export const mulberry32 = __MC.mulberry32;
export const hashSeed = __MC.hashSeed;
export const LOSS = __MC.LOSS;
export const HEALTH_RANK = __MC.HEALTH_RANK;
export const rollupHealth = __MC.rollupHealth;
export const safetyMeter = __MC.safetyMeter;
export const projectShortName = __MC.projectShortName;
export const projectKind = __MC.projectKind;
export const buildTimelineEvents = __MC.buildTimelineEvents;
export const portraitDimensions = __MC.portraitDimensions;
export const gaugeValue = __MC.gaugeValue;
export const attentionSignals = __MC.attentionSignals;
export const freshness = __MC.freshness;
export const fleetSummary = __MC.fleetSummary;
