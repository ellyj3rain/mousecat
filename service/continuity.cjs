"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT = 384 * 1024;
const cache = new Map(); // bounded last-observed projections, never a persistent record store
const denied = new Set();
const fileKey = file => "file:" + (process.platform === "win32" ? path.normalize(file).toLowerCase() : path.normalize(file));
const admittedFile = file => file.endsWith(".jsonl") && !/(^|[\\/])(?:sessions|\.codex|\.aws)(?:[\\/]|$)/i.test(file) && !file.startsWith("\\\\");
const denialKey = (ref, dir) => ref.format === "neo-project-data" ? fileKey(path.resolve(dir, ref.path || "")) : "bulletin:" + new URL(ref.url).href + ":" + ref.projectRef;
const hash = value => createHash("sha256").update(value).digest("hex");
const object = value => value && typeof value === "object" && !Array.isArray(value);
const text = value => {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,})\b/g, "[credential-redacted]").replace(/Bearer\s+\S+/gi, "Bearer [credential-redacted]");
  return clean.length > 4096 ? clean.slice(0, 4000) + " [bounded projection; consult source]" : clean;
};
const list = value => Array.isArray(value) ? value : [];
const strings = value => list(value).slice(0, 64).filter(item => typeof item === "string").map(text);
const revision = value => typeof value === "string" ? text(value).slice(0, 128) : typeof value === "number" && Number.isFinite(value) ? value : null;
const owner = value => object(value) ? Object.fromEntries(["id", "identityId", "role", "name", "sessionId", "sourceRef"].filter(key => typeof value[key] === "string").map(key => [key, text(value[key])])) : null;

function projectWork(row, lineHash) {
  const p = row?.payload, w = p?.work;
  if (row?.type !== "project-work" || w?.schema !== "neo.work-organization/1" || typeof w.id !== "string" || typeof row.id !== "string") return null;
  const remainingDetails = list(w.remaining).slice(0, 64).map(item => typeof item === "string"
    ? { id: null, status: null, detail: text(item), owner: null, sourceRefs: [] }
    : object(item) ? { id: text(item.id), status: text(item.status), detail: text(item.detail),
      owner: typeof item.owner === "string" ? text(item.owner) : owner(item.owner), sourceRefs: strings(item.sourceRefs) } : null)
    .filter(item => item && (item.detail || item.id));
  const projected = { recordId: row.id, source: text(row.source), timestamp: text(row.timestamp), sourceSha256: lineHash,
    workId: text(w.id), parentId: text(w.parentId), revision: String(revision(w.revision) ?? ""),
    acceptedRevision: revision(p.acceptedRevision),
    owner: owner(w.owner), implementationOwnerSession: { work: text(w.implementationOwnerSession), payload: text(p.implementationOwnerSession) },
    outcome: text(w.outcome), status: text(w.organization?.status), standing: text(p.standing), sourceRefs: strings(w.sourceRefs),
    operationalSupersedes: strings([p.supersedesOperationalStandingOf].flat()), predecessorRecordId: text(p.predecessorRecordId),
    units: list(w.development?.units).slice(0, 32).map(unit => ({ id: text(unit.id), target: text(unit.target), owner: owner(unit.owner),
      status: text(unit.status) || (text(unit.execution?.status) ? `Declared ${text(unit.execution.status)}` : null),
      execution: object(unit.execution) ? { status: text(unit.execution.status), evidenceRefs: strings(unit.execution.evidenceRefs) } : null, acceptanceIds: strings(unit.acceptanceIds),
      dependencies: list(unit.dependencies).slice(0, 32).map(dep => typeof dep === "string" ? text(dep) : object(dep) ? { id: text(dep.id), type: text(dep.type), ref: text(dep.ref), sourceRefs: strings(dep.sourceRefs) } : null).filter(Boolean) })),
    acceptance: list(w.acceptance).slice(0, 32).map(item => ({ id: text(item.id), condition: text(item.condition), status: text(item.status), evidenceRefs: strings(item.evidenceRefs) })),
    remaining: remainingDetails.map(item => item.detail || item.id), remainingDetails,
    directions: list(w.changes).slice(0, 32).map(change => ({ author: text(change.author), reason: text(change.reason), basis: text(change.basis), sourceRefs: strings(change.sourceRefs),
      changedUnitIds: strings(change.delta?.changedUnitIds), addedUnitIds: strings(change.delta?.addedUnitIds), removedUnitIds: strings(change.delta?.removedUnitIds) })),
    requirement: object(p.requirementRevision) ? { source: text(p.requirementRevision.source), continuation: text(p.requirementRevision.continuation), scope: text(p.requirementRevision.scope) } : null,
    meaning: "Source-attributed work and obligations; no action grant, acceptance or reassignment inferred" };
  const referenceLists = [w.sourceRefs, w.remaining, [p.supersedesOperationalStandingOf].flat(), ...list(w.remaining).filter(object).map(item => item.sourceRefs), ...list(w.development?.units).flatMap(unit => [unit.acceptanceIds, unit.execution?.evidenceRefs, ...list(unit.dependencies).filter(object).map(dep => dep.sourceRefs)]), ...list(w.acceptance).map(item => item.evidenceRefs), ...list(w.changes).flatMap(change => [change.sourceRefs, change.delta?.changedUnitIds, change.delta?.addedUnitIds, change.delta?.removedUnitIds])];
  projected.projectionComplete = list(w.development?.units).length <= 32 && list(w.acceptance).length <= 32 && list(w.changes).length <= 32 && list(w.development?.units).every(unit => list(unit.dependencies).length <= 32) && remainingDetails.length === list(w.remaining).length && referenceLists.every(items => list(items).length <= 64) && !JSON.stringify(projected).includes("[bounded projection; consult source]");
  return projected;
}

