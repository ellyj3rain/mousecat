import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";

const ID_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const MAX_EXCERPT_BYTES = 65_536;
const DEFAULT_MAX_DATA_BYTES = 2_097_152;
const HARD_MAX_DATA_BYTES = 8_388_608;
const FORMATS = new Set(["json", "jsonl", "text"]);
const FORBIDDEN_DESCRIPTOR_KEYS = new Set([
  "command",
  "executable",
  "rendercode",
  "script",
  "html",
  "token",
  "secret",
  "password",
  "credentialvalue",
]);

export const PROJECT_SURFACE_CONTRACT = Object.freeze({
  schema: "mousecat.project-surface.contract/1",
  tool: "mousecat.projects",
  actions: Object.freeze(["list", "discover", "draft", "register", "describe", "threads", "data"]),
  surfaceSchema: "mousecat.project-surface/1",
  groupSchema: "mousecat.project-group/1",
  draftSchema: "mousecat.project-surface.draft/1",
  formats: Object.freeze(["json", "jsonl", "text"]),
  ownership: Object.freeze({
    mousecat: ["surface-registry", "document-excerpts", "data-summaries", "thread-binding"],
    project: ["governing-documents", "data-sources", "adapter-ratification"],
    caller: ["project-selection", "thread-interpretation", "result-consumption"],
  }),
});

export function validateProjectGroupDescriptor(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return error("project-group-required");
  }
  if (hasForbiddenDescriptorKey(raw)) {
    return error("project-group-executable-or-secret-field-rejected");
  }
  const groupId = identifier(raw.groupId);
  const label = text(raw.label, 160);
  const projectRef = text(raw.projectRef, 512);
  const memberSurfaceIds = Array.isArray(raw.memberSurfaceIds)
    ? raw.memberSurfaceIds.map((member) => identifier(member))
    : null;
  if (!groupId) return error("project-group-id-invalid");
  if (!label) return error("project-group-label-required");
  if (!memberSurfaceIds || memberSurfaceIds.length === 0
      || memberSurfaceIds.length > 32
      || memberSurfaceIds.some((member) => !member)
      || new Set(memberSurfaceIds).size !== memberSurfaceIds.length) {
    return error("project-group-member-invalid", { groupId });
  }
  return {
    schema: "mousecat.project-group.validation/1",
    ok: true,
    value: {
      schema: PROJECT_SURFACE_CONTRACT.groupSchema,
      groupId,
      label,
      ...(projectRef ? { projectRef } : {}),
      memberSurfaceIds,
    },
  };
}

// Proposal heuristics only. A generated draft is never registered by itself;
// the operator ratifies it, and a ratified surface may name any documents.
const GOVERNING_DOCUMENT_HEURISTICS = Object.freeze([
  { match: /^readme(?:[._-].*)?$/u, role: "readme" },
  { match: /^(?:agents|neo|claude|core|copilot)\.md$/u, role: "instructions" },
  { match: /^(?:governance|contributing|code_of_conduct|security)\.md$/u, role: "governance" },
  { match: /^(?:roadmap|todo|plan|plans)\.md$/u, role: "roadmap" },
  { match: /^(?:session_state|state|status|session)\.md$/u, role: "state" },
  { match: /^(?:decision_registry|decisions|adr)\.md$/u, role: "decisions" },
  { match: /^record\.md$/u, role: "decisions" },
  { match: /^(?:findings|changelog|history)\.md$/u, role: "history" },
  { match: /^(?:batch_log|journal)\.md$/u, role: "journal" },
  { match: /^(?:memory|index)\.md$/u, role: "index" },
  { match: /^version(?:[._-].*)?$/u, role: "version" },
  { match: /^(?:architecture|design)\.md$/u, role: "architecture" },
  { match: /^(?:engine_contract|contract|api)\.md$/u, role: "contract" },
]);

const LEDGER_ROLES = new Set(["journal", "decisions", "history"]);

function error(code, details = {}) {
  return { schema: "mousecat.error/1", ok: false, code, ...details };
}

function text(value, maximum = 512) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function identifier(value) {
  const normalized = text(value, 160)?.toLowerCase() || null;
  return normalized && ID_RE.test(normalized) ? normalized : null;
}

function stringList(value, maximum = 128) {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized = value.map((item) => text(item, 512));
  return normalized.every(Boolean) ? [...new Set(normalized)] : null;
}

