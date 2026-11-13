"use strict";
const fs = require("node:fs/promises");
const { readContinuity } = require("../continuity.cjs");
const { observeRemoteEvidence } = require("../remote-standing.cjs");
const { assertOwnWorktreeRoot, assertReadOnlyGitIntegrations } = require("../git-read-admission.cjs");
const path = require("node:path");
const net = require("node:net");
const { execFile } = require("node:child_process");
const { createHash } = require("node:crypto");

const MAX_FILE = 128 * 1024;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const DOCUMENTS = ["AGENTS.md", "CORE.md", "ARCHITECTURE.md", "GOVERNANCE.md", "SESSION_STATE.md", "ROADMAP.md"];
const sha256 = data => createHash("sha256").update(data).digest("hex");
const errorCode = e => String(e && (e.code || e.name) || "unavailable");

async function readBounded(file) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_FILE) throw Object.assign(new Error("file exceeds observation limit"), { code: "LIMIT" });
    const data = Buffer.alloc(MAX_FILE + 1);
    const { bytesRead } = await handle.read(data, 0, data.length, 0);
    if (bytesRead > MAX_FILE) throw Object.assign(new Error("file exceeds observation limit"), { code: "LIMIT" });
    return { data: data.subarray(0, bytesRead), stat };
  } finally { await handle.close(); }
}

async function loadCatalog(file) {
  const { data } = await readBounded(file);
  const doc = JSON.parse(data.toString("utf8"));
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.objects) || doc.objects.length > 32) throw new Error("invalid operations catalog");
  const ids = new Set();
  let serviceCount = 0;
  for (const obj of doc.objects) {
    if (!obj || typeof obj.id !== "string" || !ID.test(obj.id) || ids.has(obj.id) || typeof obj.label !== "string" || !["project", "repository", "runtime"].includes(obj.kind)) throw new Error("invalid or duplicate catalog object");
    ids.add(obj.id);
    if (obj.root != null && (typeof obj.root !== "string" || !obj.root)) throw new Error("invalid source root");
    if (obj.services != null && (!Array.isArray(obj.services) || obj.services.length > 8)) throw new Error("invalid services");
    for (const svc of obj.services || []) {
      if (++serviceCount > 32) throw new Error("service observation limit exceeded");
      if (!svc || typeof svc.id !== "string" || !ID.test(svc.id) || !Number.isInteger(svc.port) || svc.port < 1 || svc.port > 65535) throw new Error("invalid service probe");
    }
    for (const link of obj.relationships || []) {
      if (!link || !["part-of", "uses", "associated-with", "runtime-of"].includes(link.kind) || typeof link.target !== "string" || !ID.test(link.target) || typeof link.source !== "string") throw new Error("invalid relationship");
    }
  }
  for (const obj of doc.objects) for (const link of obj.relationships || []) if (!ids.has(link.target)) throw new Error("unknown relationship target");
  return { schema: "mc.operations.catalog/1", source: { path: file, sha256: sha256(data) }, objects: doc.objects.map(obj => ({
    id: obj.id, label: obj.label, kind: obj.kind,
    responsibility: typeof obj.responsibility === "string" ? obj.responsibility : null,
    authority: typeof obj.authority === "string" ? obj.authority : "unconfirmed",
    root: obj.root == null ? null : path.resolve(path.dirname(file), obj.root),
    relationships: (obj.relationships || []).map(link => ({ kind: link.kind, target: link.target, source: link.source })),
    services: (obj.services || []).map(service => ({ id: service.id, port: service.port })),
  })) };
}

function gitRead(root, args, { input = null, raw = false } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  env.GIT_TERMINAL_PROMPT = "0";
  return new Promise(resolve => {
    const child = execFile("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
      cwd: root, windowsHide: true, timeout: 2500, maxBuffer: 256 * 1024,
      env,
    }, (error, stdout) => resolve(error ? { status: "unavailable", code: errorCode(error) } : { status: "observed", value: raw ? String(stdout) : stdout.trim() }));
    if (input !== null) { child.stdin.on("error", () => {}); child.stdin.end(input); }
  });
}