function selectHeads(records, { complete = true } = {}) {
  const byId = new Map(), replaced = new Set(), issues = [], edges = new Map();
  for (const row of records) { if (byId.has(row.recordId) && JSON.stringify(byId.get(row.recordId)) !== JSON.stringify(row)) issues.push({ recordId: row.recordId, code: "record-id-conflict" }); else byId.set(row.recordId, row); }
  for (const row of records) for (const targetId of row.operationalSupersedes) {
    const target = byId.get(targetId);
    if (!target) { issues.push({ recordId: row.recordId, targetId, code: "missing-superseded-record" }); continue; }
    if (target.workId !== row.workId) { issues.push({ recordId: row.recordId, targetId, code: "cross-work-supersession" }); continue; }
    replaced.add(targetId); edges.set(row.recordId, [...(edges.get(row.recordId) || []), targetId]);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) { if (visiting.has(id)) { issues.push({ recordId: id, code: "supersession-cycle" }); return; } if (visited.has(id)) return; visiting.add(id); for (const target of edges.get(id) || []) visit(target); visiting.delete(id); visited.add(id); }
  for (const row of records) visit(row.recordId);
  const workIds = [...new Set(records.map(row => row.workId))];
  if (!complete) issues.push({ code: "incomplete-source-coverage" });
  const heads = workIds.map(workId => { const ids = [...new Set(records.filter(row => row.workId === workId && !replaced.has(row.recordId)).map(row => row.recordId))]; return { workId, recordIds: ids, ambiguous: !complete || ids.length !== 1 || issues.some(issue => byId.get(issue.recordId)?.workId === workId) }; });
  return { heads, issues, rule: "Explicit same-work operational supersession only; never latest timestamp or numeric revision" };
}

async function readProjectData(ref, manifestDir) {
  if (!Array.isArray(ref.workIds) || !ref.workIds.length || ref.workIds.length > 16 || ref.workIds.some(id => typeof id !== "string")) throw Object.assign(Error(), { code: "INVALID_SCOPE" });
  const file = path.resolve(manifestDir, ref.path || "");
  if (!admittedFile(file)) throw Object.assign(Error(), { code: "SOURCE_NOT_ADMITTED" });
  const canonical = await fs.realpath(file), canonicalKey = fileKey(canonical);
  if (!admittedFile(canonical)) throw Object.assign(Error(), { code: "SOURCE_NOT_ADMITTED" });
  if (denied.has(canonicalKey)) throw Object.assign(Error(), { code: "PRIOR_DENIAL_HELD", denied: true });
  let handle;
  try { handle = await fs.open(canonical, "r"); }
  catch (error) { error.denialKey = canonicalKey; throw error; }
  try {
    const before = await handle.stat(); if (!before.isFile()) throw Object.assign(Error(), { code: "NOT_FILE" });
    const start = Math.max(0, before.size - MAX_BYTES), bytes = Buffer.alloc(Math.min(before.size, MAX_BYTES));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, start), after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Object.assign(Error(), { code: "SOURCE_CHANGED" });
    if (bytesRead !== bytes.length) throw Object.assign(Error(), { code: "INCOMPLETE_READ" });
    let body = bytes.subarray(0, bytesRead).toString("utf8"); if (start) body = body.slice(body.indexOf("\n") + 1);
    const tornTail = body.length > 0 && !body.endsWith("\n"); if (tornTail) body = body.slice(0, body.lastIndexOf("\n") + 1);
    const records = []; let malformed = 0;
    for (const line of body.split(/\r?\n/)) { if (!line.trim()) continue; if (Buffer.byteLength(line) > 256 * 1024) { malformed++; continue; } try { const row = projectWork(JSON.parse(line), hash(line)); if (row && ref.workIds.includes(row.workId)) records.push(row); } catch { malformed++; } }
    const omittedRecords = Math.max(0, records.length - 32);
    return { status: "observed", records: records.slice(-32), directives: [], evidence: { path: file, observedSha256: hash(bytes.subarray(0, bytesRead)), modifiedAt: before.mtime.toISOString(), readFrom: start, bytesRead, totalBytes: before.size },
      coverage: { complete: !start && !tornTail && !malformed && !omittedRecords && records.every(row => row.projectionComplete), prefixOmitted: !!start, tornTail, malformed, omittedRecords, incompleteProjections: records.filter(row => !row.projectionComplete).length } };
  } catch (error) { error.denialKey = canonicalKey; throw error; } finally { await handle.close(); }
}

