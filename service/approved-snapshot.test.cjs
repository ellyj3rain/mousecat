"use strict";
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mc-approved-snapshot-"));
process.env.MC_DATA_DIR = path.join(scratch, "data");
const engine = require("./engine.cjs");
const git = (root, args) => execFileSync("git", args, { cwd: root, windowsHide: true, encoding: "utf8" }).trim();

function markerCommand(root, name) {
  const helper = path.join(root, ".git", `${name}.cjs`);
  const marker = path.join(root, ".git", `${name}.ran`);
  fs.writeFileSync(helper, `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},'executed');process.stdin.pipe(process.stdout);`);
  return { marker, command: `"${process.execPath.replace(/\\/g, "/")}" "${helper.replace(/\\/g, "/")}"` };
}

function repo(name) {
  const root = path.join(scratch, name);
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.name", "Approved Snapshot Test"]);
  git(root, ["config", "user.email", "approved-snapshot@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(root, "work.txt"), "base\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "base"]);
  return root;
}

test("source reads and preview refuse selected executable filters before any side effect", async () => {
  const root = repo("executable-clean-filter");
  const sentinel = markerCommand(root, "clean-filter");
  git(root, ["config", "filter.mc-sentinel.clean", sentinel.command]);
  fs.writeFileSync(path.join(root, ".gitattributes"), "work.txt filter=mc-sentinel\n");
  fs.writeFileSync(path.join(root, "work.txt"), "unapproved work\n");
  const index = fs.readFileSync(path.join(root, ".git", "index"));
  const head = git(root, ["rev-parse", "HEAD"]);
  const state = await engine.projectState(root);
  assert.equal(state.observation.status, "unavailable");
  assert.match(state.observation.reason, /executable Git clean\/process filters/);
  await assert.rejects(engine.actionStateFingerprint(root), /source observation unavailable/);
  assert.equal((await engine.plan("commit", root)).feasible, false);
  assert.equal((await engine.diff(root, "work.txt")).status, "unavailable");
  const manifestPath = path.join(scratch, "filter-operations.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, objects: [{ id: "fixture", label: "Fixture", kind: "repository", root }] }));
  const operations = require("./operations/index.cjs").createOperations({ manifestPath });
  const observation = await operations.project("fixture");
  assert.equal(observation.source.git.status, "unavailable");
  assert.equal(observation.source.git.code, "GIT_INTEGRATIONS");
  assert.equal(fs.existsSync(sentinel.marker), false);
  assert.deepEqual(fs.readFileSync(path.join(root, ".git", "index")), index);
  assert.equal(git(root, ["rev-parse", "HEAD"]), head);
  assert.equal(fs.readFileSync(path.join(root, "work.txt"), "utf8"), "unapproved work\n");
  // Positive fixture control: ordinary Git conversion really would run this
  // driver. Only this disposable repository is intentionally touched here.
  git(root, ["-c", "core.fsmonitor=false", "diff", "--no-ext-diff", "--no-textconv"]);
  assert.equal(fs.existsSync(sentinel.marker), true);
});

test("read-only diffs and private preview do not execute textconv or fsmonitor helpers", async () => {
  const root = repo("read-integration-markers");
  const textconv = markerCommand(root, "textconv");
  const monitor = markerCommand(root, "fsmonitor");
  git(root, ["config", "diff.mc-sentinel.textconv", textconv.command]);
  git(root, ["config", "core.fsmonitor", monitor.command]);
  fs.writeFileSync(path.join(root, ".gitattributes"), "work.txt diff=mc-sentinel\n");
  fs.writeFileSync(path.join(root, "work.txt"), "reviewed work\n");
  assert.equal((await engine.projectState(root)).observation.status, "observed");
  assert.equal((await engine.diff(root, "work.txt")).isRepo, true);
  assert.equal((await engine.plan("commit", root)).standing, "issued");
  assert.equal(fs.existsSync(textconv.marker), false);
  assert.equal(fs.existsSync(monitor.marker), false);
});

async function waitForImportedCommit(root, commitOid, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      execFileSync("git", ["cat-file", "-e", `${commitOid}^{commit}`], {
        cwd: root, windowsHide: true, stdio: "ignore",
      });
      return;
    } catch { /* object has not crossed the durable intent boundary yet */ }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for approved commit object import");
}

