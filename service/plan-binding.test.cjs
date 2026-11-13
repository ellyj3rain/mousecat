"use strict";
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-plan-binding-"));
process.env.MC_DATA_DIR = path.join(TMP, "data");
const engine = require("./engine.cjs");
test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

function git(cwd, args) {
  return execFileSync("git", args, { cwd, windowsHide: true, encoding: "utf8" }).trim();
}
function repo(name) {
  const root = path.join(TMP, name);
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "plan@example.test"]);
  git(root, ["config", "user.name", "Plan Test"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(root, "tracked.txt"), "base\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  return root;
}

test("approval consumes one opaque server-issued plan and rejects caller authority", async () => {
  const root = repo("opaque");
  fs.writeFileSync(path.join(root, "tracked.txt"), "changed\n");
  const plan = await engine.plan("commit", root, { message: "bound change" });
  assert.equal(plan.standing, "issued");
  assert.equal(Object.hasOwn(plan, "commands"), false);
  assert.equal(Object.hasOwn(plan, "computedFrom"), false);
  await assert.rejects(() => engine.apply({ ...plan, action: "backup" }, { approve: true }), /server-issued plan id/);
  const applied = await engine.apply(plan.id, { approve: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.standing, "applied");
  assert.equal(git(root, ["log", "-1", "--pretty=%s"]), "bound change");
  await assert.rejects(() => engine.apply(plan.id, { approve: true }), /unknown, consumed/);
});

test("same-count content changes make an approved preview stale before any command", async () => {
  const root = repo("stale-content");
  fs.writeFileSync(path.join(root, "tracked.txt"), "previewed\n");
  const plan = await engine.plan("commit", root, { message: "must not run" });
  fs.writeFileSync(path.join(root, "tracked.txt"), "different bytes\n");
  const result = await engine.apply(plan.id, { approve: true });
  assert.equal(result.ok, false);
  assert.equal(result.standing, "stale");
  assert.equal(git(root, ["log", "-1", "--pretty=%s"]), "base");
  assert.equal(git(root, ["status", "--porcelain"]).split(/\r?\n/).filter(Boolean).length, 1);
});

test("untracked content is part of the exact approval binding", async () => {
  const root = repo("stale-untracked");
  fs.writeFileSync(path.join(root, "new.txt"), "previewed\n");
  const plan = await engine.plan("commit", root);
  fs.writeFileSync(path.join(root, "new.txt"), "changed without changing file count\n");
  const result = await engine.apply(plan.id, { approve: true });
  assert.equal(result.ok, false);
  assert.equal(result.standing, "stale");
  assert.equal(git(root, ["rev-list", "--count", "HEAD"]), "1");
});

test("non-HEAD ref changes make a full-bundle preview stale", async () => {
  const root = repo("stale-ref");
  const plan = await engine.plan("backup", root, { target: "bundle" });
  git(root, ["branch", "new-retained-ref", "HEAD"]);
  const result = await engine.apply(plan.id, { approve: true });
  assert.equal(result.ok, false);
  assert.equal(result.standing, "stale");
});

test("remote backup refuses hidden destinations and pushes only the reviewed local destination", async () => {
  const root = repo("backup-destinations");
  const first = path.join(TMP, "first bare.git"), second = path.join(TMP, "second bare.git");
  fs.mkdirSync(first); fs.mkdirSync(second);
  git(first, ["init", "--bare", "-q"]); git(second, ["init", "--bare", "-q"]);
  git(root, ["remote", "add", "origin", first]);
  git(root, ["remote", "set-url", "--push", "--add", "origin", first]);
  git(root, ["remote", "set-url", "--push", "--add", "origin", second]);
  const refused = await engine.plan("backup", root, { remote: "origin" });
  assert.equal(refused.feasible, false);
  assert.match(refused.reason, /exactly one reviewed push destination/);
  assert.equal(refused.choices.find((choice) => choice.name === "origin").pushUrls.length, 2);
  assert.equal(git(first, ["for-each-ref"]), "");
  assert.equal(git(second, ["for-each-ref"]), "");

  git(root, ["config", "--unset-all", "remote.origin.pushurl"]);
  const approved = await engine.plan("backup", root, { remote: "origin" });
  assert.equal(approved.remote.url, first);
  const result = await engine.apply(approved.id, { approve: true });
  assert.equal(result.ok, true);
  const branch = git(root, ["symbolic-ref", "--short", "HEAD"]);
  assert.equal(git(first, ["rev-parse", `refs/heads/${branch}`]), git(root, ["rev-parse", "HEAD"]));
  assert.equal(git(second, ["for-each-ref"]), "");

  git(root, ["config", `url.${second}.pushInsteadOf`, first]);
  const rewrite = await engine.plan("backup", root, { remote: "origin" });
  assert.equal(rewrite.feasible, false);
  assert.match(rewrite.reason, /URL rewrite rules/);
  assert.equal((await engine.plan("backup", root, { target: "bundle" })).targetKind, "bundle");
});

test("remote selection does not infer GitHub identity from a URL path or replace a missing explicit choice", async () => {
  const root = repo("backup-host-identity");
  git(root, ["remote", "add", "origin", "https://untrusted.invalid/github.com/example/project.git"]);
  const state = await engine.projectState(root);
  assert.equal(state.remotesDetailed[0].isGitHub, false);
  assert.equal((await engine.plan("backup", root)).targetKind, "bundle");
  const absent = await engine.plan("backup", root, { remote: "missing" });
  assert.equal(absent.feasible, false);
  assert.match(absent.reason, /not configured/);
});

test("a branch advance after durable intent cannot enter the approved remote backup", async () => {
  const root = repo("backup-content-binding");
  const destination = path.join(TMP, "reviewed-backup.git");
  fs.mkdirSync(destination); git(destination, ["init", "--bare", "-q"]);
  git(root, ["remote", "add", "origin", destination]);
  const reviewed = git(root, ["rev-parse", "HEAD"]);
  const branch = git(root, ["symbolic-ref", "--short", "HEAD"]);
  const plan = await engine.plan("backup", root, { remote: "origin" });
  process.env.MC_TEST_COMMAND_DELAY_MS = "1500";
  try {
    const applying = engine.apply(plan.id, { approve: true });
    const deadline = Date.now() + 15000;
    while (!engine.readAudit().some((entry) => entry.kind === "apply-intent" && entry.target === root && entry.action === "backup")) {
      if (Date.now() > deadline) throw new Error("backup intent was not observed");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    fs.writeFileSync(path.join(root, "tracked.txt"), "later unapproved commit\n");
    git(root, ["add", "tracked.txt"]); git(root, ["commit", "-qm", "later work"]);
    assert.notEqual(git(root, ["rev-parse", "HEAD"]), reviewed);
    assert.equal((await applying).ok, true);
  } finally { delete process.env.MC_TEST_COMMAND_DELAY_MS; }
  assert.equal(git(destination, ["rev-parse", `refs/heads/${branch}`]), reviewed);
});

test("legacy rollback payloads are non-executing after an applied commit", async () => {
  const root = repo("rollback-retired");
  fs.writeFileSync(path.join(root, "tracked.txt"), "approved\n");
  const plan = await engine.plan("commit", root);
  const applied = await engine.apply(plan.id, { approve: true });
  assert.equal(Object.hasOwn(applied, "rollbackAvailable"), false);
  const refused = await engine.rollback({ id: applied.id, target: TMP, commands: [["reset", "--hard"]] });
  assert.equal(refused.ok, false);
  assert.equal(refused.retired, true);
  assert.equal(git(root, ["rev-list", "--count", "HEAD"]), "2");
});
