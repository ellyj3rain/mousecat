export const CANONICAL_PACK = Object.freeze([
  "MEMORY.md",
  "CORE.md",
  "ARCHITECTURE.md",
  "GOVERNANCE.md",
  "DECISION_REGISTRY.md",
  "FINDINGS.md",
  "BATCH_LOG.md",
  "ROADMAP.md",
  "SESSION_STATE.md",
  "VERSION",
]);

export const APPEND_ONLY = Object.freeze([
  "BATCH_LOG.md",
  "DECISION_REGISTRY.md",
  "FINDINGS.md",
]);

const META = new Set([
  ".gitattributes",
  ".gitignore",
  "LICENSE",
  "package-lock.json",
]);

const ALLOWED_LOCAL_REFS = new Set([
  ".mousecat/",
  "artifacts/local/",
  "mousecat.config.json",
  "runtime/",
  "traces/",
]);

function isDoc(path) {
  return CANONICAL_PACK.includes(path) || path.endsWith(".md") || path.startsWith("docs/");
}

function isSubstantive(path) {
  return !isDoc(path) && !META.has(path) && path !== "VERSION";
}

const REPO_EXT = /\.(cjs|css|html|js|json|md|mjs|sh|ts|txt|ya?ml)$/u;

function looksInternal(token) {
  if (!token || /[\s()[\]{}<>]/u.test(token)) return false;
  if (/^[a-z]+:\/\//iu.test(token) || token.startsWith("#") || token.startsWith("mailto:")) return false;
  if (/^[/.]+$/u.test(token)) return false;
  return REPO_EXT.test(token) || token.endsWith("/") || ALLOWED_LOCAL_REFS.has(token);
}

function normalizeRef(token) {
  return token
    .replace(/^\.\//u, "")
    .replace(/[#:].*$/u, "")
    .replace(/\/+$/u, (match) => match);
}

export function extractReferences(text) {
  const refs = new Set();
  const source = String(text || "");
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) refs.add(match[1].trim());
  for (const match of source.matchAll(/`([^`]+)`/gu)) refs.add(match[1].trim());
  return [...refs]
    .map((token) => token.trim())
    .filter(looksInternal)
    .map(normalizeRef);
}

function dirOf(path) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function resolveFrom(docPath, ref) {
  const base = ref.startsWith("/")
    ? ref.slice(1)
    : `${dirOf(docPath) ? `${dirOf(docPath)}/` : ""}${ref}`;
  const parts = [];

  for (const segment of base.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }

  return `${parts.join("/")}${ref.endsWith("/") ? "/" : ""}`;
}

function refResolves(docPath, ref, fileSet, files) {
  if (ALLOWED_LOCAL_REFS.has(ref)) return true;

  const candidates = [resolveFrom(docPath, ref), ref.replace(/^\.?\//u, "")];
  for (const candidate of candidates) {
    if (ALLOWED_LOCAL_REFS.has(candidate)) return true;
    if (candidate.endsWith("/")) {
      if (files.some((file) => file.startsWith(candidate))) return true;
    } else if (fileSet.has(candidate) || files.includes(candidate)) {
      return true;
    }
  }

  return false;
}

function normalizeContent(value) {
  return String(value == null ? "" : value).replace(/\r\n/gu, "\n");
}

export function runDocChecks(changeset = {}) {
  const files = Array.isArray(changeset.files) ? changeset.files : [];
  const fileSet = new Set(files);
  const changed = Array.isArray(changeset.changed) ? changeset.changed : [];
  const changedPaths = new Set(changed.map((change) => change.path));
  const headContent = typeof changeset.headContent === "function" ? changeset.headContent : () => null;
  const baseContent = typeof changeset.baseContent === "function" ? changeset.baseContent : () => null;
  const checks = [];
  const add = (id, level, ok, message) => checks.push({ id, level, ok, message });

  const missing = CANONICAL_PACK.filter((member) => !fileSet.has(member));
  add(
    "doc-pack-complete",
    "error",
    missing.length === 0,
    missing.length > 0 ? `doc-pack missing: ${missing.join(", ")}` : "doc-pack complete",
  );

  const substantive = changed
    .filter((change) => change.status !== "D" && isSubstantive(change.path))
    .map((change) => change.path);
  const batchTouched = changedPaths.has("BATCH_LOG.md");
  add(
    "source-change-documented",
    substantive.length > 0 ? "error" : "warn",
    substantive.length === 0 || batchTouched,
    substantive.length === 0
      ? "no substantive source change detected"
      : batchTouched
        ? "substantive change is accompanied by BATCH_LOG.md"
        : `substantive change without BATCH_LOG.md: ${substantive.slice(0, 6).join(", ")}`,
  );

  const versionChanged = changedPaths.has("VERSION");
  if (versionChanged && !batchTouched) {
    add("version-batch-together", "error", false, "VERSION changed without BATCH_LOG.md");
  } else if (batchTouched && !versionChanged) {
    add("version-batch-together", "warn", false, "BATCH_LOG.md changed without VERSION; confirm version-preserving batch");
  } else {
    add("version-batch-together", "warn", true, "VERSION and BATCH_LOG movement are consistent");
  }

  const rewrites = [];
  for (const path of APPEND_ONLY) {
    if (!changedPaths.has(path)) continue;
    const base = normalizeContent(baseContent(path));
    if (!base) continue;
    const head = normalizeContent(headContent(path));
    if (!head.startsWith(base)) rewrites.push(path);
  }
  add(
    "append-only-preserved",
    "error",
    rewrites.length === 0,
    rewrites.length > 0 ? `append-only ledger rewritten: ${rewrites.join(", ")}` : "append-only ledgers preserved",
  );

  const dangling = [];
  for (const change of changed) {
    if (change.status === "D" || !isDoc(change.path)) continue;
    let text = headContent(change.path);
    if (text == null) continue;
    if (APPEND_ONLY.includes(change.path)) {
      const base = normalizeContent(baseContent(change.path));
      const head = normalizeContent(text);
      text = base && head.startsWith(base) ? head.slice(base.length) : head;
    }
    for (const ref of extractReferences(text)) {
      if (!refResolves(change.path, ref, fileSet, files)) dangling.push(`${change.path} -> ${ref}`);
    }
  }
  add(
    "doc-references-resolve",
    "error",
    dangling.length === 0,
    dangling.length > 0
      ? `documentation references missing paths: ${dangling.slice(0, 8).join("; ")}`
      : "documentation references resolve",
  );

  const title = String(changeset.title || "");
  const hasPrefix = /^\s*\[(A\d[\w.]*|W\d[\w.]*|HOTFIX|CHORE|DOCS)\]/iu.test(title);
  add(
    "batch-prefix-present",
    "warn",
    hasPrefix || !title,
    title ? (hasPrefix ? "title carries batch prefix" : `title has no batch prefix: ${title.slice(0, 80)}`) : "no title supplied",
  );

  const errors = checks.filter((check) => check.level === "error" && !check.ok).length;
  const warnings = checks.filter((check) => check.level === "warn" && !check.ok).length;
  return { ok: errors === 0, checks, errors, warnings };
}

export default {
  APPEND_ONLY,
  CANONICAL_PACK,
  extractReferences,
  runDocChecks,
};
