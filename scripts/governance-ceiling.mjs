#!/usr/bin/env node

import {
  failIf,
  readJson,
  readText,
  report,
} from "./lib/check-utils.mjs";

const errors = [];
const pkg = readJson("package.json");
const readme = readText("README.md");
const governance = readText("GOVERNANCE.md");
const agents = readText("AGENTS.md");
const ci = readText(".github/workflows/ci-verify.yml");
const ciReadme = readText(".github/CI-README.md");
const gitlabCi = readText(".gitlab-ci.yml");
const outcomeWorkflow = readText(".github/workflows/pr-outcome-corpus.yml");
const prTemplate = readText(".github/pull_request_template.md");

function section(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : -1;
  return text.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

const gitlabDefault = section(gitlabCi, "default:", "\nci-verify:");
const gitlabCiVerify = section(gitlabCi, "ci-verify:", "\nmerge-request-shape:");
const gitlabMergeRequestShape = section(gitlabCi, "merge-request-shape:", "\nnode-20-compat:");

for (const script of ["pr:ready", "governance:floor", "governance:ceiling", "docs:check", "docs:pr", "hooks:install", "hooks:check", "hygiene:strict", "test:github-scripts", "pr:shape", "cd:dry-run"]) {
  failIf(errors, !pkg.scripts?.[script], `package.json must expose npm run ${script}.`);
}

for (const command of ["npm run pr:ready", "npm audit --audit-level=high", "check-pr-chronology.mjs", "check-pr-shape.mjs"]) {
  failIf(errors, !ci.includes(command), `.github/workflows/ci-verify.yml must run ${command}.`);
}

failIf(errors, !ci.includes("name: ci-verify"), ".github/workflows/ci-verify.yml must expose stable ci-verify check name.");
failIf(errors, !ci.includes("node-20-compat"), ".github/workflows/ci-verify.yml must keep the Node 20 compatibility check.");
failIf(errors, !ci.includes("--write-trace"), ".github/workflows/ci-verify.yml must emit PR classification traces.");
failIf(errors, !outcomeWorkflow.includes("collect-pr-outcome.mjs"), ".github/workflows/pr-outcome-corpus.yml must collect outcome observations.");
failIf(errors, !governance.includes("GZDS"), "GOVERNANCE.md must identify GZDS as the governing standard.");
failIf(errors, !governance.includes("PR readiness"), "GOVERNANCE.md must describe PR readiness.");
failIf(errors, !governance.includes("PR documentation runner"), "GOVERNANCE.md must describe the PR documentation runner.");
failIf(errors, !governance.includes("Kohai"), "GOVERNANCE.md must describe the Kohai-aware version ladder.");
failIf(errors, !governance.includes("GitOps Observation"), "GOVERNANCE.md must describe GitOps observation.");
failIf(errors, !agents.includes("npm run pr:ready"), "AGENTS.md must instruct agents to run npm run pr:ready before PR readiness claims.");
failIf(errors, !agents.includes("PR documentation runner"), "AGENTS.md must mention the PR documentation runner.");
failIf(errors, !ciReadme.includes("GZDS"), ".github/CI-README.md must describe the GZDS-aligned CI posture.");
failIf(errors, !ciReadme.includes("ci-verify"), ".github/CI-README.md must describe the ci-verify gate.");
failIf(errors, !ciReadme.includes("docs:pr"), ".github/CI-README.md must describe the docs:pr gate.");
for (const command of ["npm run pr:ready", "check-pr-shape.mjs", "npm audit --audit-level=high", "npm run cd:dry-run"]) {
  failIf(errors, !gitlabCi.includes(command), `.gitlab-ci.yml must run ${command}.`);
}
for (const job of ["ci-verify", "merge-request-shape", "node-20-compat", "dependency-scan", "package-dry-run"]) {
  failIf(errors, !gitlabCi.includes(`${job}:`), `.gitlab-ci.yml must expose ${job}.`);
}
for (const tag of ["- zero-local", "- open-ground"]) {
  failIf(errors, !gitlabDefault.includes(tag), `.gitlab-ci.yml default jobs must require the ${tag.slice(2)} runner tag.`);
}
for (const [job, contents] of [["ci-verify", gitlabCiVerify], ["merge-request-shape", gitlabMergeRequestShape]]) {
  failIf(errors, !contents.includes("apt-get install -y --no-install-recommends git ca-certificates"), `.gitlab-ci.yml ${job} must install git for repository-state checks in slim Node images.`);
}
failIf(errors, !gitlabCi.includes("$CI_OPEN_MERGE_REQUESTS"), ".gitlab-ci.yml must suppress duplicate branch pipelines while an MR is open.");
failIf(errors, !governance.includes("Public GitLab Runner Discipline"), "GOVERNANCE.md must describe the public GitLab runner boundary.");
failIf(errors, !agents.includes("Open Ground GitLab"), "AGENTS.md must describe the Open Ground GitLab gate.");
failIf(errors, !ciReadme.includes("Open Ground GitLab"), ".github/CI-README.md must describe the Open Ground GitLab lane.");
failIf(errors, !readme.includes("Open Ground GitLab"), "README must describe the Open Ground GitLab contribution gate.");
failIf(errors, !readme.includes("GZDS-governed"), "README must present Mousecat as GZDS-governed OSS.");
failIf(errors, !readme.includes("Kohai-aware"), "README must describe the Kohai-aware root odometer.");
failIf(errors, !readme.includes("PolyForm Perimeter 1.0.0"), "README must describe the PolyForm Perimeter license posture.");
failIf(errors, !readme.includes("PR documentation runner"), "README must describe the PR documentation runner.");
failIf(errors, !prTemplate.includes("PR shape gate"), ".github/pull_request_template.md must surface the PR shape gate.");

report("governance:ceiling", errors);
