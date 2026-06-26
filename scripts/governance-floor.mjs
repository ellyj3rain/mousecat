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

const errors = [];
const pkg = readJson("package.json");
const version = readText("VERSION").trim();
const license = fileExists("LICENSE") ? readText("LICENSE") : "";

failIf(errors, pkg.license !== "MPL-2.0", "package.json license must be MPL-2.0.");
failIf(errors, !license.includes("Mozilla Public License Version 2.0"), "LICENSE must contain the MPL-2.0 text.");
failIf(errors, pkg.version !== version, `package.json version (${pkg.version}) must match VERSION (${version}).`);
failIf(errors, !fileExists("package-lock.json"), "package-lock.json must be present for deterministic npm ci.");

const toolNames = MOUSECAT_TOOLS.map((tool) => tool.name);
const boundaryNames = TOOL_BOUNDARIES.map((boundary) => boundary.tool);
for (const toolName of toolNames) {
  failIf(errors, !boundaryNames.includes(toolName), `${toolName} must have a TOOL_BOUNDARIES entry.`);
}
for (const boundary of TOOL_BOUNDARIES) {
  failIf(errors, !toolNames.includes(boundary.tool), `${boundary.tool} boundary has no matching public tool.`);
  failIf(errors, !WORK_PERMIT_PROFILES.some((permit) => permit.id === boundary.defaultPermit), `${boundary.tool} references unknown permit ${boundary.defaultPermit}.`);
}

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
