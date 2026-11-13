/* ============================================================================
   Throwaway-target test for the gated engine. Creates real temporary git repos,
   exercises plan / apply / retired rollback / the approval gate / backup / audit,
   and asserts the REAL on-disk git effects. No mocks. Run: node service/engine.test.cjs
   ============================================================================ */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// route audit + backups to a throwaway data dir BEFORE loading the engine
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-engine-test-"));
process.env.MC_DATA_DIR = path.join(TMP, "data");
const engine = require("./engine.cjs");

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else { fail++; console.log("  FAIL  " + label); }
}
function g(cwd, args) { return execFileSync("git", args, { cwd, windowsHide: true }).toString().trim(); }

function mkRepo(name) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  g(dir, ["init", "-q"]);
  g(dir, ["config", "user.email", "test@example.com"]);
  g(dir, ["config", "user.name", "MC Test"]);
  g(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
}

(async () => {
  console.log("engine test in", TMP);

  // ---- 1. zero-commit project: dirty + no commits = at-risk ----
  console.log("\n[1] commit action against a zero-commit repo");
  const r1 = mkRepo("zero");
  fs.writeFileSync(path.join(r1, "a.txt"), "work in progress\n");
  fs.writeFileSync(path.join(r1, "b.txt"), "more work\n");

  const s0 = await engine.projectState(r1);
  ok(s0.isRepo && s0.zeroCommit && s0.dirty === 2, `state: zero-commit, 2 dirty (got dirty=${s0.dirty}, zero=${s0.zeroCommit})`);

  const p1 = await engine.plan("commit", r1);
  ok(p1.feasible && p1.action === "commit" && /Automatic undo is not offered/.test(p1.recovery), "plan: feasible + honest recovery boundary");
  ok(!Object.hasOwn(p1, "commands") && p1.standing === "issued", "plan: private commands are not returned as caller authority");

  const sDry = await engine.projectState(r1);
  ok(sDry.zeroCommit && sDry.dirty === 2, "DRY RUN: plan() changed nothing on disk");

  // approval gate
  let blocked = false;
  try { await engine.apply(p1.id, { approve: false }); } catch { blocked = true; }
  ok(blocked, "GATE: apply without approve:true is blocked");

  const a1 = await engine.apply(p1.id, { approve: true });
  ok(a1.ok, "apply: ok");
  const s1 = await engine.projectState(r1);
  ok(!s1.zeroCommit && s1.dirty === 0, `apply: real commit created, tree clean (zero=${s1.zeroCommit}, dirty=${s1.dirty})`);
  ok(g(r1, ["log", "-1", "--pretty=%s"]) === p1.message, "apply: commit message matches the plan");

  const rb1 = await engine.rollback({ id: a1.id, commands: [["reset", "--hard"]], target: TMP });
  ok(rb1.ok === false && rb1.retired === true, "legacy rollback payload is explicitly non-executing");
  const s2 = await engine.projectState(r1);
  ok(!s2.zeroCommit && s2.dirty === 0, "retired rollback leaves the applied commit unchanged");

  // ---- 2. non-zero-commit ----
  console.log("\n[2] commit action against a repo with history");
  const r2 = mkRepo("hist");
  fs.writeFileSync(path.join(r2, "x.txt"), "v1\n");
  g(r2, ["add", "-A"]); g(r2, ["commit", "-q", "-m", "first"]);
  fs.writeFileSync(path.join(r2, "x.txt"), "v2\n");

  const p2 = await engine.plan("commit", r2, { message: "second save" });
  const a2 = await engine.apply(p2.id, { approve: true });
  ok(a2.ok && g(r2, ["log", "-1", "--pretty=%s"]) === "second save", "apply: second commit created");

  // "nothing to save" path: the successful commit left the tree clean.
  ok((await engine.projectState(r2)).dirty === 0, "setup: tree is clean after the commit");
  const pClean = await engine.plan("commit", r2);
  ok(pClean.feasible === false, "plan: honest 'nothing to save' when clean");

  // ---- 3. backup via bundle (no remote) ----
  console.log("\n[3] backup action with no remote (local bundle)");
  const p3 = await engine.plan("backup", r2);
  ok(p3.feasible && p3.targetKind === "bundle", "plan: backup uses a local bundle when no remote");
  const a3 = await engine.apply(p3.id, { approve: true });
  ok(a3.ok && !Object.hasOwn(a3, "rollbackAvailable"), "apply: backup bundle written without executable rollback authority");
  const rb3 = await engine.rollback(a3.id);
  ok(rb3.ok === false && rb3.retired === true, "rollback remains retired after bundle creation");

  // ---- 4. real history reads ----
  console.log("\n[4] read-only history");
  const h = await engine.history(r2);
  ok(!h.empty && h.events.every((e) => e.synthetic === false), "history: real git events, none synthetic");

  // ---- 5. audit log recorded everything ----
  console.log("\n[5] audit");
  const aud = engine.readAudit();
  ok(aud.length >= 6 && aud.some((e) => e.kind === "apply-intent") && aud.some((e) => e.kind === "apply-result")
    && aud.some((e) => e.kind === "rollback-retired"), `audit: plan/intent/result/retirement recorded (${aud.length} entries)`);

  // ---- 6. backup target selection: GitHub preferred, every choice surfaced ----
  console.log("\n[6] backup target selection (GitHub-aware, multi-remote)");
  const r3 = mkRepo("remotes");
  fs.writeFileSync(path.join(r3, "y.txt"), "v1\n"); g(r3, ["add", "-A"]); g(r3, ["commit", "-q", "-m", "init"]);
  g(r3, ["remote", "add", "enterprise", "https://git.enterprise.example/acme/x.git"]);
  g(r3, ["remote", "add", "origin", "https://github.com/example-owner/x.git"]);
  g(r3, ["remote", "add", "split", "https://github.com/example-owner/read-only.git"]);
  g(r3, ["remote", "set-url", "--push", "split", "https://git.enterprise.example/acme/write.git"]);
  const pb = await engine.plan("backup", r3);
  ok(pb.feasible && pb.targetKind === "remote" && pb.remote.name === "origin" && pb.remote.isGitHub === true,
    `backup DEFAULTS to GitHub origin, never the deprecated enterprise remote (got ${pb.remote && pb.remote.name})`);
  ok(!Object.hasOwn(pb, "commands"), "backup command set stays private to the issuing engine");
  ok(pb.choices.some((c) => c.name === "enterprise" && c.isGitHub === false)
    && pb.choices.some((c) => c.name === "origin" && c.isGitHub === true)
    && pb.choices.some((c) => c.kind === "bundle"),
    "backup SURFACES every choice (enterprise, origin GitHub, local bundle)");
  const split = pb.choices.find((c) => c.name === "split");
  ok(split && split.url === "https://git.enterprise.example/acme/write.git" && split.isGitHub === false,
    "backup represents the acting push URL when fetch and push destinations differ");
  const pbE = await engine.plan("backup", r3, { remote: "enterprise" });
  ok(pbE.remote && pbE.remote.name === "enterprise", "explicit opts.remote pins enterprise (user choice honored)");
  const pbB = await engine.plan("backup", r3, { target: "bundle" });
  ok(pbB.targetKind === "bundle", "opts.target=bundle forces the local bundle");

  const r4 = mkRepo("nonremote");
  fs.writeFileSync(path.join(r4, "z.txt"), "v1\n"); g(r4, ["add", "-A"]); g(r4, ["commit", "-q", "-m", "init"]);
  g(r4, ["remote", "add", "enterprise", "https://git.enterprise.example/acme/z.git"]);
  const pb4 = await engine.plan("backup", r4);
  ok(pb4.targetKind === "bundle" && pb4.noGitHub === true, "no GitHub remote -> safe local bundle, NOT the non-GitHub remote");
  ok(pb4.choices.some((c) => c.name === "enterprise"), "the non-GitHub remote is still offered as a choice");

  // ---- 7. unqualified repository creation is removed ----
  console.log("\n[7] repository creation boundary");
  const conn = await engine.plan("connect", r4);
  ok(conn.feasible === false && /host, account, and environment binding/.test(conn.reason),
    "connect: repository creation stays unavailable until execution identity is bound");
  const conn2 = await engine.plan("connect", r3);
  ok(conn2.feasible === false, "connect: no caller can obtain repository-creation authority");

  // cleanup
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("TEST ERROR:", e); process.exit(2); });
