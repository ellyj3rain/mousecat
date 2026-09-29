#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HOOKS = Object.freeze(["commit-msg", "pre-commit", "pre-push"]);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function lf(text) {
  return String(text).replace(/\r\n/gu, "\n");
}

export function hookBody(name) {
  if (name === "commit-msg") {
    return `#!/bin/sh
set -eu

subject="$(head -n 1 "$1" || true)"

case "$subject" in
  Merge\\ *|Revert\\ *|fixup!\\ *|squash!\\ *)
    exit 0
    ;;
esac

if printf '%s\\n' "$subject" | grep -Eq '^\\[(A[0-9]+([.][0-9]+)*|W[0-9]+([.][0-9]+)*|HOTFIX|CHORE|DOCS)\\] '; then
  exit 0
fi

echo "mousecat commit-msg: subject must start with [A...], [W...], [HOTFIX], [CHORE], or [DOCS]." >&2
echo "subject: $subject" >&2
exit 1
`;
  }

  if (name === "pre-commit") {
    return `#!/bin/sh
set -eu

npm run governance:floor
npm run governance:ceiling
npm run docs:check
npm run docs:pr
npm run hygiene:strict
`;
  }

  if (name === "pre-push") {
    return `#!/bin/sh
set -eu

npm run pr:ready
npm audit --audit-level=high
`;
  }

  throw new Error(`unknown hook "${name}"`);
}

function hooksDirectory(repoRoot) {
  let gitDir = resolve(repoRoot, ".git");
  if (!existsSync(gitDir)) throw new Error(`not a git checkout: ${repoRoot}`);
  if (statSync(gitDir).isFile()) {
    const pointer = /^gitdir: (.+)$/mu.exec(readFileSync(gitDir, "utf8"));
    if (!pointer) throw new Error("invalid Git directory pointer");
    gitDir = resolve(repoRoot, pointer[1].trim());
  }
  const commonDir = resolve(gitDir, "commondir");
  if (existsSync(commonDir)) gitDir = resolve(gitDir, readFileSync(commonDir, "utf8").trim());
  return resolve(gitDir, "hooks");
}

export function installHooks(repoRoot = REPO_ROOT) {
  const hooksDir = hooksDirectory(repoRoot);
  mkdirSync(hooksDir, { recursive: true });

  const installed = [];
  for (const name of HOOKS) {
    const target = resolve(hooksDir, name);
    writeFileSync(target, hookBody(name), "utf8");
    chmodSync(target, 0o755);
    installed.push(target);
  }
  return installed;
}

export function checkHooks(repoRoot = REPO_ROOT) {
  const hooksDir = hooksDirectory(repoRoot);
  const missing = [];
  const stale = [];
  for (const name of HOOKS) {
    const target = resolve(hooksDir, name);
    if (!existsSync(target)) {
      missing.push(name);
      continue;
    }
    if (lf(readFileSync(target, "utf8")) !== lf(hookBody(name))) stale.push(name);
  }
  return {
    ok: missing.length === 0 && stale.length === 0,
    missing,
    stale,
  };
}

function main(argv = process.argv.slice(2)) {
  const check = argv.includes("--check");
  if (check) {
    const result = checkHooks();
    if (!result.ok) {
      console.error("hooks: stale or missing");
      if (result.missing.length) console.error(`missing: ${result.missing.join(", ")}`);
      if (result.stale.length) console.error(`stale: ${result.stale.join(", ")}`);
      process.exit(1);
    }
    console.log("hooks: ok");
    return;
  }

  const installed = installHooks();
  console.log(`hooks: installed ${installed.length} hook(s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
