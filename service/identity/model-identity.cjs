/* ============================================================================
   Marshmallow Commons — per-model static IDENTITY (first principle).

   MC OWNS this contract. It is general and stack-agnostic: a model is identified
   by a stable canonical id, so every input and every action is attributable for
   audit. Any stack plugs in through a Source that maps its native model entries
   into this shape. neo is one such source (see neo-adapter.cjs), behind a clean
   seam; MC works with no stack at all (a config/manifest source).

   This is the bedrock the memory + audit architecture stands on. It does NOT
   import any stack's code, so it stays portable.

   ModelIdentity:
     id       MC canonical, stable id (the only key consumers persist)
     family   capability family (claude / gemini / grok / ...)
     vendor   provider/vendor (anthropic / google / xai / ollama / ...)
     label    human display name
     tier     capability tier (frontier / balanced / fast) or null
     source   which Source produced this identity (e.g. "neo", "config")
     aliases  loose spellings that resolve to id (data, not code)
     raw      the source-native entry (nothing is a dead end: drill to raw)

   A Source is { name: string, list(): RawEntry[] } where a RawEntry has at least
   { id }, and optionally { family, vendor|provider, label, tier, aliases, model }.
   ============================================================================ */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DATA_DIR = process.env.MC_DATA_DIR || path.join(os.homedir(), ".marshmallow-commons");
const ATTRIBUTION_LOG = path.join(DATA_DIR, "model-attribution.jsonl");

/** Normalize a source-native entry into a ModelIdentity. */
function toIdentity(raw, source) {
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.slice() : [];
  if (raw.cliAlias && !aliases.includes(raw.cliAlias)) aliases.push(raw.cliAlias);
  return {
    id: String(raw.id),
    family: raw.family || "unknown",
    vendor: raw.vendor || raw.provider || "unknown",
    label: raw.label || String(raw.id),
    tier: raw.tier || null,
    source: source || "unknown",
    aliases,
    raw,
  };
}

/** Aggregates identities from one or more sources and resolves any spelling
    (canonical id, alias, or native model string) to the canonical identity.
    First source to claim an id wins (deterministic, order = precedence). */
class ModelRegistry {
  constructor() {
    this.byId = new Map();
    this.byLookup = new Map();
    this.sources = [];
  }

  addSource(source) {
    if (!source || typeof source.list !== "function") return this;
    this.sources.push(source.name || "unknown");
    for (const raw of source.list()) {
      if (!raw || raw.id == null) continue;
      const idn = toIdentity(raw, source.name);
      if (this.byId.has(idn.id)) continue; // first source wins
      this.byId.set(idn.id, idn);
      this.byLookup.set(idn.id, idn);
      for (const a of idn.aliases) if (!this.byLookup.has(a)) this.byLookup.set(a, idn);
      if (idn.raw && idn.raw.model && !this.byLookup.has(idn.raw.model)) this.byLookup.set(idn.raw.model, idn);
    }
    return this;
  }

  /** Resolve any spelling to its ModelIdentity, or null for unknown. */
  resolve(spelling) {
    return spelling ? this.byLookup.get(spelling) || null : null;
  }
  has(spelling) {
    return !!this.resolve(spelling);
  }
  /** Canonical id for any spelling, or null. */
  canonical(spelling) {
    return this.resolve(spelling)?.id ?? null;
  }
  list() {
    return [...this.byId.values()];
  }
}

/** A config/manifest Source: reads a JSON array of model identities from disk.
    The portable path that works with NO stack installed. */
function configSource(manifestPath) {
  return {
    name: "config",
    list() {
      try {
        const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
  };
}

/** Attribute an input/action to a model identity, for audit. Resolves the model
    via the registry and appends an honest record: an UNKNOWN model is recorded
    as { modelId: null, resolved: false, requested } and never fabricated. The
    append never throws into the caller. */
function attribute(registry, requested, event = {}) {
  const idn = registry.resolve(requested);
  const rec = {
    at: new Date().toISOString(),
    kind: event.kind || "input",
    modelId: idn ? idn.id : null,
    resolved: !!idn,
    requested: requested ?? null,
    ...event,
  };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(ATTRIBUTION_LOG, JSON.stringify(rec) + "\n", "utf8");
  } catch {
    /* attribution must never throw into the caller */
  }
  return rec;
}

/** Read recent attribution records (newest first). */
function readAttribution({ limit = 200 } = {}) {
  try {
    return fs
      .readFileSync(ATTRIBUTION_LOG, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((l) => JSON.parse(l))
      .reverse();
  } catch {
    return [];
  }
}

module.exports = {
  DATA_DIR,
  ATTRIBUTION_LOG,
  ModelRegistry,
  toIdentity,
  configSource,
  attribute,
  readAttribution,
};
