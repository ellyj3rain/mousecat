#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

function clean(value) {
  return value == null ? null : String(value);
}

function nowIso() {
  return new Date().toISOString();
}

function int(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readEvent(path) {
  if (!path) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

export function outcomeTracePath() {
  return ".mousecat/data/gitops/pr-outcomes/records.jsonl";
}

export function outcomeContextFromEvent(event = {}) {
  if (event.pull_request) {
    const pr = event.pull_request;
    return {
      kind: "pull_request",
      repository: event.repository?.full_name || null,
      pullRequest: int(pr.number),
      title: clean(pr.title),
      state: clean(pr.state),
      merged: Boolean(pr.merged),
      baseRefName: clean(pr.base?.ref),
      headRefName: clean(pr.head?.ref),
      headSha: clean(pr.head?.sha),
      action: clean(event.action),
      terminal: event.action === "closed",
    };
  }

  if (event.workflow_run) {
    const run = event.workflow_run;
    const prs = Array.isArray(run.pull_requests) ? run.pull_requests : [];
    return {
      kind: "workflow_run",
      repository: event.repository?.full_name || null,
      workflow: clean(run.name),
      workflowRunId: int(run.id),
      workflowConclusion: clean(run.conclusion),
      workflowStatus: clean(run.status),
      headBranch: clean(run.head_branch),
      headSha: clean(run.head_sha),
      pullRequests: prs.map((pr) => ({
        number: int(pr.number),
        url: clean(pr.url),
        headSha: clean(pr.head?.sha || pr.head_sha),
        baseRefName: clean(pr.base?.ref),
        headRefName: clean(pr.head?.ref),
      })),
      terminal: run.status === "completed",
    };
  }

  return {
    kind: "manual",
    repository: event.repository?.full_name || process.env.GITHUB_REPOSITORY || null,
    terminal: false,
  };
}

export function buildOutcomeObservation(context = {}, options = {}) {
  const observedAt = options.observedAt || nowIso();
  const prNumber = context.pullRequest || context.pullRequests?.[0]?.number || null;
  return {
    schema: "mousecat.gitops.pr-outcome-observation/1",
    id: `mousecat-pr-outcome-${observedAt.replace(/[:.]/g, "-")}`,
    observedAt,
    source: "mousecat.github.pr-outcome-corpus",
    subject: {
      repository: context.repository || null,
      pullRequest: prNumber,
      headSha: context.headSha || context.pullRequests?.[0]?.headSha || null,
    },
    context,
  };
}

export function appendOutcomeTrace(record, path = outcomeTracePath()) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + "\n", "utf8");
  return path;
}

export function run(env = process.env) {
  const event = readEvent(env.GITHUB_EVENT_PATH);
  const context = outcomeContextFromEvent(event);
  const record = buildOutcomeObservation(context);
  const path = appendOutcomeTrace(record);
  process.stdout.write(`PR outcome observation: ${path}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(run());
  } catch (err) {
    process.stderr.write(`PR outcome observation: ERROR - ${err.message}\n`);
    process.exit(1);
  }
}