function relativePath(value) {
  const normalized = text(value, 512);
  if (!normalized) return null;
  if (isAbsolute(normalized) || normalized.includes("..") || normalized.includes("\\")) return null;
  if (normalized.startsWith("/") || normalized.startsWith("~")) return null;
  return normalized;
}

function hasForbiddenDescriptorKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasForbiddenDescriptorKey);
  return Object.entries(value).some(([key, child]) => (
    FORBIDDEN_DESCRIPTOR_KEYS.has(key.toLowerCase())
    || hasForbiddenDescriptorKey(child)
  ));
}

function boundedLines(value, fallback, maximum, minimum = 1) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) return null;
  return value;
}

export function validateProjectSurfaceDescriptor(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return error("project-surface-required");
  }
  if (hasForbiddenDescriptorKey(raw)) {
    return error("project-surface-executable-or-secret-field-rejected");
  }
  const surfaceId = identifier(raw.surfaceId);
  const projectRef = text(raw.projectRef, 512);
  const projectKind = identifier(raw.projectKind);
  const root = text(raw.root, 1_024);
  const identityMarkers = stringList(raw.identityMarkers, 32)
    ?.map((item) => relativePath(item));
  if (!surfaceId) return error("project-surface-id-invalid");
  if (!projectRef) return error("project-surface-project-ref-required");
  if (!projectKind) return error("project-surface-project-kind-invalid");
  if (!root) return error("project-surface-root-required");
  if (!identityMarkers?.length || identityMarkers.some((item) => !item)) {
    return error("project-surface-identity-marker-invalid");
  }
  if (!Array.isArray(raw.governingDocuments)
      || raw.governingDocuments.length === 0
      || raw.governingDocuments.length > 64) {
    return error("project-surface-governing-document-required");
  }

  const governingDocuments = [];
  const roles = new Set();
  const documentPaths = new Set();
  for (const document of raw.governingDocuments) {
    const role = identifier(document?.role);
    const path = relativePath(document?.path);
    const label = text(document?.label, 160);
    const excerptLines = boundedLines(document?.excerptLines, 12, 200);
    const tailLines = boundedLines(document?.tailLines, 0, 200, 0);
    if (!role || roles.has(role)) {
      return error("project-surface-document-role-invalid", { role });
    }
    if (!path || documentPaths.has(path) || excerptLines === null || tailLines === null) {
      return error("project-surface-document-path-invalid", { role });
    }
    roles.add(role);
    documentPaths.add(path);
    governingDocuments.push({
      role,
      path,
      ...(label ? { label } : {}),
      excerptLines,
      tailLines,
      required: document?.required !== false,
    });
  }

  const interactionIds = raw.interactionIds;
  if (interactionIds !== undefined && (!Array.isArray(interactionIds) || interactionIds.length > 256
    || interactionIds.some(id => typeof id !== "string" || !id.trim() || id.length > 512)
    || new Set(interactionIds).size !== interactionIds.length)) return error("project-surface-interaction-ids-invalid");
  const dataSources = [];
  const dataNames = new Set();
  for (const source of Array.isArray(raw.dataSources) ? raw.dataSources : []) {
    const name = identifier(source?.name);
    const path = relativePath(source?.path);
    const label = text(source?.label, 160);
    const format = identifier(source?.format);
    const maxBytes = source?.maxBytes === undefined
      ? DEFAULT_MAX_DATA_BYTES
      : Number.isInteger(source?.maxBytes) && source.maxBytes > 0 && source.maxBytes <= HARD_MAX_DATA_BYTES
        ? source.maxBytes
        : null;
    if (!name || dataNames.has(name) || !path || !format || !FORMATS.has(format) || maxBytes === null) {
      return error("project-surface-data-source-invalid", { name });
    }
    dataNames.add(name);
    dataSources.push({
      name,
      path,
      format,
      ...(label ? { label } : {}),
      maxBytes,
    });
  }

  return {
    schema: "mousecat.project-surface.validation/1",
    ok: true,
    value: {
      schema: PROJECT_SURFACE_CONTRACT.surfaceSchema,
      surfaceId,
      projectRef,
      projectKind,
      root,
      identityMarkers,
      governingDocuments,
      dataSources,
      ...(interactionIds !== undefined ? { interactionIds: [...interactionIds] } : {}),
    },
  };
}

