import test from "node:test";
import assert from "node:assert/strict";

import {
  ATOMIC_SKILLS,
  SKILL_FRAMEWORKS,
  WORK_PERMIT_PROFILES,
  catalogSnapshot,
  skillButtons,
} from "../src/core/catalog.mjs";

test("Crucible, Mass-Assault, and Total Recall are atomic button skills", () => {
  const skillIds = ATOMIC_SKILLS.map((skill) => skill.id);
  assert.ok(skillIds.includes("crucible.point"));
  assert.ok(skillIds.includes("mass-assault.queue"));
  assert.ok(skillIds.includes("total-recall.docket"));

  const buttons = skillButtons();
  assert.ok(buttons.some((button) => button.skill === "crucible" && button.tool === "mousecat.ask"));
  assert.ok(buttons.some((button) => button.skill === "mass-assault" && button.tool === "mousecat.queue"));
  assert.ok(buttons.some((button) => button.skill === "total-recall" && button.tool === "mousecat.session"));
});

test("skill frameworks keep atomic skills and permit boundaries graphable", () => {
  const operator = SKILL_FRAMEWORKS.find((framework) => framework.id === "operator-decision");
  const boundary = SKILL_FRAMEWORKS.find((framework) => framework.id === "tool-boundary-control");

  assert.ok(operator.atomicSkillRefs.includes("crucible.tree"));
  assert.ok(operator.atomicSkillRefs.includes("mass-assault.queue"));
  assert.ok(boundary.boundaryRefs.includes("tool-invocation"));
});

test("work permits separate observer, operator interaction, invocation, and credentials", () => {
  const ids = WORK_PERMIT_PROFILES.map((permit) => permit.id);
  assert.deepEqual(ids, ["observer", "operator-interaction", "tool-invocation", "credential-steward"]);
  assert.equal(WORK_PERMIT_PROFILES.find((permit) => permit.id === "credential-steward").secretValuesAllowed, false);
});

test("catalog snapshot exposes one stable source-owned surface", () => {
  const snapshot = catalogSnapshot();
  assert.equal(snapshot.schema, "mousecat.catalog/1");
  assert.equal(snapshot.tools.length, 8);
  assert.ok(snapshot.buttons.length >= 7);
});
