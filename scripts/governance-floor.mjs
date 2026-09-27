#!/usr/bin/env node

import {
  failIf,
  fileExists,
  readJson,
  readText,
  report,
} from "./lib/check-utils.mjs";
import {
  INTERACTION_SHAPES,
  INTERACTION_STATUSES,
  MOUSECAT_TOOLS,
  TOOL_BOUNDARIES,
  WORK_PERMIT_PROFILES,
} from "../src/core/catalog.mjs";
import {
  parseRootVersion,
  projectRootVersionToPackageVersion,
} from "../src/core/governance/version.mjs";
import { validateToolBoundaries } from "./lib/tool-boundaries.mjs";

const errors = [];
const pkg = readJson("package.json");
const lock = readJson("package-lock.json");
const version = readText("VERSION").trim();
const license = fileExists("LICENSE") ? readText("LICENSE") : "";
const rootVersion = parseRootVersion(version);
const packageProjection = projectRootVersionToPackageVersion(version);

failIf(errors, pkg.license !== "SEE LICENSE IN LICENSE", "package.json license must point to the in-repo PolyForm Perimeter license.");
failIf(errors, !license.includes("PolyForm Perimeter License 1.0.0"), "LICENSE must contain the PolyForm Perimeter 1.0.0 text.");
failIf(errors, !license.includes("Required Notice:"), "LICENSE must carry a Required Notice line.");
failIf(errors, !rootVersion.ok, rootVersion.violation || "VERSION must use Mousecat's Kohai-aware root form.");
failIf(errors, !packageProjection.ok, packageProjection.error || "VERSION must project to npm package metadata.");
if (packageProjection.ok) {
  failIf(errors, pkg.version !== packageProjection.version, `package.json version (${pkg.version}) must project from VERSION (${version}) as ${packageProjection.version}.`);
  failIf(errors, lock.version !== packageProjection.version, `package-lock.json top version (${lock.version}) must match package projection ${packageProjection.version}.`);
  failIf(errors, lock.packages?.[""]?.version !== packageProjection.version, `package-lock root package version (${lock.packages?.[""]?.version}) must match package projection ${packageProjection.version}.`);
}
failIf(errors, !fileExists("package-lock.json"), "package-lock.json must be present for deterministic npm ci.");

const toolNames = MOUSECAT_TOOLS.map((tool) => tool.name);
errors.push(...validateToolBoundaries(MOUSECAT_TOOLS, TOOL_BOUNDARIES, WORK_PERMIT_PROFILES));

for (const permit of WORK_PERMIT_PROFILES) {
  for (const grant of permit.grants) {
    const tool = grant.split(":")[0];
    failIf(errors, !toolNames.includes(tool), `${permit.id} grants unknown tool ${grant}.`);
  }
}

failIf(errors, INTERACTION_SHAPES.length !== new Set(INTERACTION_SHAPES).size, "Interaction shapes must be unique.");
failIf(errors, INTERACTION_STATUSES.length !== new Set(INTERACTION_STATUSES).size, "Interaction statuses must be unique.");

const bridge = MOUSECAT_TOOLS.find((tool) => tool.name === "mousecat.bridge");
failIf(errors, !bridge, "mousecat.bridge must stay in the public tool catalog.");
failIf(errors, !TOOL_BOUNDARIES.some((entry) => entry.tool === "mousecat.bridge" && entry.upstreamAccess === "resource-read"), "mousecat.bridge must remain a resource-read boundary.");

report("governance:floor", errors);
