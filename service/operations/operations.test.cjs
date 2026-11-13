"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, execFileSync } = require("node:child_process");
const { createOperations, loadCatalog } = require("./index.cjs");
const { createHandler } = require("../mcp-server.cjs");
const M = require("../../engine/model.mjs").default;

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mc-operations-"));
  // Test scratch only; source, saves and retained operational evidence are not targets.
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "catalog.json");
  const save = async objects => fs.writeFile(file, JSON.stringify({ schemaVersion: 1, objects }));
  await save([{ id: "mc", label: "MC", kind: "project", root: "." }, { id: "example", label: "Example project", kind: "project", root: null }]);
  return { dir, file, save, ops: createOperations({ manifestPath: file }) };
}

test("catalog rereads changes, preserves distinct identities, rejects invalid bindings", async t => {
  const { ops, save, file } = await fixture(t);
  const initial = await ops.catalog();
  assert.equal(initial.objects[1].id, "example");
  assert.equal((await ops.project("example")).source.status, "unconfigured");
  await save([{ id: "pml", label: "PML", kind: "project" }]);
  assert.equal((await ops.catalog()).objects[0].id, "pml");
  assert.notEqual((await ops.catalog()).source.sha256, initial.source.sha256);
  await save([{ id: "mc", label: "MC", kind: "project", services: [{ id: "probe", port: 1234, token: "SECRET_SENTINEL" }], relationships: [{ kind: "uses", target: "mc", source: "fixture", env: { key: "SECRET_SENTINEL" } }] }]);
  assert.equal(JSON.stringify(await ops.catalog()).includes("SECRET_SENTINEL"), false);
  await assert.rejects(ops.project("../secret"), /unknown/);
  await save([{ id: "a", label: "A", kind: "project", relationships: [{ kind: "part-of", target: "missing", source: "test" }] }]);
  await assert.rejects(loadCatalog(file), /relationship/);
  await save([{ id: "a", label: "A", kind: "project", services: [{ id: "remote", port: 70000 }] }]);
  await assert.rejects(loadCatalog(file), /service/);
  await save([{ id: true, label: "Boolean", kind: "project" }]);
  await assert.rejects(loadCatalog(file), /catalog object/);
});

test("source reads report real pins and dirt while preserving all source bytes and index", async t => {
  const { ops, dir } = await fixture(t);
  const git = args => execFileSync("git", args, { cwd: dir, windowsHide: true }).toString().trim();
  git(["init", "-q"]);
  await fs.writeFile(path.join(dir, "VERSION"), "0.10.0\n");
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "fixture", version: "0.2.0", scripts: { build: "never execute this" }, dependencies: { react: "19" } }));
  git(["add", "VERSION", "package.json"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
  await fs.writeFile(path.join(dir, "VERSION"), "0.10.1\n");
  const before = git(["status", "--porcelain=v1"]);
  const indexBefore = await fs.readFile(path.join(dir, ".git/index"));
  const observed = await ops.project("mc");
  assert.equal(observed.source.git.head, git(["rev-parse", "HEAD"]));
  assert.equal(observed.source.git.worktree.dirty, true);
  assert.equal(observed.source.version, "0.10.1");
  assert.equal(observed.source.versionAgreement.inSync, false);
  assert.deepEqual(observed.source.dependencies.scriptNames, ["build"]);
  assert.equal(observed.source.dependencies.installationQualified, false);
  assert.equal(git(["status", "--porcelain=v1"]), before);
  assert.deepEqual(await fs.readFile(path.join(dir, ".git/index")), indexBefore);
  assert.equal(await fs.readFile(path.join(dir, "VERSION"), "utf8"), "0.10.1\n");
  const hook = path.join(dir, ".git/hooks/mc-fsmonitor");
  await fs.writeFile(hook, "#!/bin/sh\necho invoked > .git/mc-hook-invoked\nprintf '\\0'\n");
  await fs.chmod(hook, 0o755);
  git(["config", "core.fsmonitor", hook.replaceAll("\\", "/")]);
  await ops.project("mc");
  await assert.rejects(fs.stat(path.join(dir, ".git/mc-hook-invoked")), { code: "ENOENT" });
  const other = path.join(dir, "other"); await fs.mkdir(other);
  execFileSync("git", ["init", "-q", other], { windowsHide: true });
  const priorDir = process.env.GIT_DIR, priorTree = process.env.GIT_WORK_TREE;
  process.env.GIT_DIR = path.join(other, ".git"); process.env.GIT_WORK_TREE = other;
  try { assert.equal((await ops.project("mc")).source.git.head, observed.source.git.head); }
  finally {
    if (priorDir == null) delete process.env.GIT_DIR; else process.env.GIT_DIR = priorDir;
    if (priorTree == null) delete process.env.GIT_WORK_TREE; else process.env.GIT_WORK_TREE = priorTree;
  }
});

