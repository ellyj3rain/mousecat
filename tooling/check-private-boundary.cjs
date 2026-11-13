"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
const git = args => execFileSync("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], { cwd: root, env, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }).toString().split(/\r?\n/).filter(Boolean);
const candidates = [...new Set([...git(["diff", "--name-only", "HEAD"]), ...git(["ls-files", "--others", "--exclude-standard"])])];
const findings = [];
for (const relative of candidates) {
  const filename = path.join(root, relative);
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) continue;
  if (/(^|\/)(?:\.local|runtime|traces|\.marshmallow-commons)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:sqlite3?|db)$/i.test(relative)) { findings.push({ path: relative, category: "private-state-path" }); continue; }
  const stat = fs.statSync(filename);
  if (stat.size > 2 * 1024 * 1024 || !/\.(?:[cm]?js|tsx?|json|md|html|css|ya?ml)$/.test(relative)) continue;
  const text = fs.readFileSync(filename, "utf8");
  if (/[A-Za-z]:[\\/]Users[\\/](?!example(?:[\\/]|$)|<)[^\s"'<>\\/]+[\\/]/i.test(text)) findings.push({ path: relative, category: "machine-specific-user-path" });
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\b(?:ghp|sk_live)_[A-Za-z0-9]{12,}/.test(text)) findings.push({ path: relative, category: "secret-shaped-material" });
}
console.log(JSON.stringify({ schema: "mc.source-privacy-check/1", scope: "proposed working-tree changes; history requires separate remediation", checked: candidates.length, findings }, null, 2));
process.exitCode = findings.length ? 1 : 0;
