import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { operatorSnapshot } from "../src/operator/server.mjs";
import {
  validateProjectGroupDescriptor,
  generateProjectSurfaceDraft,
  validateProjectSurfaceDescriptor,
} from "../src/core/project-surfaces.mjs";

function tempStateConfig() {
  const dir = mkdtempSync(join(tmpdir(), "mousecat-projects-"));
  return {
    dir,
    path: join(dir, ".mousecat", "state.json"),
    config: {
      state: {
        enabled: true,
        path: join(dir, ".mousecat", "state.json"),
        maxEvents: 20,
        maxRoutePlans: 20,
      },
    },
  };
}

function fixtureProject(parent) {
  const root = join(parent, "example-project");
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, ".git"), { recursive: true });
  writeFileSync(join(root, ".git", "config"), "[remote \"origin\"]\n\turl = git@github.com:ellyj3rain/example-project.git\n");
  mkdirSync(join(root, "decisions"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "# Example\n\nAny governing set works.\n");
  writeFileSync(join(root, "GOVERNANCE.md"), "# Governance\n\nAny names, any layout.\n");
  writeFileSync(join(root, "SESSION_STATE.md"), "# Session state\n\n**As of** today, the example stands.\n");
  writeFileSync(join(root, "BATCH_LOG.md"), "# Batch log\n\n| Batch | Date |\n|---|---|\n| A1 | 2026-01-01 |\n");
  writeFileSync(join(root, "VERSION"), "1.2.3-alpha\n");
  writeFileSync(
    join(root, "decisions", "rows.jsonl"),
    [
      JSON.stringify({ id: 1, word: "watch", county: "County001" }),
      JSON.stringify({ id: 2, word: "cook", county: "County002" }),
      "",
    ].join("\n"),
  );
  return root;
}

const OBSERVER = { profileId: "observer" };
const OPERATOR = { profileId: "operator-interaction" };