test("bytes written after approval remain visible but cannot enter the approved commit", async () => {
  const root = repo("late-worktree-write");
  const file = path.join(root, "work.txt");
  fs.writeFileSync(file, "approved bytes\n");
  const plan = await engine.plan("commit", root, { message: "commit exact approved bytes" });
  assert.equal(plan.standing, "issued");
  assert.match(plan.approvedSnapshot.sha256, /^[a-f0-9]{64}$/);
  assert.match(plan.approvedSnapshot.treeOid, /^[a-f0-9]{40,64}$/);
  assert.match(plan.approvedSnapshot.commitOid, /^[a-f0-9]{40,64}$/);
  assert.equal(plan.approvedSnapshot.schema, "mc.approved-commit-snapshot/2");
  assert.equal(plan.approvedSnapshot.headRef, "refs/heads/main");
  assert.equal(Object.hasOwn(plan.approvedSnapshot, "directory"), false);

  process.env.MC_TEST_COMMAND_DELAY_MS = "1000";
  try {
    const applying = engine.apply(plan.id, { approve: true });
    await waitForImportedCommit(root, plan.approvedSnapshot.commitOid);
    fs.writeFileSync(file, "later operator bytes\n");
    const result = await applying;
    assert.equal(result.ok, true);
    assert.equal(result.standing, "applied");
  } finally {
    delete process.env.MC_TEST_COMMAND_DELAY_MS;
  }

  assert.equal(git(root, ["rev-parse", "HEAD"]), plan.approvedSnapshot.commitOid);
  assert.equal(git(root, ["show", "HEAD:work.txt"]), "approved bytes");
  assert.equal(fs.readFileSync(file, "utf8"), "later operator bytes\n");
  assert.equal(git(root, ["diff", "--cached", "--name-only"]), "");
  assert.match(git(root, ["status", "--porcelain=v1"]), /^M work\.txt$/m);
});

test("a symbolic HEAD swap cannot redirect the approved commit to another branch", async () => {
  const root = repo("symbolic-head-swap");
  const base = git(root, ["rev-parse", "HEAD"]);
  git(root, ["branch", "other", base]);
  fs.writeFileSync(path.join(root, "work.txt"), "approved bytes\n");
  const plan = await engine.plan("commit", root, { message: "commit only to planned branch" });
  assert.equal(plan.approvedSnapshot.headRef, "refs/heads/main");

  process.env.MC_TEST_COMMAND_DELAY_MS = "1000";
  let result;
  try {
    const applying = engine.apply(plan.id, { approve: true });
    await waitForImportedCommit(root, plan.approvedSnapshot.commitOid);
    git(root, ["symbolic-ref", "HEAD", "refs/heads/other"]);
    result = await applying;
  } finally {
    delete process.env.MC_TEST_COMMAND_DELAY_MS;
  }

  assert.equal(result.ok, false);
  assert.equal(result.outcome, "failed-effects-possible");
  assert.match(result.error, /HEAD no longer names the approved branch refs\/heads\/main/);
  assert.equal(git(root, ["rev-parse", "refs/heads/main"]), plan.approvedSnapshot.commitOid);
  assert.equal(git(root, ["rev-parse", "refs/heads/other"]), base);
  assert.equal(git(root, ["rev-parse", "HEAD"]), base);
  assert.equal(git(root, ["diff", "--cached", "--name-only"]), "");
  assert.match(result.results[1].command, /exact approved branch refs\/heads\/main/);
});

test("detached HEAD is refused before an approved snapshot is created", async () => {
  const root = repo("detached-head");
  const base = git(root, ["rev-parse", "HEAD"]);
  git(root, ["checkout", "--detach", "-q", base]);
  fs.writeFileSync(path.join(root, "work.txt"), "detached bytes\n");
  const plan = await engine.plan("commit", root, { message: "must bind a branch" });
  assert.equal(plan.feasible, false);
  assert.match(plan.reason, /HEAD to name one local branch/);
  assert.equal(git(root, ["rev-parse", "HEAD"]), base);
});

test("a changed private snapshot seal is refused before the commit ref changes", async () => {
  const root = repo("tampered-snapshot");
  fs.writeFileSync(path.join(root, "work.txt"), "approved bytes\n");
  const before = git(root, ["rev-parse", "HEAD"]);
  const plan = await engine.plan("commit", root, { message: "must remain sealed" });
  const manifest = path.join(process.env.MC_DATA_DIR, "approved-snapshots", plan.id, "MANIFEST.json");
  fs.appendFileSync(manifest, " ");
  const result = await engine.apply(plan.id, { approve: true });
  assert.equal(result.ok, false);
  assert.equal(result.standing, "refused");
  assert.match(result.error, /snapshot manifest changed/);
  assert.equal(git(root, ["rev-parse", "HEAD"]), before);
  assert.equal(fs.existsSync(`${git(root, ["rev-parse", "--git-path", "index"])}.lock`), false);
});

test.after(() => {
  delete process.env.MC_TEST_COMMAND_DELAY_MS;
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
});
