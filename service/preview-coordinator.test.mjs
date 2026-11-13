import assert from "node:assert/strict";
import test from "node:test";
import { PreviewCoordinator, sameActionToken } from "../src/data/previewCoordinator.ts";

test("new project loads reject late results from the prior project", () => {
  const coordinator = new PreviewCoordinator();
  const a = coordinator.beginLoad("project-a");
  const b = coordinator.beginLoad("project-b");
  assert.equal(coordinator.acceptsLoad(a), false);
  assert.equal(coordinator.acceptsLoad(b), true);
});

test("newer destination replans reject reordered earlier responses", () => {
  const coordinator = new PreviewCoordinator();
  coordinator.beginLoad("project-a");
  const first = coordinator.beginAction("project-a", "backup");
  const second = coordinator.beginAction("project-a", "backup");
  assert.equal(coordinator.acceptsAction(first), false);
  assert.equal(coordinator.acceptsAction(second), true);
});

test("project reload and close invalidate pending action previews", () => {
  const coordinator = new PreviewCoordinator();
  coordinator.beginLoad("project-a");
  const pending = coordinator.beginAction("project-a", "backup");
  coordinator.beginLoad("project-a");
  assert.equal(coordinator.acceptsAction(pending), false);
  const pendingAfterReload = coordinator.beginAction("project-a", "backup");
  coordinator.invalidate();
  assert.equal(coordinator.acceptsAction(pendingAfterReload), false);
});

test("navigation invalidates an in-flight approval completion", () => {
  const coordinator = new PreviewCoordinator();
  coordinator.beginLoad("project-a");
  const approval = coordinator.beginAction("project-a", "apply:backup");
  coordinator.beginLoad("project-b");
  assert.equal(coordinator.acceptsAction(approval), false);
});

test("an old approval cannot clear the busy identity of a newer approval", () => {
  const coordinator = new PreviewCoordinator();
  coordinator.beginLoad("project-a");
  const oldApproval = coordinator.beginAction("project-a", "apply:commit");
  const newApproval = coordinator.beginAction("project-a", "apply:commit");
  assert.equal(sameActionToken(oldApproval, newApproval), false);
  assert.equal(coordinator.acceptsAction(oldApproval), false);
  assert.equal(coordinator.acceptsAction(newApproval), true);
});
