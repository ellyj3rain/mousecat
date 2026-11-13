/* Optional compatible-engine model registry adapter. MC_NEO_PATH and source key
   neo are retained format compatibility identifiers; no private engine is bundled. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { ModelRegistry, configSource } = require("./model-identity.cjs");

/** Resolve neo's model-registry.js: an explicit override, or MC_NEO_PATH/<neo root>. */
function resolveNeoRegistryPath(override) {
  const base = override || process.env.MC_NEO_PATH;
  if (!base) return null;
  if (base.endsWith("model-registry.js") && fs.existsSync(base)) return base;
  const p = path.join(base, "core", "bridges", "model-registry.js");
  return fs.existsSync(p) ? p : null;
}

/** Map a neo registry entry into MC's RawEntry shape (vendor derived from the
    provider key; cliAlias folded into aliases by toIdentity; raw kept for drill). */
function mapNeoEntry(e) {
  return {
    id: e.id,
    family: e.family,
    vendor: e.provider ? String(e.provider).split("-")[0] : e.family || "unknown",
    label: e.label || e.id,
    tier: e.tier || null,
    reasoning: e.reasoning || null,
    aliases: e.aliases || [],
    cliAlias: e.cliAlias || null,
    model: e.model || null,
    raw: e,
  };
}

/** Build the neo Source. Async because neo's registry is an ES module. Returns a
    Source { name:'neo', available, list() } with the entries pre-loaded (or empty
    when neo is absent). */
async function neoSource(override) {
  const p = resolveNeoRegistryPath(override);
  let entries = [];
  if (p) {
    try {
      const url = pathToFileURL(path.resolve(p)).href;
      const mod = await import(url);
      const reg = mod.MODEL_REGISTRY || (mod.default && mod.default.MODEL_REGISTRY) || [];
      entries = Array.isArray(reg) ? reg.map(mapNeoEntry) : [];
    } catch {
      entries = [];
    }
  }
  return { name: "neo", available: entries.length > 0, list: () => entries };
}

/** Compose the MC model registry from the available sources. neo first (the
    primary stack when present), then the config manifest. Either may be absent. */
async function buildRegistry({ neoPath, manifestPath } = {}) {
  const reg = new ModelRegistry();
  const ns = await neoSource(neoPath);
  if (ns.available) reg.addSource(ns);
  if (manifestPath) reg.addSource(configSource(manifestPath));
  return reg;
}

module.exports = { resolveNeoRegistryPath, mapNeoEntry, neoSource, buildRegistry };
