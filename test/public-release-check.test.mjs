import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditPublicRelease } from "../scripts/public-release-check.mjs";

test("release check distinguishes a clean tree from private reachable history without exposing contents", () => {
  // Hook Git variables override subprocess cwd, including the audit's subprocess.
  // This test is serial in its own worker; restore the inherited hook context.
  const gitContext = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"];
  const inherited = new Map(gitContext.map(key => [key, process.env[key]]));
  for (const key of gitContext) delete process.env[key];
  const cwd = mkdtempSync(join(tmpdir(), "mousecat-release-history-"));
  const git = args => execFileSync("git", args, { cwd, stdio: "pipe" });
  const commit = subject => { git(["add", "--all"]); git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", subject]); };
  try {
    git(["init"]);
    assert.throws(() => auditPublicRelease({ cwd }), /No reachable commits/u);
    mkdirSync(join(cwd, ".neo"));
    writeFileSync(join(cwd, ".neo", "project.json"), '{"privateFixture":true}');
    writeFileSync(join(cwd, ".env.local"), "SYNTHETIC_ENVIRONMENT_FIXTURE=private-input");
    const marker = ["C:", "/Users/", "synthetic-person/private-work"].join("");
    writeFileSync(join(cwd, "note.md"), marker);
    commit("private synthetic baseline");
    git(["branch", "retained-private-history"]);
    git(["tag", "private-fixture-tag"]);
    rmSync(join(cwd, ".neo", "project.json"));
    rmSync(join(cwd, ".env.local"));
    writeFileSync(join(cwd, "note.md"), "Public synthetic note.");
    commit("clean current tree");
    assert.equal(auditPublicRelease({ cwd, treeOnly: true }).ok, true);
    const report = auditPublicRelease({ cwd });
    assert.equal(report.ok, false);
    assert.deepEqual(report.findings.map(f => f.category).sort(), ["operator-path", "private-path", "private-path"]);
    assert.equal(JSON.stringify(report).includes(marker), false);
    assert.equal(report.remoteRetainedRefsVerified, false);
    assert.equal(report.credentialsScanned, false);
    // Even after replacing main's ancestry, retained refs must still fail.
    git(["checkout", "--orphan", "clean-release"]);
    commit("clean publication ancestry");
    assert.equal(auditPublicRelease({ cwd, treeOnly: true }).ok, true);
    assert.equal(auditPublicRelease({ cwd }).ok, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    for (const [key, value] of inherited) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
