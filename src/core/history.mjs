import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute, posix } from "node:path";

const TYPES = new Set(["plan", "decision", "evidence", "result", "method", "document", "note"]);
const RELATIONS = new Set(["references", "based-on", "implements", "supports", "supersedes", "derived-from", "tested-by", "part-of", "contains"]);
const MAX_BYTES = 512 * 1024;
const REDACTED = "[sensitive-redacted]";
const hash = value => createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const historyHash = value => hash(JSON.stringify(canonical(value)));
const copy = value => JSON.parse(JSON.stringify(value));
const error = (code, extra = {}) => ({ schema: "mousecat.error/1", ok: false, code, ...extra });
function cleanText(value) {
  return String(value ?? "").replace(/\bcontinuation-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/giu, REDACTED)
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/gu, REDACTED)
    .replace(/(Bearer\s+)[a-zA-Z0-9_.-]+/giu, "$1" + REDACTED);
}
function safeValue(value) {
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === "object") {
    if (value.sensitive === true) return { sensitive: true, content: REDACTED };
    return Object.fromEntries(Object.entries(value).map(([k, v]) =>
      [k, /secret|token|password|cookie|private.?key|api.?key|capability/iu.test(k) ? REDACTED : safeValue(v)]));
  }
  return typeof value === "string" ? cleanText(value) : value;
}
function refsIn(text) {
  return [...new Set(String(text || "").match(/(?:skill-[a-f0-9]{16}|(?:[a-z][a-z0-9-]*:)*(?:plan-sha256|content-sha256):[a-f0-9]{64}|\b[a-f0-9]{64}\b)/gu) || [])];
}
function sourceRef(surfaceId, path) { return "source:" + surfaceId + ":" + path; }
function sourceLinks(text, surfaceId, path) {
  const links = refsIn(text).map(target => ({ relation: "references", target, basis: "Literal reference in " + path }));
  for (const match of String(text).matchAll(/\[([^\]]+)\]\(([^\s)]+)\)/gu)) {
    const target = match[2];
    if (/^[a-z]+:/iu.test(target) || target.startsWith("/")) continue;
    const [file, anchor] = target.split("#");
    const resolved = file ? posix.normalize(posix.join(posix.dirname(path), file)) : path;
    if (resolved.startsWith("../")) continue;
    links.push({ relation: "references", target: sourceRef(surfaceId, resolved) + (anchor ? "#" + anchor : ""), basis: "Source link: " + match[1] });
  }
  return links;
}

