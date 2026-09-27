import test from "node:test";
import assert from "node:assert/strict";
import { MOUSECAT_TOOLS, TOOL_BOUNDARIES, WORK_PERMIT_PROFILES } from "../src/core/catalog.mjs";
import { validateToolBoundaries } from "../scripts/lib/tool-boundaries.mjs";

function check(change) {
  const boundaries = structuredClone(TOOL_BOUNDARIES);
  change?.(boundaries);
  return validateToolBoundaries(MOUSECAT_TOOLS, boundaries, WORK_PERMIT_PROFILES);
}

test("public tool boundaries cover action schemas and declared authority", () => {
  assert.deepEqual(check(), []);
});

test("floor rejects unknown permits and incomplete or invented action declarations", () => {
  const errors = check(boundaries => {
    const projects = boundaries.find(boundary => boundary.tool === "mousecat.projects");
    projects.actionPermits.register = "unknown-permit";
    delete projects.actionPermits.list;
    projects.actionPermits.invented = "observer";
  });
  assert.ok(errors.some(error => error.includes("register references unknown permit unknown-permit")));
  assert.ok(errors.some(error => error.includes("list has no declared permit")));
  assert.ok(errors.some(error => error.includes("invented is not a public action")));
});

test("adapter-defined permits cannot excuse an unrelated action or tool", () => {
  const errors = check(boundaries => {
    boundaries.find(boundary => boundary.tool === "mousecat.projects").actionPermits.register = "adapter-operation-permit";
    boundaries.find(boundary => boundary.tool === "mousecat.workbench").actionPermits.open = "adapter-operation-permit";
  });
  assert.equal(errors.filter(error => error.includes("unknown permit adapter-operation-permit")).length, 2);
});
