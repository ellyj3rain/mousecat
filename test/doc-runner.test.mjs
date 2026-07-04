import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_PACK,
  extractReferences,
  runDocChecks,
} from "../src/core/governance/doc-runner.mjs";

const fullPack = [...CANONICAL_PACK];
const byId = (result, id) => result.checks.find((check) => check.id === id);

test("doc runner passes a documented source batch", () => {
  const result = runDocChecks({
    files: [...fullPack, "src/core/runtime.mjs"],
    changed: [
      { path: "src/core/runtime.mjs", status: "M" },
      { path: "BATCH_LOG.md", status: "M" },
    ],
    baseContent: (path) => (path === "BATCH_LOG.md" ? "# Log\n## [A1]\n" : ""),
    headContent: (path) => (path === "BATCH_LOG.md" ? "# Log\n## [A1]\n## [A2]\n" : ""),
    title: "[A2] Add runtime surface",
  });

  assert.equal(result.ok, true);
  assert.equal(byId(result, "source-change-documented").ok, true);
  assert.equal(byId(result, "version-batch-together").level, "warn");
});

test("doc runner fails an incomplete doc-pack", () => {
  const result = runDocChecks({
    files: fullPack.filter((path) => path !== "ROADMAP.md"),
    changed: [],
  });

  assert.equal(byId(result, "doc-pack-complete").ok, false);
  assert.equal(result.ok, false);
});

test("doc runner requires BATCH_LOG for substantive changes", () => {
  const result = runDocChecks({
    files: [...fullPack, "src/core/runtime.mjs"],
    changed: [{ path: "src/core/runtime.mjs", status: "M" }],
  });

  assert.equal(byId(result, "source-change-documented").ok, false);
  assert.equal(result.ok, false);
});

test("doc runner preserves append-only ledgers", () => {
  const result = runDocChecks({
    files: fullPack,
    changed: [{ path: "FINDINGS.md", status: "M" }],
    baseContent: () => "# Findings\n## F-001 original\n",
    headContent: () => "# Findings\n## F-001 rewritten\n",
  });

  assert.equal(byId(result, "append-only-preserved").ok, false);
  assert.equal(result.ok, false);
});

test("doc runner validates documentation path references", () => {
  const result = runDocChecks({
    files: [...fullPack, "src/core/catalog.mjs", "mousecat.config.example.json"],
    changed: [{ path: "README.md", status: "M" }],
    headContent: () => [
      "See `src/core/catalog.mjs`.",
      "Copy `mousecat.config.example.json` to `mousecat.config.json`.",
      "Do not depend on `does/not/exist.mjs`.",
    ].join("\n"),
  });

  assert.equal(byId(result, "doc-references-resolve").ok, false);
  assert.match(byId(result, "doc-references-resolve").message, /does\/not\/exist\.mjs/u);
});

test("doc runner checks only appended references in append-only ledgers", () => {
  const result = runDocChecks({
    files: [...fullPack, "src/core/catalog.mjs"],
    changed: [{ path: "BATCH_LOG.md", status: "M" }],
    baseContent: () => "Old historical reference `old/missing.mjs`.\n",
    headContent: () => "Old historical reference `old/missing.mjs`.\nNew reference `src/core/catalog.mjs`.\n",
  });

  assert.equal(byId(result, "doc-references-resolve").ok, true);
});

test("doc runner allows documented local-only runtime paths", () => {
  const result = runDocChecks({
    files: fullPack,
    changed: [{ path: "AGENTS.md", status: "M" }],
    headContent: () => "Keep `.mousecat/`, `runtime/`, `traces/`, and `artifacts/local/` ignored.",
  });

  assert.equal(byId(result, "doc-references-resolve").ok, true);
});

test("extractReferences ignores routes, commands, URLs, and object shapes", () => {
  const refs = extractReferences(
    "Call `npm run pr:ready`, POST `/api/agent`, read `{ provider }`, see `src/core/runtime.mjs` and [docs](GOVERNANCE.md), not https://example.test/x.",
  );

  assert.deepEqual(refs.sort(), ["GOVERNANCE.md", "src/core/runtime.mjs"].sort());
});
