"use strict";
const { readContinuity } = require("./continuity.cjs");
const { createOperations } = require("./operations/index.cjs");
const engine = require("./engine.cjs");
const { observeRemoteEvidence } = require("./remote-standing.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");

async function readDrift(root) {
  try {
    const versionFile = path.join(root, "VERSION"), packageFile = path.join(root, "package.json");
    if ((await fs.stat(versionFile)).size > 256 || (await fs.stat(packageFile)).size > 128 * 1024) return null;
    const version = (await fs.readFile(versionFile, "utf8")).trim();
    const pkg = JSON.parse(await fs.readFile(packageFile, "utf8"));
    return version && typeof pkg.version === "string" ? { versionFile: version, packageJson: pkg.version, readme: null, inSync: version === pkg.version } : null;
  } catch { return null; }
}

async function inspectRoot(root) {
  try {
    if (!(await fs.stat(root)).isDirectory()) return { status: "not-directory" };
    try { await fs.lstat(path.join(root, ".git")); return { status: "observed", hasGitMarker: true }; }
    catch (error) { if (error.code === "ENOENT") return { status: "observed", hasGitMarker: false }; throw error; }
  } catch (error) { return { status: error.code === "ENOENT" ? "missing" : "unavailable" }; }
}

function createWorkspace({ operations = createOperations(), readState = engine.projectState, drift = readDrift, inspect = inspectRoot, remoteStanding = observeRemoteEvidence, repositoryObserver = null } = {}) {
  if (repositoryObserver !== null) throw new Error("Repository evaluator is not selected in this release");
  return async function snapshot() {
    const catalog = await operations.catalog();
    const objects = [];
    for (const entry of catalog.objects) {
      const object = { ...entry, observation: { status: "unconfigured" }, continuity: catalog.source?.path ? await readContinuity({ manifestPath: catalog.source.path, id: entry.id }) : null };
      if (object.continuity?.catalogSha256 && object.continuity.catalogSha256 !== catalog.source.sha256) object.continuity = { schema: "mc.operations.continuity/1", status: "unavailable", observedAt: new Date().toISOString(), code: "CATALOG_CHANGED", records: [], directives: [], sources: [], heads: [], issues: [] };
      if (entry.root) {
        try {
          const source = await inspect(entry.root);
          if (source.status !== "observed") { object.observation = { status: "unavailable", sourceStatus: source.status }; objects.push(object); continue; }
          // The selected source boundary has no Git marker. Do not inherit an
          // ancestor repository's HEAD or reinterpret a denied Git probe as clean.
          const state = source.hasGitMarker ? await readState(entry.root) : { isRepo: false, dirty: null, remotes: [], observation: { status: "observed", scm: "not-configured" } };
          const stateObservedAt = new Date().toISOString();
          const remote = state.isRepo ? await remoteStanding(state.remotes) : null;
          const selected = { isRepo: state.isRepo, branch: state.branch, dirty: state.dirty,
            remotes: state.remotes, headSha: state.headSha, zeroCommit: state.zeroCommit,
            ahead: state.ahead, behind: state.behind, upstream: state.upstream, lastCommit: state.lastCommit,
            remoteStanding: typeof remote === "string" ? remote : remote?.standing || "unknown",
            remoteObservation: remote?.observation || "unreported", remoteEvaluation: remote?.evaluation || "unreported",
            drift: await drift(entry.root), observation: state.observation };
          object.observation = typeof state.isRepo === "boolean" && state.observation?.status !== "unavailable" ? { status: "observed", state: selected } : { status: "unavailable" };
        } catch { object.observation = { status: "unavailable" }; }
      }
      objects.push(object);
    }
    return { schema: "mc.workspace/1", observedAt: new Date().toISOString(), catalogSource: catalog.source, objects,
      runtime: catalog.runtime, consistency: catalog.consistency };
  };
}
module.exports = { createWorkspace };