function slugify(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return ID_RE.test(normalized) ? normalized : null;
}

function candidateRole(fileName) {
  const lower = fileName.toLowerCase();
  const withoutExtension = lower.replace(/\.(?:md|txt|markdown)$/u, "");
  for (const heuristic of GOVERNING_DOCUMENT_HEURISTICS) {
    if (heuristic.match.test(lower) || heuristic.match.test(withoutExtension)) return heuristic.role;
  }
  return null;
}

function dataFileFormat(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) return "jsonl";
  if (lower.endsWith(".json")) return "json";
  return null;
}

function gitRemotes(root) {
  try {
    const config = readFileSync(join(root, ".git", "config"), "utf8");
    const remotes = [];
    for (const line of config.split(/\r?\n/u)) {
      const match = /^\s*url\s*=\s*(\S+)\s*$/u.exec(line);
      if (match) remotes.push(match[1]);
    }
    return remotes;
  } catch {
    return [];
  }
}

export function generateProjectSurfaceDraft(root, options = {}) {
  const normalizedRoot = text(root, 1_024);
  if (!normalizedRoot) return error("project-surface-root-required");
  let entries;
  try {
    const rootStat = statSync(normalizedRoot);
    if (!rootStat.isDirectory()) return error("project-surface-root-not-a-directory");
    entries = readdirSync(normalizedRoot, { withFileTypes: true });
  } catch {
    return error("project-surface-root-unreadable", { root: normalizedRoot });
  }

  const governingCandidates = [];
  const claimedRoles = new Set();
  const dataCandidates = [];
  const otherFiles = [];
  for (const entry of entries) {
    if (entry.isFile()) {
      const role = candidateRole(entry.name);
      if (role && !claimedRoles.has(role)) {
        claimedRoles.add(role);
        governingCandidates.push({ role, path: entry.name, name: entry.name });
      } else if (dataFileFormat(entry.name)) {
        dataCandidates.push({ path: entry.name, format: dataFileFormat(entry.name), name: entry.name });
      } else {
        otherFiles.push(entry.name);
      }
    } else if (entry.isDirectory()) {
      const lowerName = entry.name.toLowerCase();
      if (lowerName.startsWith(".") || lowerName === "node_modules") {
        continue;
      }
      try {
        const children = readdirSync(join(normalizedRoot, entry.name), { withFileTypes: true });
        const formats = new Set();
        for (const child of children.slice(0, 200)) {
          const format = child.isFile() ? dataFileFormat(child.name) : null;
          if (format) formats.add(format);
        }
        if (formats.size > 0) {
          dataCandidates.push({
            path: entry.name,
            format: formats.has("jsonl") ? "jsonl" : "json",
            name: entry.name,
          });
        }
      } catch {
        // An unreadable subdirectory proposes nothing.
      }
    }
  }

  const isGitRepository = existsSync(join(normalizedRoot, ".git"));
  const ledgerRoles = governingCandidates.filter((candidate) => LEDGER_ROLES.has(candidate.role));
  if (governingCandidates.length < 2 || !isGitRepository || ledgerRoles.length === 0) {
    return {
      schema: PROJECT_SURFACE_CONTRACT.draftSchema,
      ok: true,
      draft: null,
      evidence: {
        root: normalizedRoot,
        qualified: false,
        reason: !isGitRepository
          ? "not-a-git-repository"
          : ledgerRoles.length === 0
            ? "no-governing-ledger"
            : "fewer-than-two-governing-candidates",
        governingCandidates: governingCandidates.length,
        gitRemotes: isGitRepository ? gitRemotes(normalizedRoot) : [],
      },
    };
  }

  const surfaceId = slugify(basename(normalizedRoot)) || "project";
  const identityMarkers = governingCandidates.slice(0, 4).map((candidate) => candidate.path);
  const governingDocuments = governingCandidates.slice(0, 24).map((candidate) => ({
    role: candidate.role,
    path: candidate.path,
    label: candidate.name,
    excerptLines: candidate.role === "version" ? 5 : 12,
    tailLines: 0,
    required: true,
  }));
  const dataSources = dataCandidates.slice(0, 8).map((candidate, index) => ({
    name: slugify(candidate.name) || `data-${index + 1}`,
    path: candidate.path,
    format: candidate.format,
    label: candidate.name,
    maxBytes: DEFAULT_MAX_DATA_BYTES,
  }));

  const draft = validateProjectSurfaceDescriptor({
    surfaceId,
    projectRef: `project:${surfaceId}`,
    projectKind: "repository",
    root: normalizedRoot,
    identityMarkers,
    governingDocuments,
    dataSources,
  });
  if (!draft.ok) return draft;
  return {
    schema: PROJECT_SURFACE_CONTRACT.draftSchema,
    ok: true,
    draft: draft.value,
    evidence: {
      root: normalizedRoot,
      qualified: true,
      heuristic: true,
      roles: governingDocuments.map((document) => document.role),
      dataCandidateCount: dataCandidates.length,
      otherFileCount: otherFiles.length,
      gitRemotes: gitRemotes(normalizedRoot),
      ...(options.note ? { note: text(options.note, 1_000) } : {}),
    },
  };
}

