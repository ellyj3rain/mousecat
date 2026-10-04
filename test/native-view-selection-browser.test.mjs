import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { startOperatorServer } from "../src/operator/server.mjs";

function png() {
  const chunk = (kind, bytes) => {
    const content = Buffer.concat([Buffer.from(kind), bytes]); let crc = 0xffffffff;
    for (const byte of content) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, content, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from([0, 30, 60, 90, 255]))), chunk("IEND", Buffer.alloc(0))]);
}

test("explicit native session selection survives ended and disconnected polling while default selection advances", {
  skip: process.env.MOUSECAT_BROWSER_TEST !== "1" ? "run with MOUSECAT_BROWSER_TEST=1 for isolated browser acceptance" : false,
}, async t => {
  const parent = await mkdtemp(join(tmpdir(), "mousecat-native-selection-"));
  t.after(async () => {
    assert.equal(dirname(resolve(parent)), resolve(tmpdir()));
    assert.ok(basename(parent).startsWith("mousecat-native-selection-"));
    await rm(parent, { recursive: true, force: true });
  });
  const bytes = png();
  const image = { file: "frame.png", width: 1, height: 1, sha256: createHash("sha256").update(bytes).digest("hex") };
  const registry = [];
  for (const id of ["ended", "disconnected", "paused", "older", "live"]) {
    const directory = join(parent, id), sessionId = randomUUID();
    await mkdir(join(directory, "commands"), { recursive: true });
    await writeFile(join(directory, image.file), bytes);
    registry.push({ id, label: `Selection fixture ${id}`, directory, sessionId });
  }
  let sequence = 0;
  const saveViews = async () => {
    sequence += 1;
    const now = Date.now();
    for (const entry of registry) {
      await writeFile(join(entry.directory, "latest.json"), JSON.stringify({
        schema: "mousecat.native-view/1", sessionId: entry.sessionId, sequence,
        capturedAtUnixMs: now - ({ disconnected: 60000, ended: 1000, older: 2000 }[entry.id] || 0), image,
        state: entry.id === "ended" ? "ended" : entry.id === "paused" ? "paused" : "running", title: entry.label,
        summary: "Synthetic session-selection fixture.", people: [], lastCommandSequence: 0,
      }));
    }
  };
  const registryPath = join(parent, "registry.json");
  await writeFile(registryPath, JSON.stringify(registry));
  await saveViews();
  const app = await startOperatorServer({ port: 0, nativeViews: { registryPath } });
  t.after(() => app.close());
  const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
  t.after(() => browser.close());
  const errors = [];
  const selected = page => page.getByRole("combobox", { name: "Simulation session", exact: true });
  const awaitSelection = (page, id) => page.waitForFunction(value =>
    document.querySelector('[aria-label="Simulation session"]')?.value === value
      && document.querySelector(".native-heading h2")?.textContent === `Selection fixture ${value}`,
  id, { timeout: 5000 });
  const remainsSelected = async (page, id) => {
    await awaitSelection(page, id);
    // Observe two later polling deliveries, rather than asserting a fleeting initial frame.
    for (let index = 0; index < 2; index += 1) {
      await page.waitForResponse(response => new URL(response.url()).pathname === `/api/native-views/${id}/snapshot`, { timeout: 3500 });
    }
    assert.equal(await selected(page).inputValue(), id);
    assert.equal(new URL(await page.url()).hash, `#native-view?session=${id}`);
    assert.equal(await page.locator(".native-heading h2").innerText(), `Selection fixture ${id}`);
  };
  for (const width of [1680, 760, 390, 320]) {
    await saveViews();
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      for (const id of ["ended", "disconnected"]) {
        await page.goto(`${app.url}#native-view?session=${id}`);
        await remainsSelected(page, id);
      }
      await saveViews();
      await page.goto(`${app.url}#native-view`);
      await awaitSelection(page, "live");
      await selected(page).selectOption("ended");
      await remainsSelected(page, "ended");
      await selected(page).selectOption("disconnected");
      await remainsSelected(page, "disconnected");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
        `session selection overflowed at ${width}px`);
    } finally { await context.close(); }
  }

  await saveViews();
  const held = await browser.newContext();
  let releaseLookup;
  try {
    const page = await held.newPage();
    let lookupStarted;
    const started = new Promise(resolveLookup => { lookupStarted = resolveLookup; });
    const released = new Promise(resolveLookup => { releaseLookup = resolveLookup; });
    await page.route("**/api/native-views/live/snapshot", async route => {
      lookupStarted(); await released; await route.continue();
    });
    await page.goto(`${app.url}#native-view`);
    await started;
    // Choosing the already displayed default must pin it even when its URL is unchanged.
    await selected(page).selectOption("ended");
    releaseLookup();
    await remainsSelected(page, "ended");
  } finally { releaseLookup?.(); await held.close(); }

  await saveViews();
  const noSuccessor = await browser.newContext();
  try {
    const page = await noSuccessor.newPage();
    await page.route("**/api/native-views", async route => {
      const response = await route.fetch(), value = await response.json();
      value.views = value.views.filter(entry => entry.id !== "live");
      await route.fulfill({ response, json: value });
    });
    await page.goto(`${app.url}#native-view`);
    await remainsSelected(page, "ended");
  } finally { await noSuccessor.close(); }

  const missing = await browser.newContext();
  try {
    const page = await missing.newPage();
    await page.goto(`${app.url}#native-view?session=missing`);
    await page.waitForFunction(() => document.querySelector(".native-connection")?.textContent === "Feed unavailable");
    for (let index = 0; index < 2; index += 1) {
      const response = await page.waitForResponse(value => new URL(value.url()).pathname === "/api/native-views/missing/snapshot");
      assert.equal(response.ok(), false);
    }
    assert.equal(new URL(page.url()).hash, "#native-view?session=missing");
    assert.equal(await page.locator(".native-heading h2").innerText(), "Simulation", "unknown explicit session fell back to another feed");
    assert.equal(await page.locator(".native-connection").innerText(), "Feed unavailable");
    assert.equal(await selected(page).inputValue(), "");
  } finally { await missing.close(); }

  // Restore the former unconditional successor behavior in a disposable browser.
  // The same explicit ended selection must then be displaced by the live feed.
  const source = await readFile(new URL("../src/operator/public/native-view.js", import.meta.url), "utf8");
  const conditionalLookup = "const successor = explicitSession ? null : await findSuccessor(signal);";
  const guardedSelection = "if (successor && !explicitSession)";
  assert.equal(source.split(conditionalLookup).length, 2);
  assert.equal(source.split(guardedSelection).length, 2);
  const broken = source.replace(conditionalLookup, "const successor = await findSuccessor(signal);")
    .replace(guardedSelection, "if (successor)");
  await saveViews();
  const control = await browser.newContext();
  try {
    const page = await control.newPage();
    await page.route("**/native-view.js", route => route.fulfill({ contentType: "text/javascript", body: broken }));
    await page.goto(`${app.url}#native-view?session=ended`);
    await awaitSelection(page, "live");
    assert.notEqual(await selected(page).inputValue(), "ended", "known-bad successor control did not reproduce lost selection");
  } finally { await control.close(); }
  for (const [expression, replacement, expected] of [
    ['value.snapshot.connection === "live"', 'value.snapshot.connection !== "disconnected"', "paused"],
    ["&& value.snapshot.view.capturedAtUnixMs > currentCapturedAt", "", "older"],
  ]) {
    assert.equal(source.split(expression).length, 2);
    await saveViews();
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.route("**/native-view.js", route => route.fulfill({ contentType: "text/javascript", body: source.replace(expression, replacement) }));
      await page.route("**/api/native-views", async route => {
        const response = await route.fetch(), value = await response.json();
        value.views = value.views.filter(entry => entry.id !== "live");
        await route.fulfill({ response, json: value });
      });
      await page.goto(`${app.url}#native-view`);
      await awaitSelection(page, expected);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  for (const entry of registry) assert.deepEqual(await readdir(join(entry.directory, "commands")), [], "session browsing issued a native command");
});
