#!/usr/bin/env node

import {
  failIf,
  latestHeading,
  markdownTableItems,
  readJson,
  readText,
  report,
} from "./lib/check-utils.mjs";
import { MOUSECAT_TOOLS } from "../src/core/catalog.mjs";
import { parseRootVersion, projectRootVersionToPackageVersion } from "../src/core/governance/version.mjs";

const errors = [];
const pkg = readJson("package.json");
const rootVersion = readText("VERSION").trim();
const readme = readText("README.md");
const architecture = readText("ARCHITECTURE.md");
const batchLog = readText("BATCH_LOG.md");
const decisions = readText("DECISION_REGISTRY.md");
const session = readText("SESSION_STATE.md");

const toolNames = MOUSECAT_TOOLS.map((tool) => tool.name).sort();
const readmeTools = markdownTableItems(readme).sort();
const architectureTools = markdownTableItems(architecture).sort();

failIf(errors, JSON.stringify(readmeTools) !== JSON.stringify(toolNames), "README tool table must match src/core/catalog.mjs.");
failIf(errors, JSON.stringify(architectureTools) !== JSON.stringify(toolNames), "ARCHITECTURE public tool table must match src/core/catalog.mjs.");
failIf(errors, !readme.includes("PolyForm Perimeter 1.0.0"), "README must state the PolyForm Perimeter license posture.");
failIf(errors, pkg.license !== "SEE LICENSE IN LICENSE", "package.json must point to the in-repo license.");
failIf(errors, !parseRootVersion(rootVersion).ok, "VERSION must use the Kohai-aware root odometer.");
failIf(errors, !projectRootVersionToPackageVersion(rootVersion).ok, "VERSION must project losslessly to npm package metadata.");
failIf(errors, !readme.includes("Kohai-aware"), "README must describe the Kohai-aware version posture.");
failIf(errors, !readme.includes("npm run pr:ready"), "README CI section must name npm run pr:ready.");

const latestBatch = latestHeading(batchLog, "## [");
failIf(errors, !latestBatch, "BATCH_LOG.md must contain at least one batch entry.");
if (latestBatch) {
  const batchId = /\[(A[0-9.]+)\]/u.exec(latestBatch)?.[1] || null;
  failIf(errors, batchId && !session.includes(batchId), `SESSION_STATE.md must mention latest batch ${batchId}.`);
}

const latestDecision = latestHeading(decisions, "## DR-");
failIf(errors, !latestDecision, "DECISION_REGISTRY.md must contain at least one decision entry.");

report("docs:check", errors);
