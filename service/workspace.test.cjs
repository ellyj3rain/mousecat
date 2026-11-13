"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createWorkspace } = require("./workspace.cjs");
const { activeWorkspace, workspaceSummary, scopedInterpretation } = require("../engine/workspace.mjs");
const shared = require("../engine/model.mjs").default;

test("active work is a derived view; legacy input and unknown source facts are preserved separately", () => {
  const at = new Date().toISOString();
  const raw = { generatedAt: at, projects: [{ id: "GZS-WebDev", group: "web" }, { id: "NEO", group: "legacy" }, { id: "neo", path: "/old", dirty: 2 }], services: [] };
  const before = JSON.stringify(raw);
  const workspace = { observedAt: at, objects: [{ id: "neo", label: "neo", root: null, observation: { status: "unconfigured" } }, { id: "mc", label: "Marshmallow Commons", kind: "project", root: "/selected", observation: { status: "observed", state: { isRepo: true, dirty: 3, remotes: ["origin"], remoteStanding: "configured-unverified", headSha: "actual", drift: { inSync: true } } } }] };
  const view = activeWorkspace(raw, workspace);
  assert.deepEqual(view.projects.map(p => p.id), ["mc"]);
  assert.equal(view.projects[0].dirty, 3);
  assert.equal(view.projects[0].lossRisk, "none");
  assert.equal(JSON.stringify(raw), before);
  assert.equal(workspaceSummary(view).pending, 1);
  assert.equal(workspaceSummary(view).observedAt, at);
  assert.deepEqual(activeWorkspace(raw, null).projects.map(p => p.id), []);
  assert.equal(activeWorkspace(raw, workspace, "unavailable").projects.length, 0);
  assert.equal(activeWorkspace(raw, workspace, "live", Date.parse(at) + 46000).projects.length, 0);
});

test("source rebinding cannot borrow a same-ID project's old drift or health", () => {
  const at = new Date().toISOString();
  const raw = { generatedAt: at, projects: [{ id: "neo", path: "/old", drift: { inSync: false } }] };
  const workspace = { observedAt: at, objects: [{ id: "neo", root: "/new", observation: { status: "observed", state: { isRepo: true, dirty: 0, remotes: [] } } }] };
  assert.equal(activeWorkspace(raw, workspace).projects.length, 1);
  assert.equal(activeWorkspace(raw, workspace).projects[0].drift, null);
  workspace.objects[0].root = "/old";
  assert.equal(activeWorkspace(raw, workspace).projects[0].drift.inSync, false);
});

test("legacy and sibling credential alerts do not become another project's health", () => {
  const model = scopedInterpretation(shared);
  const mk = (id, root) => ({ id, path: root, isRepo: true, dirty: 0, branch: "main", remotes: ["origin"], remoteStanding: "configured-unverified", lossRisk: "none", drift: { inSync: true } });
  const a = mk("mc", "/work/mc"), b = mk("neo", "/work/neo");
  const doc = { projects: [a, b], services: [], families: [], secrets: [{ path: "/old-web/.env", present: true, severity: "critical" }, { path: "/work/neo/.env", present: true, severity: "critical" }] };
  assert.equal(model.rollupHealth(a, doc).health, "ok");
  assert.equal(model.rollupHealth(b, doc).health, "risk");
  assert.deepEqual(model.fleetSummary(doc), { risk: 1, attention: 0, neutral: 0, ok: 1, total: 2 });
  assert.equal(doc.secrets.length, 2);
});

