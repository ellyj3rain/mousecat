import { test } from "node:test";
import assert from "node:assert/strict";

import { MERGE_STRATEGIES, classifyMergeStrategy, classifyPrShape } from "../src/core/governance/gitops/merge-strategy-classifier.mjs";

test("small Mousecat governance PR with tests and records has clear PR shape", () => {
  const r = classifyPrShape({
    changedFiles: [
      { path: "src/core/governance/gitops/merge-strategy-classifier.mjs", additions: 80, deletions: 10 },
      { path: "test/gitops-classifier.test.mjs", additions: 40, deletions: 0 },
      { path: "BATCH_LOG.md", additions: 10, deletions: 0 },
      { path: "DECISION_REGISTRY.md", additions: 10, deletions: 0 },
    ],
  });
  assert.equal(r.allowed, true);
  assert.equal(r.code, "pr-shape-clear");
  assert.deepEqual(r.dimensions.surfaceClasses, ["governance-doc", "governance-source", "test"]);
});

test("generated or local output blocks PR shape", () => {
  const r = classifyPrShape({ changedFiles: [{ path: "artifacts/docx/GOVERNANCE.docx" }] });
  assert.equal(r.allowed, false);
  assert.ok(r.audit.blockingSignals.includes("generated-or-local-output"));
});

test("governance classifier changes require batch and decision companions", () => {
  const r = classifyPrShape({
    changedFiles: [
      "src/core/governance/gitops/merge-strategy-classifier.mjs",
      "test/gitops-classifier.test.mjs",
    ],
  });
  assert.equal(r.allowed, false);
  assert.equal(r.requiresOperator, true);
  assert.ok(r.audit.blockingSignals.includes("governance-change-missing-batch-record"));
  assert.ok(r.audit.blockingSignals.includes("governance-change-missing-decision-record"));
});

test("source changes without tests are caution signals", () => {
  const r = classifyPrShape({ changedFiles: ["src/core/runtime.mjs", "BATCH_LOG.md"] });
  assert.equal(r.allowed, true);
  assert.equal(r.riskBand, "caution");
  assert.ok(r.signals.some((signal) => signal.code === "source-change-missing-tests"));
});

test("ordinary one-unit PR defaults to squash", () => {
  const r = classifyMergeStrategy({ commitCount: 3, reviewUnitCount: 1, batchCount: 1 });
  assert.equal(r.strategy, MERGE_STRATEGIES.SQUASH);
  assert.equal(r.allowed, true);
  assert.equal(r.code, "default-squash");
  assert.equal(r.schema, "mousecat.governance.classifier-verdict/1");
});

test("aggregate or multi-batch PRs require split or operator ratification", () => {
  const r = classifyMergeStrategy({ reviewUnitCount: 3, batchCount: 3 });
  assert.equal(r.strategy, MERGE_STRATEGIES.OPERATOR_DECISION);
  assert.equal(r.allowed, false);
  assert.equal(r.requiresOperator, true);
  assert.equal(r.code, "split-required");
});

test("rebase needs explicit preserved-series ratification", () => {
  const r = classifyMergeStrategy({ requestedStrategy: "rebase", repositoryAllowsRebase: true });
  assert.equal(r.strategy, MERGE_STRATEGIES.OPERATOR_DECISION);
  assert.equal(r.code, "rebase-needs-ratification");
});

test("protected rollback uses a revert PR", () => {
  const r = classifyMergeStrategy({ isRollback: true, branchProtectionRequiresPr: true });
  assert.equal(r.strategy, MERGE_STRATEGIES.REVERT_PR);
  assert.equal(r.allowed, true);
  assert.equal(r.code, "protected-rollback");
});
