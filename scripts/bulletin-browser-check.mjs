#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";

const output = resolve(".mousecat/bulletin-browser"); await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
const permit = { profileId: "operator-interaction" }, results = [];
const titles = ["Keep geometry with each observation", "Retain uncertain sound attribution", "Separate gaze from travel direction", "Preserve physical consequences", "Carry correction provenance", "Review contact geometry"];
let app;
try {
  for (const viewport of [{ width: 1680, height: 950 }, { width: 760, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    const runtime = createMousecatRuntime();
    for (let i = 0; i < 9; i++) {
      const result = runtime.handleTool("mousecat.bulletin", { action: "capture", permit, record: {
        ideaId: `example-${i}`, projectRef: i < 6 ? "project:field-study" : "project:asset-work", title: titles[i % titles.length],
        proposition: "An explicitly captured proposal retains its source context and can be corrected as evidence improves.",
        horizon: i % 2 ? "mid" : "short", source: { author: i % 2 ? "Operator" : "Example host", host: "synthetic-demo", sessionId: "example-chat", messageId: `message-${i}`, at: `2026-10-04T10:${String(i).padStart(2, "0")}:00.000Z` },
        links: i > 0 && i < 6 ? [{ ideaId: `example-${i - 1}`, relation: i % 2 ? "extends" : "relates" }] : [],
      } }); assert.equal(result.ok, true);
    }
    app = await startOperatorServer({ runtime, port: 0 });
    const context = await browser.newContext({ viewport });
    try {
      const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.goto(app.url + "/#bulletin"); await page.locator(".bulletin-node").first().waitFor();
      assert.equal(await page.locator("#bulletin-toggle").getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".bulletin-node").count(), 9); assert.equal(await page.locator(".bulletin-connection").count(), 5);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({ path: resolve(output, `${viewport.width}-board.png`), fullPage: true });
      const original = await page.locator(".bulletin-canvas>g").getAttribute("transform");
      await page.getByRole("button", { name: "Zoom in bulletin" }).click(); assert.notEqual(await page.locator(".bulletin-canvas>g").getAttribute("transform"), original);
      await page.getByRole("button", { name: "Fit", exact: true }).click();
      const canvas = page.locator(".bulletin-canvas"); await canvas.focus(); await canvas.press("ArrowLeft"); assert.notEqual(await page.locator(".bulletin-canvas>g").getAttribute("transform"), original); await canvas.press("f");
      await page.screenshot({ path: resolve(output, `${viewport.width}-overview.png`), fullPage: true });
      await page.getByLabel("Bulletin project").selectOption("project:field-study"); assert.equal(await page.locator(".bulletin-node").count(), 6);
      await page.screenshot({ path: resolve(output, `${viewport.width}-project.png`), fullPage: true });
      await page.getByRole("searchbox", { name: "Find an idea" }).fill("uncertain sound"); assert.equal(await page.locator(".bulletin-node").count(), 1);
      await page.waitForFunction(() => document.querySelector(".bulletin-count").dataset.queryVerified === "true");
      await page.getByRole("searchbox", { name: "Find an idea" }).fill("");
      const first = page.locator('[data-idea-id="example-0"]'); await first.focus(); await first.press("Enter");
      await page.getByRole("heading", { name: titles[0], exact: true }).waitFor();
      assert.match(await page.locator(".bulletin-details").innerText(), /example-chat|message-0/);
      await page.screenshot({ path: resolve(output, `${viewport.width}-details.png`), fullPage: true });
      await page.getByRole("button", { name: "Amend", exact: true }).click(); await page.getByRole("textbox", { name: "Title", exact: true }).fill("Geometry with retained source identity");
      await page.getByRole("button", { name: "Save idea", exact: true }).click(); await page.waitForFunction(() => !document.querySelector(".bulletin-editor").open);
      assert.equal(runtime.state.bulletin.get("example-0").revision, 2);
      await page.getByLabel("Change idea standing").selectOption("parked"); await page.getByRole("button", { name: "Apply standing", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-idea-id="example-0"]').classList.contains("parked"));
      await page.getByRole("button", { name: "Close details", exact: true }).click();
      const submissions = [];
      await page.route("**/api/command", async route => {
        const payload = route.request().postDataJSON();
        if (payload.commandId !== "bulletin-capture") return route.continue();
        submissions.push(payload);
        if (submissions.length !== 1) return route.continue();
        const committed = await route.fetch(); assert.equal(committed.status(), 200);
        await route.abort("failed");
      });
      await page.getByRole("button", { name: "Capture idea", exact: true }).click();
      await page.getByRole("textbox", { name: "Title", exact: true }).fill("New proposition from operator");
      await page.getByRole("textbox", { name: "Proposition", exact: true }).fill("Retain this bounded proposition for later review.");
      await page.getByRole("button", { name: "Save idea", exact: true }).click();
      await page.locator(".bulletin-error").filter({ hasText: "Save outcome unknown" }).waitFor();
      assert.equal(runtime.state.bulletin.size, 10, "the failed response follows a completed capture");
      const savedId = submissions[0].values.record.ideaId, anchor = structuredClone(runtime.state.bulletin.get(savedId).source);
      assert.equal(await page.getByRole("textbox", { name: "Proposition", exact: true }).isDisabled(), true);
      await page.getByRole("button", { name: "Retry save", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector(".bulletin-editor").open);
      assert.deepEqual(submissions[1], submissions[0], "retry keeps the exact submitted draft");
      assert.equal(runtime.state.bulletin.size, 10);
      assert.equal(runtime.state.bulletin.get(savedId).revision, 1);
      assert.deepEqual(runtime.state.bulletin.get(savedId).source, anchor);
      await page.getByRole("button", { name: "Capture idea", exact: true }).click();
      await page.getByRole("textbox", { name: "Title", exact: true }).fill("New proposition from operator");
      await page.getByRole("textbox", { name: "Proposition", exact: true }).fill("Retain this bounded proposition for later review.");
      await page.getByRole("button", { name: "Save idea", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector(".bulletin-editor").open);
      assert.notEqual(submissions[2].values.record.ideaId, savedId, "an intentional fresh draft has its own identity");
      assert.equal(runtime.state.bulletin.size, 11);
      await page.unroute("**/api/command");
      await first.focus(); await first.press("Enter"); await page.getByText("Prune content", { exact: true }).click(); await page.getByRole("button", { name: "Prune this idea", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".bulletin-details h3")?.textContent === "Pruned idea");
      assert.equal(runtime.state.bulletin.get("example-0").status, "pruned");
      await page.getByRole("button", { name: "Close details", exact: true }).click();
      await page.getByLabel("Idea standing").selectOption("pruned"); assert.equal(await page.locator(".bulletin-node").count(), 1);
      await page.getByLabel("Idea standing").selectOption("active");
      const second = page.locator('[data-idea-id="example-1"]'); await second.focus(); await second.press("Enter");
      await page.getByRole("button", { name: "Amend", exact: true }).click();
      await page.getByRole("textbox", { name: "Proposition", exact: true }).fill("Draft retained during a source conflict");
      const stored = runtime.state.bulletin.get("example-1"); runtime.bulletinCommand({ action: "disposition", ideaId: stored.ideaId, projectRef: stored.projectRef, expectedRevision: stored.revision, status: "parked", source: stored.source });
      await page.getByRole("button", { name: "Save idea", exact: true }).click(); await page.locator(".bulletin-error").filter({ hasText: "bulletin-revision-conflict" }).waitFor();
      assert.equal(await page.getByRole("textbox", { name: "Proposition", exact: true }).inputValue(), "Draft retained during a source conflict");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Close details", exact: true }).click();
      const selected = page.locator('[data-idea-id="example-2"]'); await selected.focus(); await selected.press("Enter");
      const connection = page.getByLabel("Connect to idea"); await connection.selectOption("example-1"); await connection.focus();
      const candidate = { ...structuredClone(runtime.state.bulletin.get("example-3")), ideaId: "live-candidate", title: "New live candidate", links: [] };
      const captureRecord = Object.fromEntries(["ideaId", "projectRef", "title", "proposition", "source", "horizon", "links"].map(key => [key, candidate[key]]));
      assert.equal(runtime.handleTool("mousecat.bulletin", { action: "capture", permit, record: captureRecord }).ok, true);
      await page.waitForFunction(() => [...document.querySelector('[aria-label="Connect to idea"]').options].some(option => option.value === "live-candidate"));
      assert.equal(await connection.inputValue(), "example-1"); assert.equal(await connection.evaluate(node => document.activeElement === node), true);
      const currentCandidate = runtime.state.bulletin.get("live-candidate");
      assert.equal(runtime.handleTool("mousecat.bulletin", { action: "amend", permit, ideaId: currentCandidate.ideaId, projectRef: currentCandidate.projectRef, expectedRevision: currentCandidate.revision, patch: { title: "Renamed live candidate" }, source: currentCandidate.source }).ok, true);
      await page.waitForFunction(() => [...document.querySelector('[aria-label="Connect to idea"]').options].some(option => option.value === "live-candidate" && option.textContent === "Renamed live candidate"));
      await page.getByRole("button", { name: "Amend", exact: true }).click();
      const draft = page.getByRole("textbox", { name: "Proposition", exact: true }); await draft.fill("Private draft remains through peer updates"); await draft.focus();
      const linked = runtime.state.bulletin.get("example-1");
      assert.equal(runtime.bulletinCommand({ action: "prune", ideaId: linked.ideaId, projectRef: linked.projectRef, expectedRevision: linked.revision, source: linked.source }).ok, true);
      await page.waitForFunction(() => ![...document.querySelector('[aria-label="Connect to idea"]').options].some(option => option.value === "example-1"));
      assert.equal(await draft.inputValue(), "Private draft remains through peer updates"); assert.equal(await draft.evaluate(node => document.activeElement === node), true);
      assert.match(await page.locator('.bulletin-link-row').innerText(), /Pruned idea/);
      await page.getByRole("button", { name: "Cancel", exact: true }).click(); await page.getByRole("button", { name: "Close details", exact: true }).click();
      const projectCounts = await page.evaluate(async () => {
        const { installProjects } = await import("/project-view.js");
        const host = document.createElement("div"), nav = document.createElement("nav"), reader = document.createElement("main"); host.append(nav, reader); document.body.append(host);
        const render = installProjects(nav, reader), snapshot = { projects: [{ surface: { projectRef: "project:count-check", surfaceId: "count-check" }, page: { governingDocuments: [], dataSources: [] }, threads: { live: [], archived: [] } }], bulletin: { records: [] } };
        render(snapshot, { project: "project:count-check" }); const count = reader.querySelector('[data-bulletin-count]'); const before = count.textContent;
        snapshot.bulletin.records.push({ projectRef: "project:count-check", status: "open" }); render(snapshot, { project: "project:count-check" }); const afterCapture = count.textContent;
        snapshot.bulletin.records[0].status = "addressed"; render(snapshot, { project: "project:count-check" }); const afterDisposition = count.textContent;
        const sameNode = count === reader.querySelector('[data-bulletin-count]'); host.remove(); return { before, afterCapture, afterDisposition, sameNode };
      });
      assert.match(projectCounts.before, /^0 /); assert.match(projectCounts.afterCapture, /^1 /); assert.match(projectCounts.afterDisposition, /^0 /); assert.equal(projectCounts.sameNode, true);
      for (const theme of ["bw", "light", "manuscript"]) {
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
        await page.screenshot({ path: resolve(output, `${viewport.width}-${theme}.png`), fullPage: true });
      }
      assert.deepEqual(errors, []); results.push({ viewport, checks: ["direct-route", "explicit-links", "no-horizontal-overflow", "zoom-fit-keyboard", "project-search", "provenance", "amend", "disposition", "operator-capture", "lost-response-retry", "immutable-submission", "fresh-draft-identity", "prune-tombstone", "stale-draft-retention", "live-connection-candidates", "candidate-renaming", "pruned-target-label", "peer-refresh-preserves-focus-draft", "project-count-refresh", "three-themes"] });
    } finally { await context.close(); await app.close(); app = null; }
  }
  const sources = {};
  for (const path of ["src/core/bulletin.mjs", "src/core/runtime.mjs", "src/core/local-state.mjs", "src/core/catalog.mjs", "src/operator/server.mjs", "src/operator/public/bulletin.js", "src/operator/public/bulletin.css", "src/operator/public/operator.js", "src/operator/public/index.html", "src/operator/public/project-view.js", "test/bulletin.test.mjs", "scripts/bulletin-browser-check.mjs"]) sources[path] = createHash("sha256").update(await readFile(path)).digest("hex");
  await writeFile(resolve(output, "receipt.json"), JSON.stringify({ schema: "mousecat.bulletin.browser-verification/1", status: "PASS", at: new Date().toISOString(), sources, results }, null, 2) + "\n");
  console.log(JSON.stringify({ status: "PASS", viewports: results.length, output }));
} finally { await app?.close(); await browser.close(); }