test("passive workspace snapshots reread the catalog and never inspect an unbound root", async () => {
  let rev = 0; const reads = [];
  const snapshot = createWorkspace({ inspect: async () => ({ status: "observed", hasGitMarker: true }), operations: { catalog: async () => ({ source: { path: "private", sha256: String(rev) }, objects: [{ id: "mc", root: "/mc", label: "MC" }, { id: "example", root: null, label: "Example project" }] }) }, readState: async root => { reads.push(root); return { isRepo: true, dirty: rev, remotesDetailed: [{ url: "SECRET_SENTINEL" }] }; } });
  const first = await snapshot(); rev = 8; const next = await snapshot();
  assert.equal(first.objects[0].observation.state.dirty, 0);
  assert.equal(next.objects[0].observation.state.dirty, 8);
  assert.equal(next.catalogSource.sha256, "8");
  assert.equal(next.objects[1].observation.status, "unconfigured");
  assert.deepEqual(reads, ["/mc", "/mc"]);
  assert.equal(JSON.stringify(next).includes("SECRET_SENTINEL"), false);
});

test("source read failure remains unavailable rather than becoming a healthy project", async () => {
  const snapshot = createWorkspace({ inspect: async () => ({ status: "observed", hasGitMarker: true }), operations: { catalog: async () => ({ objects: [{ id: "neo", root: "/held" }] }) }, readState: async () => { throw new Error("denied"); } });
  const workspace = await snapshot();
  assert.equal(workspace.objects[0].observation.status, "unavailable");
  assert.equal(activeWorkspace({ projects: [] }, workspace).projects.length, 0);
  assert.equal(workspaceSummary(activeWorkspace({ projects: [] }, workspace)).unavailable, 1);
});

test("unselected repository evaluators cannot be activated by a caller", () => {
  assert.throws(() => createWorkspace({repositoryObserver:async()=>({standing:"current-local-same-head"})}), /not selected/);
});

test("non-npm repositories remain visible with version consistency explicitly unknown", () => {
  const workspace = { observedAt: new Date().toISOString(), objects: [{ id: "python", label: "Python work", root: "/python", observation: { status: "observed", state: { isRepo: true, dirty: 2, remotes: ["origin"], drift: null } } }] };
  const view = activeWorkspace({ projects: [] }, workspace);
  assert.equal(view.projects.length, 1);
  assert.equal(view.projects[0].drift, null);
  const model = scopedInterpretation(shared);
  const version = model.safetyMeter(view.projects[0]).find(segment => segment.key === "clean");
  assert.equal(version.ok, false); assert.equal(version.unknown, true);
  assert.match(version.plain, /not observed/);
  assert.equal(model.portraitDimensions(view.projects[0]).find(segment => segment.key === "clean").num, "unknown");
});

test("observed non-Git sources stay visible without borrowed commit/clean claims", async () => {
  let gitReads = 0;
  const snapshot = createWorkspace({ operations: { catalog: async () => ({ objects: [{ id: "example", root: "/source", label: "Example project" }, { id: "held", root: null }] }) }, inspect: async () => ({ status: "observed", hasGitMarker: false }), readState: async () => { gitReads++; throw Error("Must not probe ancestor Git"); }, drift: async () => null });
  const workspace = await snapshot(); assert.equal(gitReads, 0);
  const view = activeWorkspace({ projects: [] }, workspace);
  assert.equal(view.projects[0].id, "example"); assert.equal(view.projects[0].isRepo, false);
  assert.equal(view.projects[0].lossRisk, "not-git"); assert.equal(view.projects[0].lastCommit, null);
  const saved = scopedInterpretation(shared).safetyMeter(view.projects[0]).find(segment => segment.key === "saved");
  assert.equal(saved.unknown, true); assert.match(saved.plain, /not observed/);
  assert.equal(workspace.objects[1].observation.status, "unconfigured");
});

test("denied root inspection cannot degrade into an observed non-Git source", async () => {
  let probes = 0;
  const snapshot = createWorkspace({ operations: { catalog: async () => ({ objects: [{ id: "held", root: "/held" }] }) }, inspect: async () => ({ status: "unavailable" }), readState: async () => { probes++; return { isRepo: false }; } });
  const workspace = await snapshot(); assert.equal(probes, 0);
  assert.equal(workspace.objects[0].observation.status, "unavailable");
  assert.equal(activeWorkspace({ projects: [] }, workspace).projects.length, 0);
});