function bulletinRecord(row) {
  if (!object(row) || typeof row.ideaId !== "string") return null;
  const attribution = value => object(value) ? Object.fromEntries(["author", "host", "sessionId", "messageId", "at"].filter(key => typeof value[key] === "string").map(key => [key, text(value[key])])) : null;
  return { ideaId: text(row.ideaId), projectRef: text(row.projectRef), revision: revision(row.revision), title: text(row.title), proposition: text(row.proposition), status: text(row.status), horizon: text(row.horizon), reviewAt: text(row.reviewAt), attribution: attribution(row.source),
    links: list(row.links).slice(0, 24).filter(link => ["extends", "relates", "depends-on"].includes(link.relation)).map(link => ({ ideaId: text(link.ideaId), relation: link.relation })),
    history: list(row.history).slice(0, 64).filter(object).map(item => ({ revision: revision(item.revision), action: text(item.action), at: text(item.at), title: text(item.title), proposition: text(item.proposition), status: text(item.status), attribution: attribution(item.source) })),
    assignment: null, meaning: "Operator bulletin attribution/disposition is separate from work assignment or action authority" };
}

async function readBulletin(ref, fetcher) {
  const url = new URL(ref.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== "4317" || url.pathname !== "/mcp" || url.search || url.hash || url.username || url.password || typeof ref.projectRef !== "string" || !/^project:[a-z0-9][a-z0-9._-]{0,127}$/.test(ref.projectRef)) throw Object.assign(Error(), { code: "SOURCE_NOT_ADMITTED" });
  let session = null, nextId = 1;
  const signal = AbortSignal.timeout(3500);
  async function request(method, params, notification = false) {
    const id = notification ? undefined : nextId++;
    const response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json", Accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...(session ? { "mcp-session-id": session } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", ...(id ? { id } : {}), method, params }), signal, redirect: "error" });
    if (!response.ok) throw Object.assign(Error(), { code: "HTTP_" + response.status, denied: response.status === 401 || response.status === 403 });
    session = response.headers.get("mcp-session-id") || session;
    const reader = response.body?.getReader(); if (!reader) return null; const chunks = []; let count = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; count += part.value.length; if (count > MAX_BYTES) throw Object.assign(Error(), { code: "LIMIT" }); chunks.push(Buffer.from(part.value)); } } finally { await reader.cancel().catch(() => {}); }
    const body = Buffer.concat(chunks).toString("utf8"); if (!body.trim()) return null;
    const candidates = response.headers.get("content-type")?.includes("text/event-stream") ? body.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => JSON.parse(line.slice(5))) : [JSON.parse(body)];
    const value = candidates.find(candidate => candidate.id === id); if (!value && !notification) throw Object.assign(Error(), { code: "INVALID_RESPONSE" });
    if (value?.error) throw Object.assign(Error(), { code: "MCP_" + value.error.code, denied: /permit|denied|forbidden/i.test(value.error.message || "") });
    return value?.result;
  }
  await request("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "mc-continuity-read", version: "1" }, capabilities: {} });
  await request("notifications/initialized", {}, true);
  const tools = await request("tools/list", {}), tool = tools.tools.find(item => item.name.replace(/\./g, "_") === "mousecat_bulletin");
  if (!tool) throw Object.assign(Error(), { code: "BULLETIN_UNAVAILABLE" });
  const called = await request("tools/call", { name: tool.name, arguments: { action: "query", projectRef: ref.projectRef, permit: { profileId: "observer" } } });
  if (called?.isError) throw Object.assign(Error(), { code: "BULLETIN_REFUSED", denied: true });
  const data = called.structuredContent || JSON.parse(called.content.find(item => item.type === "text").text);
  if (data.ok !== true || data.schema !== "mousecat.bulletin/1") throw Object.assign(Error(), { code: data.code || "INVALID_BULLETIN", denied: /permit|denied|forbidden/i.test(data.code || "") });
  const records = list(data.records), directives = records.slice(0, 32).map(bulletinRecord).filter(Boolean);
  const incompleteProjections = records.slice(0, 32).filter(row => list(row.history).length > 64 || list(row.links).length > 24).length + (JSON.stringify(directives).includes("[bounded projection; consult source]") ? 1 : 0);
  return { status: "observed", records: [], directives, evidence: { url: url.href, projectRef: ref.projectRef, schema: data.schema, observedSha256: hash(JSON.stringify(data)) }, coverage: { complete: records.length <= 32 && !incompleteProjections && !list(data.quarantined).length, omittedRecords: Math.max(0, records.length - 32), incompleteProjections, quarantined: list(data.quarantined).length } };
}

