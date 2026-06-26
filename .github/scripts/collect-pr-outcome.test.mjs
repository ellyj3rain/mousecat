import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  appendOutcomeTrace,
  buildOutcomeObservation,
  outcomeContextFromEvent,
} from "./collect-pr-outcome.mjs";

test("outcomeContextFromEvent reads closed pull_request payloads", () => {
  const context = outcomeContextFromEvent({
    action: "closed",
    repository: { full_name: "example/mousecat" },
    pull_request: {
      number: 7,
      title: "Example",
      state: "closed",
      merged: true,
      base: { ref: "main" },
      head: { ref: "feature", sha: "abc123" },
    },
  });

  assert.equal(context.kind, "pull_request");
  assert.equal(context.pullRequest, 7);
  assert.equal(context.merged, true);
  assert.equal(context.terminal, true);
});

test("outcomeContextFromEvent reads workflow_run payloads", () => {
  const context = outcomeContextFromEvent({
    repository: { full_name: "example/mousecat" },
    workflow_run: {
      id: 42,
      name: "ci-verify",
      status: "completed",
      conclusion: "success",
      head_branch: "feature",
      head_sha: "abc123",
      pull_requests: [{ number: 7, url: "https://api.example/pr/7" }],
    },
  });

  assert.equal(context.kind, "workflow_run");
  assert.equal(context.workflow, "ci-verify");
  assert.equal(context.pullRequests[0].number, 7);
  assert.equal(context.terminal, true);
});

test("outcome traces are structured JSON lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "mousecat-pr-outcome-"));
  const path = join(dir, "records.jsonl");
  const record = buildOutcomeObservation({
    repository: "example/mousecat",
    pullRequest: 7,
    headSha: "abc123",
  }, {
    observedAt: "2026-06-26T00:00:00.000Z",
  });
  appendOutcomeTrace(record, path);
  const parsed = JSON.parse(readFileSync(path, "utf8").trim());
  assert.equal(parsed.schema, "mousecat.gitops.pr-outcome-observation/1");
  assert.equal(parsed.subject.pullRequest, 7);
});