export function createHistoryController({ state, publicInteraction, persist }) {
  state.historyRecords ||= new Map();
  state.historyCoverage ||= new Map();
  const records = state.historyRecords;
  let generation = 0;
  let cachedGeneration = -1;
  let aliasIndex;
  function latest(ref) { return records.get(ref)?.at(-1) || null; }
  function insert(raw) {
    const record = safeValue(raw);
    const revision = historyHash(record);
    const versions = records.get(record.ref) || [];
    if (versions.at(-1)?.revision === revision) return versions.at(-1);
    const next = { ...record, revision, indexedAt: new Date().toISOString() };
    // Returning to prior content still has its original addressable revision.
    if (versions.some(v => v.revision === revision)) {
      const existing = versions.find(v => v.revision === revision);
      records.set(record.ref, [...versions.filter(v => v.revision !== revision), existing]);
      generation += 1;
      return existing;
    }
    records.set(record.ref, [...versions, next]);
    generation += 1;
    return next;
  }
  function syncInteractions() {
    for (const original of [...state.archivedInteractions.values(), ...state.interactions.values()]) {
      const interaction = publicInteraction(original);
      const sensitive = interaction.items?.some(item => item.sensitive);
      if (sensitive && records.get(interaction.interactionId)?.some(r => r.standing !== "redacted")) {
        records.delete(interaction.interactionId);
        generation += 1;
      }
      const selected = interaction.items || [];
      const body = sensitive ? REDACTED : selected.map(item => {
        const answer = item.response ? "\n\nOriginal response\n" + JSON.stringify(safeValue(item.response), null, 2) : "";
        const choices = item.options?.length ? "## Original choices\n" + item.options.map(option => ["- " + option.label, option.description || "", "Recorded value: " + JSON.stringify(safeValue(option.value ?? option.label))].join("\n")).join("\n\n") : "";
        return [item.title, item.prompt, item.description, choices, item.mlReview ? JSON.stringify(safeValue(item.mlReview), null, 2) : ""].filter(Boolean).join("\n\n") + answer;
      }).join("\n\n");
      const aliases = sensitive ? [] : selected.flatMap(item => {
        const lineage = item.metadata?.lineage || {};
        return [lineage.evidenceRef, lineage.threadId].filter(Boolean);
      });
      const links = sensitive ? [] : [
        ...(interaction.parentInteractionId ? [{ relation: "based-on", target: interaction.parentInteractionId, basis: "Interaction parent lineage" }] : []),
        ...refsIn(body).filter(ref => !aliases.includes(ref)).map(target => ({ relation: "references", target, basis: "Literal reference in the preserved interaction" }))
      ];
      insert({
        ref: interaction.interactionId, kind: interaction.skillRef === "field-test" ? "plan" : "decision",
        title: sensitive ? "Sensitive interaction" : cleanText(interaction.title || selected[0]?.title || interaction.interactionId),
        project: sensitive ? "" : (interaction.projectRef || ""), date: interaction.createdAt,
        updatedAt: interaction.updatedAt, standing: sensitive ? "redacted" : interaction.status,
        body, aliases, links, source: { kind: "interaction", label: "Original Mousecat interaction", interactionId: interaction.interactionId },
        response: sensitive ? null : selected.map(item => ({ itemId: item.id, response: safeValue(item.response || null) })),
        items: sensitive ? [] : selected.map(safeValue),
        method: null
      });
    }
  }
  function aliasMap() {
    if (cachedGeneration === generation && aliasIndex) return aliasIndex;
    aliasIndex = new Map();
    for (const versions of records.values()) {
      for (const item of versions) for (const alias of [item.ref, ...(item.aliases || [])]) {
        if (!aliasIndex.has(alias)) aliasIndex.set(alias, new Set());
        aliasIndex.get(alias).add(item.ref);
        const digest = /[a-f0-9]{64}$/u.exec(alias)?.[0];
        if (digest) {
          if (!aliasIndex.has(digest)) aliasIndex.set(digest, new Set());
          aliasIndex.get(digest).add(item.ref);
        }
      }
    }
    cachedGeneration = generation;
    return aliasIndex;
  }
  function resolveRef(ref, project = "") {
    if (records.has(ref)) return { status: "resolved", ref };
    let candidates = [...(aliasMap().get(ref) || [])];
    if (candidates.length > 1 && project) {
      const scoped = candidates.filter(id => latest(id).project === project);
      if (scoped.length) candidates = scoped;
    }
    const matchingVersion = candidates.length === 1 ? records.get(candidates[0]).filter(item => (item.aliases || []).some(alias => alias === ref || alias.endsWith(":" + ref))).at(-1) : null;
    return candidates.length === 1 ? { status: "resolved", ref: candidates[0], ...(matchingVersion ? { revision: matchingVersion.revision } : {}) }
      : { status: candidates.length ? "ambiguous" : "unresolved", candidates };
  }
  function summary(record) {
    return { ref: record.ref, revision: record.revision, title: record.title, kind: record.kind,
      project: record.project, date: record.date, standing: record.standing, indexedAt: record.indexedAt,
      versions: records.get(record.ref).length };
  }
  function detail(ref, revision) {
    const resolution = resolveRef(ref);
    if (resolution.status !== "resolved") return { ok: false, ...resolution, requested: ref };
    const versions = records.get(resolution.ref);
    const wantedRevision = revision || resolution.revision;
    const record = wantedRevision ? versions.find(item => item.revision === wantedRevision) : versions.at(-1);
    if (!record) return error("history-revision-not-found");
    const linked = (record.links || []).map(link => {
      const target = resolveRef(link.target, record.project);
      const pinned = link.revision || target.revision;
      const destination = target.ref ? (pinned ? records.get(target.ref)?.find(r => r.revision === pinned) : latest(target.ref)) : null;
      return { ...link, ...target, ...(pinned ? { revision: pinned } : {}), status: target.status === "resolved" && !destination ? "unresolved-revision" : target.status, title: destination?.title || link.target };
    });
    const backlinks = [];
    for (const candidates of records.values()) {
      const candidate = candidates.at(-1);
      for (const link of candidate.links || []) {
        if (resolveRef(link.target, candidate.project).ref === record.ref && candidate.ref !== record.ref) {
          backlinks.push({ ...summary(candidate), relation: link.relation, basis: link.basis });
        }
      }
    }
    return { ok: true, record: copy(record), links: linked, backlinks,
      revisions: versions.map(item => ({ revision: item.revision, date: item.date, indexedAt: item.indexedAt, standing: item.standing })),
      currentRevision: versions.at(-1).revision,
      coverage: state.historyCoverage.get(record.source?.surfaceId + ":" + record.source?.path) || null };
  }
  function query(args = {}) {
    syncInteractions();
    if (args.ref) return detail(String(args.ref), args.revision ? String(args.revision) : undefined);
    const query = String(args.query || "").toLowerCase().trim();
    const all = [...records.values()].map(versions => versions.at(-1));
    const matching = all.filter(record => (!args.kind || record.kind === args.kind)
      && (!args.project || record.project === args.project)
      && (!args.standing || record.standing === args.standing)
      && (!args.from || String(record.date || "").slice(0, 10) >= args.from)
      && (!args.to || String(record.date || "").slice(0, 10) <= args.to)
      && (!query || [record.title, record.body, record.ref, record.project, ...(record.aliases || [])].join(" ").toLowerCase().includes(query)));
    matching.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || a.ref.localeCompare(b.ref));
    const offset = Math.max(0, Number.isInteger(args.offset) ? args.offset : 0);
    const limit = Math.min(100, Math.max(1, Number.isInteger(args.limit) ? args.limit : 40));
    return { schema: "mousecat.history/1", ok: true, total: matching.length, offset, limit,
      records: matching.slice(offset, offset + limit).map(summary),
      facets: { kinds: [...new Set(all.map(r => r.kind))].sort(), projects: [...new Set(all.map(r => r.project).filter(Boolean))].sort(), standings: [...new Set(all.map(r => r.standing))].sort() },
      coverage: [...state.historyCoverage.values()].map(copy),
      scope: "Retained Mousecat interactions and explicitly indexed registered sources. Original external transcripts are included only when registered and indexed." };
  }
  function register(raw) {
    if (!raw || !/^note:[a-z0-9][a-z0-9._:/-]{0,199}$/u.test(raw.ref || "") || !TYPES.has(raw.kind)) return error("history-record-invalid");
    if (typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 240 || typeof raw.body !== "string" || Buffer.byteLength(raw.body) > MAX_BYTES) return error("history-content-invalid");
    if (!raw.source || raw.source.kind !== "host" || !raw.source.host || !raw.source.sessionId) return error("history-provenance-required");
    if (raw.standing && !["proposed", "reported"].includes(raw.standing)) return error("history-standing-not-operator-ruling");
    const links = raw.links || [];
    if (!Array.isArray(links) || links.length > 100 || links.some(link => !RELATIONS.has(link.relation) || typeof link.target !== "string" || !link.target || typeof link.basis !== "string" || !link.basis)) return error("history-link-provenance-required");
    if (raw.kind === "method" && (!raw.method || ["purpose", "applicability", "procedure", "failures"].some(key => typeof raw.method[key] !== "string" || !raw.method[key].trim()) || !links.length)) return error("history-method-evidence-required");
    if (JSON.stringify(raw).length > MAX_BYTES) return error("history-record-too-large");
    const record = insert({
      ref: raw.ref, title: raw.title, body: raw.body, kind: raw.kind, project: String(raw.project || ""),
      date: raw.date || latest(raw.ref)?.date || new Date().toISOString(), standing: raw.standing || "proposed",
      source: { kind: "host", host: String(raw.source.host), sessionId: String(raw.source.sessionId), label: String(raw.source.label || "Host-authored record") },
      aliases: Array.isArray(raw.aliases) ? raw.aliases.filter(alias => typeof alias === "string" && /^[a-f0-9]{40}$/u.test(alias)).slice(0, 20) : [],
      links: links.map(link => ({ relation: link.relation, target: link.target, basis: link.basis })),
      method: raw.kind === "method" ? Object.fromEntries(["purpose", "applicability", "procedure", "failures"].map(key => [key, raw.method[key]])) : null
    });
    persist();
    return { ok: true, record: summary(record) };
  }
  function indexSource({ surfaceId, path }) {
    const surface = state.projectSurfaces.get(surfaceId);
    if (!surface) return error("history-surface-not-registered");
    const declared = [...surface.governingDocuments, ...surface.dataSources].find(item => item.path === path);
    if (!declared) return error("history-source-not-declared");
    const key = surfaceId + ":" + path;
    const coverage = { surfaceId, path, project: surface.projectRef, checkedAt: new Date().toISOString() };
    try {
      const root = realpathSync(surface.root);
      const file = realpathSync(resolve(root, path));
      const rel = relative(root, file);
      if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("source-outside-registered-root");
      const stats = statSync(file);
      if (!stats.isFile()) throw new Error("source-is-not-a-file");
      if (stats.size > Math.min(MAX_BYTES, declared.maxBytes || MAX_BYTES)) throw new Error("source-exceeds-index-limit");
      const raw = readFileSync(file, "utf8");
      let body = cleanText(raw);
      let kind = "document";
      let aliases = [hash(raw)];
      let parsed;
      if (path.endsWith(".json")) {
        parsed = JSON.parse(raw);
        body = JSON.stringify(safeValue(parsed), null, 2);
        aliases.push(historyHash(parsed));
        kind = "evidence";
        if (/^[a-f0-9]{64}$/u.test(parsed.contentSha256 || "")) {
          const { contentSha256, ...content } = parsed;
          if (historyHash(content) === contentSha256) aliases.push(contentSha256);
        }
        if (parsed.schema === "field-test.work-plan/1") { kind = "plan"; aliases.push("field-test:plan-sha256:" + historyHash(parsed)); }
      } else if (path.endsWith(".jsonl")) {
        body = raw.split(/\r?\n/u).filter(Boolean).map(line => JSON.stringify(safeValue(JSON.parse(line)))).join("\n");
      }
      // Redaction invalidates source aliases: a digest must not become a discovery channel.
      if (body.includes(REDACTED)) aliases = [];
      const ref = sourceRef(surfaceId, path);
      const sourceVersion = ref + "@sha256:" + hash(raw);
      if (!body.includes(REDACTED)) aliases.push(sourceVersion);
      if (body.includes(REDACTED)) {
        for (const existing of [...records.keys()]) if (existing === ref || existing.startsWith(ref + "#")) records.delete(existing);
        generation += 1;
      }
      const sectionLinks = [];
      if (/\.md$/iu.test(path) && !body.includes(REDACTED)) {
        const lines = body.split(/\r?\n/u);
        const headings = lines.flatMap((line, index) => /^(#{1,6})\s+(.+)$/u.test(line) ? [{ line: index, title: line.replace(/^#+\s+/u, "") }] : []);
        const used = new Map();
        headings.forEach((heading, index) => {
          const slug = heading.title.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "section";
          const occurrence = (used.get(slug) || 0) + 1; used.set(slug, occurrence);
          const sectionRef = ref + "#" + slug + (occurrence > 1 ? "-" + occurrence : "");
          const end = headings[index + 1]?.line || lines.length;
          const sectionBody = lines.slice(heading.line, end).join("\n");
          const section = insert({ ref: sectionRef, kind: "document", title: heading.title, body: sectionBody,
            project: surface.projectRef, date: stats.mtime.toISOString(), standing: "source-record",
            source: { kind: "file", surfaceId, path, label: path, startLine: heading.line + 1, endLine: end, digest: hash(raw) },
            aliases: [], method: null, links: [{ relation: "part-of", target: sourceVersion, basis: "Exact source-file identity and digest" },
              ...sourceLinks(sectionBody, surfaceId, path)] });
          sectionLinks.push({ relation: "contains", target: sectionRef, revision: section.revision, basis: "Source section at line " + (heading.line + 1) });
        });
      }
      const record = insert({ ref, kind, title: parsed?.title || declared.label || path,
        body, project: surface.projectRef, date: stats.mtime.toISOString(), standing: body.includes(REDACTED) ? "redacted" : "source-record",
        source: { kind: "file", surfaceId, path, label: path, digest: hash(raw) },
        aliases, method: null, links: [...sectionLinks, ...sourceLinks(body, surfaceId, path).filter(link => !aliases.includes(link.target))] });
      state.historyCoverage.set(key, { ...coverage, status: "indexed", revision: record.revision, bytes: stats.size });
      persist();
      return { ok: true, record: summary(record) };
    } catch (cause) {
      const safeReasons = new Set(["source-outside-registered-root", "source-is-not-a-file", "source-exceeds-index-limit"]);
      state.historyCoverage.set(key, { ...coverage, status: cause.code === "ENOENT" ? "missing" : "unavailable", reason: cause.code === "ENOENT" ? "source-missing" : cause instanceof SyntaxError ? "invalid-source-json" : safeReasons.has(cause.message) ? cause.message : "source-read-failed" });
      persist();
      return error("history-source-unavailable", { coverage: state.historyCoverage.get(key) });
    }
  }
  return { syncInteractions, query, register, indexSource };
}
