#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { APPEND_ONLY, runDocChecks } from "../src/core/governance/doc-runner.mjs";

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      ...options,
    }).trim();
  } catch {
    return "";
  }
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function parseNameStatus(raw) {
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\t/u);
      return { status: status[0], path: rest.at(-1) };
    })
    .filter((change) => change.path);
}

function uniqueChanges(changes) {
  const seen = new Map();
  for (const change of changes) seen.set(change.path, change);
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function trackedAndCandidateFiles() {
  return git(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function gitShow(ref, path) {
  return git(["show", `${ref}:${path}`]) || null;
}

function readHead(path) {
  if (existsSync(path)) {
    try {
      return readFileSync(path, "utf8").replace(/^\uFEFF/u, "");
    } catch {
      return null;
    }
  }
  return gitShow("HEAD", path);
}

function resolveBase() {
  const explicit = arg("--base");
  if (explicit) return explicit;
  const ciBase = process.env.GITHUB_BASE_REF || process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME;
  if (ciBase) return git(["merge-base", "HEAD", `origin/${ciBase}`]) || `origin/${ciBase}`;
  return git(["rev-parse", "--verify", "-q", "HEAD~1"]);
}

function title() {
  return arg(
    "--title",
    process.env.PR_TITLE ||
      process.env.GITHUB_HEAD_REF ||
      process.env.CI_MERGE_REQUEST_TITLE ||
      git(["log", "-1", "--format=%s"]),
  );
}

const all = process.argv.includes("--all");
const files = trackedAndCandidateFiles();
let changed = [];
let base = "";

if (all) {
  changed = files
    .filter((file) => file.endsWith(".md") && !APPEND_ONLY.includes(file))
    .map((path) => ({ status: "A", path }));
} else {
  const dirty = git(["status", "--porcelain"]);
  const explicitBase = arg("--base") || process.env.GITHUB_BASE_REF || process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME;
  base = dirty && !explicitBase ? "HEAD" : resolveBase();
  if (base) changed = parseNameStatus(git(["diff", "--name-status", base, "HEAD"]));
  if (dirty && !explicitBase) {
    changed = changed.concat(parseNameStatus(git(["diff", "--name-status", "HEAD"])));
    changed = changed.concat(parseNameStatus(git(["diff", "--cached", "--name-status", "HEAD"])));
    const tracked = new Set(git(["ls-files", "--cached"]).split(/\r?\n/u).filter(Boolean));
    for (const file of files) {
      if (!tracked.has(file)) changed.push({ status: "A", path: file });
    }
  }
  changed = uniqueChanges(changed);
  if (!base && changed.length === 0) {
    changed = files.filter((file) => file.endsWith(".md")).map((path) => ({ status: "A", path }));
  }
}

const result = runDocChecks({
  files,
  changed,
  baseContent: (path) => (base && base !== "HEAD" ? gitShow(base, path) : gitShow("HEAD", path)),
  headContent: readHead,
  title: title(),
});

const marker = (check) => (check.ok ? "ok" : check.level === "error" ? "FAIL" : "warn");
console.log(`\nMousecat PR documentation runner${all ? " (repo-state audit)" : ""}`);
console.log(`changeset: ${changed.length} file(s)${base ? `; base: ${base}` : ""}\n`);
for (const check of result.checks) {
  console.log(`${marker(check).padEnd(5)} ${check.id.padEnd(28)} ${check.message}`);
}
console.log(`\n${result.errors} error(s), ${result.warnings} warning(s) - ${result.ok ? "PASS" : "FAIL"}\n`);

process.exit(result.ok ? 0 : 1);
