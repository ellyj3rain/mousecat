import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { checkInstalledRuntime } from "../scripts/installed-check.mjs";
import { runtimeInputFingerprint } from "../src/service/installed-identity.mjs";

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "mousecat-installed-check-"));
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(resolve(root, "src/operator/public"), { recursive: true });
  await mkdir(resolve(root, "src/service"), { recursive: true });
  await writeFile(resolve(root, "src/service/runner.mjs"), "// current runtime\n");
  await writeFile(resolve(root, "src/operator/public/index.html"), "<main>Current canvas</main>");
  const configPath = resolve(root, "config.json"), statePath = resolve(root, "state.json");
  await writeFile(configPath, JSON.stringify({ state: { enabled: true, path: statePath } }));
  await writeFile(resolve(root, "package.json"), JSON.stringify({ name: "mousecat-fixture" }));
  await writeFile(resolve(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }));
  const desktop = { RepositoryRoot: root, ConfigPath: configPath, Port: 4317 };
  const record = { serviceId: "mousecat-operator", pid: 123, workingDirectory: root, runnerPath: resolve(root, "src/service/runner.mjs"), configPath, port: 4317, startedAt: new Date(Date.now() + 1000).toISOString(), persistence: { enabled: true, path: statePath } };
  record.inputFingerprint = await runtimeInputFingerprint(root, configPath);
  const fetchImpl = async url => new Response(url.endsWith("/api/snapshot") ? JSON.stringify({ schema: "mousecat.operator-snapshot/2", status: { ok: true } }) : "<main>Current canvas</main>");
  return { repositoryRoot: root, desktop, record, fetchImpl, isAlive: () => true, ownsListener: () => true };
}

test("installed check accepts matching runtime, workspace and served source bytes", async t => {
  const result = await checkInstalledRuntime(await fixture(t));
  assert.equal(result.ok, true); assert.equal(result.assets.length, 1); assert.equal(result.assets[0].matches, true);
});

test("installed check refuses old checkout before contacting a preview endpoint", async t => {
  const options = await fixture(t); options.desktop.RepositoryRoot = resolve(options.repositoryRoot, "old-checkout");
  options.fetchImpl = () => { throw new Error("must not contact endpoint"); };
  const result = await checkInstalledRuntime(options);
  assert.equal(result.ok, false); assert.deepEqual(result.failures, ["desktop-checkout-mismatch"]);
});

test("installed check refuses a healthy server serving an older interface", async t => {
  const options = await fixture(t), healthyFetch = options.fetchImpl;
  options.fetchImpl = url => url.endsWith("/api/snapshot") ? healthyFetch(url) : new Response("<main>Old interface</main>");
  const result = await checkInstalledRuntime(options);
  assert.equal(result.ok, false); assert.deepEqual(result.failures, ["served-asset-mismatch:index.html"]);
});

test("installed check refuses changed runtime content even with preserved timestamps", async t => {
  const options = await fixture(t), path = options.record.runnerPath, before = await stat(path);
  await writeFile(path, "// changed runtime\n"); await utimes(path, before.atime, before.mtime);
  const result = await checkInstalledRuntime(options);
  assert.equal(result.ok, false); assert.ok(result.failures.includes("runtime-input-fingerprint-mismatch"));
});

test("installed check refuses healthy endpoint owned by another process", async t => {
  const options = await fixture(t); options.ownsListener = () => false;
  const result = await checkInstalledRuntime(options);
  assert.equal(result.ok, false); assert.ok(result.failures.includes("service-listener-identity-mismatch"));
});

test("startup fingerprint detects configuration, dependency and deleted-module changes", async t => {
  const options = await fixture(t), root = options.repositoryRoot;
  for (const [path, text] of [[options.desktop.ConfigPath, JSON.stringify({ state: { enabled: true, path: options.record.persistence.path }, changed: true })],
    [resolve(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { changed: {} } })]]) {
    options.record.inputFingerprint = await runtimeInputFingerprint(root, options.desktop.ConfigPath);
    await writeFile(path, text);
    assert.ok((await checkInstalledRuntime(options)).failures.includes("runtime-input-fingerprint-mismatch"));
  }
  options.record.inputFingerprint = await runtimeInputFingerprint(root, options.desktop.ConfigPath);
  await rm(options.record.runnerPath);
  assert.ok((await checkInstalledRuntime(options)).failures.includes("runtime-input-fingerprint-mismatch"));
});

test("startup fingerprint supports npm distributions without a dependency lock", async t => {
  const options = await fixture(t); await rm(resolve(options.repositoryRoot, "package-lock.json"));
  const a = await runtimeInputFingerprint(options.repositoryRoot, options.desktop.ConfigPath);
  const b = await runtimeInputFingerprint(options.repositoryRoot, options.desktop.ConfigPath);
  assert.deepEqual(a, b); assert.notDeepEqual(a, options.record.inputFingerprint);
});

test("startup fingerprint preserves optional configuration defaults", async t => {
  const options = await fixture(t); await rm(options.desktop.ConfigPath);
  const a = await runtimeInputFingerprint(options.repositoryRoot, options.desktop.ConfigPath);
  const b = await runtimeInputFingerprint(options.repositoryRoot, options.desktop.ConfigPath);
  assert.deepEqual(a, b); assert.notDeepEqual(a, options.record.inputFingerprint);
});

test("installed check refuses stopped service or another persistent workspace", async t => {
  const options = await fixture(t); options.isAlive = () => false;
  assert.ok((await checkInstalledRuntime(options)).failures.includes("managed-service-not-running"));
  options.isAlive = () => true; options.record.persistence.path = resolve(options.repositoryRoot, "another-state.json");
  assert.ok((await checkInstalledRuntime(options)).failures.includes("service-state-store-mismatch"));
});
