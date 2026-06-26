import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  appendPrClassificationTrace,
  buildPrClassificationRecord,
  classifyNumstat,
  parseNumstat,
  ratificationFromLabels,
} from "./check-pr-shape.mjs";

test("parseNumstat reads changed file counts", () => {
  assert.deepEqual(parseNumstat("10\t2\tsrc/core/runtime.mjs\n-\t-\tartifacts/docx/export.docx\n"), [
    { path: "src/core/runtime.mjs", additions: 10, deletions: 2 },
    { path: "artifacts/docx/export.docx", additions: 0, deletions: 0 },
  ]);
});

test("classifyNumstat blocks generated artifacts", () => {
  const r = classifyNumstat("0\t0\tartifacts/docx/export.docx\n");
  assert.equal(r.allowed, false);
  assert.ok(r.audit.blockingSignals.includes("generated-or-local-output"));
});

test("classifyNumstat routes governance source without records", () => {
  const r = classifyNumstat("12\t3\tsrc/core/governance/gitops/merge-strategy-classifier.mjs\n");
  assert.equal(r.allowed, false);
  assert.ok(r.audit.blockingSignals.includes("governance-change-missing-batch-record"));
  assert.ok(r.audit.blockingSignals.includes("governance-change-missing-decision-record"));
});

test("classifyNumstat accepts coherent governance classifier PR shape", () => {
  const r = classifyNumstat([
    "70\t8\tsrc/core/governance/gitops/merge-strategy-classifier.mjs",
    "45\t0\ttest/gitops-classifier.test.mjs",
    "55\t0\t.github/scripts/check-pr-shape.mjs",
    "30\t0\t.github/scripts/check-pr-shape.test.mjs",
    "6\t0\t.github/workflows/ci.yml",
    "8\t0\tGOVERNANCE.md",
    "10\t0\tBATCH_LOG.md",
    "10\t0\tDECISION_REGISTRY.md",
  ].join("\n"));
  assert.equal(r.allowed, true);
  assert.equal(r.requiresOperator, false);
  assert.deepEqual(r.dimensions.surfaceClasses, ["ci", "governance-doc", "governance-source", "test"]);
});

test("ratificationFromLabels maps operator PR labels to ratification hatches", () => {
  const r = ratificationFromLabels([
    "mousecat:ratify-surface-span",
    "pr-shape:ratify-test-gap",
    "unrelated",
  ]);
  assert.equal(r.surfaceSpan, true);
  assert.equal(r.testGap, true);
  assert.equal(r.largeDiff, false);
  assert.equal(r.missingCompanions, false);
});

test("classification traces are structured JSON lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "mousecat-pr-shape-"));
  const path = join(dir, "records.jsonl");
  const verdict = classifyNumstat("1\t0\tREADME.md\n");
  const record = buildPrClassificationRecord(verdict, {
    observedAt: "2026-06-26T00:00:00.000Z",
    repository: "example/mousecat",
    pullRequest: "1/merge",
    base: "origin/main",
    head: "abc123",
  });
  appendPrClassificationTrace(record, path);
  const parsed = JSON.parse(readFileSync(path, "utf8").trim());
  assert.equal(parsed.schema, "mousecat.gitops.pr-classification/1");
  assert.equal(parsed.subject.repository, "example/mousecat");
  assert.equal(parsed.verdict.classifier, "mousecat.gitops.pr-shape");
});
