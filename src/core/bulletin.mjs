import { createHash, randomUUID } from "node:crypto";

export const BULLETIN_SCHEMA = "mousecat.bulletin/1";
export const BULLETIN_LIMITS = Object.freeze({ records: 2000, revisions: 64, links: 24, query: 256, bytes: 8 * 1024 * 1024 });
const STATES = ["open", "parked", "addressed", "archived", "pruned"];
const REDACTED = "[sensitive-redacted]";
const copy = value => structuredClone(value);
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const failure = code => ({ schema: "mousecat.error/1", ok: false, code });
const object = value => value && typeof value === "object" && !Array.isArray(value);
function clean(value) {
  return value.replace(/\bcontinuation-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/giu, REDACTED)
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/gu, REDACTED)
    .replace(/(Bearer\s+)[a-zA-Z0-9_.-]+/giu, "$1" + REDACTED);
}
function text(value, max, optional = false) {
  return optional && value == null ? null : typeof value === "string" && value.trim() && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value) ? clean(value.trim()) : undefined;
}
function exact(value, keys) { return object(value) && Object.keys(value).every(key => keys.includes(key)); }
function iso(value, optional = false) {
  return optional && value == null ? null : typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}
function source(value) {
  if (!exact(value, ["author", "host", "sessionId", "messageId", "at"])) return null;
  const result = { author: text(value.author, 200), host: text(value.host, 100), sessionId: text(value.sessionId, 256), messageId: text(value.messageId, 256), at: iso(value.at) };
  return Object.values(result).some(entry => entry === undefined) ? null : result;
}
function normalize(value) {
  if (!exact(value, ["ideaId", "projectRef", "surfaceId", "title", "proposition", "source", "horizon", "reviewAt", "links", "sensitive"])) return null;
  const result = { ideaId: text(value.ideaId, 128), projectRef: text(value.projectRef, 512), surfaceId: text(value.surfaceId, 128, true), title: text(value.title, 240), proposition: text(value.proposition, 6000), source: source(value.source), horizon: value.horizon || "short", reviewAt: iso(value.reviewAt, true), sensitive: value.sensitive === true, links: [] };
  if (Object.values(result).some(entry => entry === undefined) || !result.source || !["short", "mid"].includes(result.horizon) || (value.sensitive !== undefined && typeof value.sensitive !== "boolean")) return null;
  if (value.links !== undefined && (!Array.isArray(value.links) || value.links.length > BULLETIN_LIMITS.links)) return null;
  for (const link of value.links || []) {
    const ideaId = text(link?.ideaId, 128);
    if (!exact(link, ["ideaId", "relation"]) || !ideaId || !["extends", "relates", "depends-on"].includes(link.relation) || ideaId === result.ideaId || result.links.some(entry => entry.ideaId === ideaId && entry.relation === link.relation)) return null;
    result.links.push({ ideaId, relation: link.relation });
  }
  return result;
}
export function publicBulletinRecord(record) {
  const result = copy(record);
  if (result.sensitive || result.status === "pruned") {
    result.title = result.status === "pruned" ? "Pruned idea" : REDACTED;
    result.proposition = result.status === "pruned" ? null : REDACTED;
    result.links = [];
    result.history = result.history.map(entry => ({ revision: entry.revision, action: entry.action, at: entry.at, source: entry.source, contentHash: entry.contentHash,
      ...(entry.ownership ? { ownership: entry.ownership } : {}) }));
    delete result.captureHash;
  }
  return result;
}
function sealed(record) { const { integrity: _integrity, ...content } = record; return { ...content, integrity: hash(content) }; }
function ownership(record) { return { projectRef: record.projectRef, surfaceId: record.surfaceId }; }
function validOwnership(value) {
  return exact(value, ["projectRef", "surfaceId"]) && typeof value.projectRef === "string" && text(value.projectRef, 512) === value.projectRef
    && (value.surfaceId === null || typeof value.surfaceId === "string") && text(value.surfaceId, 128, true) === value.surfaceId;
}
function validHistory(record) {
  let owner = record.origin;
  if (owner !== undefined && !validOwnership(owner)) return false;
  return Array.isArray(record.history) && record.history.length <= BULLETIN_LIMITS.revisions && record.history.length === record.revision
    && record.history[0]?.action === "capture" && record.history.at(-1)?.status === record.status
    && record.history.every((entry, index) => {
      if (!exact(entry, ["revision", "action", "at", "source", "contentHash", "title", "proposition", "status", "ownership"])) return false;
      if (entry.action === "relocate") {
        const change = entry.ownership, previous = record.history[index - 1];
        if (!owner || !previous || !exact(change, ["from", "to", "expectedRevision", "authority"])
          || !validOwnership(change.from) || !validOwnership(change.to) || hash(change.from) !== hash(owner)
          || hash(change.from) === hash(change.to) || change.expectedRevision !== index
          || !exact(change.authority, ["kind", "profileId", "grant"]) || change.authority.kind !== "work-permit"
          || typeof change.authority.profileId !== "string" || text(change.authority.profileId, 128) !== change.authority.profileId || change.authority.grant !== "mousecat.bulletin:relocate"
          || entry.status !== previous.status || entry.contentHash !== previous.contentHash) return false;
        owner = change.to;
      } else if (entry.ownership !== undefined) return false;
      const anchor = source(entry.source);
      return entry.revision === index + 1 && anchor && hash(anchor) === hash(entry.source) && iso(entry.at)
        && /^[a-f0-9]{64}$/u.test(entry.contentHash) && STATES.includes(entry.status)
        && ["capture", "amend", "disposition", "prune", "relocate"].includes(entry.action)
        && (!(record.sensitive || record.status === "pruned") || (entry.title === undefined && entry.proposition === undefined))
        && (entry.title === undefined || text(entry.title, 240) === entry.title)
        && (entry.proposition === undefined || text(entry.proposition, 6000) === entry.proposition);
    }) && (owner === undefined || (record.history.some(entry => entry.action === "relocate") && hash(owner) === hash(ownership(record))));
}
export function restoreBulletinRecords(records) {
  const valid = new Map(), quarantined = [], seen = new Set(); let retainedBytes = 2;
  for (const record of records || []) {
    const identity = text(record?.ideaId, 128, true) || null;
    const duplicate = identity !== null && seen.has(identity);
    if (identity !== null) seen.add(identity);
    try {
      const { integrity, ...content } = record;
      const normalized = normalize(Object.fromEntries(["ideaId", "projectRef", "surfaceId", "title", "proposition", "source", "horizon", "reviewAt", "links", "sensitive"].map(key => [key, record[key]])));
      const bytes = Buffer.byteLength(JSON.stringify(record), "utf8") + 1;
      if (!exact(record, ["ideaId", "projectRef", "surfaceId", "title", "proposition", "source", "horizon", "reviewAt", "links", "sensitive", "revision", "status", "createdAt", "updatedAt", "captureHash", "history", "integrity", "origin"])
        || !STATES.includes(record.status) || !Number.isInteger(record.revision) || record.revision < 1 || !validHistory(record)
        || !iso(record.createdAt) || !iso(record.updatedAt) || !normalized || Object.entries(normalized).some(([key, value]) => hash(value) !== hash(record[key]))
        || !/^[a-f0-9]{64}$/u.test(record.captureHash) || hash(content) !== integrity || duplicate || valid.size >= BULLETIN_LIMITS.records
        || retainedBytes + bytes > BULLETIN_LIMITS.bytes) throw new Error("invalid");
      valid.set(record.ideaId, record); retainedBytes += bytes;
    } catch {
      const previous = valid.get(identity); if (previous) { retainedBytes -= Buffer.byteLength(JSON.stringify(previous), "utf8") + 1; valid.delete(identity); }
      if (!quarantined.some(entry => entry.ideaId === identity)) quarantined.push({ ideaId: identity, projectRef: text(record?.projectRef, 512, true) || null, code: "bulletin-persisted-record-invalid" });
    }
  }
  return { valid, quarantined };
}
export function createBulletinController({ state, persist, permitAllows, now = () => new Date().toISOString() }) {
  const restored = restoreBulletinRecords([...state.bulletin.values()]);
  for (const entry of state.bulletinQuarantine || []) restored.valid.delete(text(entry?.ideaId, 128, true));
  state.bulletin = restored.valid;
  state.bulletinQuarantine = [...(state.bulletinQuarantine || []), ...restored.quarantined].slice(0, BULLETIN_LIMITS.records)
    .map(entry => ({ ideaId: text(entry?.ideaId, 128, true) || null, projectRef: text(entry?.projectRef, 512, true) || null, code: "bulletin-persisted-record-invalid" }));
  function query(args = {}) {
    if (!exact(args, ["action", "permit", "projectRef", "surfaceId", "status", "query"])) return failure("bulletin-query-invalid");
    if (args.status && !STATES.includes(args.status)) return failure("bulletin-status-invalid");
    if (args.query !== undefined && (typeof args.query !== "string" || args.query.length > BULLETIN_LIMITS.query)) return failure("bulletin-query-invalid");
    if ((args.projectRef !== undefined && !text(args.projectRef, 512)) || (args.surfaceId !== undefined && !text(args.surfaceId, 128))) return failure("bulletin-scope-invalid");
    const words = (args.query || "").toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    const records = [...state.bulletin.values()].filter(record => (!args.projectRef || args.projectRef === record.projectRef) && (!args.surfaceId || args.surfaceId === record.surfaceId) && (!args.status || args.status === record.status)).map(publicBulletinRecord).filter(record => words.every(word => `${record.title} ${record.proposition || ""} ${record.projectRef} ${record.source.author} ${record.source.host}`.toLocaleLowerCase().includes(word))).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.ideaId.localeCompare(b.ideaId));
    const projects = [...new Set(records.map(record => record.projectRef))].map(projectRef => ({ projectRef, records: records.filter(record => record.projectRef === projectRef) }));
    return { schema: BULLETIN_SCHEMA, ok: true, records, projects, limits: BULLETIN_LIMITS, quarantined: copy(state.bulletinQuarantine.filter(entry => !args.projectRef || entry.projectRef === args.projectRef)) };
  }
  function mutate(action, args, operator = false) {
    if (!["capture", "amend", "disposition", "prune"].includes(action) || (!operator && ["disposition", "prune"].includes(action))) return failure("bulletin-operator-command-required");
    const allowed = action === "capture" ? ["action", "permit", "record"] : action === "amend" ? ["action", "permit", "ideaId", "projectRef", "expectedRevision", "patch", "source"] : ["action", "permit", "ideaId", "projectRef", "expectedRevision", "status", "source"];
    if (!exact(args, allowed)) return failure("bulletin-input-invalid");
    let record, candidate;
    if (action === "capture") {
      candidate = normalize(args.record);
      if (!candidate) return failure("bulletin-record-invalid");
      if (state.bulletinQuarantine.some(entry => entry.ideaId === candidate.ideaId)) return failure("bulletin-identity-quarantined");
      record = state.bulletin.get(candidate.ideaId);
      if (record) return record.captureHash === hash(candidate) ? { schema: BULLETIN_SCHEMA, ok: true, duplicate: true, record: publicBulletinRecord(record) } : failure("bulletin-identity-conflict");
      if (state.bulletin.size >= BULLETIN_LIMITS.records) return failure("bulletin-capacity-reached");
    } else {
      record = state.bulletin.get(args.ideaId);
      if (!record || record.projectRef !== args.projectRef) return failure("bulletin-record-unavailable");
      if (record.revision !== args.expectedRevision) return failure("bulletin-revision-conflict");
      if (record.status === "pruned") return failure("bulletin-record-pruned");
      if (record.history.length >= BULLETIN_LIMITS.revisions - (action === "prune" ? 0 : 1)) return failure("bulletin-revision-capacity-reached");
      if (!source(args.source)) return failure("bulletin-source-invalid");
      if (action === "amend") {
        if (!exact(args.patch, ["title", "proposition", "horizon", "reviewAt", "links", "sensitive"]) || !Object.keys(args.patch).length || (record.sensitive && args.patch.sensitive === false)) return failure("bulletin-patch-invalid");
        candidate = normalize({ ...Object.fromEntries(["ideaId", "projectRef", "surfaceId", "title", "proposition", "source", "horizon", "reviewAt", "links", "sensitive"].map(key => [key, record[key]])), ...args.patch });
        if (!candidate) return failure("bulletin-record-invalid");
      } else candidate = copy(record);
    }
    if (action === "capture" && candidate.surfaceId && state.projectSurfaces.get(candidate.surfaceId)?.projectRef !== candidate.projectRef) return failure("bulletin-surface-unavailable");
    for (const link of action === "capture" || (action === "amend" && args.patch.links) ? candidate.links : []) {
      const target = state.bulletin.get(link.ideaId);
      if (!target || target.projectRef !== candidate.projectRef || target.status === "pruned") return failure("bulletin-link-unavailable");
    }
    if (action === "disposition" && !STATES.filter(value => value !== "pruned").includes(args.status)) return failure("bulletin-status-invalid");
    const at = now(), revision = (record?.revision || 0) + 1;
    const status = action === "prune" ? "pruned" : action === "disposition" ? args.status : record?.status || "open";
    const contentHash = hash({ title: candidate.title, proposition: candidate.proposition, links: candidate.links });
    const entry = { revision, action, at, source: action === "capture" ? candidate.source : source(args.source), contentHash, title: candidate.title, proposition: candidate.proposition, status };
    const next = { ...candidate, ...(record?.origin ? { origin: copy(record.origin) } : {}), revision, status, createdAt: record?.createdAt || at, updatedAt: at, captureHash: record?.captureHash || hash(candidate), history: [...(record?.history || []), entry] };
    if (next.sensitive || status === "pruned") {
      next.title = status === "pruned" ? "Pruned idea" : REDACTED;
      next.proposition = status === "pruned" ? "[pruned]" : REDACTED;
      next.links = [];
      next.history = next.history.map(({ title: _title, proposition: _proposition, ...rest }) => rest);
    }
    state.bulletin.set(next.ideaId, sealed(next));
    if (Buffer.byteLength(JSON.stringify([...state.bulletin.values()]), "utf8") > BULLETIN_LIMITS.bytes) {
      if (record) state.bulletin.set(record.ideaId, record); else state.bulletin.delete(next.ideaId);
      return failure("bulletin-storage-capacity-reached");
    }
    if (!persist()) { if (record) state.bulletin.set(record.ideaId, record); else state.bulletin.delete(next.ideaId); return failure("bulletin-persistence-failed"); }
    return { schema: BULLETIN_SCHEMA, ok: true, record: publicBulletinRecord(state.bulletin.get(next.ideaId)) };
  }
  function relocate(args, permit) {
    if (!exact(args, ["action", "permit", "records", "targetProjectRef", "targetSurfaceId", "source"])
      || !Array.isArray(args.records) || !args.records.length || args.records.length > BULLETIN_LIMITS.records) return failure("bulletin-relocation-invalid");
    const to = { projectRef: text(args.targetProjectRef, 512), surfaceId: text(args.targetSurfaceId, 128) };
    if (!validOwnership(to) || state.projectSurfaces.get(to.surfaceId)?.projectRef !== to.projectRef) return failure("bulletin-surface-unavailable");
    const anchor = source(args.source);
    if (!anchor) return failure("bulletin-source-invalid");
    const originals = new Map();
    for (const row of args.records) {
      if (!exact(row, ["ideaId", "projectRef", "expectedRevision"]) || !text(row.ideaId, 128)
        || !text(row.projectRef, 512) || !Number.isInteger(row.expectedRevision) || row.expectedRevision < 1
        || originals.has(row.ideaId)) return failure("bulletin-relocation-invalid");
      const record = state.bulletin.get(row.ideaId);
      if (!record || record.projectRef !== row.projectRef) return failure("bulletin-record-unavailable");
      if (record.revision !== row.expectedRevision) return failure("bulletin-revision-conflict");
      if (record.status === "pruned") return failure("bulletin-record-pruned");
      if (record.history.length >= BULLETIN_LIMITS.revisions - 1) return failure("bulletin-revision-capacity-reached");
      if (hash(ownership(record)) === hash(to)) return failure("bulletin-ownership-unchanged");
      originals.set(record.ideaId, record);
    }
    // Both incoming and outgoing links must retain their existing same-project scope.
    // Requiring the complete affected set avoids temporary cross-project links on disk.
    const projectedProject = record => originals.has(record.ideaId) ? to.projectRef : record.projectRef;
    for (const record of state.bulletin.values()) for (const link of record.links) {
      if (!originals.has(record.ideaId) && !originals.has(link.ideaId)) continue;
      const target = state.bulletin.get(link.ideaId);
      if (!target || projectedProject(record) !== projectedProject(target)) return failure("bulletin-relocation-links-cross-project");
    }
    const at = now(), authority = { kind: "work-permit", profileId: permit.profile.id, grant: "mousecat.bulletin:relocate" };
    for (const record of originals.values()) {
      const entry = { revision: record.revision + 1, action: "relocate", at, source: copy(anchor),
        contentHash: record.history.at(-1).contentHash, status: record.status,
        ownership: { from: ownership(record), to: copy(to), expectedRevision: record.revision, authority: copy(authority) },
        ...(!(record.sensitive || record.status === "pruned") ? { title: record.title, proposition: record.proposition } : {}) };
      state.bulletin.set(record.ideaId, sealed({ ...record, ...to, origin: copy(record.origin || ownership(record)),
        revision: entry.revision, updatedAt: at, history: [...record.history, entry] }));
    }
    const rollback = () => { for (const [id, record] of originals) state.bulletin.set(id, record); };
    if (Buffer.byteLength(JSON.stringify([...state.bulletin.values()]), "utf8") > BULLETIN_LIMITS.bytes) {
      rollback(); return failure("bulletin-storage-capacity-reached");
    }
    if (!persist()) { rollback(); return failure("bulletin-persistence-failed"); }
    return { schema: BULLETIN_SCHEMA, ok: true, records: [...originals.keys()].map(id => publicBulletinRecord(state.bulletin.get(id))) };
  }
  return {
    query,
    tool(args = {}) {
      const action = args.action || "query";
      const permit = permitAllows(args.permit, "mousecat.bulletin", action);
      if (!permit.allowed) return failure("bulletin-permit-required");
      return action === "query" ? query(args) : action === "relocate" ? relocate(args, permit) : mutate(action, args);
    },
    operator(args) {
      const original = args.action === "capture" ? state.bulletin.get(text(args.record?.ideaId, 128)) : null;
      // The bounded persisted capture is its own retry receipt, including after pruning.
      const anchor = original?.source.author === "Operator" && original.source.host === "mousecat-graphical" && original.source.sessionId === "operator"
        ? copy(original.source)
        : { author: "Operator", host: "mousecat-graphical", sessionId: "operator", messageId: randomUUID(), at: now() };
      return mutate(args.action, args.action === "capture"
        ? { ...args, record: { ...args.record, source: anchor } }
        : { ...args, source: anchor }, true);
    },
  };
}
