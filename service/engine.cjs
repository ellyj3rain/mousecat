/* ============================================================================
   Mousecat — local gated engine (the acting half).

   Lives OUTSIDE pb-core's process (DR-006/DR-008). pb-core stays a read-only
   sensor; this engine does the per-project deep reads (real git history, diffs,
   paved-road conformance) and the GATED actuation (the loss-risk safety net:
   save / commit / back up at-risk work). It is transport-agnostic Node (CommonJS):
   Electron main imports it and exposes it over IPC (packaged app); a tiny dev
   server imports it and serves it over HTTP for the browser dev origin.

   SAFETY MODEL (non-negotiable):
   - Reads (state/history/diff/conformance) use a git READ allowlist and never mutate.
   - plan() never mutates the selected repository. Commit planning seals the exact
     approved tree, commit, and direct local branch ref into an engine-private Git
     object/index snapshot before returning an opaque, expiring preview handle;
     private commands stay server-side.
   - apply() is the ONLY path that runs write commands, and only with explicit
     approval of one exact, unconsumed server-issued plan id. Off by default.
   - A durable intent is appended before the first effect; a durable result follows.
   - Automatic rollback is retired. Recovery requires a new, current preview.
   ============================================================================ */
"use strict";
const { execFile } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const github = require("./github.cjs");
const { assertOwnWorktreeRoot, assertReadOnlyGitIntegrations } = require("./git-read-admission.cjs");
const { reducePlanStanding } = require("./plan-standing.cjs");

const DATA_DIR = process.env.MC_DATA_DIR || path.join(os.homedir(), ".marshmallow-commons");
const AUDIT_PATH = path.join(DATA_DIR, "actuation-audit.jsonl");
const APPROVED_SNAPSHOT_ROOT = path.join(DATA_DIR, "approved-snapshots");

/* ----------------------------------------------------------------------------
   git command discipline. execFile with an argv ARRAY (never a shell string), so
   there is no shell interpolation / injection surface. Read verbs are allowlisted;
   write verbs are only ever passed in by apply()'s private command sets.
   ---------------------------------------------------------------------------- */
const GIT_READ_VERBS = new Set([
  "rev-parse", "status", "log", "remote", "branch", "config", "diff",
  "rev-list", "show", "for-each-ref", "ls-files", "symbolic-ref", "count-objects", "cat-file", "check-attr",
]);

function git(cwd, args, { allowWrite = false, input = null } = {}) {
  return new Promise((resolve, reject) => {
    const verb = args[0];
    if (!allowWrite && !GIT_READ_VERBS.has(verb)) {
      return reject(new Error(`git ${verb}: not a read verb (writes require apply())`));
    }
    const readEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
    const argv = allowWrite ? args : ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args];
    const child = execFile("git", argv, { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: { ...readEnv, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" }, ...(allowWrite ? {} : { timeout: 5000 }) }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(new Error(`git ${args.join(" ")}: ${(stderr || err.message || "").trim()}`), { code: err.code }));
      resolve(String(stdout));
    });
    if (input !== null) { child.stdin.on("error", () => {}); child.stdin.end(input); }
  });
}
const gitRead = (cwd, args, opts = {}) => git(cwd, args, opts);
const gitWrite = (cwd, args) => git(cwd, args, { allowWrite: true });

/** Run Git with an exact private index/object environment. The selected repository
    remains the read source, while every object and index write lands under the
    engine-owned snapshot root. */
function gitWithEnvironment(cwd, args, exactEnv) {
  return new Promise((resolve, reject) => {
    const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
    execFile("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
      cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      env: { ...base, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", ...exactEnv },
    }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(new Error(`git ${args.join(" ")}: ${(stderr || err.message || "").trim()}`), { code: err.code }));
      resolve(String(stdout));
    });
  });
}

/** Run one apply command. A plain array is a git command (back-compat);
    a {bin,args} object routes to git or gh. Only called from the gated paths. */
function runCommand(cwd, cmd) {
  const bin = Array.isArray(cmd) ? "git" : cmd.bin;
  const args = Array.isArray(cmd) ? cmd : cmd.args;
  if (bin === "git") return gitWrite(cwd, args);
  if (bin === "gh") {
    return new Promise((resolve, reject) => {
      execFile(github.resolveGh(), args, { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(`gh ${args.join(" ")}: ${(stderr || err.message || "").trim()}`));
        resolve(String(stdout));
      });
    });
  }
  return Promise.reject(new Error(`unknown command bin: ${bin}`));
}
const cmdLabel = (cmd) => {
  const bin = Array.isArray(cmd) ? "git" : cmd.bin;
  const args = Array.isArray(cmd) ? cmd : cmd.args;
  return `${bin} ${args.join(" ")}`;
};

/* ----------------------------------------------------------------------------
   INTEGRITY (not just consent). apply() must not be coercible into running
   arbitrary commands via a crafted plan: each action may only run its own
   bin+verb set, re-checked at apply time regardless of what the plan carries.
   ---------------------------------------------------------------------------- */
const ACTION_VERBS = {
  // Commit has no command allowlist: it can only use the sealed-snapshot path.
  commit: {},
  backup: { git: new Set(["push", "bundle"]) },
  connect: { gh: new Set(["repo"]) }, // and the subcommand must be `repo create`
};
function assertAllowed(action, cmd) {
  const bin = Array.isArray(cmd) ? "git" : cmd.bin;
  const args = Array.isArray(cmd) ? cmd : cmd.args;
  const verbs = ACTION_VERBS[action] && ACTION_VERBS[action][bin];
  const verb = args[0];
  const ok = !!verbs && verbs.has(verb) && (action !== "connect" || (verb === "repo" && args[1] === "create"));
  if (!ok) throw new Error(`refused: '${bin} ${verb}' is not permitted for the '${action}' action`);
}
async function tryRead(cwd, args, fallback = null) {
  try {
    return await gitRead(cwd, args);
  } catch {
    return fallback;
  }
}


function hashPart(hash, label, value) {
  const bytes = Buffer.from(String(value), "utf8");
  hash.update(`${label}:${bytes.length}:`, "utf8");
  hash.update(bytes);
  hash.update("\n", "utf8");
}

function hashFileInto(hash, file) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on("data", chunk => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
}

/**
 * Bind approval to the exact observed repository state. Git diffs cover tracked
 * bytes; untracked files are streamed into the digest separately. Any failed
 * read refuses planning or application instead of weakening the snapshot.
 */