test("explicit legacy associations survive restart without changing ownership or leaking sensitive titles", async () => {
  const { dir, config } = tempStateConfig();
  try {
    const root = fixtureProject(dir);
    const runtime = createMousecatRuntime({ config });
    const draft = generateProjectSurfaceDraft(root).draft;
    const surface = { ...draft, interactionIds: ["legacy", "private"] };
    assert.equal(runtime.handleTool("mousecat.projects", { action: "register", surface, permit: OPERATOR }).ok, true);
    runtime.handleTool("mousecat.ask", { interactionId: "legacy", title: "Legacy", prompt: "Review it" });
    runtime.handleTool("mousecat.ask", { interactionId: "private", title: "PRIVATE TITLE", source: "PRIVATE SOURCE", items: [{ id: "secret", prompt: "PRIVATE PROMPT", sensitive: true }] });
    for (const candidate of [runtime, createMousecatRuntime({ config })]) {
      for (const projectRef of [undefined, draft.projectRef]) {
        const result = candidate.handleTool("mousecat.projects", { action: "threads", projectRef, permit: OBSERVER });
        const threads = [...result.threads.live, ...result.threads.archived];
        assert.equal(threads.length, 2);
        assert.equal(threads.find(t => t.interactionId === "legacy").projectRef, null);
        assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
      }
      assert.doesNotMatch(JSON.stringify(await operatorSnapshot(candidate)), /PRIVATE/);
    }
    for (const interactionIds of ["legacy", ["legacy", "legacy"], [" "], ["x".repeat(513)], Array.from({ length: 257 }, (_, i) => String(i))]) {
      assert.equal(validateProjectSurfaceDescriptor({ ...draft, interactionIds }).ok, false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("project surface descriptors accept any governing document set", () => {
  const validated = validateProjectSurfaceDescriptor({
    surfaceId: "any-project",
    projectRef: "project:any-project",
    projectKind: "repository",
    root: "C:/somewhere/any-project",
    identityMarkers: ["CONTRIBUTING.md", "docs/decisions.md"],
    governingDocuments: [
      { role: "instructions", path: "CONTRIBUTING.md", excerptLines: 20 },
      { role: "decisions", path: "docs/decisions.md", tailLines: 8 },
    ],
    dataSources: [
      { name: "runs", path: "data/runs.jsonl", format: "jsonl" },
    ],
  });
  assert.equal(validated.ok, true);
  assert.equal(validated.value.governingDocuments.length, 2);
  assert.equal(validated.value.dataSources[0].format, "jsonl");
});

test("project surface descriptors reject forbidden fields and unsafe paths", () => {
  const forbidden = validateProjectSurfaceDescriptor({
    surfaceId: "bad-project",
    projectRef: "project:bad-project",
    projectKind: "repository",
    root: "C:/somewhere/bad-project",
    identityMarkers: ["README.md"],
    governingDocuments: [{ role: "readme", path: "README.md", script: "not-allowed.js" }],
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.code, "project-surface-executable-or-secret-field-rejected");

  const traversal = validateProjectSurfaceDescriptor({
    surfaceId: "bad-project",
    projectRef: "project:bad-project",
    projectKind: "repository",
    root: "C:/somewhere/bad-project",
    identityMarkers: ["../outside.md"],
    governingDocuments: [{ role: "readme", path: "README.md" }],
  });
  assert.equal(traversal.ok, false);
  assert.equal(traversal.code, "project-surface-identity-marker-invalid");

  const duplicateRole = validateProjectSurfaceDescriptor({
    surfaceId: "bad-project",
    projectRef: "project:bad-project",
    projectKind: "repository",
    root: "C:/somewhere/bad-project",
    identityMarkers: ["README.md"],
    governingDocuments: [
      { role: "readme", path: "README.md" },
      { role: "readme", path: "docs/README.md" },
    ],
  });
  assert.equal(duplicateRole.ok, false);
  assert.equal(duplicateRole.code, "project-surface-document-role-invalid");
});

test("the generator drafts a surface without registering it", () => {
  const parent = mkdtempSync(join(tmpdir(), "mousecat-draft-"));
  try {
    const root = fixtureProject(parent);
    const draft = generateProjectSurfaceDraft(root);
    assert.equal(draft.ok, true);
    assert.equal(draft.evidence.qualified, true);
    assert.equal(draft.evidence.heuristic, true);
    assert.equal(draft.draft.surfaceId, "example-project");
    assert.ok(draft.draft.governingDocuments.some((document) => document.role === "instructions"));
    assert.ok(draft.draft.governingDocuments.some((document) => document.role === "state"));
    assert.ok(draft.draft.dataSources.some((source) => source.path === "decisions"));

    const bare = mkdtempSync(join(tmpdir(), "mousecat-bare-"));
    writeFileSync(join(bare, "notes.txt"), "one file only\n");
    const unqualified = generateProjectSurfaceDraft(bare);
    assert.equal(unqualified.ok, true);
    assert.equal(unqualified.draft, null);
    assert.equal(unqualified.evidence.reason, "not-a-git-repository");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("projects register, describe pages, and hold project-bound threads", () => {
  const { dir, path, config } = tempStateConfig();
  try {
    const parent = mkdtempSync(join(tmpdir(), "mousecat-lifecycle-"));
    config.projects = { roots: [parent] };
    const root = fixtureProject(parent);
    const runtime = createMousecatRuntime({ config });

    const listed = runtime.handleTool("mousecat.projects", { action: "list", permit: OBSERVER });
    assert.equal(listed.ok, true);
    assert.equal(listed.registered.length, 0);
    assert.equal(listed.drafts, undefined);

    const discovered = runtime.handleTool("mousecat.projects", { action: "discover", permit: OBSERVER });
    assert.equal(discovered.ok, true);
    assert.equal(discovered.drafts.length, 1);
    assert.equal(discovered.drafts[0].draft.surfaceId, "example-project");
    assert.ok(discovered.drafts[0].evidence.gitRemotes[0].includes("example-project.git"));

    const draft = discovered.drafts[0].draft;
    draft.projectRef = "project:example-project";
    const registered = runtime.handleTool("mousecat.projects", {
      action: "register",
      surface: draft,
      permit: OPERATOR,
    });
    assert.equal(registered.ok, true);
    assert.equal(registered.surface.projectRef, "project:example-project");

    runtime.handleTool("mousecat.ask", {
      interactionId: "example-thread",
      projectRef: "project:example-project",
      prompt: "Example project question",
    });

    const described = runtime.handleTool("mousecat.projects", {
      action: "describe",
      surfaceId: "example-project",
      permit: OBSERVER,
    });
    assert.equal(described.ok, true);
    assert.equal(described.threads.live.length, 1);
    assert.equal(described.threads.live[0].interactionId, "example-thread");
    const stateDocument = described.page.governingDocuments.find((document) => document.role === "state");
    assert.equal(stateDocument.exists, true);
    assert.ok(stateDocument.excerpt[0].startsWith("# Session state"));
    const versionDocument = described.page.governingDocuments.find((document) => document.role === "version");
    assert.deepEqual(versionDocument.excerpt, ["1.2.3-alpha", ""]);

    const second = createMousecatRuntime({ config });
    const persisted = second.handleTool("mousecat.projects", {
      action: "describe",
      surfaceId: "example-project",
      permit: OBSERVER,
    });
    assert.equal(persisted.ok, true);
    assert.equal(persisted.threads.archived.length, 0);
    assert.equal(persisted.threads.live.length, 1);
    assert.equal(persisted.threads.live[0].interactionId, "example-thread");
    assert.equal(second.status().counts.projectSurfaces, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("projects summarize declared jsonl data sources", () => {
  const { dir, config } = tempStateConfig();
  try {
    const parent = mkdtempSync(join(tmpdir(), "mousecat-data-"));
    const root = fixtureProject(parent);
    const runtime = createMousecatRuntime({ config });
    const draft = generateProjectSurfaceDraft(root);
    assert.equal(draft.ok, true);
    const registered = runtime.handleTool("mousecat.projects", {
      action: "register",
      surface: { ...draft.draft, projectRef: "project:example-project" },
      permit: OPERATOR,
    });
    assert.equal(registered.ok, true);

    const summary = runtime.handleTool("mousecat.projects", {
      action: "data",
      surfaceId: "example-project",
      source: "decisions",
      permit: OBSERVER,
    });
    assert.equal(summary.ok, true);
    assert.equal(summary.summary.format, "jsonl");
    assert.equal(summary.summary.isDirectory, true);
    assert.equal(summary.summary.files, 1);

    const fileSummary = runtime.handleTool("mousecat.projects", {
      action: "data",
      surfaceId: "example-project",
      source: draft.draft.dataSources.find((source) => source.path === "decisions").name,
      permit: OBSERVER,
    });
    assert.equal(fileSummary.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project surface actions are permit-scoped", () => {
  const runtime = createMousecatRuntime();
  const listed = runtime.handleTool("mousecat.projects", { action: "list", permit: OBSERVER });
  assert.equal(listed.ok, true);

  const refused = runtime.handleTool("mousecat.projects", {
    action: "register",
    surface: {
      surfaceId: "unpermitted",
      projectRef: "project:unpermitted",
      projectKind: "repository",
      root: "C:/nowhere",
      identityMarkers: ["README.md"],
      governingDocuments: [{ role: "readme", path: "README.md" }],
    },
    permit: OBSERVER,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "project-surface-permit-required");

  const unpermitted = runtime.handleTool("mousecat.projects", { action: "list" });
  assert.equal(unpermitted.ok, false);
  assert.equal(unpermitted.code, "project-surface-permit-required");
});

test("project groups collate registered subprojects", () => {
  const { dir, config } = tempStateConfig();
  try {
    const parent = mkdtempSync(join(tmpdir(), "mousecat-group-"));
    config.projects = { roots: [parent] };
    const root = fixtureProject(parent);
    const runtime = createMousecatRuntime({ config });
    const draft = generateProjectSurfaceDraft(root);
    assert.equal(draft.ok, true);
    const registered = runtime.handleTool("mousecat.projects", {
      action: "register",
      surface: { ...draft.draft, surfaceId: "sao", projectRef: "project:sao" },
      permit: OPERATOR,
    });
    assert.equal(registered.ok, true);

    const missingMember = runtime.handleTool("mousecat.projects", {
      action: "register",
      group: {
        groupId: "county-family",
        label: "County family",
        memberSurfaceIds: ["sao", "not-registered"],
      },
      permit: OPERATOR,
    });
    assert.equal(missingMember.ok, false);
    assert.equal(missingMember.code, "project-group-member-unknown");
    assert.deepEqual(missingMember.missingMembers, ["not-registered"]);

    const groupRegistered = runtime.handleTool("mousecat.projects", {
      action: "register",
      group: {
        groupId: "county-family",
        label: "County family",
        projectRef: "project:county-family",
        memberSurfaceIds: ["sao"],
      },
      permit: OPERATOR,
    });
    assert.equal(groupRegistered.ok, true);

    const listed = runtime.handleTool("mousecat.projects", { action: "list", permit: OBSERVER });
    assert.equal(listed.groups.length, 1);
    assert.equal(listed.groups[0].groupId, "county-family");

    const described = runtime.handleTool("mousecat.projects", {
      action: "describe",
      groupId: "county-family",
      permit: OBSERVER,
    });
    assert.equal(described.ok, true);
    assert.equal(described.members.length, 1);
    assert.equal(described.members[0].surfaceId, "sao");
    assert.equal(described.members[0].missing, false);
    const stateDocument = described.members[0].page.governingDocuments.find((document) => document.role === "state");
    assert.equal(stateDocument.exists, true);
    assert.ok(Array.isArray(described.threads.live));

    const second = createMousecatRuntime({ config });
    const persisted = second.handleTool("mousecat.projects", { action: "list", permit: OBSERVER });
    assert.equal(persisted.groups.length, 1);
    assert.equal(persisted.groups[0].groupId, "county-family");
    assert.equal(second.status().counts.projectGroups, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project group descriptors validate shape and reject unsafe fields", () => {
  const valid = validateProjectGroupDescriptor({
    groupId: "county-family",
    label: "County family",
    projectRef: "project:county-family",
    memberSurfaceIds: ["sao", "zao", "zomboid-speakeasy"],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.memberSurfaceIds.length, 3);

  const duplicateMembers = validateProjectGroupDescriptor({
    groupId: "county-family",
    label: "County family",
    memberSurfaceIds: ["sao", "sao"],
  });
  assert.equal(duplicateMembers.ok, false);
  assert.equal(duplicateMembers.code, "project-group-member-invalid");

  const forbidden = validateProjectGroupDescriptor({
    groupId: "county-family",
    label: "County family",
    memberSurfaceIds: ["sao"],
    script: "not-allowed.js",
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.code, "project-group-executable-or-secret-field-rejected");
});
