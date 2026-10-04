#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";
import { developmentGraph, graphSurface } from "../fixtures/development-graph.mjs";

const output = resolve(".mousecat/graph-library-browser");
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(tmpdir(), "mousecat-graph-library-"));
const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
let app;
const receipts = [];
try {
  await writeFile(join(root, "AGENTS.md"), "# Synthetic graph catalogue\n");
  await writeFile(join(root, "continuity.json"), JSON.stringify(developmentGraph()));
  const other = developmentGraph(180); other.projectRef = "project:second";
  await writeFile(join(root, "second.json"), JSON.stringify(other));
  await writeFile(join(root, "invalid.json"), "{}");
  const runtime = createMousecatRuntime();
  const primary = graphSurface(root); primary.dataSources[0].label = "Continuity";
  primary.dataSources.push({ ...primary.dataSources[0], name: "alternate" });
  primary.dataSources.push({ ...primary.dataSources[0], name: "missing", label: "Missing source", path: "missing.json" });
  primary.dataSources.push({ ...primary.dataSources[0], name: "invalid", label: "Invalid source", path: "invalid.json" });
  const secondary = { ...graphSurface(root), surfaceId: "second", projectRef: "project:second",
    dataSources: [{ ...primary.dataSources[0], path: "second.json" }] };
  for (const surface of [primary, secondary]) assert.equal(runtime.handleTool("mousecat.projects", { action: "register", surface, permit: { profileId: "operator-interaction" } }).ok, true);
  app = await startOperatorServer({ runtime, host: "127.0.0.1", port: 0 });
  for (const viewport of [{ width: 1680, height: 950 }, { width: 760, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await writeFile(join(root, "continuity.json"), JSON.stringify(developmentGraph()));
    const context = await browser.newContext({ viewport });
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(app.url + "/#questions");
      await page.getByRole("button", { name: "Graphs", exact: true }).click();
      await page.getByRole("heading", { name: "Graphs", exact: true }).waitFor();
      assert.equal(await page.locator("#graphs-toggle").getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".graph-library-card").count(), 5);
      const search = page.getByRole("searchbox", { name: "Find a graph" });
      await search.fill("second");
      const second = page.locator(".graph-library-card:visible");
      await second.locator("svg").waitFor();
      assert.equal(await second.count(), 1);
      assert.match(await second.innerText(), /180 nodes/);
      assert.match(await second.innerText(), /160 of 180/);
      await second.focus(); await second.press("Enter");
      await page.locator(".development-graph-counts").filter({ hasText: "180 nodes" }).waitFor();
      assert.equal(await page.locator(".development-graph-identity h3").evaluate(node => node === document.activeElement), true);
      assert.equal(new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("project"), "project:second");
      assert.equal(await page.locator("#graphs-toggle").getAttribute("aria-pressed"), "true");
      await page.getByRole("button", { name: "Graphs", exact: true }).click();
      assert.equal(await search.inputValue(), "second");
      await search.fill("does not exist");
      await page.getByText("No graphs match your search.", { exact: true }).waitFor();
      await search.fill("invalid");
      await page.getByText("Preview unavailable", { exact: true }).waitFor();
      await search.fill("missing");
      await page.getByText("Source unavailable", { exact: true }).waitFor();
      await search.fill("");
      const primaryCard = page.locator(".graph-library-card").filter({ has: page.getByText("example · continuity", { exact: true }) });
      assert.equal(await page.getByText("example · alternate", { exact: true }).count(), 1);
      await primaryCard.locator("svg").waitFor();
      const changed = developmentGraph(), originalBytes = JSON.stringify(changed).length;
      changed.edges.pop(); changed.nodes[0].summary += " ".repeat(originalBytes - JSON.stringify(changed).length);
      assert.equal(JSON.stringify(changed).length, originalBytes);
      await writeFile(join(root, "continuity.json"), JSON.stringify(changed));
      await page.getByRole("button", { name: "Refresh graphs", exact: true }).click();
      await primaryCard.locator(".graph-library-meta").filter({ hasText: "3 nodes · 1 connections" }).waitFor();
      await page.route("**/api/project-graphs/example/continuity", route => route.fulfill({ status: 503, body: "unavailable" }));
      await page.getByRole("button", { name: "Refresh graphs", exact: true }).click();
      await primaryCard.getByText("Preview unavailable", { exact: true }).waitFor();
      await page.unroute("**/api/project-graphs/example/continuity");
      await page.getByRole("button", { name: "Refresh graphs", exact: true }).click();
      await primaryCard.locator("svg").waitFor();
      const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflowing, false, "graph selector must fit the viewport");
      await page.screenshot({ path: join(output, `selector-${viewport.width}.png`), fullPage: true });
      await page.reload(); await page.getByRole("heading", { name: "Graphs", exact: true }).waitFor();
      assert.deepEqual(errors, []);
      receipts.push({ viewport, globalNavigation: true, exactSourceChoice: true, realPreview: true,
        unavailableSources: true, searchAndReturn: true, directReload: true, horizontalOverflow: false,
        graphEntryFocus: true, equalSizeSourceRefresh: true, transientPreviewRecovery: true, duplicateSourceLabels: true });
    } finally { await context.close(); }
  }
  await writeFile(join(output, "receipt.json"), JSON.stringify({ status: "PASS", receipts }, null, 2) + "\n");
  console.log(JSON.stringify({ status: "PASS", widths: receipts.map(receipt => receipt.viewport.width) }));
} finally {
  await app?.close(); await browser.close();
  if (resolve(root).startsWith(resolve(tmpdir()) + "\\") || resolve(root).startsWith(resolve(tmpdir()) + "/")) await rm(root, { recursive: true, force: true });
}
