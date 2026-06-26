import { SEVERITIES, bool, int, list, makeGovernedVerdict, makeSignal, norm } from "../classifiers/governed-verdict.mjs";

export const MERGE_STRATEGIES = Object.freeze({
  SQUASH: "squash",
  REBASE: "rebase",
  MERGE_COMMIT: "merge-commit",
  REVERT_PR: "revert-pr",
  STACKED_PR: "stacked-pr",
  OPERATOR_DECISION: "operator-decision",
});

export const PR_SHAPE_DEFAULT_BUDGET = Object.freeze({
  maxFiles: 12,
  maxChangedLines: 700,
  operatorFiles: 28,
  operatorChangedLines: 1800,
  maxSurfaceClasses: 5,
});

const ROOT_GOVERNANCE_FILES = new Set([
  "AGENTS.md",
  "ARCHITECTURE.md",
  "BATCH_LOG.md",
  "CORE.md",
  "DECISION_REGISTRY.md",
  "FINDINGS.md",
  "GOVERNANCE.md",
  "README.md",
  "ROADMAP.md",
  "SESSION_STATE.md",
  "VERSION",
]);

const DECISION_REQUIRED_GOVERNANCE_FILES = new Set([
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CORE.md",
  "DECISION_REGISTRY.md",
  "GOVERNANCE.md",
  "README.md",
]);

const PACKAGE_FILES = new Set(["package.json", "package-lock.json", "npm-shrinkwrap.json"]);
const TEST_PATH_RE = /(?:^|\/)(?:test|tests|__tests__)\/|[./](?:test|spec)\.(?:[cm]?js|jsx|tsx?|mjs)$/i;
const GENERATED_OUTPUT_RE = /\.(?:docx|pdf|tgz|zip|tar|gz|xlsx|pptx|sqlite|sqlite3|db)$/i;
const LOCAL_STATE_PREFIXES = Object.freeze([
  "node_modules/",
  "coverage/",
  "dist/",
  "build/",
  "runtime/",
  "traces/",
  "artifacts/local/",
  "artifacts/docx/",
  ".mousecat/",
]);
const LOCAL_STATE_FILES = new Set(["mousecat.config.json", ".env"]);

