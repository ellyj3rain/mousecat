import { test } from "node:test";
import assert from "node:assert/strict";

import { findBlockingPullRequests, pullRequestContext } from "./check-pr-chronology.mjs";

const current = { currentNumber: 10, baseRefName: "main" };

function blockers(openPullRequests) {
  return findBlockingPullRequests({ ...current, openPullRequests }).map((pr) => pr.number);
}

test("no open older pull request passes", () => {
  assert.deepEqual(blockers([]), []);
});

test("older draft pull request does not block", () => {
  assert.deepEqual(blockers([{ number: 9, title: "draft", baseRefName: "main", isDraft: true }]), []);
});

test("older non-draft pull request blocks", () => {
  assert.deepEqual(blockers([{ number: 9, title: "ready", baseRefName: "main", isDraft: false }]), [9]);
});

test("older pull request on another base does not block", () => {
  assert.deepEqual(blockers([{ number: 9, title: "release", baseRefName: "release", isDraft: false }]), []);
});

test("newer pull request never blocks", () => {
  assert.deepEqual(blockers([{ number: 11, title: "newer", baseRefName: "main", isDraft: false }]), []);
});

test("GitHub REST pull request shape is normalized", () => {
  assert.deepEqual(blockers([{ number: 8, title: "rest", base: { ref: "main" }, draft: false, html_url: "https://example.test/pr/8" }]), [8]);
});

test("pull request context reads event number, base, and repository", () => {
  assert.deepEqual(
    pullRequestContext({
      pull_request: { number: 12, base: { ref: "main" } },
      repository: { full_name: "ellyj3rain/mousecat" },
    }),
    { currentNumber: 12, baseRefName: "main", repository: "ellyj3rain/mousecat" },
  );
});