test("service probes send no bytes and distinguish application health from connectivity", async t => {
  const { ops, save } = await fixture(t);
  let bytes = 0;
  const server = require("node:net").createServer(socket => socket.on("data", data => { bytes += data.length; }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await save([{ id: "runtime", label: "Runtime", kind: "runtime", services: [{ id: "fixture", port }] }]);
  assert.equal((await ops.services()).services[0].status, "reachable");
  assert.equal((await ops.services()).services[0].applicationHealth, "not-probed");
  await new Promise(resolve => server.close(resolve));
  assert.equal(bytes, 0);
  assert.equal((await ops.services()).services[0].status, "not-listening");
});

test("fleet uses the shared MC model, flags stale input and never substitutes sample data", async t => {
  const doc = { schemaVersion: 1, generatedAt: new Date(Date.now() - 60000).toISOString(), projects: [{ id: "x", isRepo: true, lossRisk: "zero-commit", dirty: 1 }], families: [], secrets: [], services: [] };
  const server = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(doc)); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/v1/status`;
  const ops = createOperations({ pbCoreUrl: url });
  const result = await ops.fleet();
  assert.deepEqual(result.summary, M.fleetSummary(doc));
  assert.equal(result.stale, true);
  assert.deepEqual(result.projects[0].health, M.rollupHealth(doc.projects[0], doc));
  await new Promise(resolve => server.close(resolve));
  const missing = await ops.fleet();
  assert.equal(missing.status, "unavailable"); assert.equal(missing.sampleUsed, false);
  assert.throws(() => createOperations({ pbCoreUrl: "https://example.com/v1/status" }), /loopback/);
  const stalled = http.createServer(() => {});
  await new Promise(resolve => stalled.listen(0, "127.0.0.1", resolve));
  try {
    const timeout = await createOperations({ pbCoreUrl: `http://127.0.0.1:${stalled.address().port}/v1/status` }).fleet();
    assert.equal(timeout.status, "unavailable");
    assert.equal(timeout.code, String(new DOMException("timeout", "TimeoutError").code));
    assert.equal(typeof timeout.code, "string");
  } finally { stalled.closeAllConnections(); await new Promise(resolve => stalled.close(resolve)); }
});

test("MCP lifecycle, discovery, resources and invalid inputs use the same operational target", async t => {
  const { ops } = await fixture(t); const handle = createHandler(ops);
  const call = (method, params) => handle({ jsonrpc: "2.0", id: 1, method, params });
  assert.equal((await call("tools/list")).error.code, -32002);
  assert.equal((await call("initialize", { protocolVersion: "2025-06-18" })).result.protocolVersion, "2025-06-18");
  for (const version of ["2024-11-05", "2025-03-26"]) assert.equal((await call("initialize", { protocolVersion: version })).result.protocolVersion, version);
  assert.equal((await call("tools/list")).result.tools.length, 4);
  for (const tool of (await call("tools/list")).result.tools) assert.equal(tool.outputSchema.type, "object");
  assert.equal((await call("initialize", { protocolVersion: "2025-06-18" })).result.serverInfo.version, (await fs.readFile(path.resolve(__dirname, "../../VERSION"), "utf8")).trim());
  assert.equal((await call("initialize", { protocolVersion: "2025-06-18" })).result.serverInfo.name, "marshmallow-commons");
  assert.equal((await call("initialize", { protocolVersion: "2025-06-18" })).result.serverInfo.title, "Mousecat");
  assert.equal((await call("resources/list")).result.resources.length, 3);
  const resource = await call("resources/read", { uri: "mc://object/example" });
  assert.equal(JSON.parse(resource.result.contents[0].text).source.status, "unconfigured");
  assert.equal((await call("tools/call", { name: "mc_project", arguments: { id: "mc", path: "/other" } })).error.code, -32602);
  assert.equal((await call("tools/call", { name: "mc_apply", arguments: {} })).error.code, -32602);
  assert.equal((await call("resources/read", { uri: "file:///secret" })).error.code, -32602);
  assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});

test("real stdio server emits only framed MCP responses and exits on input closure", async t => {
  const { file } = await fixture(t);
  const child = spawn(process.execPath, [path.resolve(__dirname, "../mcp-server.cjs")], { windowsHide: true, env: { ...process.env, MC_OPERATIONS_MANIFEST: file } });
  t.after(() => { if (child.exitCode == null) child.kill(); });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(stderr))); });
  child.stdin.end([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "qualification", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "mc_catalog", arguments: {} } },
  ].map(JSON.stringify).join("\n") + "\n");
  await done;
  const responses = stdout.trim().split("\n").map(JSON.parse);
  assert.deepEqual(responses.map(r => r.id), [1, 2, 3]);
  assert.equal(responses[2].result.structuredContent.objects.length, 2);
  assert.equal(stderr, "");
});

test("selected non-Git source never borrows an ancestor repository identity", async t => {
  const { dir, save, ops } = await fixture(t);
  const git = args => execFileSync("git", args, { cwd: dir, windowsHide: true }).toString().trim();
  git(["init", "-q"]);
  await fs.writeFile(path.join(dir, "parent.txt"), "parent-owned source\n");
  git(["add", "parent.txt"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "parent"]);
  await fs.mkdir(path.join(dir, "inner"));
  await save([{ id: "mc", label: "Selected source", kind: "project", root: "inner" }]);
  const observed = await ops.project("mc");
  assert.equal(observed.source.status, "observed");
  assert.equal(observed.source.git.status, "not-configured");
  assert.equal(Object.hasOwn(observed.source.git, "head"), false);
});
