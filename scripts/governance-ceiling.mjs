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
const ci = readText(".github/workflows/ci.yml");
const ciReadme = readText(".github/CI-README.md");
const prTemplate = readText(".github/pull_request_template.md");

for (const script of ["pr:ready", "governance:floor", "governance:ceiling", "docs:check", "hygiene:strict", "test:github-scripts", "pr:shape"]) {
  failIf(errors, !pkg.scripts?.[script], `package.json must expose npm run ${script}.`);
}

for (const command of ["npm run pr:ready", "npm audit --audit-level=high", "check-pr-chronology.mjs", "check-pr-shape.mjs"]) {
  failIf(errors, !ci.includes(command), `.github/workflows/ci.yml must run ${command}.`);
}

failIf(errors, !governance.includes("GZDS"), "GOVERNANCE.md must identify GZDS as the governing standard.");
failIf(errors, !governance.includes("PR readiness"), "GOVERNANCE.md must describe PR readiness.");
failIf(errors, !agents.includes("npm run pr:ready"), "AGENTS.md must instruct agents to run npm run pr:ready before PR readiness claims.");
failIf(errors, !ciReadme.includes("GZDS"), ".github/CI-README.md must describe the GZDS-aligned CI posture.");
failIf(errors, !readme.includes("GZDS-governed"), "README must present Mousecat as GZDS-governed OSS.");
failIf(errors, !prTemplate.includes("PR shape gate"), ".github/pull_request_template.md must surface the PR shape gate.");

report("governance:ceiling", errors);