async function readContinuity({ manifestPath, id, fetcher = fetch } = {}) {
  const observedAt = new Date().toISOString();
  try {
    const stat = await fs.stat(manifestPath); if (stat.size > 128 * 1024) throw Object.assign(Error(), { code: "LIMIT" });
    const manifestBytes = await fs.readFile(manifestPath), manifest = JSON.parse(manifestBytes), entry = list(manifest.objects).find(item => item.id === id);
    if (!entry) throw Object.assign(Error(), { code: "UNKNOWN_OBJECT" });
    const refs = entry.continuitySources;
    if (refs === undefined) return { schema: "mc.operations.continuity/1", status: "unconfigured", observedAt, records: [], directives: [], sources: [], heads: [], issues: [] };
    if (!Array.isArray(refs) || refs.length > 4 || refs.some(ref => !object(ref) || !["neo-project-data", "mousecat-bulletin"].includes(ref.format) || (ref.id !== undefined && (typeof ref.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(ref.id))))) throw Object.assign(Error(), { code: "INVALID_SOURCES" });
    const sources = [], records = [], directives = [];
    for (const ref of refs) {
      const key = hash(JSON.stringify({ manifestPath, id, ref })), operation = denialKey(ref, path.dirname(manifestPath)); let result;
      try {
        if (denied.has(operation)) throw Object.assign(Error(), { code: "PRIOR_DENIAL_HELD", denied: true });
        if (denied.size >= 256) throw Object.assign(Error(), { code: "DENIAL_HOLD_CAPACITY" });
        result = ref.format === "neo-project-data" ? await readProjectData(ref, path.dirname(manifestPath)) : ref.format === "mousecat-bulletin" ? await readBulletin(ref, fetcher) : (() => { throw Object.assign(Error(), { code: "UNSUPPORTED_SOURCE" }); })();
        if (Buffer.byteLength(JSON.stringify(result)) > MAX_OUTPUT) throw Object.assign(Error(), { code: "OUTPUT_LIMIT" });
        result.observedAt = new Date().toISOString(); cache.delete(key); cache.set(key, structuredClone(result)); while (cache.size > 16) cache.delete(cache.keys().next().value);
      } catch (error) {
        if (error.denied || ["EACCES", "EPERM"].includes(error.code)) { error.denied = true; denied.add(operation); if (error.denialKey) denied.add(error.denialKey); }
        const old = cache.get(key); result = { ...(old || { records: [], directives: [] }), status: error.denied ? "denied" : "unavailable", stale: !!old, code: String(error.code || error.name || "unavailable"), lastObservedAt: old?.observedAt || null };
      }
      const sourceId = ref.id || ref.format;
      records.push(...list(result.records).map(row => ({ ...row, sourceId, stale: result.status !== "observed" })));
      directives.push(...list(result.directives).map(row => ({ ...row, sourceId, stale: result.status !== "observed" })));
      const { records: _records, directives: _directives, ...summary } = result; sources.push({ id: sourceId, format: ref.format, ...summary });
    }
    const complete = sources.every(source => source.status === "observed" && source.coverage?.complete === true);
    const topology = selectHeads(records, { complete }), ok = sources.filter(source => source.status === "observed").length;
    const output = { schema: "mc.operations.continuity/1", status: complete ? "observed" : ok ? "partial" : "unavailable", observedAt, catalogSha256: hash(manifestBytes), sources, records, directives, ...topology, assignmentRule: "Literal source identities retained; no revocation inferred from inactivity; attribution is not assignment" };
    if (Buffer.byteLength(JSON.stringify(output)) > MAX_OUTPUT) throw Object.assign(Error(), { code: "OUTPUT_LIMIT" });
    return output;
  } catch (error) { return { schema: "mc.operations.continuity/1", status: "unavailable", observedAt, code: String(error.code || error.name || "unavailable"), records: [], directives: [], sources: [], heads: [], issues: [] }; }
}
module.exports = { readContinuity, projectWork, bulletinRecord, selectHeads };