async function actionStateFingerprint(projectPath) {
  const target = path.resolve(String(projectPath || ""));
  const state = await projectState(target);
  if (!state.isRepo || state.observation?.status !== "observed") {
    throw new Error("source observation unavailable for exact plan binding");
  }
  const [status, unstaged, staged, remotes, refs, untracked] = await Promise.all([
    gitRead(target, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    gitRead(target, ["diff", "--binary", "--no-ext-diff", "--no-textconv"]),
    gitRead(target, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv"]),
    gitRead(target, ["remote", "-v"]),
    gitRead(target, ["for-each-ref", "--format=%(refname)%00%(objectname)"]),
    gitRead(target, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const hash = createHash("sha256");
  hashPart(hash, "target", target);
  hashPart(hash, "head", state.headSha || "zero-commit");
  hashPart(hash, "branch", state.branch || "detached");
  hashPart(hash, "status", status);
  hashPart(hash, "unstaged", unstaged);
  hashPart(hash, "staged", staged);
  hashPart(hash, "remotes", remotes);
  hashPart(hash, "refs", refs.split(/\r?\n/).filter(Boolean).sort().join("\n"));
  const names = untracked.split("\0").filter(Boolean).sort();
  if (names.length > 4096) throw new Error("too many untracked files for exact plan binding");
  const rootPrefix = target.endsWith(path.sep) ? target : target + path.sep;
  for (const name of names) {
    const file = path.resolve(target, name);
    if (!file.startsWith(rootPrefix)) throw new Error("untracked path escaped the project root");
    const stat = fs.lstatSync(file);
    hashPart(hash, "untracked-path", name);
    hashPart(hash, "untracked-mode", stat.mode);
    hashPart(hash, "untracked-size", stat.size);
    if (stat.isSymbolicLink()) hashPart(hash, "untracked-link", fs.readlinkSync(file));
    else if (stat.isFile()) await hashFileInto(hash, file);
    else throw new Error("unsupported untracked entry in exact plan binding");
  }
  return {
    schema: "mc.action-state-fingerprint/2",
    target,
    sha256: hash.digest("hex"),
    observed: { headSha: state.headSha, branch: state.branch, zeroCommit: state.zeroCommit, dirty: state.dirty },
  };
}

const shaBytes = bytes => createHash("sha256").update(bytes).digest("hex");
const shaFile = file => shaBytes(fs.readFileSync(file));
const stableJson = value => JSON.stringify(value, null, 2) + "\n";

function durableExclusiveWrite(file, bytes) {
  const fd = fs.openSync(file, "wx");
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function looseObjects(objectRoot) {
  const rows = [];
  for (const dir of fs.readdirSync(objectRoot, { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^[a-f0-9]{2}$/.test(dir.name)) continue;
    for (const entry of fs.readdirSync(path.join(objectRoot, dir.name), { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9]{38}$/.test(entry.name)) continue;
      const relative = `${dir.name}/${entry.name}`;
      const absolute = path.join(objectRoot, dir.name, entry.name);
      rows.push({ relative, oid: dir.name + entry.name, bytes: fs.statSync(absolute).size, sha256: shaFile(absolute) });
    }
  }
  return rows.sort((a, b) => a.relative.localeCompare(b.relative));
}

async function commitSnapshotPreflight(target, repositoryKey) {
  await assertReadOnlyGitIntegrations(target, gitRead);
  const signing = (await tryRead(target, ["config", "--bool", "commit.gpgsign"], "false")).trim();
  if (signing === "true") throw new Error("commit planning requires signed-commit snapshot support for this repository");
  const configuredHooks = (await tryRead(target, ["config", "--path", "core.hooksPath"], "")).trim();
  const hooksRoot = configuredHooks
    ? (path.isAbsolute(configuredHooks) ? configuredHooks : path.resolve(target, configuredHooks))
    : path.join(repositoryKey, "hooks");
  for (const hook of ["pre-commit", "prepare-commit-msg", "commit-msg", "post-commit"]) {
    if (fs.existsSync(path.join(hooksRoot, hook))) {
      throw new Error(`commit planning requires an approved-snapshot adapter for the configured ${hook} hook`);
    }
  }
  const name = (await tryRead(target, ["config", "--get", "user.name"], "")).trim();
  const email = (await tryRead(target, ["config", "--get", "user.email"], "")).trim();
  if (!name || !email || /[\r\n]/.test(name + email)) throw new Error("commit identity is unavailable for an immutable approved snapshot");
  return { authorName: name, authorEmail: email };
}

/** Build the exact tree and commit in an engine-private object store. Nothing is
    added to the selected repository. The returned tree/commit identifiers are the
    content the operator approves, so later worktree writes cannot enter it. */
async function captureApprovedCommitSnapshot({ planId, target, repositoryKey, fingerprint, message, createdAt, baseHead, headTarget }) {
  const identity = await commitSnapshotPreflight(target, repositoryKey);
  fs.mkdirSync(APPROVED_SNAPSHOT_ROOT, { recursive: true });
  const directory = path.join(APPROVED_SNAPSHOT_ROOT, planId);
  fs.mkdirSync(directory, { recursive: false });
  const objectRoot = path.join(directory, "objects");
  fs.mkdirSync(path.join(objectRoot, "info"), { recursive: true });
  fs.mkdirSync(path.join(objectRoot, "pack"), { recursive: true });
  const indexPath = path.join(directory, "approved.index");
  const repositoryIndexPath = (await gitRead(target, ["rev-parse", "--path-format=absolute", "--git-path", "index"])).trim();
  const privateEnv = {
    GIT_INDEX_FILE: indexPath,
    GIT_OBJECT_DIRECTORY: objectRoot,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repositoryKey, "objects"),
    GIT_AUTHOR_NAME: identity.authorName,
    GIT_AUTHOR_EMAIL: identity.authorEmail,
    GIT_COMMITTER_NAME: identity.authorName,
    GIT_COMMITTER_EMAIL: identity.authorEmail,
    GIT_AUTHOR_DATE: createdAt,
    GIT_COMMITTER_DATE: createdAt,
  };
  try {
    await gitWithEnvironment(target, baseHead ? ["read-tree", baseHead] : ["read-tree", "--empty"], privateEnv);
    await gitWithEnvironment(target, ["add", "-A"], privateEnv);
    const treeOid = (await gitWithEnvironment(target, ["write-tree"], privateEnv)).trim();
    const commitArgs = ["commit-tree", treeOid];
    if (baseHead) commitArgs.push("-p", baseHead);
    commitArgs.push("-m", message);
    const commitOid = (await gitWithEnvironment(target, commitArgs, privateEnv)).trim();
    if (!/^[a-f0-9]{40,64}$/.test(treeOid) || !/^[a-f0-9]{40,64}$/.test(commitOid)) {
      throw new Error("approved snapshot produced an invalid Git identity");
    }
    const core = {
      schema: "mc.approved-commit-snapshot/2",
      planId, target: path.resolve(target), repositoryKey,
      sourceFingerprintSha256: fingerprint.sha256,
      baseHead: baseHead || null, headTarget, treeOid, commitOid, message, createdAt,
      author: identity, repositoryIndexPath,
      index: { bytes: fs.statSync(indexPath).size, sha256: shaFile(indexPath) },
      objects: looseObjects(objectRoot),
    };
    const approvedSnapshotSha256 = shaBytes(Buffer.from(stableJson(core), "utf8"));
    const manifest = { ...core, approvedSnapshotSha256 };
    const manifestPath = path.join(directory, "MANIFEST.json");
    durableExclusiveWrite(manifestPath, stableJson(manifest));
    return Object.freeze({
      directory, objectRoot, indexPath, manifestPath,
      manifestFileSha256: shaFile(manifestPath), approvedSnapshotSha256,
      baseHead: baseHead || null, headTarget, treeOid, commitOid,
      repositoryIndexPath, objectCount: manifest.objects.length,
      objectBytes: manifest.objects.reduce((sum, item) => sum + item.bytes, 0),
    });
  } catch (error) {
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* preserve original error */ }
    throw error;
  }
}

function verifyApprovedCommitSnapshot(snapshot) {
  if (!snapshot || !fs.existsSync(snapshot.manifestPath)) throw new Error("approved snapshot is unavailable");
  if (shaFile(snapshot.manifestPath) !== snapshot.manifestFileSha256) throw new Error("approved snapshot manifest changed");
  const manifest = JSON.parse(fs.readFileSync(snapshot.manifestPath, "utf8"));
  const { approvedSnapshotSha256, ...core } = manifest;
  if (approvedSnapshotSha256 !== snapshot.approvedSnapshotSha256
      || shaBytes(Buffer.from(stableJson(core), "utf8")) !== approvedSnapshotSha256
      || manifest.treeOid !== snapshot.treeOid || manifest.commitOid !== snapshot.commitOid
      || manifest.headTarget !== snapshot.headTarget
      || manifest.index.sha256 !== shaFile(snapshot.indexPath)) throw new Error("approved snapshot seal changed");
  for (const object of manifest.objects) {
    const file = path.join(snapshot.objectRoot, object.relative);
    if (!fs.existsSync(file) || fs.statSync(file).size !== object.bytes || shaFile(file) !== object.sha256) {
      throw new Error(`approved snapshot object changed: ${object.oid}`);
    }
  }
  return manifest;
}

function discardApprovedSnapshot(record) {
  const directory = record?.approvedSnapshot?.directory;
  if (!directory) return;
  const root = path.resolve(APPROVED_SNAPSHOT_ROOT) + path.sep;
  const selected = path.resolve(directory);
  if (!selected.startsWith(root)) throw new Error("approved snapshot cleanup escaped its private root");
  fs.rmSync(selected, { recursive: true, force: true });
}

async function canonicalRepositoryKey(projectPath) {
  const target = await assertOwnWorktreeRoot(projectPath, gitRead);
  const raw = (await gitRead(target, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(target, raw);
  let canonical = fs.realpathSync.native(absolute);
  if (process.platform === "win32") canonical = canonical.toLowerCase();
  return canonical;
}

/* ----------------------------------------------------------------------------
   Remote intelligence. A backup must go to the RIGHT place: GitHub by default,
   never a deprecated non-GitHub remote just because it sorts first. We read each
   remote's URL and classify it, then prefer a GitHub `origin`, then any GitHub
   remote; the operator can always override the target.
   ---------------------------------------------------------------------------- */
function isGitHubUrl(url) {
  const value = String(url || "");
  if (/^(?:[^/@:\s]+@)?github\.com:[^\s]+$/i.test(value)) return true;
  try { return new URL(value).hostname.toLowerCase() === "github.com"; }
  catch { return false; }
}
/** Parse `git remote -v` into one row per remote. The acting destination is
    the push URL; a distinct fetch URL is retained only as supporting evidence. */
function parseRemotes(verbose) {
  const map = new Map();
  for (const line of String(verbose || "").split("\n")) {
    const m = line.match(/^(\S+)\s+(.+)\s+\((fetch|push)\)$/);
    if (!m) continue;
    const [, name, url, kind] = m;
    if (!map.has(name)) map.set(name, { name, fetchUrls: [], pushUrls: [] });
    map.get(name)[kind === "push" ? "pushUrls" : "fetchUrls"].push(url);
  }
  return [...map.values()].map((remote) => {
    const fetchUrl = remote.fetchUrls[0] || null;
    const pushUrl = remote.pushUrls.length === 1 ? remote.pushUrls[0] : null;
    const url = pushUrl || fetchUrl;
    return { ...remote, fetchUrl, pushUrl, url, isGitHub: remote.pushUrls.length > 0 && remote.pushUrls.every(isGitHubUrl) };
  });
}
/** Choose the backup remote: an explicit pick wins, else a GitHub `origin`, else
    any GitHub remote. Returns null when there is no GitHub remote (and no explicit
    pick) so the caller can fall back to a safe local backup instead of a deprecated
    or non-GitHub remote. */
function pickRemote(detailed, preferName) {
  if (preferName) {
    return detailed.find((r) => r.name === preferName) || null;
  }
  const gh = detailed.filter((r) => r.isGitHub);
  return gh.find((r) => r.name === "origin") || gh[0] || null;
}

async function backupDestination(target, remoteName, expectedUrl = null) {
  let rewrites = "";
  try { rewrites = await gitRead(target, ["config", "--includes", "--null", "--name-only", "--get-regexp", "^url\\."]); }
  catch (error) { if (error.code !== 1) throw error; }
  if (rewrites.split("\0").some((key) => /\.(?:insteadof|pushinsteadof)$/i.test(key))) {
    throw new Error("Remote backup with URL rewrite rules requires a qualified destination adapter; use a local bundle.");
  }
  const urls = (await gitRead(target, ["remote", "get-url", "--push", "--all", remoteName])).trim().split(/\r?\n/).filter(Boolean);
  if (urls.length !== 1) throw new Error("Remote backup requires exactly one reviewed push destination; use a local bundle for multi-destination remotes.");
  if (expectedUrl !== null && urls[0] !== expectedUrl) throw new Error("The reviewed backup destination changed; review a new plan.");
  return urls[0];
}

/* ----------------------------------------------------------------------------
   READ-ONLY deep reads.
   ---------------------------------------------------------------------------- */

/** The real, current git state of a project (the source of every plan). */
async function projectState(projectPath) {
  try { await assertOwnWorktreeRoot(projectPath, gitRead); }
  catch (error) { return { path: projectPath, isRepo: false, observation: error.code === "NO_GIT_MARKER" ? { status: "observed" } : { status: "unavailable", failed: ["source-binding"] } }; }
  const probe = async args => { try { const raw = await gitRead(projectPath, args); return { ok: true, text: raw.trim(), raw }; } catch (error) { return { ok: false, code: error.code, message: error.message }; } };
  const repo = await probe(["rev-parse", "--is-inside-work-tree"]);
  if (!repo.ok) {
    // Git's explicit C-locale no-repository response is an observation; a missing
    // path, permission error, timeout, or other failure does not prove absence.
    if (repo.code === 128 && /fatal: not a git repository \(or any of the parent directories\): \.git/.test(repo.message))
      return { path: projectPath, isRepo: false, observation: { status: "observed" } };
    return { path: projectPath, isRepo: false, observation: { status: "unavailable", failed: ["repository"] } };
  }
  if (repo.text !== "true") return { path: projectPath, isRepo: false, observation: { status: "observed" } };
  try { await assertReadOnlyGitIntegrations(projectPath, gitRead); }
  catch (error) { return { path: projectPath, isRepo: true, observation: { status: "unavailable", failed: ["worktree", "git-integrations"], reason: error.message } }; }
  const status = await probe(["status", "--porcelain"]);
  const remote = await probe(["remote", "-v"]);
  const head = await probe(["rev-parse", "--verify", "--quiet", "HEAD"]);
  const branch = await probe(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const failed = [];
  if (!status.ok) failed.push("worktree");
  if (!remote.ok) failed.push("remotes");
  const zeroCommit = !head.ok && head.code === 1 && branch.ok;
  if (!head.ok && !zeroCommit) failed.push("HEAD");
  if (!branch.ok && branch.code !== 1) failed.push("branch");
  if (failed.length) return { path: projectPath, isRepo: true, observation: { status: "unavailable", failed } };
  const dirtyFiles = status.raw.split("\n").filter(Boolean).map(line => ({ status: line.slice(0, 2).trim(), file: line.slice(3) }));
  const remotesDetailed = parseRemotes(remote.text);
  const remotes = remotesDetailed.map(item => item.name);
  let ahead = null, behind = null, upstream = null, lastCommit = null;
  if (!zeroCommit) {
    upstream = (await tryRead(projectPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "")).trim() || null;
    if (upstream) {
      const counts = (await tryRead(projectPath, ["rev-list", "--left-right", "--count", upstream + "...HEAD"], "")).trim().match(/(\d+)\s+(\d+)/);
      if (counts) { behind = Number(counts[1]); ahead = Number(counts[2]); }
    }
    lastCommit = (await tryRead(projectPath, ["log", "-1", "--pretty=%h %s"], "")).trim() || null;
  }
  return { path: projectPath, isRepo: true, branch: branch.ok ? branch.text : null, dirtyFiles, dirty: dirtyFiles.length,
    remotes, remotesDetailed, headSha: head.ok ? head.text : null, zeroCommit, ahead, behind, upstream, lastCommit,
    observation: { status: "observed" } };
}

/** Real history: actual git log, plus parsed DECISION_REGISTRY / BATCH_LOG anchors.
    Everything returned here is REAL (recorded); the UI keeps reconstructed points
    only where this returns nothing, and labels them. */
async function history(projectPath, { limit = 40 } = {}) {
  const events = [];
  const state = await projectState(projectPath);
  if (state.observation?.status === "unavailable") return { status: "unavailable", events, empty: false, sources: [], reason: "repository-observation-unavailable" };
  if (!state.isRepo) return { events, empty: true, emptyKind: "not-git", sources: [] };
  if (state.zeroCommit) return { events, empty: true, emptyKind: "zero-commit", sources: ["git"] };

  const SEP = "\x1f", REC = "\x1e";
  const fmt = ["%H", "%h", "%aI", "%s", "%an"].join(SEP);
  let raw;
  try { raw = await gitRead(projectPath, ["log", `--pretty=${fmt}${REC}`, `-${limit}`]); }
  catch { return { status: "unavailable", events, empty: false, sources: [], reason: "git-history-unavailable" }; }
  for (const rec of raw.split(REC)) {
    const line = rec.trim();
    if (!line) continue;
    const [hash, short, iso, subject, author] = line.split(SEP);
    if (!hash) continue;
    const tag = (subject.match(/\[([AB]\d+(?:\.\d+)*|DR-\d+)\]/) || [])[1];
    // Preserve a recorded entry whose date cannot be parsed without inventing a date.
    const at = new Date(iso).getTime();
    events.push({
      kind: tag ? "release" : "commit",
      at: Number.isFinite(at) ? at : null,
      synthetic: false,
      title: subject.replace(/\s*\[[^\]]+\]\s*$/, "").trim() || subject,
      tag: tag || short,
      summary: `Recorded commit by ${author} on ${state.branch || "this branch"}.`,
      raw: { hash, short, author, when: iso, subject, source: "git log (recorded)" },
    });
  }

  // parse the project's own registries for real decision/batch anchors
  const sources = ["git"];
  for (const [file, kind] of [["DECISION_REGISTRY.md", "decision"], ["BATCH_LOG.md", "release"]]) {
    const fp = path.join(projectPath, file);
    if (!fs.existsSync(fp)) continue;
    sources.push(file);
    const text = fs.readFileSync(fp, "utf8");
    const re = /^##\s+(\[[AB][\w.]+\]|DR-\d+)\s*\|\s*([\d-]+)\s*\|\s*(.+)$/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      const at = /^\d{4}-\d{2}-\d{2}$/.test(m[2]) ? Date.parse(`${m[2]}T00:00:00.000Z`) : NaN;
      const validDate = Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === m[2];
      events.push({
        kind,
        at: validDate ? at : null,
        synthetic: false,
        title: m[3].trim(),
        tag: m[1].replace(/[[\]]/g, ""),
        summary: `Recorded ${kind} from ${file}.`,
        raw: { source: `recorded (${file})`, entry: m[1], date: m[2], title: m[3].trim() },
      });
    }
  }

  events.sort((a, b) => a.at == null ? (b.at == null ? 0 : 1) : b.at == null ? -1 : a.at - b.at);
  const dated = events.filter(event => event.at != null);
  return { events, empty: events.length === 0, sources, span: { from: dated[0]?.at, to: dated[dated.length - 1]?.at } };
}

/** A read-only per-file diff (names + the actual patch for one file). */
async function diff(projectPath, file) {
  const state = await projectState(projectPath);
  if (state.observation?.status === "unavailable") return { isRepo: state.isRepo, status: "unavailable", files: [], patch: null, reason: "Source observation is unavailable." };
  if (!state.isRepo) return { isRepo: false, files: [] };
  const numstat = (await tryRead(projectPath, ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "HEAD"], "")) || "";
  const files = numstat.split("\n").filter(Boolean).map((l) => {
    const [add, del, f] = l.split("\t");
    return { file: f, additions: add === "-" ? null : Number(add), deletions: del === "-" ? null : Number(del) };
  });
  let patch = null;
  if (file) patch = await tryRead(projectPath, ["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--", file], "");
  return { isRepo: true, files, patch };
}

/* ----------------------------------------------------------------------------
   GATED ACTUATION. Each action knows how to build a plan from real state and how
   to roll itself back. plan() never writes; apply() runs the write commands.
   ---------------------------------------------------------------------------- */

let planSeq = 0;
function nextId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${(planSeq++).toString(36)}`;
}

const PLAN_TTL_MS = 5 * 60 * 1000;
const MAX_ISSUED_PLANS = 128;
const issuedPlans = new Map();
const repositoryLocks = new Map();
let journalRecovery = null;

function isDurableTerminalResult(entry) {
  if (!entry || entry.outcome === "outcome-unconfirmed" || entry.standing === "unknown") return false;
  return (entry.outcome === "completed" && entry.standing === "applied")
    || (entry.outcome === "failed-effects-possible" && entry.standing === "failed");
}

/** Recover the intent/result journal once. A missing journal is a clean start;
    an existing unreadable or malformed journal is an unknown outcome and blocks
    every new actuation until a human reconciles the retained evidence. */
function journalState() {
  if (journalRecovery) return journalRecovery;
  const unresolved = new Set();
  const pending = new Map();
  try {
    const raw = fs.readFileSync(AUDIT_PATH, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    for (const line of lines) {
      const entry = JSON.parse(line);
      if (!entry || typeof entry !== "object" || typeof entry.kind !== "string") {
        throw new Error("journal entry has no kind");
      }
      if (entry.kind === "apply-intent") {
        if (typeof entry.attemptId !== "string" || typeof entry.repositoryKey !== "string") {
          throw new Error("apply intent is missing its durable identity");
        }
        pending.set(entry.attemptId, entry.repositoryKey);
      }
      if (entry.kind === "apply-result") {
        if (typeof entry.attemptId !== "string") throw new Error("apply result is missing its attempt identity");
        if (isDurableTerminalResult(entry)) pending.delete(entry.attemptId);
      }
    }
    for (const key of pending.values()) unresolved.add(key);
    journalRecovery = { trusted: true, unresolved, error: null };
  } catch (error) {
    if (error && error.code === "ENOENT") journalRecovery = { trusted: true, unresolved, error: null };
    else journalRecovery = { trusted: false, unresolved, error: "The retained actuation journal cannot be verified." };
  }
  return journalRecovery;
}

async function withRepositoryLock(repositoryKey, operation) {
  const prior = repositoryLocks.get(repositoryKey) || Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const tail = prior.catch(() => {}).then(() => gate);
  repositoryLocks.set(repositoryKey, tail);
  await prior.catch(() => {});
  try {
    return await operation();
  } finally {
    release();
    if (repositoryLocks.get(repositoryKey) === tail) repositoryLocks.delete(repositoryKey);
  }
}

function publicPlan(record) {
  const { privatePlan, expiresAt, fingerprint, approvedSnapshot } = record;
  const { commands, ensureDirs, computedFrom, execution, reversible, reversibleNote, ...visible } = privatePlan;
  return {
    ...visible,
    expiresAt: new Date(expiresAt).toISOString(),
    standing: "issued",
    binding: { schema: fingerprint.schema, sha256: fingerprint.sha256 },
    ...(approvedSnapshot ? { approvedSnapshot: {
      schema: "mc.approved-commit-snapshot/2",
      sha256: approvedSnapshot.approvedSnapshotSha256,
      treeOid: approvedSnapshot.treeOid,
      commitOid: approvedSnapshot.commitOid,
      headRef: approvedSnapshot.headTarget,
      objectCount: approvedSnapshot.objectCount,
      objectBytes: approvedSnapshot.objectBytes,
    } } : {}),
    recovery: "Automatic undo is not offered. Any recovery requires a new current-state review.",
  };
}

function pruneIssuedPlans(now = Date.now()) {
  for (const [id, record] of issuedPlans) if (record.expiresAt < now) {
    issuedPlans.delete(id);
    discardApprovedSnapshot(record);
  }
}

async function terminalRefusal(record, event, error) {
  const lifecycle = await reducePlanStanding(["issue", event]);
  const standing = lifecycle.ok ? lifecycle.standing : "unknown";
  const rec = {
    id: nextId("applied"),
    action: record.privatePlan.action, target: record.privatePlan.target,
    ok: false, standing, error, results: [], at: new Date().toISOString(),
  };
  await audit({ kind: "apply-refused", ...rec, lifecycleEvaluation: lifecycle.evaluation });
  return rec;
}

/** Build a deterministic default commit message from the real state. */
function defaultMessage(state) {
  const n = state.dirty;
  return `Save work in progress (${n} file${n === 1 ? "" : "s"})`;
}

const ACTIONS = {
  /** SAVE / COMMIT at-risk work into a commit so it cannot be lost. */
  commit: {
    title: "Save your work (commit)",
    explain: "Records all your current changes as a commit, so the work can't be lost.",
    async plan(projectPath, opts = {}) {
      const state = await projectState(projectPath);
      if (state.observation?.status === "unavailable") return { feasible: false, reason: "Source observation is unavailable; no action planned." };
      if (!state.isRepo) return { feasible: false, reason: "The selected source has no own Git working tree." };
      if (state.dirty === 0 && !state.zeroCommit) {
        return { feasible: false, reason: "Nothing to save: there are no uncommitted changes." };
      }
      const headTarget = (await tryRead(projectPath, ["symbolic-ref", "--quiet", "HEAD"], "")).trim();
      if (!/^refs\/heads\/[^\r\n]+$/.test(headTarget)) {
        return { feasible: false, reason: "Commit planning requires HEAD to name one local branch." };
      }
      const indirectBranch = (await tryRead(projectPath, ["symbolic-ref", "--quiet", headTarget], "")).trim();
      if (indirectBranch) {
        return { feasible: false, reason: "Commit planning requires the selected local branch to be a direct Git ref." };
      }
      const message = (opts.message || defaultMessage(state)).replace(/\n/g, " ").trim();
      const steps = [
        { n: 1, label: `Seal ${state.dirty} changed file${state.dirty === 1 ? "" : "s"} into the approved snapshot`, before: `${state.dirty} unsaved`, after: "exact content identity retained privately" },
        { n: 2, label: `Commit only that sealed snapshot on "${state.branch || "HEAD"}"`, before: state.zeroCommit ? "no commits yet" : state.lastCommit, after: `new commit: "${message}"` },
      ];
      return {
        feasible: true,
        action: "commit",
        title: this.title,
        explain: this.explain,
        target: projectPath,
        message,
        steps,
        commands: [],
        execution: "approved-snapshot-commit",
        computedFrom: { dirty: state.dirty, branch: state.branch, headTarget, headSha: state.headSha, zeroCommit: state.zeroCommit, files: state.dirtyFiles },
      };
    },
  },

  /** BACK UP committed work. Surfaces EVERY target as a choice (GitHub remotes,
      other remotes, a local bundle) so the operator controls where it goes.
      Defaults to a GitHub remote (origin first), NEVER a deprecated non-GitHub
      remote just because it sorts first; falls back to a safe local bundle when
      there is no GitHub remote and none is explicitly chosen. opts.remote pins a
      remote; opts.target==='bundle' forces the local bundle. */
  backup: {
    title: "Back up your work",
    explain: "Copies your saved work somewhere safe off this working folder.",
    async plan(projectPath, opts = {}) {
      const state = await projectState(projectPath);
      if (state.observation?.status === "unavailable") return { feasible: false, reason: "Source observation is unavailable; no action planned." };
      if (!state.isRepo) return { feasible: false, reason: "The selected source has no own Git working tree." };
      if (state.zeroCommit) return { feasible: false, reason: "Nothing to back up yet: make a commit first." };

      const detailed = state.remotesDetailed || [];
      const choices = [
        ...detailed.map((r) => ({ id: r.name, kind: "remote", name: r.name, url: r.url, fetchUrl: r.fetchUrl, pushUrl: r.pushUrl, fetchUrls: r.fetchUrls, pushUrls: r.pushUrls, isGitHub: r.isGitHub })),
        { id: "bundle", kind: "bundle", name: "Local backup file", isGitHub: false },
      ];
      const branch = state.branch || "HEAD";
      const chosenRemote = pickRemote(detailed, opts.remote);
      if (opts.remote && !chosenRemote && opts.target !== "bundle") return { feasible: false, reason: "The selected backup remote is not configured.", choices };
      const wantBundle = opts.target === "bundle" || (!chosenRemote && opts.remote == null);

      if (wantBundle) {
        const backupsDir = path.join(DATA_DIR, "backups");
        const name = `${path.basename(projectPath)}_${Date.now().toString(36)}.bundle`;
        const bundlePath = path.join(backupsDir, name);
        return {
          feasible: true, action: "backup", title: this.title, explain: this.explain, target: projectPath,
          targetKind: "bundle", noGitHub: detailed.every((r) => !r.isGitHub),
          steps: [{ n: 1, label: detailed.length ? "Write a full local backup (no GitHub remote set)" : "Write a full local backup bundle", before: "only in this working folder", after: bundlePath }],
          commands: [["bundle", "create", bundlePath, "--all"]], ensureDirs: [backupsDir],
          choices, computedFrom: { mode: "bundle", bundlePath, availableRemotes: detailed.map((r) => r.name) },
        };
      }

      const r = chosenRemote || detailed.find((x) => x.name === opts.remote);
      if (!state.branch) return { feasible: false, reason: "Remote backup requires one selected local branch; use a local bundle for detached HEAD.", choices };
      let destination;
      try { destination = await backupDestination(projectPath, r.name); }
      catch (error) { return { feasible: false, reason: error.message, choices }; }
      return {
        feasible: true, action: "backup", title: this.title, explain: this.explain, target: projectPath,
        targetKind: "remote", remote: { name: r.name, url: destination, fetchUrl: r.fetchUrl, pushUrl: destination, pushUrls: [destination], isGitHub: isGitHubUrl(destination) },
        steps: [{ n: 1, label: `Push "${branch}" to ${r.name}${r.isGitHub ? " (GitHub)" : " (not GitHub)"}`, before: state.ahead == null ? "backup state unknown" : `${state.ahead} commit(s) not backed up`, after: `backed up to ${r.name}` }],
        commands: [["push", "--", destination, `${state.headSha}:refs/heads/${branch}`]],
        choices, computedFrom: { remote: r.name, url: destination, isGitHub: isGitHubUrl(destination), branch, headSha: state.headSha, ahead: state.ahead, otherRemotes: detailed.filter((x) => x.name !== r.name).map((x) => x.name) },
      };
    },
  },

  /** Repository creation is deliberately unavailable. The former plan observed
      one mutable gh account and could later execute against another. Read-only
      GitHub status and already-configured remote backup remain available. */
  connect: {
    title: "Connect to GitHub",
    explain: "Repository creation stays unavailable until its execution identity is bound to the preview.",
    async plan() {
      return {
        feasible: false,
        reason: "GitHub repository creation is unavailable until host, account, and environment binding is source-qualified.",
      };
    },
  },
};

/** Compute a plan. Target repository state is not mutated. Commit plans seal a
    private object/index snapshot before the approval handle is returned. */
async function plan(actionKind, projectPath, opts = {}) {
  const action = ACTIONS[actionKind];
  if (!action) throw new Error(`unknown action: ${actionKind}`);
  const recovered = journalState();
  if (!recovered.trusted) {
    return { feasible: false, reason: `${recovered.error} No write can be planned until it is reconciled.` };
  }
  let repositoryKey = null;
  try { repositoryKey = await canonicalRepositoryKey(projectPath); } catch { /* action planner reports non-repository state */ }
  if (repositoryKey && recovered.unresolved.has(repositoryKey)) {
    return { feasible: false, reason: "A previous attempt has no durable terminal result. Inspect the audit before planning another write." };
  }
  const p = await action.plan(projectPath, opts);
  if (p.feasible === false) return p;
  pruneIssuedPlans();
  if (issuedPlans.size >= MAX_ISSUED_PLANS) throw new Error("too many outstanding plans; approve or re-open the safety gate");
  if (!repositoryKey) repositoryKey = await canonicalRepositoryKey(projectPath);
  const createdAt = new Date();
  const built = { id: `plan_${randomUUID()}`, createdAt: createdAt.toISOString(), ...p };
  const fingerprint = await actionStateFingerprint(projectPath);
  let approvedSnapshot = null;
  try {
    if (built.execution === "approved-snapshot-commit") {
      approvedSnapshot = await captureApprovedCommitSnapshot({
        planId: built.id, target: built.target, repositoryKey, fingerprint,
        message: built.message, createdAt: built.createdAt,
        baseHead: built.computedFrom?.headSha || null,
        headTarget: built.computedFrom?.headTarget,
      });
      const afterCapture = await actionStateFingerprint(projectPath);
      if (afterCapture.sha256 !== fingerprint.sha256) {
        throw new Error("source changed while the approved snapshot was being sealed; review a new plan");
      }
    }
    const lifecycle = await reducePlanStanding(["issue"]);
    if (!lifecycle.ok || lifecycle.standing !== "issued") throw new Error("plan blocked: approval lifecycle unavailable");
  } catch (error) {
    if (approvedSnapshot) discardApprovedSnapshot({ approvedSnapshot });
    throw error;
  }
  const record = { privatePlan: built, fingerprint, approvedSnapshot, repositoryKey, expiresAt: createdAt.getTime() + PLAN_TTL_MS };
  issuedPlans.set(built.id, record);
  await audit({
    kind: "plan", planId: built.id, action: actionKind, target: projectPath, repositoryKey, commands: built.commands,
    ...(approvedSnapshot ? { approvedSnapshotSha256: approvedSnapshot.approvedSnapshotSha256,
      approvedTreeOid: approvedSnapshot.treeOid, approvedCommitOid: approvedSnapshot.commitOid,
      approvedHeadRef: approvedSnapshot.headTarget } : {}),
  });
  return publicPlan(record);
}

/** Apply a server-issued plan once. The caller returns only its opaque id. */
async function apply(planId, { approve = false } = {}) {
  if (typeof planId !== "string" || !/^plan_[0-9a-f-]{36}$/.test(planId)) throw new Error("apply requires a server-issued plan id");
  if (approve !== true) throw new Error("apply blocked: explicit approval (approve:true) is required");
  const record = issuedPlans.get(planId);
  if (!record) throw new Error("apply blocked: plan is unknown, consumed, or no longer available");
  // Claim synchronously before the first await. Duplicate callers cannot reserve
  // the same receipt, even while this attempt waits behind another repository write.
  issuedPlans.delete(planId);
  const result = await withRepositoryLock(record.repositoryKey, () => applyReserved(record));
  if (result?.standing !== "unknown" && result?.outcome !== "outcome-unconfirmed") discardApprovedSnapshot(record);
  return result;
}

function acquireApprovedIndexReplacement(snapshot, manifest) {
  if (path.resolve(snapshot.repositoryIndexPath) !== path.resolve(manifest.repositoryIndexPath)) {
    throw new Error("approved snapshot index destination changed");
  }
  const lockPath = `${snapshot.repositoryIndexPath}.lock`;
  const bytes = fs.readFileSync(snapshot.indexPath);
  if (shaBytes(bytes) !== manifest.index.sha256) throw new Error("approved snapshot index changed");
  let fd;
  try {
    fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
  let active = true;
  return Object.freeze({
    assertCurrent() {
      if (!active || !fs.existsSync(lockPath) || shaFile(lockPath) !== manifest.index.sha256) {
        throw new Error("approved index replacement changed");
      }
      return true;
    },
    commit() {
      this.assertCurrent();
      fs.renameSync(lockPath, snapshot.repositoryIndexPath);
      active = false;
      if (shaFile(snapshot.repositoryIndexPath) !== manifest.index.sha256) {
        const error = new Error("approved index replacement could not be verified after ref update");
        error.outcomeUnconfirmed = true;
        throw error;
      }
      return true;
    },
    discard() {
      if (!active) return;
      try { fs.unlinkSync(lockPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      active = false;
    },
  });
}

/** Reserve the selected worktree's symbolic HEAD only after Git has advanced the
    exact approved branch ref. Supported Git writers honor HEAD.lock. Holding it
    across index installation prevents the checked-out branch from being swapped
    between the exact ref compare-and-swap and the approved index replacement. */
function acquireApprovedHeadReservation(headPath, expectedTarget) {
  const selected = path.resolve(headPath);
  const lockPath = `${selected}.lock`;
  const expected = `ref: ${expectedTarget}`;
  let fd = null;
  try {
    fd = fs.openSync(lockPath, "wx");
    const current = fs.readFileSync(selected, "utf8").trim();
    if (current !== expected) throw new Error(`HEAD no longer names the approved branch ${expectedTarget}`);
    fs.writeFileSync(fd, `${expected}\n`);
    fs.fsyncSync(fd);
  } catch (error) {
    if (fd != null) {
      try { fs.closeSync(fd); } catch { /* preserve original error */ }
      fd = null;
      try { fs.unlinkSync(lockPath); } catch (cleanup) { if (cleanup?.code !== "ENOENT") error.outcomeUnconfirmed = true; }
    }
    throw error;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
  const lockSha256 = shaFile(lockPath);
  let active = true;
  return Object.freeze({
    assertCurrent() {
      if (!active || !fs.existsSync(lockPath) || shaFile(lockPath) !== lockSha256
          || fs.readFileSync(selected, "utf8").trim() !== expected) {
        throw new Error("approved branch HEAD reservation changed");
      }
      return true;
    },
    discard() {
      if (!active) return;
      try { fs.unlinkSync(lockPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      active = false;
    },
  });
}

function importApprovedObjects(record, manifest) {
  const destinationRoot = path.join(record.repositoryKey, "objects");
  for (const object of manifest.objects) {
    const source = path.join(record.approvedSnapshot.objectRoot, object.relative);
    const destination = path.join(destinationRoot, object.relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (!fs.existsSync(destination)) {
      // Git makes loose objects read-only. Write and flush a private temporary
      // file first, then copy it into the immutable object namespace without
      // replacing a concurrently imported object.
      const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
      let fd;
      try {
        try {
          fd = fs.openSync(temporary, "wx");
          fs.writeFileSync(fd, fs.readFileSync(source));
          fs.fsyncSync(fd);
        } finally {
          if (fd != null) fs.closeSync(fd);
        }
        let created = false;
        try {
          fs.copyFileSync(temporary, destination, fs.constants.COPYFILE_EXCL);
          created = true;
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
        }
        if (created) {
          const destinationFd = fs.openSync(destination, "r+");
          try { fs.fsyncSync(destinationFd); } finally { fs.closeSync(destinationFd); }
          try { fs.chmodSync(destination, 0o444); } catch { /* Windows ACLs remain authoritative */ }
        }
      } finally {
        try { fs.unlinkSync(temporary); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      }
    }
  }
}

async function executeApprovedCommit(record, manifest, indexReplacement, results) {
  const target = record.privatePlan.target;
  if (Number(process.env.MC_TEST_FAIL_BEFORE_COMMAND_INDEX) === 0) throw new Error("injected failure before approved object import");
  importApprovedObjects(record, manifest);
  await gitRead(target, ["cat-file", "-e", `${manifest.commitOid}^{commit}`]);
  results.push({ command: "git import approved snapshot objects", ok: true, output: manifest.approvedSnapshotSha256 });
  if (Number(process.env.MC_TEST_FAIL_BEFORE_COMMAND_INDEX) === 1) throw new Error("injected failure before approved ref update");
  const delay = Number(process.env.MC_TEST_COMMAND_DELAY_MS || 0);
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  indexReplacement.assertCurrent();
  const headPath = (await gitRead(target, ["rev-parse", "--path-format=absolute", "--git-path", "HEAD"])).trim();
  const oldValue = manifest.baseHead || "0".repeat(manifest.commitOid.length);
  await gitWrite(target, ["update-ref", "--no-deref", manifest.headTarget, manifest.commitOid, oldValue]);
  results.push({ command: `git update-ref exact approved branch ${manifest.headTarget}`, ok: true, output: manifest.commitOid });
  let headReservation = null;
  let indexInstalled = false;
  let operationError = null;
  try {
    headReservation = acquireApprovedHeadReservation(headPath, manifest.headTarget);
    indexReplacement.commit();
    indexInstalled = true;
    headReservation.assertCurrent();
  } catch (error) {
    operationError = error;
    if (indexInstalled) error.outcomeUnconfirmed = true;
    throw error;
  } finally {
    if (headReservation) {
      try { headReservation.discard(); }
      catch (error) {
        error.outcomeUnconfirmed = true;
        if (operationError) operationError.outcomeUnconfirmed = true;
        else throw error;
      }
    }
  }
}

async function applyReserved(record) {
  const builtPlan = record.privatePlan;
  let approvedManifest = null;
  let indexReplacement = null;
  if (!ACTIONS[builtPlan.action]) throw new Error(`apply blocked: unknown action '${builtPlan.action}'`);
  if (Date.now() > record.expiresAt) return terminalRefusal(record, "expire", "Plan expired; re-open the safety gate to review current state.");
  const recovered = journalState();
  if (!recovered.trusted) {
    return terminalRefusal(record, "refuse", "The retained actuation journal cannot be verified; no command was run.");
  }
  if (recovered.unresolved.has(record.repositoryKey)) {
    return terminalRefusal(record, "refuse", "A prior attempt has no durable terminal result; inspect the audit before another write.");
  }
  let currentFingerprint;
  try { currentFingerprint = await actionStateFingerprint(builtPlan.target); }
  catch { return terminalRefusal(record, "refuse", "Source state could not be re-observed; no command was run."); }
  if (currentFingerprint.sha256 !== record.fingerprint.sha256) {
    return terminalRefusal(record, "stale", "Source state changed after preview; review a new plan before applying.");
  }

  if (builtPlan.execution === "approved-snapshot-commit") {
    try {
      approvedManifest = verifyApprovedCommitSnapshot(record.approvedSnapshot);
    } catch (error) {
      return terminalRefusal(record, "refuse", `Approved snapshot could not be verified (${error.message}); no commit ref was changed.`);
    }
  }

  // Defense in depth over the private server-issued command set.
  for (const cmd of builtPlan.commands || []) assertAllowed(builtPlan.action, cmd);
  if (builtPlan.action === "backup" && builtPlan.targetKind === "remote") {
    try { await backupDestination(builtPlan.target, builtPlan.computedFrom.remote, builtPlan.computedFrom.url); }
    catch (error) { return terminalRefusal(record, "refuse", `${error.message} No push was attempted.`); }
  }

  const executing = await reducePlanStanding(["issue", "approve", "begin"]);
  if (!executing.ok || executing.standing !== "executing") {
    if (indexReplacement) indexReplacement.discard();
    return terminalRefusal(record, "refuse", "Approval lifecycle unavailable; no command was run.");
  }

  const target = builtPlan.target;
  const appliedId = nextId("applied");
  const results = [];

  // The durable intent is the point of no return. It contains no receipt secret.
  try {
    await audit({
      kind: "apply-intent", attemptId: appliedId, planId: builtPlan.id,
      action: builtPlan.action, target, repositoryKey: record.repositoryKey,
      fingerprint: record.fingerprint.sha256,
      commands: (builtPlan.commands || []).map(cmdLabel),
      ...(approvedManifest ? { approvedSnapshotSha256: approvedManifest.approvedSnapshotSha256,
        approvedTreeOid: approvedManifest.treeOid, approvedCommitOid: approvedManifest.commitOid,
        approvedHeadRef: approvedManifest.headTarget } : {}),
    }, { required: true });
  } catch {
    if (indexReplacement) indexReplacement.discard();
    return terminalRefusal(record, "refuse", "Execution intent could not be retained; no target command or backup-directory creation was attempted.");
  }
  journalState().unresolved.add(record.repositoryKey);

  try {
    if (approvedManifest) {
      // The index lock is a target-repository effect, so it is acquired only
      // after the durable intent. Reobserve while it is held before importing
      // any approved object or changing the ref.
      indexReplacement = acquireApprovedIndexReplacement(record.approvedSnapshot, approvedManifest);
      const lockedFingerprint = await actionStateFingerprint(builtPlan.target);
      if (lockedFingerprint.sha256 !== record.fingerprint.sha256) {
        throw new Error("source changed before the approved index was reserved");
      }
      await executeApprovedCommit(record, approvedManifest, indexReplacement, results);
    } else {
      (builtPlan.ensureDirs || []).forEach((d) => fs.mkdirSync(d, { recursive: true }));
      for (let index = 0; index < builtPlan.commands.length; index++) {
        const cmd = builtPlan.commands[index];
        const delay = Number(process.env.MC_TEST_COMMAND_DELAY_MS || 0);
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        if (Number(process.env.MC_TEST_FAIL_BEFORE_COMMAND_INDEX) === index) throw new Error(`injected failure before command ${index}`);
        if (builtPlan.action === "backup" && builtPlan.targetKind === "remote") {
          await backupDestination(target, builtPlan.computedFrom.remote, builtPlan.computedFrom.url);
        }
        const out = await runCommand(target, cmd);
        results.push({ command: cmdLabel(cmd), ok: true, output: out.trim().slice(0, 4000) });
      }
    }
  } catch (e) {
    if (indexReplacement) try { indexReplacement.discard(); } catch { /* result remains conservative */ }
    const uncertain = e?.outcomeUnconfirmed === true;
    const lifecycle = await reducePlanStanding(["issue", "approve", "begin", "fail"]);
    const rec = { id: appliedId, action: builtPlan.action, target, ok: false,
      standing: uncertain ? "unknown" : (lifecycle.ok ? lifecycle.standing : "unknown"),
      outcome: uncertain ? "outcome-unconfirmed" : "failed-effects-possible",
      ...(uncertain ? { outcomeUnconfirmed: true } : {}), effectsPossible: true,
      error: `${e.message}. Earlier effects may have occurred; this receipt will not replay.`, results, at: new Date().toISOString() };
    return persistAttemptResult(record, rec, lifecycle.evaluation);
  }

  const lifecycle = await reducePlanStanding(["issue", "approve", "begin", "succeed"]);
  if (!lifecycle.ok || lifecycle.standing !== "applied") {
    const rec = {
      id: appliedId, action: builtPlan.action, target,
      ok: false, standing: "unknown", outcome: "outcome-unconfirmed",
      outcomeUnconfirmed: true, effectsPossible: true, results,
      error: "Commands completed but result standing is unavailable. Inspect the audit; this receipt will not replay.",
      at: new Date().toISOString(),
    };
    return persistAttemptResult(record, rec, lifecycle.evaluation);
  }
  const rec = {
    id: appliedId, action: builtPlan.action, target,
    ok: true, standing: lifecycle.standing, outcome: "completed", results,
    at: new Date().toISOString(),
  };
  return persistAttemptResult(record, rec, lifecycle.evaluation);
}

async function persistAttemptResult(record, rec, lifecycleEvaluation) {
  try {
    await audit({
      kind: "apply-result", attemptId: rec.id, planId: record.privatePlan.id,
      action: rec.action, target: rec.target, repositoryKey: record.repositoryKey,
      ok: rec.ok, standing: rec.standing, outcome: rec.outcome,
      effectsPossible: rec.effectsPossible === true, results: rec.results,
      error: rec.error, lifecycleEvaluation,
      ...(record.approvedSnapshot ? { approvedSnapshotSha256: record.approvedSnapshot.approvedSnapshotSha256,
        approvedTreeOid: record.approvedSnapshot.treeOid,
        approvedCommitOid: record.approvedSnapshot.commitOid,
        approvedHeadRef: record.approvedSnapshot.headTarget } : {}),
    }, { required: true });
    if (isDurableTerminalResult(rec)) journalState().unresolved.delete(record.repositoryKey);
    else journalState().unresolved.add(record.repositoryKey);
    return rec;
  } catch (error) {
    // The durable intent remains unmatched and blocks further writes after restart.
    return {
      ...rec,
      ok: false,
      standing: "unknown",
      outcome: "outcome-unconfirmed",
      outcomeUnconfirmed: true,
      effectsPossible: true,
      error: `Effects may have occurred but the terminal result could not be retained (${error.message}). Inspect the audit; this receipt will not replay.`,
    };
  }
}

/** Compatibility refusal for old in-process callers. It never interprets payloads. */
async function rollback() {
  await audit({ kind: "rollback-retired", ok: false, retired: true });
  return {
    ok: false,
    retired: true,
    error: "Automatic rollback is retired. Recovery requires a new current-state preview and explicit approval.",
  };
}

/* ----------------------------------------------------------------------------
   Audit log and actuation journal. Required intent/result entries are fsynced;
   failure is part of the action outcome instead of being swallowed.
   ---------------------------------------------------------------------------- */
function approvalReference(planId) {
  return createHash("sha256").update(`consumed-approval:${String(planId || "")}`, "utf8").digest("hex");
}

/** Audit evidence must never become a second authorization surface. This also
    redacts older entries at read time, so a pre-existing live plan id or private
    command label is not returned to a renderer. */
function sanitizeAuditValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== "object") return value;
  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "planId") {
      if (!Object.hasOwn(clean, "planRef")) clean.planRef = approvalReference(child);
      continue;
    }
    if (key === "commands") {
      clean.commandCount = Array.isArray(child) ? child.length : 0;
      continue;
    }
    if (key === "command") continue;
    clean[key] = sanitizeAuditValue(child);
  }
  return clean;
}

async function audit(entry, { required = false } = {}) {
  let fd = null;
  try {
    if (process.env.MC_TEST_FAIL_AUDIT_KIND === entry.kind) throw new Error(`injected ${entry.kind} persistence failure`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fd = fs.openSync(AUDIT_PATH, "a");
    const retained = sanitizeAuditValue({ at: new Date().toISOString(), ...entry });
    fs.writeFileSync(fd, JSON.stringify(retained) + "\n", "utf8");
    if (required) fs.fsyncSync(fd);
    return true;
  } catch (error) {
    if (required) throw new Error(`actuation record unavailable: ${error.message}`);
    return false;
  } finally {
    if (fd != null) try { fs.closeSync(fd); } catch { /* close failure follows write result */ }
  }
}
function readAudit({ limit = 100 } = {}) {
  try {
    const lines = fs.readFileSync(AUDIT_PATH, "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => sanitizeAuditValue(JSON.parse(l))).reverse();
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    return [{
      at: new Date().toISOString(),
      kind: "audit-unavailable",
      ok: false,
      error: "The retained actuation journal cannot be verified; no audit entries are being represented as complete.",
    }];
  }
}

module.exports = {
  DATA_DIR, AUDIT_PATH,
  projectState, history, diff,
  githubStatus: () => github.status(),
  githubLogin: () => github.launchLogin(),
  githubSwitch: (opts) => github.switchAccount(opts || {}),
  githubLogout: (opts) => github.logout(opts || {}),
  ACTIONS, actionStateFingerprint, plan, apply, rollback,
  audit, readAudit,
};