export function discoverProjectSurfaceDrafts(root) {
  const normalizedRoot = text(root, 1_024);
  if (!normalizedRoot) return [];
  try {
    const rootStat = statSync(normalizedRoot);
    if (!rootStat.isDirectory()) return [];
  } catch {
    return [];
  }
  const drafts = [];
  try {
    const entries = readdirSync(normalizedRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const draft = generateProjectSurfaceDraft(join(normalizedRoot, entry.name));
      if (draft.ok) drafts.push(draft);
    }
  } catch {
    return [];
  }
  return drafts;
}

function readExcerpt(filePath, headLines, tailLineCount) {
  let content;
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      return { exists: true, bytes: stat.size, excerpt: null, tail: null, code: "not-a-file" };
    }
    content = readFileSync(filePath, "utf8").slice(0, MAX_EXCERPT_BYTES);
  } catch (readError) {
    return { exists: existsSync(filePath), bytes: 0, excerpt: null, tail: null, code: readError.code || "unreadable" };
  }
  const lines = content.split(/\r?\n/u);
  const excerpt = lines.slice(0, headLines);
  const tail = tailLineCount > 0 ? lines.slice(-tailLineCount) : [];
  return {
    exists: true,
    bytes: Buffer.byteLength(content, "utf8"),
    excerpt,
    tail,
    truncated: lines.length > headLines || content.length >= MAX_EXCERPT_BYTES,
  };
}

export function readProjectSurfacePage(surface) {
  if (!surface || surface.schema !== PROJECT_SURFACE_CONTRACT.surfaceSchema) {
    return error("project-surface-required");
  }
  const markers = surface.identityMarkers.map((path) => {
    let exists = false;
    try {
      exists = statSync(join(surface.root, path)).isFile();
    } catch {
      exists = false;
    }
    return { path, exists };
  });
  const documents = surface.governingDocuments.map((document) => {
    const excerpt = readExcerpt(join(surface.root, document.path), document.excerptLines, document.tailLines);
    return {
      role: document.role,
      path: document.path,
      label: document.label || null,
      required: document.required,
      ...excerpt,
    };
  });
  const dataSources = surface.dataSources.map((source) => {
    let bytes = 0;
    let exists = false;
    let isDirectory = false;
    try {
      const stat = statSync(join(surface.root, source.path));
      exists = true;
      isDirectory = stat.isDirectory();
      if (!isDirectory) bytes = stat.size;
    } catch {
      exists = false;
    }
    return {
      name: source.name,
      path: source.path,
      format: source.format,
      label: source.label || null,
      exists,
      isDirectory,
      bytes,
    };
  });
  return {
    schema: "mousecat.project-surface.page/1",
    ok: true,
    page: {
      surfaceId: surface.surfaceId,
      projectRef: surface.projectRef,
      projectKind: surface.projectKind,
      root: surface.root,
      identityMarkers: markers,
      governingDocuments: documents,
      dataSources,
    },
  };
}

function summarizeJsonl(content, maxBytes) {
  const lines = content.split(/\r?\n/u);
  const rows = [];
  let nonEmptyRows = 0;
  let parseFailures = 0;
  const keys = new Set();
  for (const line of lines) {
    if (!line.trim()) continue;
    nonEmptyRows += 1;
    if (rows.length < 5) {
      try {
        const parsed = JSON.parse(line);
        rows.push(parsed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const key of Object.keys(parsed).slice(0, 32)) {
            if (keys.size < 32) keys.add(key);
          }
        }
      } catch {
        parseFailures += 1;
      }
    }
  }
  return {
    format: "jsonl",
    rows: nonEmptyRows,
    truncated: content.length >= maxBytes,
    parseFailures,
    keys: [...keys],
    sampleRows: rows,
  };
}

