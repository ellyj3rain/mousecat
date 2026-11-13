"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mc-workspace-engine-"));
process.env.MC_DATA_DIR = path.join(scratch, "private");
const engine = require("./engine.cjs");
const git = (root, args) => execFileSync("git", args, { cwd: root, windowsHide: true }).toString().trim();
function repo(name) {
  const root = path.join(scratch, name); fs.mkdirSync(root);
  git(root, ["init", "-q"]); git(root, ["config", "user.name", "Fixture"]); git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]); git(root, ["config", "core.hooksPath", ".git/hooks"]);
  fs.writeFileSync(path.join(root, "work.txt"), "baseline\n"); git(root, ["add", "work.txt"]); git(root, ["commit", "-qm", "baseline"]);
  return root;
}

test("planning and approved writes bind to the same selected repository despite inherited routing", async () => {
  const a = repo("a"), b = repo("b");
  const bHead = git(b, ["rev-parse", "HEAD"]), bIndex = fs.readFileSync(path.join(b, ".git/index"));
  fs.writeFileSync(path.join(a, "work.txt"), "new work\n");
  const prior = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
  process.env.GIT_DIR = path.join(b, ".git"); process.env.GIT_WORK_TREE = b;
  try {
    const plan = await engine.plan("commit", a);
    assert.equal(plan.target, a);
    const result = await engine.apply(plan.id, { approve: true });
    assert.equal(result.ok, true);
  } finally { for (const [key, value] of Object.entries(prior)) { if (value == null) delete process.env[key]; else process.env[key] = value; } }
  assert.equal(git(a, ["log", "-1", "--pretty=%s"]).startsWith("Save work"), true);
  assert.equal(git(b, ["rev-parse", "HEAD"]), bHead);
  assert.deepEqual(fs.readFileSync(path.join(b, ".git/index")), bIndex);
});

test("a failed worktree probe is unavailable and cannot produce a clean reading or write plan", async () => {
  const root = repo("unavailable");
  fs.writeFileSync(path.join(root, ".git/index"), "invalid fixture index\n");
  const state = await engine.projectState(root);
  assert.equal(state.observation.status, "unavailable");
  assert.equal(state.observation.failed.includes("worktree"), true);
  assert.equal(state.dirty, undefined);
  const plan = await engine.plan("commit", root);
  assert.equal(plan.feasible, false);
  assert.match(plan.reason, /unavailable/);
});

test("a non-Git child cannot borrow or commit its ancestor repository", async () => {
  const parent = repo("parent-binding");
  const child = path.join(parent, "component"); fs.mkdirSync(child);
  fs.writeFileSync(path.join(parent, "work.txt"), "outside selected component\n");
  fs.writeFileSync(path.join(child, "child.txt"), "inside selected component\n");
  const head = git(parent, ["rev-parse", "HEAD"]), index = fs.readFileSync(path.join(parent, ".git/index"));
  const state = await engine.projectState(child);
  assert.equal(state.isRepo, false);
  assert.equal(state.observation.status, "observed");
  assert.equal((await engine.plan("commit", child)).feasible, false);
  assert.equal((await engine.plan("backup", child)).feasible, false);
  assert.equal(git(parent, ["rev-parse", "HEAD"]), head);
  assert.deepEqual(fs.readFileSync(path.join(parent, ".git/index")), index);
  assert.equal(fs.readFileSync(path.join(parent, "work.txt"), "utf8"), "outside selected component\n");
});

test("a registered git-file worktree retains its own source and branch", async () => {
  const parent = repo("linked-parent"), linked = path.join(scratch, "linked-source");
  git(parent, ["worktree", "add", "-q", "-b", "linked", linked]);
  assert.equal(fs.statSync(path.join(linked, ".git")).isFile(), true);
  const parentHead = git(parent, ["rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(linked, "work.txt"), "linked work only\n");
  assert.equal((await engine.projectState(linked)).isRepo, true);
  const plan = await engine.plan("commit", linked);
  assert.equal((await engine.apply(plan.id, { approve: true })).ok, true);
  assert.equal(git(parent, ["rev-parse", "HEAD"]), parentHead);
  assert.notEqual(git(linked, ["rev-parse", "HEAD"]), parentHead);
});

test.after(() => {
  // Only these test-created temporary fixtures are disposable.
  fs.rmSync(scratch, { recursive: true, force: true });
});
