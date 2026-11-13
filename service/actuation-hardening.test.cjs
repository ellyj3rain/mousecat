"use strict";
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mc-actuation-hardening-"));
process.env.MC_DATA_DIR = path.join(scratch, "data");
let engine = require("./engine.cjs");
const git = (root, args) => execFileSync("git", args, { cwd: root, windowsHide: true, encoding: "utf8" }).trim();

function repo(name) {
  const root = path.join(scratch, name);
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Hardening Test"]);
  git(root, ["config", "user.email", "hardening@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(root, "work.txt"), "base\n");
  git(root, ["add", "-A"]); git(root, ["commit", "-qm", "base"]);
  return root;
}

test("duplicate concurrent approvals reserve one receipt and dispatch once", async () => {
  const root = repo("duplicate");
  fs.writeFileSync(path.join(root, "work.txt"), "approved\n");
  const plan = await engine.plan("commit", root, { message: "one dispatch" });
  process.env.MC_TEST_COMMAND_DELAY_MS = "40";
  try {
    const settled = await Promise.allSettled([
      engine.apply(plan.id, { approve: true }),
      engine.apply(plan.id, { approve: true }),
    ]);
    assert.equal(settled.filter(item => item.status === "fulfilled" && item.value.ok).length, 1);
    assert.equal(settled.filter(item => item.status === "rejected").length, 1);
    assert.equal(git(root, ["rev-list", "--count", "HEAD"]), "2");
  } finally { delete process.env.MC_TEST_COMMAND_DELAY_MS; }
});

test("distinct receipts for one repository serialize and the later stale receipt cannot write", async () => {
  const root = repo("serialized");
  fs.writeFileSync(path.join(root, "work.txt"), "approved\n");
  const first = await engine.plan("commit", root, { message: "first serialized" });
  const second = await engine.plan("commit", root, { message: "must become stale" });
  process.env.MC_TEST_COMMAND_DELAY_MS = "40";
  try {
    const results = await Promise.all([
      engine.apply(first.id, { approve: true }),
      engine.apply(second.id, { approve: true }),
    ]);
    assert.equal(results.filter(item => item.ok).length, 1);
    assert.equal(results.filter(item => item.standing === "stale").length, 1);
    assert.equal(git(root, ["rev-list", "--count", "HEAD"]), "2");
  } finally { delete process.env.MC_TEST_COMMAND_DELAY_MS; }
});

test("intent persistence failure prevents every target effect", async () => {
  const root = repo("intent-failure");
  fs.writeFileSync(path.join(root, "work.txt"), "approved\n");
  const plan = await engine.plan("commit", root, { message: "must not commit" });
  process.env.MC_TEST_FAIL_AUDIT_KIND = "apply-intent";
  try {
    const result = await engine.apply(plan.id, { approve: true });
    assert.equal(result.ok, false);
    assert.equal(result.standing, "refused");
    assert.match(result.error, /intent could not be retained/);
    assert.equal(git(root, ["rev-list", "--count", "HEAD"]), "1");
    assert.match(git(root, ["status", "--porcelain"]), /work\.txt/);
  } finally { delete process.env.MC_TEST_FAIL_AUDIT_KIND; }
});

test("approved-object import failure preserves user state and never claims no effect", async () => {
  const root = repo("partial");
  fs.writeFileSync(path.join(root, "work.txt"), "approved\n");
  const plan = await engine.plan("commit", root, { message: "partial attempt" });
  process.env.MC_TEST_FAIL_BEFORE_COMMAND_INDEX = "1";
  try {
    const result = await engine.apply(plan.id, { approve: true });
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "failed-effects-possible");
    assert.equal(result.effectsPossible, true);
    assert.equal(result.results.length, 1);
    assert.match(result.error, /Earlier effects may have occurred/);
    assert.equal(git(root, ["rev-list", "--count", "HEAD"]), "1");
    assert.equal(git(root, ["diff", "--cached", "--name-only"]), "");
    assert.match(git(root, ["status", "--porcelain"]), /work\.txt/);
  } finally { delete process.env.MC_TEST_FAIL_BEFORE_COMMAND_INDEX; }
});

test("terminal persistence failure returns uncertainty, consumes approval and blocks restart", async () => {
  const root = repo("result-failure");
  fs.writeFileSync(path.join(root, "work.txt"), "approved\n");
  const plan = await engine.plan("commit", root, { message: "effect without result record" });
  process.env.MC_TEST_FAIL_AUDIT_KIND = "apply-result";
  let result;
  try { result = await engine.apply(plan.id, { approve: true }); }
  finally { delete process.env.MC_TEST_FAIL_AUDIT_KIND; }
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "outcome-unconfirmed");
  assert.equal(result.effectsPossible, true);
  assert.equal(git(root, ["rev-list", "--count", "HEAD"]), "2");
  await assert.rejects(() => engine.apply(plan.id, { approve: true }), /unknown, consumed/);
  const blocked = await engine.plan("commit", root);
  assert.equal(blocked.feasible, false);
  assert.match(blocked.reason, /no durable terminal result/);

  delete require.cache[require.resolve("./engine.cjs")];
  engine = require("./engine.cjs");
  const afterRestart = await engine.plan("backup", root);
  assert.equal(afterRestart.feasible, false);
  assert.match(afterRestart.reason, /no durable terminal result/);
});

test("legacy rollback payloads cannot mutate through the engine", async () => {
  const root = repo("retired-rollback");
  const before = git(root, ["rev-parse", "HEAD"]);
  const result = await engine.rollback({ target: root, commands: [["reset", "--hard", "HEAD~1"]] });
  assert.equal(result.ok, false);
  assert.equal(result.retired, true);
  assert.equal(git(root, ["rev-parse", "HEAD"]), before);
});

test.after(() => {
  delete process.env.MC_TEST_COMMAND_DELAY_MS;
  delete process.env.MC_TEST_FAIL_AUDIT_KIND;
  delete process.env.MC_TEST_FAIL_BEFORE_COMMAND_INDEX;
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
});
