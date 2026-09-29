#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const privatePaths = [
  /^(?:\.neo(?:-sandboxes)?|\.mousecat|node_modules|runtime|traces|artifacts\/local)\//u,
  /^mousecat\.config\.json$/u,
  /^\.env(?:\.|$)/u,
  /\.(?:sqlite|sqlite3|db|docx|pdf)$/u,
  /^design\/.*decision-receipt.*\.json$/u,
  /^design\/mousecat-governance-world-mivpo-examination-20260714-2047Z-1347PST\.md$/u,
  /^apps\/mousecat-world\/Content\/MousecatWorld\/Generated\/.*\.region(?:\.receipt)?\.json$/u,
];
const operatorPath = /[A-Za-z]:[\\/]+Users[\\/]+/u;

// Inspect local Git refs only. Remote retained PRs and third-party mirrors require
// separate verification; a clean tree is explicitly weaker than clean history.
export function auditPublicRelease({ cwd = process.cwd(), treeOnly = false } = {}) {
  function git(args) { return execFileSync("git", args, { cwd, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
  const commits = treeOnly ? [git(["rev-parse", "HEAD"]).toString().trim()] : git(["rev-list", "--all"]).toString().trim().split(/\r?\n/u).filter(Boolean);
  if (!commits.length) throw new Error("No reachable commits to audit");
  const blobs = new Set();
  const findings = new Map();
  const binaryPaths = new Set();
  let bytes = 0;
  for (const commit of commits) {
    for (const entry of git(["ls-tree", "-rz", commit]).toString().split("\0").filter(Boolean)) {
      const separator = entry.indexOf("\t");
      const metadata = entry.slice(0, separator), path = entry.slice(separator + 1);
      const [, type, id] = metadata.split(" ");
      if (type !== "blob") continue;
      if (privatePaths.some(pattern => pattern.test(path))) {
        findings.set("path:" + path, { category: "private-path", path });
        continue;
      }
      if (blobs.has(id)) continue;
      blobs.add(id);
      const body = git(["cat-file", "blob", id]); bytes += body.length;
      if (body.includes(0)) { binaryPaths.add(path); continue; }
      if (operatorPath.test(body.toString("utf8"))) findings.set("blob:" + id, { category: "operator-path", path, blob: id });
    }
  }
  return { ok: findings.size === 0, scope: treeOnly ? "current-tree" : "all-local-git-refs", commits: commits.length,
    textAndBinaryBlobs: blobs.size, bytes, binaryPaths: [...binaryPaths], findings: [...findings.values()],
    remoteRetainedRefsVerified: false, credentialsScanned: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== "--tree")) throw new Error("Unsupported release-check argument");
    const report = auditPublicRelease({ treeOnly: process.argv.includes("--tree") });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch {
    console.error("Public release check could not inspect this Git checkout. No source content is printed.");
    process.exitCode = 1;
  }
}