function normalizePath(path) {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function baseName(path) {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? normalized : normalized.slice(index + 1);
}

function startsWithAny(path, prefixes) {
  const normalized = normalizePath(path);
  return prefixes.some((prefix) => normalized === prefix.replace(/\/$/, "") || normalized.startsWith(prefix));
}

function changedFileRecord(entry) {
  if (typeof entry === "string") return { path: normalizePath(entry), additions: 0, deletions: 0 };
  if (!entry || typeof entry !== "object") return null;
  const path = normalizePath(entry.path || entry.filename || entry.name);
  if (!path) return null;
  return {
    path,
    additions: int(entry.additions ?? entry.addedLines, 0),
    deletions: int(entry.deletions ?? entry.removedLines, 0),
  };
}

function normalizeChangedFiles(input) {
  return list(input)
    .map(changedFileRecord)
    .filter((entry) => entry && entry.path);
}

function isLocalStatePath(path) {
  const normalized = normalizePath(path);
  return LOCAL_STATE_FILES.has(normalized) || startsWithAny(normalized, LOCAL_STATE_PREFIXES);
}

function isGeneratedOutputPath(path) {
  const normalized = normalizePath(path);
  return GENERATED_OUTPUT_RE.test(normalized) || startsWithAny(normalized, ["artifacts/generated/"]);
}

function isTestPath(path) {
  return TEST_PATH_RE.test(normalizePath(path));
}

function surfaceClassForPath(path) {
  const normalized = normalizePath(path);
  const file = baseName(normalized);
  if (isLocalStatePath(normalized)) return "local-state";
  if (isGeneratedOutputPath(normalized)) return "generated-output";
  if (isTestPath(normalized)) return "test";
  if (normalized.startsWith(".github/")) return "ci";
  if (PACKAGE_FILES.has(normalized)) return "package";
  if (normalized.startsWith("src/core/governance/")) return "governance-source";
  if (ROOT_GOVERNANCE_FILES.has(file) && !normalized.includes("/")) return "governance-doc";
  if (normalized.startsWith("src/")) return "runtime-source";
  if (normalized.startsWith("scripts/")) return "tooling";
  if (normalized.startsWith("fixtures/")) return "fixture";
  if (normalized.endsWith(".md")) return "docs";
  return "other";
}

function prShapeBudget(input) {
  const overrides = input && typeof input.diffSizeBudget === "object" ? input.diffSizeBudget : {};
  return {
    maxFiles: int(overrides.maxFiles, PR_SHAPE_DEFAULT_BUDGET.maxFiles),
    maxChangedLines: int(overrides.maxChangedLines, PR_SHAPE_DEFAULT_BUDGET.maxChangedLines),
    operatorFiles: int(overrides.operatorFiles, PR_SHAPE_DEFAULT_BUDGET.operatorFiles),
    operatorChangedLines: int(overrides.operatorChangedLines, PR_SHAPE_DEFAULT_BUDGET.operatorChangedLines),
    maxSurfaceClasses: int(overrides.maxSurfaceClasses, PR_SHAPE_DEFAULT_BUDGET.maxSurfaceClasses),
  };
}

function totalLines(input, changedFiles) {
  if (Number.isFinite(Number(input.totalChangedLines))) return Math.max(0, Number(input.totalChangedLines));
  if (changedFiles.length > 0) return changedFiles.reduce((sum, file) => sum + file.additions + file.deletions, 0);
  return int(input.additions, 0) + int(input.deletions, 0);
}

function filesByClass(changedFiles) {
  const byClass = {};
  for (const file of changedFiles) {
    const surfaceClass = surfaceClassForPath(file.path);
    byClass[surfaceClass] ||= [];
    byClass[surfaceClass].push(file.path);
  }
  return byClass;
}

function hasPath(changedFiles, path) {
  return changedFiles.some((file) => file.path === path);
}

export function classifyPrShape(input = {}) {
  const changedFiles = normalizeChangedFiles(input.changedFiles);
  const budget = prShapeBudget(input);
  const changedFileCount = changedFiles.length || int(input.changedFileCount, 0);
  const totalChangedLines = totalLines(input, changedFiles);
  const byClass = filesByClass(changedFiles);
  const surfaceClasses = Object.keys(byClass).sort();
  const signals = [];
  const hasChangedFileFacts = changedFiles.length > 0 || changedFileCount > 0 || totalChangedLines > 0;
  const hasGovernanceChange = surfaceClasses.includes("governance-source") || surfaceClasses.includes("governance-doc");
  const needsDecisionRecord =
    surfaceClasses.includes("governance-source") ||
    changedFiles.some((file) => DECISION_REQUIRED_GOVERNANCE_FILES.has(baseName(file.path)) && !file.path.includes("/"));
  const sourceNeedsTests = surfaceClasses.some((surfaceClass) =>
    ["governance-source", "runtime-source", "tooling", "ci", "package"].includes(surfaceClass),
  );
  const generatedFiles = [...(byClass["generated-output"] || []), ...(byClass["local-state"] || [])].sort();

  if (generatedFiles.length > 0) {
    signals.push(makeSignal({
      code: "generated-or-local-output",
      severity: SEVERITIES.BLOCK,
      dimension: "source-boundary",
      evidence: `${generatedFiles.length} generated or local state file(s) are in the PR shape`,
      next: "remove-generated-or-local-output",
      data: { files: generatedFiles.slice(0, 10) },
    }));
  }

  if (
    hasChangedFileFacts &&
    (changedFileCount > budget.operatorFiles || totalChangedLines > budget.operatorChangedLines) &&
    !bool(input.operatorRatifiedLargeDiff)
  ) {
    signals.push(makeSignal({
      code: "diff-size-operator-review",
      severity: SEVERITIES.OPERATOR,
      dimension: "review-shape",
      evidence: `diff shape exceeds operator budget (${changedFileCount} file(s), ${totalChangedLines} changed line(s))`,
      next: "split-pr-or-ratify-large-diff",
      data: { changedFileCount, totalChangedLines, budget },
    }));
  } else if (hasChangedFileFacts && (changedFileCount > budget.maxFiles || totalChangedLines > budget.maxChangedLines)) {
    signals.push(makeSignal({
      code: "diff-size-budget-exceeded",
      severity: SEVERITIES.CAUTION,
      dimension: "review-shape",
      evidence: `diff shape exceeds review budget (${changedFileCount} file(s), ${totalChangedLines} changed line(s))`,
      next: "consider-pr-split",
      data: { changedFileCount, totalChangedLines, budget },
    }));
  }

  if (surfaceClasses.length > budget.maxSurfaceClasses && !bool(input.operatorRatifiedSurfaceSpan)) {
    signals.push(makeSignal({
      code: "surface-span-operator-review",
      severity: SEVERITIES.OPERATOR,
      dimension: "structural-consistency",
      evidence: `PR spans ${surfaceClasses.length} surface class(es): ${surfaceClasses.join(", ")}`,
      next: "split-pr-by-surface-class-or-ratify-span",
      data: { surfaceClasses },
    }));
  }

  if (hasGovernanceChange && !hasPath(changedFiles, "BATCH_LOG.md") && !bool(input.operatorRatifiedMissingCompanions)) {
    signals.push(makeSignal({
      code: "governance-change-missing-batch-record",
      severity: SEVERITIES.OPERATOR,
      dimension: "structural-consistency",
      evidence: "governance-shape change has no batch-log companion",
      next: "add-batch-log-entry-or-ratify-exception",
    }));
  }

  if (needsDecisionRecord && !hasPath(changedFiles, "DECISION_REGISTRY.md") && !bool(input.operatorRatifiedMissingCompanions)) {
    signals.push(makeSignal({
      code: "governance-change-missing-decision-record",
      severity: SEVERITIES.OPERATOR,
      dimension: "structural-consistency",
      evidence: "governance contract change has no decision-record companion",
      next: "add-decision-record-or-ratify-exception",
    }));
  }

  if (sourceNeedsTests && !surfaceClasses.includes("test") && !bool(input.operatorRatifiedTestGap)) {
    signals.push(makeSignal({
      code: "source-change-missing-tests",
      severity: SEVERITIES.CAUTION,
      dimension: "verification",
      evidence: "source-shaped change has no focused test companion",
      next: "add-focused-tests-or-ratify-test-gap",
    }));
  }

  return makeGovernedVerdict({
    classifier: "mousecat.gitops.pr-shape",
    subject: input.subject || "pull-request",
    decision: "pr-shape",
    allowed: true,
    code: signals.length > 0 ? "pr-shape-signals" : "pr-shape-clear",
    evidence: signals.length > 0 ? "PR shape signals were detected" : "PR shape is within source-owned review bounds",
    next: signals.find((signal) => signal.next)?.next || "classify-merge-readiness",
    dimensions: {
      changedFileCount,
      totalChangedLines,
      surfaceClasses,
      filesByClass: byClass,
      budget,
      companions: {
        batchLog: hasPath(changedFiles, "BATCH_LOG.md"),
        decisionRegistry: hasPath(changedFiles, "DECISION_REGISTRY.md"),
        tests: surfaceClasses.includes("test"),
      },
    },
    signals,
  });
}

function aggregateSignals(input) {
  const reviewUnitCount = int(input.reviewUnitCount, 1);
  const batchCount = int(input.batchCount, 1);
  return {
    reviewUnitCount,
    batchCount,
    hasAggregateDiff:
      bool(input.hasAggregateDiff) ||
      bool(input.hasMultipleBatchLedgerEntries) ||
      reviewUnitCount > 1 ||
      batchCount > 1,
  };
}

function result(strategy, allowed, code, evidence, extra = {}) {
  const verdict = makeGovernedVerdict({
    classifier: "mousecat.gitops.merge-strategy",
    subject: extra.subject || "pull-request",
    decision: strategy,
    strategy,
    allowed,
    requiresOperator: extra.requiresOperator,
    code,
    evidence,
    next: extra.next || null,
    confidence: extra.confidence,
    dimensions: extra.dimensions,
    signals: extra.signals,
  });

  return {
    strategy: verdict.strategy,
    allowed: verdict.allowed,
    requiresOperator: verdict.requiresOperator,
    code: verdict.code,
    evidence: verdict.evidence,
    next: verdict.next,
    confidence: verdict.confidence,
    riskBand: verdict.riskBand,
    riskScore: verdict.riskScore,
    dimensions: verdict.dimensions,
    signals: verdict.signals,
    audit: verdict.audit,
    schema: verdict.schema,
    classifier: verdict.classifier,
    subject: verdict.subject,
    decision: verdict.decision,
  };
}

export function classifyMergeStrategy(input = {}) {
  const requested = norm(input.requestedStrategy);
  const { hasAggregateDiff, reviewUnitCount, batchCount } = aggregateSignals(input);
  const prShape = classifyPrShape(input);
  const repoAllowsSquash = input.repositoryAllowsSquash !== false;
  const repoAllowsRebase = input.repositoryAllowsRebase !== false;
  const repoAllowsMergeCommit = bool(input.repositoryAllowsMergeCommit);
  const operatorRatified = bool(input.operatorRatifiedStrategy);

  if (!prShape.allowed) {
    const firstBlocking = prShape.signals.find((signal) => signal.severity === SEVERITIES.OPERATOR || signal.severity === SEVERITIES.BLOCK);
    return result(
      MERGE_STRATEGIES.OPERATOR_DECISION,
      false,
      firstBlocking?.code || "pr-shape-signals",
      firstBlocking?.evidence || prShape.evidence,
      { requiresOperator: prShape.requiresOperator, next: firstBlocking?.next || prShape.next, dimensions: { prShape: prShape.dimensions }, signals: prShape.signals },
    );
  }

  if (bool(input.githubRejectedExpectedStrategy)) {
    return result(
      MERGE_STRATEGIES.OPERATOR_DECISION,
      false,
      "expected-strategy-rejected",
      "the expected merge method was rejected; stop and route to the operator instead of selecting another history shape",
      { requiresOperator: true, next: "operator-ratify-new-strategy", dimensions: { prShape: prShape.dimensions }, signals: prShape.signals },
    );
  }

  if (bool(input.isRollback) || norm(input.purpose) === "rollback") {
    if (bool(input.branchProtectionRequiresPr) || bool(input.protectedBase)) {
      return result(MERGE_STRATEGIES.REVERT_PR, true, "protected-rollback", "protected base branches unmerge by revert PR", {
        next: "open-revert-pr",
        dimensions: { prShape: prShape.dimensions },
        signals: prShape.signals,
      });
    }
    return result(MERGE_STRATEGIES.OPERATOR_DECISION, false, "rollback-ref-choice", "rollback outside a protected PR path requires operator ratification", {
      requiresOperator: true,
      next: "operator-ratify-rollback-shape",
      dimensions: { prShape: prShape.dimensions },
      signals: prShape.signals,
    });
  }

  if (bool(input.isStackedPr)) {
    return result(MERGE_STRATEGIES.STACKED_PR, true, "stacked-review", "stacked PRs are allowed when base branch and merge order are explicit", {
      next: "merge-or-retarget-in-stack-order",
      dimensions: { prShape: prShape.dimensions },
      signals: prShape.signals,
    });
  }

  if (hasAggregateDiff && !bool(input.operatorRatifiedAggregate)) {
    return result(
      MERGE_STRATEGIES.OPERATOR_DECISION,
      false,
      "split-required",
      `aggregate PR signal detected (${reviewUnitCount} review unit(s), ${batchCount} batch line(s)); split before merge or obtain explicit operator ratification`,
      { requiresOperator: true, next: "split-pr", dimensions: { prShape: prShape.dimensions, reviewUnitCount, batchCount }, signals: prShape.signals },
    );
  }

  if (requested === MERGE_STRATEGIES.REBASE) {
    if (!repoAllowsRebase) {
      return result(MERGE_STRATEGIES.OPERATOR_DECISION, false, "rebase-disabled", "repository does not allow rebase merge", {
        requiresOperator: true,
        next: "choose-supported-strategy",
        dimensions: { prShape: prShape.dimensions },
        signals: prShape.signals,
      });
    }
    if (!operatorRatified || !bool(input.commitsAreIndependentlyReviewable) || !bool(input.preserveCommitSeries)) {
      return result(MERGE_STRATEGIES.OPERATOR_DECISION, false, "rebase-needs-ratification", "rebase merge requires explicit operator ratification and an intentionally preserved reviewed commit series", {
        requiresOperator: true,
        next: "operator-ratify-rebase-or-squash",
        dimensions: { prShape: prShape.dimensions },
        signals: prShape.signals,
      });
    }
    return result(MERGE_STRATEGIES.REBASE, true, "ratified-rebase", "operator ratified preserving an independently reviewed commit series", {
      next: "rebase-merge",
      dimensions: { prShape: prShape.dimensions },
      signals: prShape.signals,
    });
  }

  if (requested === MERGE_STRATEGIES.MERGE_COMMIT) {
    if (!repoAllowsMergeCommit) {
      return result(MERGE_STRATEGIES.OPERATOR_DECISION, false, "merge-commit-disabled", "repository does not allow merge commits", {
        requiresOperator: true,
        next: "operator-ratify-supported-strategy",
        dimensions: { prShape: prShape.dimensions },
        signals: prShape.signals,
      });
    }
    if (!operatorRatified || !bool(input.preserveCommitSeries)) {
      return result(MERGE_STRATEGIES.OPERATOR_DECISION, false, "merge-commit-needs-ratification", "merge commits require operator ratification of branch topology preservation", {
        requiresOperator: true,
        next: "operator-ratify-merge-commit",
        dimensions: { prShape: prShape.dimensions },
        signals: prShape.signals,
      });
    }
    return result(MERGE_STRATEGIES.MERGE_COMMIT, true, "ratified-merge-commit", "operator ratified preserving branch topology", {
      next: "merge-commit",
      dimensions: { prShape: prShape.dimensions },
      signals: prShape.signals,
    });
  }

  if (!repoAllowsSquash) {
    return result(MERGE_STRATEGIES.OPERATOR_DECISION, false, "squash-disabled", "default squash merge is unavailable", {
      requiresOperator: true,
      next: "operator-ratify-supported-strategy",
      dimensions: { prShape: prShape.dimensions },
      signals: prShape.signals,
    });
  }

  return result(MERGE_STRATEGIES.SQUASH, true, "default-squash", "one coherent review unit merges by squash", {
    next: "squash-merge",
    dimensions: { prShape: prShape.dimensions },
    signals: prShape.signals,
  });
}

export default { MERGE_STRATEGIES, PR_SHAPE_DEFAULT_BUDGET, classifyPrShape, classifyMergeStrategy };
