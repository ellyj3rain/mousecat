#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";
import { developmentGraph, graphSurface } from "../fixtures/development-graph.mjs";

// All servers, source files and browser contexts belong to this synthetic test.
// Never attaches to the installed operator service or native observation feeds.
const output = resolve(".mousecat/development-graph-browser");
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
const receipts = [];
try {
  for (const viewport of [{ width: 1680, height: 950 }, { width: 760, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    const root = await mkdtemp(join(tmpdir(), "mousecat-development-browser-"));
    let app, context;
    try {
      const graph = developmentGraph(125);
      graph.nodes[0].mediaRefs = [{ kind: "image", href: "evidence/recorded.png", label: "Recorded image", mimeType: "image/png" }];
      graph.nodes[0].summary = "<img src=x onerror='globalThis.graphInjected=true'> is source text.";
      await writeFile(join(root, "AGENTS.md"), "# Synthetic project\n");
      await writeFile(join(root, "continuity.json"), JSON.stringify(graph));
      const runtime = createMousecatRuntime();
      assert.equal(runtime.handleTool("mousecat.projects", { action: "register", surface: graphSurface(root), permit: { profileId: "operator-interaction" } }).ok, true);
      app = await startOperatorServer({ runtime, host: "127.0.0.1", port: 0 });
      context = await browser.newContext({ viewport, acceptDownloads: true });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error" && /Content Security Policy/u.test(message.text())) errors.push(message.text()); });
      await page.goto(app.url + "/#projects?project=project%3Aexample&graph=example%3Acontinuity");
      await page.locator(".development-graph-counts").filter({ hasText: "125 nodes" }).waitFor();
      assert.equal(await page.locator("g[data-node-id]").count(), 125);
      assert.equal(await page.locator(".development-graph-edge").count(), 124);
      assert.equal(await page.locator("#project-nav").isVisible(), false);
      const canvas = page.locator(".development-graph-viewport");
      const box = await canvas.boundingBox();
      assert.ok(box.width > viewport.width * .9, "canvas must own workspace width");
      assert.ok(box.height > viewport.height * .4, "canvas must remain usable on phones");
      const world = page.locator(".development-graph-world");
      const initialTransform = await world.getAttribute("transform");
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      assert.notEqual(await world.getAttribute("transform"), initialTransform);
      await page.getByRole("button", { name: "Fit graph", exact: true }).click();
      assert.equal(await world.getAttribute("transform"), initialTransform);
      await canvas.focus(); await canvas.press("ArrowRight");
      assert.notEqual(await world.getAttribute("transform"), initialTransform);
      await canvas.press("Home");
      await page.mouse.move(box.x + box.width / 2, box.y + 35);
      await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 35, box.y + 50); await page.mouse.up();
      assert.notEqual(await world.getAttribute("transform"), initialTransform);
      await page.getByRole("button", { name: "Fit graph", exact: true }).click();
      const first = page.locator('g[data-node-id="unit:0"]');
      await first.focus(); await first.press("Enter");
      const detail = page.locator(".development-graph-detail");
      await detail.getByRole("heading", { name: "Development 0", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Development 0");
      const card = await first.boundingBox(), inspector = await detail.boundingBox();
      assert.ok(card.width >= 210, "selected record must be readable");
      if (viewport.width <= 600) assert.ok(card.y + card.height <= inspector.y, "selected record must sit above the phone inspector");
      assert.match(await detail.innerText(), /partial/u); assert.match(await detail.innerText(), /scoped/u);
      assert.match(await detail.innerText(), /publication\s+local/iu);
      assert.match(await detail.innerText(), /evidence\/recorded.png/u);
      assert.equal(await detail.locator("img, iframe, video, audio").count(), 0);
      assert.equal(await page.evaluate(() => globalThis.graphInjected), undefined);
      await detail.getByRole("button", { name: "Close details", exact: true }).click();
      const svgRelation = page.locator(".development-graph-edge").first();
      await svgRelation.focus(); await svgRelation.press("Enter");
      await detail.getByRole("heading", { name: "contributes-to", exact: true }).waitFor();
      await detail.getByRole("button", { name: "From: unit:0", exact: true }).click();
      await detail.getByRole("button", { name: "contributes-to", exact: true }).click();
      await detail.getByRole("button", { name: "To: unit:1", exact: true }).click();
      await detail.getByRole("heading", { name: "Development 1", exact: true }).waitFor();
      await detail.getByRole("button", { name: "Explore connections", exact: true }).click();
      assert.equal(await page.locator("g[data-node-id]").count(), 3);
      assert.equal(await page.locator(".development-graph-edge").count(), 2);
      await page.getByRole("button", { name: /Full view/u }).click();
      assert.equal(await page.locator("g[data-node-id]").count(), 125);
      assert.equal(await detail.isVisible(), false);
      await page.getByRole("searchbox", { name: "Search continuity", exact: true }).fill("Development 124");
      assert.equal(await page.locator("g[data-node-id]").count(), 1);
      await page.getByRole("searchbox", { name: "Search continuity", exact: true }).fill("");
      await page.getByRole("combobox", { name: "View", exact: true }).selectOption("contracts");
      assert.equal(await page.locator("g[data-node-id]").count(), 62);
      const contract = page.locator('g[data-node-id="unit:1"]');
      await contract.focus(); await contract.press("Enter");
      await detail.getByRole("button", { name: "Explore connections", exact: true }).click();
      assert.equal(await page.locator("g[data-node-id]").count(), 3, "include neighbours excluded by the source view");
      assert.equal(await page.locator(".development-graph-edge").count(), 2);
      await page.getByRole("button", { name: /Full view/u }).click();
      assert.equal(await page.getByRole("combobox", { name: "View", exact: true }).inputValue(), "contracts");
      assert.equal(await page.locator("g[data-node-id]").count(), 62);
      await page.getByRole("combobox", { name: "View", exact: true }).selectOption("");
      await page.locator(".development-graph-advanced > summary").click();
      await page.getByRole("combobox", { name: "Relation", exact: true }).selectOption("depends-on");
      await page.locator(".development-graph-advanced > summary").click();
      assert.equal(await page.locator(".development-graph-edge").count(), 62);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download graph", exact: true }).click();
      const download = await downloadPromise;
      assert.deepEqual(JSON.parse(await readFile(await download.path(), "utf8")), graph);
      for (const theme of ["manuscript", "bw", "light"]) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "page overflow: " + viewport.width + "/" + theme);
        assert.equal(await page.locator(".development-graph").evaluate(node => node.scrollWidth <= node.clientWidth), true, "graph overflow: " + viewport.width + "/" + theme);
      }
      await page.evaluate(() => { document.documentElement.dataset.theme = "manuscript"; });
      await page.screenshot({ path: join(output, "graph-" + viewport.width + ".png"), fullPage: true });
      await writeFile(join(root, "continuity.json"), "{");
      await page.getByRole("button", { name: "Refresh graph", exact: true }).click();
      await page.locator(".development-graph-status").filter({ hasText: "Graph unavailable" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Download graph", exact: true }).isDisabled(), true);
      assert.equal(await page.locator(".development-graph-viewport").isVisible(), false);
      graph.revision = "fixture-2"; await writeFile(join(root, "continuity.json"), JSON.stringify(graph));
      await page.getByRole("button", { name: "Refresh graph", exact: true }).click();
      await page.locator(".development-graph-status").filter({ hasText: "fixture-2" }).waitFor();
      assert.equal(await page.getByRole("combobox", { name: "Relation", exact: true, includeHidden: true }).inputValue(), "depends-on");
      await page.getByRole("combobox", { name: "View", exact: true }).selectOption("contracts");
      await page.locator(".development-graph-advanced > summary").click();
      await page.getByRole("combobox", { name: "Node kind", exact: true }).selectOption("contract");
      await page.locator(".development-graph-advanced > summary").click();
      graph.revision = "fixture-3";
      for (const node of graph.nodes) if (node.kind === "contract") node.kind = "concept";
      graph.edges = graph.edges.filter(edge => edge.relation !== "depends-on");
      graph.views = graph.views.filter(view => view.id !== "contracts");
      await writeFile(join(root, "continuity.json"), JSON.stringify(graph));
      await page.getByRole("button", { name: "Refresh graph", exact: true }).click();
      await page.locator(".development-graph-status").filter({ hasText: "fixture-3" }).waitFor();
      for (const name of ["View", "Node kind", "Relation"]) {
        assert.equal(await page.getByRole("combobox", { name, exact: true, includeHidden: true }).inputValue(), "", "removed filter survives: " + name);
      }
      assert.equal(await page.locator("g[data-node-id]").count(), 125);
      const beforeRoute = await world.getAttribute("transform");
      await page.getByRole("link", { name: /← /u }).click();
      await page.locator("#project-nav").waitFor({ state: "visible" });
      assert.equal(await page.locator("#project-nav").isVisible(), true);
      await page.getByRole("link", { name: /Explore the continuity graph/u }).click();
      await page.locator(".development-graph-counts").filter({ hasText: "125 nodes" }).waitFor();
      assert.equal(await world.getAttribute("transform"), beforeRoute);
      assert.equal(await page.locator(".development-graph-identity h3").evaluate(node => node === document.activeElement), true);
      const search = page.getByRole("searchbox", { name: "Search continuity", exact: true });
      await search.fill("Development"); await search.press("Escape");
      assert.equal(await search.evaluate(node => node === document.activeElement), true);
      assert.deepEqual(errors, []);
      receipts.push({ viewport, directGraphNavigation: true, sourceProjection: true, keyboardDetails: true, relationNavigation: true,
        searchAndFilters: true, unbrokenRelationships: true, fullWorkspaceCanvas: true, panZoomFit: true, neighbourhood: true,
        crossKindNeighbours: true, readableSelection: true, keyboardRelations: true, routeFocus: true, retainedCamera: true, exactExport: true, inertMediaAndText: true,
        invalidRefreshWithholdsOldGraph: true, recovery: true, removedFilterReset: true, validFilterRetained: true, themes: 3 });
    } finally {
      await context?.close(); await app?.close(); await rm(root, { recursive: true, force: true });
    }
  }
  await writeFile(join(output, "receipt.json"), JSON.stringify({ status: "PASS", receipts }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ status: "PASS", viewports: receipts.length, receipt: ".mousecat/development-graph-browser/receipt.json" }) + "\n");
} finally { await browser.close(); }