function summarizeJson(content, maxBytes) {
  let parsed = null;
  let parseFailures = 0;
  try {
    parsed = JSON.parse(content);
  } catch {
    parseFailures = 1;
  }
  if (Array.isArray(parsed)) {
    const keys = new Set();
    for (const row of parsed.slice(0, 50)) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        for (const key of Object.keys(row).slice(0, 32)) {
          if (keys.size < 32) keys.add(key);
        }
      }
    }
    return {
      format: "json",
      rows: parsed.length,
      truncated: content.length >= maxBytes,
      parseFailures,
      keys: [...keys],
      sampleRows: parsed.slice(0, 3),
    };
  }
  if (parsed && typeof parsed === "object") {
    return {
      format: "json",
      rows: null,
      truncated: content.length >= maxBytes,
      parseFailures,
      keys: Object.keys(parsed).slice(0, 32),
      sampleRows: [parsed],
    };
  }
  return {
    format: "json",
    rows: null,
    truncated: content.length >= maxBytes,
    parseFailures,
    keys: [],
    sampleRows: parsed === null ? [] : [parsed],
  };
}

function summarizeText(content, maxBytes) {
  const lines = content.split(/\r?\n/u);
  return {
    format: "text",
    rows: null,
    truncated: content.length >= maxBytes,
    parseFailures: 0,
    keys: [],
    sampleRows: lines.slice(0, 40),
  };
}

export function summarizeProjectDataSource(surface, sourceName) {
  if (!surface || surface.schema !== PROJECT_SURFACE_CONTRACT.surfaceSchema) {
    return error("project-surface-required");
  }
  const source = surface.dataSources.find((candidate) => candidate.name === sourceName);
  if (!source) {
    return error("project-surface-data-source-unknown", { source: sourceName || null });
  }
  const target = join(surface.root, source.path);
  let bytes = 0;
  let isDirectory = false;
  try {
    const stat = statSync(target);
    isDirectory = stat.isDirectory();
    if (!isDirectory) bytes = stat.size;
  } catch {
    return {
      schema: "mousecat.project-data-summary/1",
      ok: true,
      summary: {
        name: source.name,
        format: source.format,
        exists: false,
        isDirectory: false,
        bytes: 0,
        files: 0,
        rows: 0,
      },
    };
  }
  if (isDirectory) {
    let files = 0;
    let totalBytes = 0;
    const fileNames = [];
    try {
      const entries = readdirSync(target, { withFileTypes: true });
      for (const entry of entries.slice(0, 200)) {
        if (!entry.isFile()) continue;
        files += 1;
        if (fileNames.length < 25) fileNames.push(entry.name);
        try {
          totalBytes += statSync(join(target, entry.name)).size;
        } catch {
          totalBytes += 0;
        }
      }
    } catch {
      files = 0;
    }
    return {
      schema: "mousecat.project-data-summary/1",
      ok: true,
      summary: {
        name: source.name,
        format: source.format,
        exists: true,
        isDirectory: true,
        files,
        bytes: totalBytes,
        fileNames,
        note: "directory source: file list only; file data loads by explicit path",
      },
    };
  }
  let content = "";
  try {
    content = readFileSync(target, "utf8").slice(0, source.maxBytes);
  } catch (readError) {
    return {
      schema: "mousecat.project-data-summary/1",
      ok: true,
      summary: {
        name: source.name,
        format: source.format,
        exists: true,
        isDirectory: false,
        bytes,
        code: readError.code || "unreadable",
      },
    };
  }
  const parsed = source.format === "jsonl"
    ? summarizeJsonl(content, source.maxBytes)
    : source.format === "json"
      ? summarizeJson(content, source.maxBytes)
      : summarizeText(content, source.maxBytes);
  return {
    schema: "mousecat.project-data-summary/1",
    ok: true,
    summary: {
      name: source.name,
      format: source.format,
      exists: true,
      isDirectory: false,
      bytes,
      ...parsed,
    },
  };
}
