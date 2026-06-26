#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { classifyPrShape } from "../../src/core/governance/gitops/merge-strategy-classifier.mjs";

function flagValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function truthy(value) {
  return /^(1|true|yes|y)$/i.test(String(value || ""));
}

function nowIso() {
  return new Date().toISOString();
}

export function prClassificationTracePath() {
  return ".mousecat/data/gitops/pr-classifications/records.jsonl";
}

export function buildPrClassificationRecord(verdict, options = {}) {
  const observedAt = options.observedAt || nowIso();
  return {
    schema: "mousecat.gitops.pr-classification/1",
    id: `mousecat-pr-classification-${observedAt.replace(/[:.]/g, "-")}`,
    observedAt,
    source: "mousecat.github.pr-shape",
    subject: {
      repository: options.repository || process.env.GITHUB_REPOSITORY || null,
      pullRequest: options.pullRequest || process.env.GITHUB_REF_NAME || null,
      base: options.base || null,
      head: options.head || process.env.GITHUB_SHA || null,
    },
    verdict,
  };
}

export function appendPrClassificationTrace(record, path = prClassificationTracePath()) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + "\n", "utf8");
  return path;
}

function labelNamesFromEventPath(eventPath) {
  if (!eventPath) return [];
  try {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    const labels = event?.pull_request?.labels || event?.issue?.labels || event?.labels || [];
    return labels
      .map((label) => typeof label === "string" ? label : label?.name)
      .filter((label) => typeof label === "string" && label.trim())
      .map((label) => label.trim().toLowerCase());
  } catch {
    return [];
  }
}

export function ratificationFromLabels(labels = []) {
  const set = new Set(labels.map((label) => String(label || "").trim().toLowerCase()).filter(Boolean));
  const has = (...names) => names.some((name) => set.has(name));
  return {
    largeDiff: has("mousecat:ratify-large-diff", "pr-shape:ratify-large-diff"),
    surfaceSpan: has("mousecat:ratify-surface-span", "pr-shape:ratify-surface-span"),
    missingCompanions: has("mousecat:ratify-missing-companions", "pr-shape:ratify-missing-companions"),
    testGap: has("mousecat:ratify-test-gap", "pr-shape:ratify-test-gap"),
  };
}

function normalizePath(path) {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

export function parseNumstat(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [additionsRaw, deletionsRaw, ...pathParts] = line.split("\t");
      const path = normalizePath(pathParts.join("\t"));
      return {
        path,
        additions: additionsRaw === "-" ? 0 : Number(additionsRaw) || 0,
        deletions: deletionsRaw === "-" ? 0 : Number(deletionsRaw) || 0,
      };
    })
    .filter((file) => file.path);
}

export function classifyNumstat(output, options = {}) {
  return classifyPrShape({
    ...options,
    changedFiles: parseNumstat(output),
  });
}

function git(args, env) {
  const result = spawnSync("git", args, { encoding: "utf8", shell: false, env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  return result.stdout;
}

function formatSignals(signals) {
  return signals
    .map((signal) => `- ${signal.severity}: ${signal.code} -> ${signal.next || "review"}`)
    .join("\n");
}

export function run(env = process.env, argv = process.argv.slice(2)) {
  if (env.GITHUB_EVENT_NAME && env.GITHUB_EVENT_NAME !== "pull_request") {
    process.stdout.write("PR shape gate: skipped outside pull_request event\n");
    return 0;
  }

  const base = flagValue(argv, "--base") || env.MOUSECAT_PR_SHAPE_BASE || (env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : "origin/main");
  const diffOutput = git(["diff", "--numstat", "--find-renames", `${base}...HEAD`], env);
  const labelRatification = ratificationFromLabels(labelNamesFromEventPath(env.GITHUB_EVENT_PATH));
  const verdict = classifyNumstat(diffOutput, {
    operatorRatifiedLargeDiff: truthy(env.MOUSECAT_OPERATOR_RATIFIED_LARGE_DIFF) || labelRatification.largeDiff,
    operatorRatifiedSurfaceSpan: truthy(env.MOUSECAT_OPERATOR_RATIFIED_SURFACE_SPAN) || labelRatification.surfaceSpan,
    operatorRatifiedMissingCompanions: truthy(env.MOUSECAT_OPERATOR_RATIFIED_MISSING_COMPANIONS) || labelRatification.missingCompanions,
    operatorRatifiedTestGap: truthy(env.MOUSECAT_OPERATOR_RATIFIED_TEST_GAP) || labelRatification.testGap,
  });
  const writeTrace = argv.includes("--write-trace") || truthy(env.MOUSECAT_GITOPS_TRACE);
  if (writeTrace) {
    const tracePath = appendPrClassificationTrace(buildPrClassificationRecord(verdict, {
      base,
      repository: env.GITHUB_REPOSITORY,
      pullRequest: env.GITHUB_REF_NAME,
      head: env.GITHUB_SHA,
    }));
    process.stdout.write(`PR classification trace: ${tracePath}\n`);
  }

  if (!verdict.allowed) {
    process.stderr.write(`PR shape gate: ${verdict.riskBand.toUpperCase()} - ${verdict.next}\n${formatSignals(verdict.signals)}\n`);
    return 1;
  }

  const signalSummary = verdict.signals.length ? ` with ${verdict.signals.length} advisory signal(s)` : "";
  process.stdout.write(`PR shape gate: OK - ${verdict.dimensions.changedFileCount} file(s), ${verdict.dimensions.totalChangedLines} changed line(s)${signalSummary}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(run());
  } catch (err) {
    process.stderr.write(`PR shape gate: ERROR - ${err.message}\n`);
    process.exit(1);
  }
}
