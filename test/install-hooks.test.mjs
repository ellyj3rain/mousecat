import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HOOKS, checkHooks, hookBody, installHooks } from "../scripts/install-hooks.mjs";

function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), "mousecat-hooks-"));
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  return root;
}

test("hook bodies carry Mousecat governance commands", () => {
  assert.ok(hookBody("commit-msg").includes("mousecat commit-msg"));
  assert.ok(hookBody("commit-msg").includes("[A...]"));
  assert.ok(hookBody("pre-commit").includes("npm run governance:floor"));
  assert.ok(hookBody("pre-commit").includes("npm run docs:pr"));
  assert.ok(hookBody("pre-push").includes("npm run pr:ready"));
  assert.ok(hookBody("pre-push").includes("npm audit --audit-level=high"));
});

test("installHooks writes every governed hook", () => {
  const root = tempRepo();
  const installed = installHooks(root);
  assert.equal(installed.length, HOOKS.length);

  for (const hook of HOOKS) {
    assert.equal(readFileSync(join(root, ".git", "hooks", hook), "utf8"), hookBody(hook));
  }
  assert.deepEqual(checkHooks(root), { ok: true, missing: [], stale: [] });
});

test("checkHooks reports stale hook bodies", () => {
  const root = tempRepo();
  installHooks(root);
  writeFileSync(join(root, ".git", "hooks", "pre-push"), "#!/bin/sh\nexit 0\n", "utf8");

  assert.deepEqual(checkHooks(root), { ok: false, missing: [], stale: ["pre-push"] });
});

test("linked worktrees install and verify hooks in the shared Git directory", () => {
  const root = mkdtempSync(join(tmpdir(), "mousecat-linked-hooks-"));
  const common = join(root, "repository.git");
  const linked = join(common, "worktrees", "linked");
  const checkout = join(root, "checkout");
  mkdirSync(linked, { recursive: true });
  mkdirSync(checkout);
  writeFileSync(join(checkout, ".git"), "gitdir: ../repository.git/worktrees/linked\n");
  writeFileSync(join(linked, "commondir"), "../..\n");
  const installed = installHooks(checkout);
  assert.deepEqual(installed, HOOKS.map(name => join(common, "hooks", name)));
  assert.deepEqual(checkHooks(checkout), { ok: true, missing: [], stale: [] });
});
