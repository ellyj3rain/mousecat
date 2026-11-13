"use strict";
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mc-journal-recovery-"));
const git = (root, args) => execFileSync("git", args, { cwd: root, windowsHide: true, encoding: "utf8" }).trim();

function repo(name) {
  const root = path.join(scratch, name);
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Journal Test"]);
  git(root, ["config", "user.email", "journal@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(root, "work.txt"), "base\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "base"]);
  return root;
}

function repositoryKey(root) {
  const raw = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(root, raw);
  const canonical = fs.realpathSync.native(absolute);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

function loadEngine(dataDir) {
  process.env.MC_DATA_DIR = dataDir;
  delete require.cache[require.resolve("./engine.cjs")];
  return require("./engine.cjs");
}

function writeJournal(dataDir, entries, suffix = "") {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "actuation-audit.jsonl"), entries.map((entry) => JSON.stringify(entry)).join("\n") + suffix, "utf8");
}

function forbiddenKeys(value, found = []) {
  if (Array.isArray(value)) value.forEach((child) => forbiddenKeys(child, found));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (["planId", "commands", "command"].includes(key)) found.push(key);
      forbiddenKeys(child, found);
    }
  }
  return found;
}

test("journal recovery is fail-closed and audit evidence is non-authorizing", async () => {
  const uncertainRepo = repo("uncertain");
  const uncertainData = path.join(scratch, "uncertain-data");
  writeJournal(uncertainData, [
    { at: new Date().toISOString(), kind: "apply-intent", attemptId: "attempt-1", repositoryKey: repositoryKey(uncertainRepo) },
    { at: new Date().toISOString(), kind: "apply-result", attemptId: "attempt-1", repositoryKey: repositoryKey(uncertainRepo), standing: "unknown", outcome: "outcome-unconfirmed" },
  ], "\n");
  let engine = loadEngine(uncertainData);
  const uncertain = await engine.plan("backup", uncertainRepo);
  assert.equal(uncertain.feasible, false);
  assert.match(uncertain.reason, /no durable terminal result/);

  const damagedRepo = repo("damaged");
  const damagedData = path.join(scratch, "damaged-data");
  writeJournal(damagedData, [{ at: new Date().toISOString(), kind: "plan", action: "backup" }], "\n{truncated");
  engine = loadEngine(damagedData);
  const damaged = await engine.plan("backup", damagedRepo);
  assert.equal(damaged.feasible, false);
  assert.match(damaged.reason, /journal cannot be verified/);
  assert.equal(engine.readAudit()[0].kind, "audit-unavailable");

  const auditRepo = repo("redaction");
  fs.writeFileSync(path.join(auditRepo, "work.txt"), "changed\n");
  const auditData = path.join(scratch, "audit-data");
  engine = loadEngine(auditData);
  const plan = await engine.plan("commit", auditRepo, { message: "retained evidence" });
  const applied = await engine.apply(plan.id, { approve: true });
  assert.equal(applied.ok, true);
  assert.equal(Object.hasOwn(applied, "planId"), false);
  const raw = fs.readFileSync(path.join(auditData, "actuation-audit.jsonl"), "utf8");
  assert.equal(raw.includes(plan.id), false);
  const entries = raw.trim().split("\n").map(JSON.parse);
  assert.deepEqual(forbiddenKeys(entries), []);
  assert.deepEqual(forbiddenKeys(engine.readAudit()), []);
  assert.ok(entries.some((entry) => entry.kind === "apply-intent"
    && entry.planRef && entry.commandCount === 0
    && /^[a-f0-9]{64}$/.test(entry.approvedSnapshotSha256)
    && /^[a-f0-9]{40,64}$/.test(entry.approvedTreeOid)
    && /^[a-f0-9]{40,64}$/.test(entry.approvedCommitOid)));
});

test.after(() => {
  delete process.env.MC_DATA_DIR;
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
});