async function documentEvidence(root, name) {
  try {
    const { data, stat } = await readBounded(path.join(root, name));
    return { file: name, status: "observed", bytes: data.length, modifiedAt: stat.mtime.toISOString(), sha256: sha256(data) };
  } catch (e) { return { file: name, status: e.code === "ENOENT" ? "missing" : "unavailable", code: errorCode(e) }; }
}

async function repository(root) {
  // A selected source directory must not borrow an ancestor repository's identity.
  try { await fs.lstat(path.join(root, ".git")); }
  catch (error) { return { status: error.code === "ENOENT" ? "not-configured" : "unavailable", ...(error.code === "ENOENT" ? {} : { code: errorCode(error) }) }; }
  const inside = await gitRead(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== "observed") return inside;
  if (inside.value !== "true") return { status: "not-worktree" };
  try {
    const admittedRead = async (target, args, opts = {}) => {
      const result = await gitRead(target, args, { ...opts, raw: true });
      if (result.status !== "observed") throw Object.assign(new Error("Git source observation unavailable."), { code: result.code === "1" ? 1 : result.code });
      return result.value;
    };
    await assertOwnWorktreeRoot(root, admittedRead);
    await assertReadOnlyGitIntegrations(root, admittedRead);
  } catch (error) { return { status: "unavailable", code: "GIT_INTEGRATIONS", reason: error.message }; }
  const head = await gitRead(root, ["rev-parse", "--verify", "HEAD"]);
  const branch = await gitRead(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const work = await gitRead(root, ["status", "--porcelain=v1", "--untracked-files=normal"]);
  return { status: "observed", head: head.status === "observed" ? head.value : null,
    headStatus: head.status, branch: branch.status === "observed" ? branch.value : null,
    worktree: work.status === "observed" ? { status: "observed", dirty: work.value.length > 0, changedEntries: work.value ? work.value.split("\n").length : 0 } : work };
}

async function dependencies(root) {
  try {
    const { data } = await readBounded(path.join(root, "package.json"));
    const pkg = JSON.parse(data.toString("utf8"));
    const names = value => Object.keys(value || {}).sort();
    let installation;
    try { installation = { status: "observed", nodeModulesPresent: (await fs.stat(path.join(root, "node_modules"))).isDirectory() }; }
    catch (e) { installation = { status: e.code === "ENOENT" ? "missing" : "unavailable", code: errorCode(e) }; }
    return { status: "observed", packageName: typeof pkg.name === "string" ? pkg.name : null,
      packageVersion: typeof pkg.version === "string" ? pkg.version : null,
      dependencies: names(pkg.dependencies), devDependencies: names(pkg.devDependencies),
      scriptNames: names(pkg.scripts), installation,
      installationQualified: false, sourceSha256: sha256(data) };
  } catch (e) { return { status: e.code === "ENOENT" ? "not-declared" : "unavailable", code: errorCode(e) }; }
}

function probe(service) {
  const at = Date.now();
  return new Promise(resolve => {
    const socket = net.createConnection({ host: "127.0.0.1", port: service.port });
    let complete = false;
    const finish = (status, code = null) => {
      if (complete) return;
      complete = true; socket.destroy();
      resolve({ id: service.id, port: service.port, host: "127.0.0.1", status, code,
        elapsedMs: Date.now() - at, observedAt: new Date().toISOString(), applicationHealth: "not-probed", start: "not-exposed" });
    };
    socket.setTimeout(700, () => finish("unavailable", "TIMEOUT"));
    socket.once("connect", () => finish("reachable"));
    socket.once("error", e => finish(e.code === "ECONNREFUSED" ? "not-listening" : "unavailable", errorCode(e)));
  });
}

function createOperations({ manifestPath = process.env.MC_OPERATIONS_MANIFEST || path.resolve(__dirname, "../../.local/operations.json"), pbCoreUrl = "http://127.0.0.1:7320/v1/status" } = {}) {
  const endpoint = new URL(pbCoreUrl);
  if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.username || endpoint.password || endpoint.pathname !== "/v1/status" || endpoint.search || endpoint.hash) throw new Error("pb-core must use the loopback status endpoint");
  const catalog = async () => ({ ...await loadCatalog(manifestPath), observedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch }, consistency: "independent observations; no source lock" });
  const project = async id => {
    const doc = await catalog();
    const obj = doc.objects.find(item => item.id === id);
    if (!obj) throw new Error("unknown catalog object");
    const continuity = await readContinuity({ manifestPath, id });
    if (continuity.catalogSha256 && continuity.catalogSha256 !== doc.source.sha256) Object.assign(continuity, { status: "unavailable", code: "CATALOG_CHANGED", records: [], directives: [], heads: [], issues: [] });
    const result = { schema: "mc.operations.object/1", observedAt: new Date().toISOString(), catalogSource: doc.source, object: obj, continuity };
    if (!obj.root) return { ...result, source: { status: "unconfigured" } };
    try {
      if (!(await fs.stat(obj.root)).isDirectory()) return { ...result, source: { status: "not-directory" } };
    } catch (e) { return { ...result, source: { status: e.code === "ENOENT" ? "missing" : "unavailable", code: errorCode(e) } }; }
    const git = await repository(obj.root);
    const evidence = [];
    for (const name of DOCUMENTS) evidence.push(await documentEvidence(obj.root, name));
    let version = null;
    try { const { data } = await readBounded(path.join(obj.root, "VERSION")); version = data.toString("utf8").trim().slice(0, 128); } catch {}
    const declared = await dependencies(obj.root);
    return { ...result, source: { status: "observed", git, version, documents: evidence, dependencies: declared,
      versionAgreement: version && declared.packageVersion ? { status: "observed", inSync: version === declared.packageVersion } : { status: "unknown" } } };
  };
  const services = async () => {
    const doc = await catalog(); const results = [];
    for (const obj of doc.objects) for (const service of obj.services) results.push({ objectId: obj.id, ...await probe(service) });
    return { schema: "mc.operations.services/1", observedAt: new Date().toISOString(), catalogSource: doc.source, services: results };
  };
  const fleet = async () => {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(1500), redirect: "error" });
      if (!response.ok) throw new Error("HTTP_" + response.status);
      const reader = response.body.getReader(); const chunks = []; let bytes = 0;
      try {
        while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 2 * 1024 * 1024) throw new Error("status exceeds observation limit"); chunks.push(Buffer.from(chunk.value)); }
      } finally { await reader.cancel().catch(() => {}); }
      const doc = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (doc.schemaVersion !== 1 || !Array.isArray(doc.projects) || !Array.isArray(doc.families) || !doc.generatedAt || !Number.isFinite(Date.parse(doc.generatedAt))) throw new Error("invalid pb-core status document");
      const M = (await import("../../engine/model.mjs")).default;
      const projects = await Promise.all(doc.projects.map(async project => {
        const remote = await observeRemoteEvidence(project.remotes);
        return { ...project, remoteStanding: remote.standing, remoteObservation: remote.observation, remoteEvaluation: remote.evaluation };
      }));
      const interpreted = { ...doc, projects };
      const ageSeconds = Math.max(0, (Date.now() - Date.parse(doc.generatedAt)) / 1000);
      let catalogCoverage;
      try { const catalogDoc = await catalog(); catalogCoverage = { status: "observed", catalogSource: catalogDoc.source,
        objects: catalogDoc.objects.map(obj => ({ id: obj.id, directProducerMatch: doc.projects.some(p => p.id === obj.id) })) }; }
      catch { catalogCoverage = { status: "unavailable" }; }
      return { schema: "mc.operations.fleet/1", status: "observed", source: endpoint.href, observedAt: new Date().toISOString(), generatedAt: doc.generatedAt,
        ageSeconds, stale: ageSeconds > 30, catalogCoverage, families: doc.families.map(f => ({ family: f.family, ...M.freshness(f) })),
        summary: M.fleetSummary(interpreted), projects: projects.map(p => ({ id: p.id, health: M.rollupHealth(p, interpreted), safety: M.safetyMeter(p) })) };
    } catch (e) { return { schema: "mc.operations.fleet/1", status: "unavailable", source: endpoint.href, code: errorCode(e), observedAt: new Date().toISOString(), sampleUsed: false }; }
  };
  return { catalog, project, services, fleet };
}
module.exports = { createOperations, loadCatalog };
