import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { chromium } from "playwright";
import { validateObservationGraph } from "../src/core/observation-graph.mjs";

const widths = [1680, 760, 390, 320];
const enabled = process.env.MOUSECAT_BROWSER_TEST === "1";
const publicDirectory = resolve("src/operator/public");

const html = `<!doctype html><html lang="en" data-theme="manuscript"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/operator.css"><link rel="stylesheet" href="/appearance.css"><link rel="stylesheet" href="/native-observation-map.css">
<style>body{margin:0;padding:16px;background:var(--page);font-family:system-ui,sans-serif}main{max-width:1500px;margin:auto}@media(max-width:390px){body{padding:8px}}</style></head>
<body><main><div id="map"></div></main><script type="module">
import { createNativeObservationMap } from '/native-observation-map.js';
window.selections=[];
window.observation=createNativeObservationMap(document.querySelector('#map'),{selectPerson:id=>window.selections.push(id)});
window.modulesReady=true;
</script></body></html>`;

async function fixtureServer(t) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (url.pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end(html); return; }
      const filename = basename(url.pathname);
      const modules = new Set(["native-observation-map.js", "native-observation-map.css", "operator.css", "appearance.css"]);
      if (!modules.has(filename) || url.pathname !== "/" + filename) { response.writeHead(404); response.end(); return; }
      const data = await readFile(join(publicDirectory, filename));
      response.setHeader("Content-Type", filename.endsWith(".css") ? "text/css" : "text/javascript");
      response.setHeader("Content-Length", data.length); response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return { url: `http://127.0.0.1:${server.address().port}/` };
}

function observation() {
  const now = Date.now(), source = (recordId, extra = {}) => ({ name: "Synthetic native observation", recordId, worldHours: 31.2, capturedAtUnixMs: now, ...extra });
  const node = (id, kind, label, perspective, extra = {}) => ({ id, kind, label, summary: `Source account: ${label}`, perspective, actorId: "person-a", status: "Supplied by source", source: source(id), ...extra });
  return { schema: "simulation.observation-graph/1", status: "available", message: "", capturedAtUnixMs: now, worldHours: 31.2, omittedNodes: 2, omittedEdges: 1,
    nodes: [
      node("avery", "person", "Avery", "observed", { position: { x: 10, y: 20, z: 0, source: "native-body" } }),
      node("blair", "person", "Blair", "unknown", { actorId: "person-b", position: { x: 18, y: 28, z: 0, source: "durable-record" } }),
      node("door", "event", "Door is locked", "observed"),
      node("need", "need", "Shelter need", "private"),
      node("belief", "belief", "A window may be open", "private", { confidence: 0.4, metrics: [{ key: "uses", label: "Prior uses", value: 3, unit: "observations", description: "Source-owned use count" }] }),
      node("prediction", "hypothesis", "Window could allow entry", "predicted"),
      node("decision", "decision", "Selected: inspect the window", "private", { status: "Selected by source", metrics: [
        { key: "selectedActionId", label: "Selected action", value: "look-window", unit: "", description: "Source receipt" },
        { key: "episodeId", label: "Episode", value: "episode-1", unit: "", description: "Source receipt" }] }),
      node("action", "action", "Inspecting window", "observed", { status: "Observed action", metrics: [
        { key: "actionId", label: "Action", value: "look-window", unit: "", description: "Source receipt" },
        { key: "episodeId", label: "Episode", value: "episode-1", unit: "", description: "Source receipt" },
        { key: "selected", label: "Selected", value: true, unit: "", description: "Source receipt" }] }),
      node("outcome", "outcome", "Window still unobserved", "unknown", { summary: "The source has not reported an inspection outcome." }),
      node("unknown", "unknown", "Downstream effect unknown", "unknown", { source: source("unknown", { worldHours: null, capturedAtUnixMs: 0 }) }),
      node("externality", "externality", "Alarm response unobserved", "unknown"),
      node("observed-externality", "externality", "Alarm heard by neighbor", "observed", { status: "Observed externality receipt", confidence: 0.999 }),
    ],
    edges: [
      { id: "e1", from: "avery", to: "belief", relation: "reports", label: "Person's reported belief", perspective: "private", source: source("belief") },
      { id: "e2", from: "belief", to: "prediction", relation: "predicts", label: "Source prediction", perspective: "predicted", source: source("prediction") },
      { id: "e3", from: "decision", to: "action", relation: "selects", label: "Selected action reference", perspective: "observed", source: source("decision") },
      { id: "e4", from: "door", to: "action", relation: "precedes", label: "Earlier source event", perspective: "observed", source: source("event-order") },
      { id: "e5", from: "action", to: "externality", relation: "correlates", label: "Reported association", perspective: "unknown", source: source("association") },
    ],
  };
}

test("source observation map retains provenance, navigable references and readable responsive tools", { skip: !enabled ? "run with MOUSECAT_BROWSER_TEST=1" : false }, async t => {
  const server = await fixtureServer(t), browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
  t.after(() => browser.close());
  const errors = [], output = resolve("artifacts/local/a26/browser-v2"); await mkdir(output, { recursive: true });
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 1050 }, deviceScaleFactor: width === 760 ? 1.5 : 1 }), page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(server.url); await page.waitForFunction(() => window.modulesReady);
      assert.equal(await page.evaluate(() => devicePixelRatio), width === 760 ? 1.5 : 1);
      const graph = observation(); validateObservationGraph(graph); await page.evaluate(value => window.observation.update(value), graph);
      await page.getByRole("tab", { name: "Positions", exact: true }).waitFor();
      assert.equal(await page.locator("[data-node-id]").count(), 2, "map invented a position for an unpositioned record");
      assert.equal(await page.locator("[data-edge-id]").count(), 0, "map invented a relation from proximity");
      const avery = page.locator('[data-node-id="avery"]'); await avery.focus(); await page.keyboard.press("Enter");
      assert.deepEqual(await page.evaluate(() => window.selections), ["person-a"]);
      assert.match(await page.locator(".native-observation-detail").innerText(), /10, 20, 0 · Native body/u);
      assert.match(await page.locator(".native-observation-provenance").innerText(), /Synthetic native observation\s+avery\s+31.20 world hours/u);
      await page.locator('[data-node-id="blair"]').focus(); await page.keyboard.press("Enter");
      assert.match(await page.locator(".native-observation-detail").innerText(), /Durable record/u);
      assert.deepEqual(await page.evaluate(() => window.selections), ["person-a", "person-b"]);
      const blairPosition = await page.locator('[data-node-id="blair"]').getAttribute("transform");
      const moved = structuredClone(graph); moved.nodes[0].position.x += 0.5; moved.nodes[1].position.z = -0.25;
      await page.evaluate(value => window.observation.update(value), moved);
      assert.equal(await page.locator('[data-node-id="blair"]').getAttribute("transform"), blairPosition, "moving one body rescaled the other body's map");
      assert.match(await page.locator(".native-observation-detail").innerText(), /18, 28, -0.25 · Durable record/u);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.nodeId), "blair", "source update lost graph keyboard focus");
      await page.evaluate(value => window.observation.update(value), graph);
      const drawing = page.locator(".native-observation-viewport svg");
      await page.getByRole("button", { name: "Recenter observation", exact: true }).click();
      const initial = await page.locator(".native-observation-plane").getAttribute("transform");
      await drawing.focus(); await page.keyboard.press("ArrowRight");
      assert.notEqual(await page.locator(".native-observation-plane").getAttribute("transform"), initial);
      await page.getByRole("button", { name: "Recenter observation", exact: true }).click();
      assert.equal(await page.locator(".native-observation-plane").getAttribute("transform"), initial);
      await drawing.hover(); await page.mouse.wheel(0, -100);
      assert.ok(parseInt(await page.locator(".native-observation-zoom").innerText(), 10) > 100);
      const bounds = await drawing.boundingBox(); await page.mouse.move(bounds.x + 20, bounds.y + bounds.height - 30); await page.mouse.down(); await page.mouse.move(bounds.x + 90, bounds.y + bounds.height - 70, { steps: 4 }); await page.mouse.up();
      assert.match(await page.locator(".native-observation-plane").getAttribute("transform"), /translate\([^0]/u);
      await page.getByRole("tab", { name: "Evidence", exact: true }).click();
      assert.equal(await page.locator("[data-node-id]").count(), graph.nodes.length);
      assert.equal(await page.locator("[data-edge-id]").count(), graph.edges.length);
      assert.match(await page.locator(".native-observation-description").innerText(), /diagram layout.*2 nodes \/ 1 references omitted/u);
      assert.match(await page.locator(".native-observation-legend").innerText(), /Private belief.*Proposed prediction.*Missing \/ unknown.*Temporal order only.*Correlation/su);
      assert.equal(await page.locator(".native-observation-lane").last().textContent(), "External effects & unknowns");
      assert.equal(await page.locator('[data-node-id="externality"]').getAttribute("data-perspective"), "unknown");
      await page.locator('[data-node-id="observed-externality"]').focus(); await page.keyboard.press("Enter");
      assert.match(await page.locator(".native-observation-detail").innerText(), /Observed externality receipt/u);
      assert.equal(await page.locator('[data-node-id="observed-externality"]').getAttribute("data-perspective"), "observed");
      const sourceConfidence = page.locator(".native-observation-fields .native-observation-field").filter({ has: page.locator("dt").filter({ hasText: /^Source confidence$/u }) }).locator("dd");
      assert.equal(await sourceConfidence.innerText(), "99.9%", "uncertain source receipt was rounded to certainty");
      for (const [confidence, display] of [[1, "100%"], [0.9999999, "<100%"], [0.0000001, "<0.01%"], [0, "0%"]]) {
        const uncertain = structuredClone(graph); uncertain.nodes.find(node => node.id === "observed-externality").confidence = confidence; validateObservationGraph(uncertain);
        await page.evaluate(value => { window.providedGraph = value; window.providedGraphJson = JSON.stringify(value); window.observation.update(value); }, uncertain);
        assert.equal(await sourceConfidence.innerText(), display);
        assert.equal(await page.evaluate(() => JSON.stringify(window.providedGraph) === window.providedGraphJson), true, "confidence display mutated the source value");
      }
      await page.evaluate(value => window.observation.update(value), graph);
      await page.locator('[data-node-id="belief"]').focus(); await page.keyboard.press("Enter");
      assert.match(await page.locator(".native-observation-detail").innerText(), /Person's private account/u);
      assert.match(await page.locator(".native-observation-detail").innerText(), /40%/u);
      assert.match(await page.locator(".native-observation-metrics").innerText(), /3 observations/u);
      await page.getByRole("button", { name: "Close observation details", exact: true }).focus();
      await page.evaluate(() => { window.unchangedGraphNode = document.querySelector('[data-node-id="belief"]'); });
      await page.evaluate(value => window.observation.update(value), graph);
      assert.equal(await page.evaluate(() => document.querySelector('[data-node-id="belief"]') === window.unchangedGraphNode), true, "unchanged source graph recreated the interactive SVG");
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), "Close observation details", "source update lost detail control focus");
      const focusUpdate = structuredClone(graph); focusUpdate.capturedAtUnixMs += 1; validateObservationGraph(focusUpdate);
      await page.evaluate(value => window.observation.update(value), focusUpdate);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.focusKey), "close", "changed source graph lost detail control focus");
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement.dataset.nodeId), "belief", "keyboard detail close lost its map destination");
      assert.equal(await page.locator(".native-observation-detail").isVisible(), false);
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Source prediction", exact: true }).focus(); await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement.matches(".native-observation-detail h3")), true, "reference traversal left focus in removed DOM");
      assert.equal(await page.evaluate(() => document.activeElement.textContent), "Source prediction");
      await page.getByRole("button", { name: "Close observation details", exact: true }).focus(); await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement.dataset.edgeId), "e2", "detail close did not return to the selected reference");
      await page.getByRole("tab", { name: "Positions", exact: true }).click();
      await page.locator('[data-node-id="avery"]').focus(); await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Person's reported belief", exact: true }).focus(); await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement.matches(".native-observation-detail h3")), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => document.activeElement === document.querySelector(".native-observation-viewport svg")), true, "an undisplayed reference had no drawing fallback");
      await page.getByRole("tab", { name: "Evidence", exact: true }).click();
      await page.locator('[data-node-id="prediction"]').focus(); await page.keyboard.press("Enter");
      assert.match(await page.locator(".native-observation-detail").innerText(), /Proposed prediction/u);
      await page.locator('[data-node-id="unknown"]').focus(); await page.keyboard.press("Enter");
      assert.match(await page.locator(".native-observation-detail").innerText(), /Unknown evidence/u);
      assert.match(await page.locator(".native-observation-provenance").innerText(), /Unknown world clock.*Acquisition time unknown/su);
      assert.equal(await page.locator(".native-observation-provenance time").getAttribute("datetime"), null, "zero acquisition clock was exposed as a 1970 timestamp");
      assert.match(await page.locator(".native-observation-detail").innerText(), /No downstream reference supplied/u);
      const temporal = page.locator('[data-edge-id="e4"]'); await temporal.focus(); await page.keyboard.press("Enter");
      assert.match(await page.locator(".native-observation-detail").innerText(), /Temporal order only/u);
      assert.match(await page.locator(".native-observation-provenance").innerText(), /event-order/u);
      assert.notEqual(await temporal.locator(".native-observation-edge-line").evaluate(element => getComputedStyle(element).strokeDasharray), "none");
      await page.screenshot({ path: join(output, `native-observation-evidence-${width}.png`), fullPage: true, animations: "disabled" });
      await page.getByRole("button", { name: "Close observation details", exact: true }).click();
      await page.getByRole("tab", { name: "Positions", exact: true }).click();
      await page.evaluate(value => window.observation.update(value), graph);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `observation overflow at ${width}`);
      for (const button of ["Zoom observation in", "Zoom observation out", "Recenter observation"]) {
        const box = await page.getByRole("button", { name: button, exact: true }).boundingBox();
        assert.ok(box.width >= 32 && box.x >= 0 && box.x + box.width <= width, `unreachable ${button} at ${width}`);
      }
      await page.waitForFunction(() => {
        const viewport = document.querySelector('.native-observation-viewport').getBoundingClientRect();
        return [...document.querySelectorAll('[data-node-id]')].every(node => {
          const point = node.getBoundingClientRect(); return point.right > viewport.left && point.left < viewport.right && point.bottom > viewport.top && point.top < viewport.bottom;
        });
      }, null, { timeout: 1500 });
      await page.screenshot({ path: join(output, `native-observation-${width}.png`), fullPage: true, animations: "disabled" });
      const changed = structuredClone(graph); changed.worldHours = null; changed.capturedAtUnixMs = 0; changed.nodes = []; changed.edges = [];
      changed.status = "unavailable"; changed.message = "No source cognition sample has been captured.";
      validateObservationGraph(changed);
      await page.evaluate(value => window.observation.update(value), changed);
      assert.equal(await page.locator("[data-node-id]").count(), 0);
      assert.match(await page.getByRole("status").innerText(), /No source cognition sample/u);
      assert.equal(await page.locator(".native-observation-viewport").isVisible(), false);
      assert.match(await page.locator(".native-observation-clock").innerText(), /Unknown world clock.*Acquisition time unknown/su);
      changed.status = "failed"; changed.message = "Source observation acquisition failed."; validateObservationGraph(changed);
      await page.evaluate(value => window.observation.update(value), changed);
      assert.match(await page.getByRole("status").innerText(), /Source observation acquisition failed/u);
      assert.equal(await page.locator(".native-observation").getAttribute("data-state"), "failed");
      await page.evaluate(() => window.observation.destroy());
      assert.equal(await page.locator(".native-observation").count(), 0);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
});
