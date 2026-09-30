import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { startOperatorServer } from "../src/operator/server.mjs";

function png(color) {
  const chunk = (kind, bytes) => {
    const content = Buffer.concat([Buffer.from(kind), bytes]); let crc = 0xffffffff;
    for (const byte of content) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, content, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, ...color, 255]))), chunk("IEND", Buffer.alloc(0))]);
}

test("regional native tiles retain focus and route independent camera controls at four widths", {
  skip: process.env.MOUSECAT_BROWSER_TEST !== "1" ? "run with MOUSECAT_BROWSER_TEST=1 for isolated browser acceptance" : false,
}, async t => {
  const parent = await mkdtemp(join(tmpdir(), "mousecat-regional-browser-"));
  t.after(async () => { assert.equal(dirname(resolve(parent)), resolve(tmpdir())); assert.ok(basename(parent).startsWith("mousecat-regional-browser-")); await rm(parent, { recursive: true, force: true }); });
  const producer = join(parent, "producer"), commands = join(producer, "commands"), registryPath = join(parent, "registry.json");
  await mkdir(commands, { recursive: true });
  const sessionId = randomUUID(), images = [];
  for (const [index, color] of [[0, [120, 30, 20]], [1, [20, 110, 40]], [2, [20, 40, 130]]]) {
    const bytes = png(color), file = `site-${index}.png`; await writeFile(join(producer, file), bytes);
    images.push({ file, sha256: createHash("sha256").update(bytes).digest("hex"), width: 1, height: 1 });
  }
  const now = Date.now(), viewport = { zoom: 1, targetZoom: 1, zoomLevels: [0.5, 1, 2] };
  const view = { schema: "mousecat.native-view/1", sessionId, sequence: 1, capturedAtUnixMs: now, image: images[0],
    state: "running", title: "Regional camera test", summary: "Synthetic browser fixture.", people: ["Avery", "Blair", "Casey"].map((label, index) => ({ id: `person-${index + 1}`, label, summary: "Observed." })), lastCommandSequence: 0,
    camera: { mode: "automatic", personIds: [], summary: "Shared world." },
    feeds: ["residential", "services", "farm"].map((siteId, index) => ({ id: `site:${siteId}`, siteId, label: siteId,
      capturedAtUnixMs: now, image: images[index], viewport: structuredClone(viewport), camera: { mode: "automatic", personIds: [`person-${index + 1}`], summary: siteId } })) };
  const save = () => writeFile(join(producer, "latest.json"), JSON.stringify(view)); await save();
  await writeFile(registryPath, JSON.stringify([{ id: "regional", label: "Regional fixture", directory: producer, sessionId }]));
  const app = await startOperatorServer({ port: 0, nativeViews: { registryPath } }); t.after(() => app.close());
  const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {}); t.after(() => browser.close());
  const errors = [], output = resolve(".mousecat/browser-check"); await mkdir(output, { recursive: true });
  for (const width of [1680, 760, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } }), page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      view.sequence += 1; view.capturedAtUnixMs = Date.now();
      for (const feed of view.feeds) feed.capturedAtUnixMs = view.capturedAtUnixMs;
      await save();
      await page.goto(app.url + "#native-view");
      await page.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
      const details = page.getByRole("button", { name: "Hide details", exact: true }); if (await details.isVisible()) await details.click();
      const popout = page.waitForEvent("popup");
      await page.locator('.native-feed-card[data-site-id="farm"]').getByRole("button", { name: "Focus", exact: true }).click();
      const detached = await popout;
      await detached.setViewportSize({ width, height: 640 });
      detached.on("pageerror", error => errors.push(error.message));
      const detachedRequests = []; detached.on("request", request => {
        if (/\/api\/native-views(?:$|\/[^/]+\/(?:snapshot|command))/u.test(new URL(request.url()).pathname)) detachedRequests.push(request.url());
      });
      const farm = detached.locator('.native-feed-card[data-site-id="farm"]');
      await farm.waitFor({ state: "visible" });
      await farm.locator(".native-panel-menu > summary").click();
      assert.equal(await page.locator(".native-camera strong").innerText(), "Camera follows Casey");
      assert.equal(await page.locator(".native-camera span").innerText(), "farm");
      await farm.getByRole("button", { name: "Camera", exact: true }).click();
      assert.equal(await page.locator('.native-feed-card:not([hidden])').count(), 2);
      const verify = async (action, operate) => {
        const expected = view.lastCommandSequence + 1;
        await operate();
        try {
          await page.waitForFunction(() => document.querySelector('.native-stage > .native-command-status')?.textContent.includes("awaiting"), null, { timeout: 3000 });
        } catch (error) {
          const diagnostic = await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 250), status: document.querySelector('.native-stage > .native-command-status')?.textContent }));
          throw new Error(`Missing ${action} request: ${JSON.stringify({ errors, diagnostic })}`, { cause: error });
        }
        const files = (await readdir(commands)).filter(file => /^\d{16}\.json$/u.test(file)).sort();
        const request = JSON.parse(await readFile(join(commands, files.at(-1)), "utf8"));
        assert.equal(request.action, action); assert.equal(request.siteId, "farm"); assert.equal(request.sequence, expected);
        view.lastCommandSequence = request.sequence; view.commandResult = { sequence: request.sequence, status: "applied", message: "Fixture acknowledged." };
        view.sequence += 1; view.capturedAtUnixMs = Date.now();
        for (const feed of view.feeds) feed.capturedAtUnixMs = view.capturedAtUnixMs;
        await save(); await page.waitForFunction(() => document.querySelector('.native-stage > .native-command-status')?.textContent.includes("Fixture acknowledged"));
      };
      await verify("zoom", () => farm.getByRole("button", { name: "Zoom this view out", exact: true }).click());
      await verify("pan", () => farm.getByRole("button", { name: "Move this view →", exact: true }).click());
      await verify("auto", () => farm.getByRole("button", { name: "Follow activity", exact: true }).click());
      const media = farm.locator(".native-panel-media");
      await verify("pan", async () => { await media.focus(); await detached.keyboard.press("ArrowLeft"); });
      await verify("zoom", async () => { await media.hover(); await detached.mouse.wheel(0, 100); });
      await verify("pan", async () => {
        const box = await media.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        await detached.mouse.move(x, y); await detached.mouse.down(); await detached.mouse.move(x + 70, y, { steps: 3 }); await detached.mouse.up();
      });
      if (width === 1680) {
        await page.waitForFunction(() => document.querySelector(".native-frame-state span:last-child")?.textContent === "0.0 images/s");
        const primaryImage = await page.locator(".native-observatory-primary img").getAttribute("src");
        const changed = png([150, 100, 30]), file = "farm-updated.png";
        await writeFile(join(producer, file), changed);
        view.feeds.find(feed => feed.siteId === "farm").image = { file, sha256: createHash("sha256").update(changed).digest("hex"), width: 1, height: 1 };
        view.sequence += 1; view.capturedAtUnixMs = Date.now(); await save();
        await detached.waitForFunction(() => document.querySelector('[data-site-id="farm"] img')?.src.includes("farm-updated.png"));
        await page.waitForFunction(() => parseFloat(document.querySelector(".native-frame-state span:last-child")?.textContent) > 0);
        assert.equal(await page.locator(".native-observatory-primary img").getAttribute("src"), primaryImage, "rate fixture changed the primary image");
        await farm.getByRole("button", { name: "Info", exact: true }).click();
        await farm.getByRole("button", { name: "Info", exact: true }).click();
        await page.waitForFunction(() => document.querySelector(".native-frame-state span:last-child")?.textContent === "0.0 images/s");
        const feed = view.feeds.find(feed => feed.siteId === "farm"), loadedImage = feed.image;
        const delayedBytes = png([20, 180, 80]), delayedFile = "farm-delayed.png";
        await writeFile(join(producer, delayedFile), delayedBytes);
        let release;
        const permit = new Promise(resolve => { release = resolve; });
        await page.route(/\/api\/native-views\/.+\/image\?/u, async route => {
          if (new URL(route.request().url()).searchParams.get("file") === delayedFile) await permit;
          await route.continue();
        });
        try {
          const requested = page.waitForRequest(request => new URL(request.url()).searchParams.get("file") === delayedFile);
          feed.image = { file: delayedFile, sha256: createHash("sha256").update(delayedBytes).digest("hex"), width: 1, height: 1 };
          view.sequence += 1; await save(); await requested;
          feed.image = loadedImage; feed.camera.summary = "Returned to the loaded image."; view.sequence += 1; await save();
          await page.waitForFunction(() => document.querySelector(".native-camera span")?.textContent === "Returned to the loaded image.");
          const completed = page.waitForResponse(response => new URL(response.url()).searchParams.get("file") === delayedFile);
          release(); await (await completed).finished(); await page.waitForTimeout(150);
          assert.ok((await farm.locator("img").getAttribute("src")).includes("farm-updated.png"), "superseded decode replaced the current regional image");
          await page.waitForTimeout(2200);
          assert.equal(await page.locator(".native-frame-state span:last-child").innerText(), "0.0 images/s", "superseded decode counted as a delivery");
        } finally { release(); await page.unrouteAll(); }
        feed.camera.summary = "farm"; view.sequence += 1; await save();
        await page.waitForFunction(() => document.querySelector(".native-camera span")?.textContent === "farm");
      }
      view.feeds.reverse(); view.sequence += 1; await save();
      await page.waitForTimeout(200);
      assert.equal(await farm.getByRole("button", { name: "Redock", exact: true }).isVisible(), true);
      assert.equal(await page.locator('.native-feed-card:not([hidden])').count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
      await page.screenshot({ path: join(output, `native-regional-${width}.png`) });
      assert.deepEqual(detachedRequests, [], "detached document created another API/observation owner");
      assert.equal(await detached.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `detached overflow at ${width}`);
      await detached.screenshot({ path: join(output, `native-detached-${width}.png`) });
      const redocked = detached.waitForEvent("close");
      await farm.getByRole("button", { name: "Redock", exact: true }).click(); await redocked;
      assert.equal(await page.locator('.native-feed-card:not([hidden])').count(), 3);
      if (width === 1680) {
        const openFarm = async () => {
          const opened = page.waitForEvent("popup");
          await page.locator('.native-feed-card[data-site-id="farm"]').getByRole("button", { name: "Focus", exact: true }).click();
          const child = await opened; child.on("pageerror", error => errors.push(error.message));
          await child.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
          return child;
        };
        let child = await openFarm();
        await child.close();
        await page.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
        await page.locator('.native-feed-card[data-site-id="farm"]').getByRole("button", { name: "Focus", exact: true }).waitFor();
        assert.equal(await page.locator('.native-feed-card:not([hidden])').count(), 3, "closing a window lost its feed");
        child = await openFarm();
        const reloaded = child.waitForEvent("close");
        await child.reload().catch(error => { assert.match(error.message, /has been closed/u); }); await reloaded;
        await page.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
        await page.locator('.native-feed-card[data-site-id="farm"]').getByRole("button", { name: "Focus", exact: true }).waitFor();
        child = await openFarm();
        await page.evaluate(() => { location.hash = "#questions"; });
        await page.locator("#native-view-state").waitFor({ state: "hidden" });
        const feed = view.feeds.find(feed => feed.siteId === "farm");
        feed.label = "Still observed while reviewing."; view.sequence += 1; await save();
        await child.waitForFunction(() => document.querySelector('.native-panel-meta strong')?.textContent.includes("Still observed while reviewing."));
        await page.evaluate(() => { location.hash = "#native-view"; });
        await page.locator("#native-view-state").waitFor({ state: "visible" });
        view.state = "ended"; view.inspection = { sequence: view.sequence, capturedAtUnixMs: Date.now(), worldHours: 3.25,
          status: "available", message: "", omittedPeople: 0, omittedEvents: 0 };
        view.study = { id: randomUUID(), label: "Ended fixture", status: "failed", attempt: 1, attemptDurationSeconds: 7200,
          autoContinue: false, worldHours: 0, accumulatedWorldHours: 0, canCheckpoint: false, canContinue: false, updatedAtUnixMs: Date.now(), lastStopReason: "incomplete" };
        view.sequence += 1; await save();
        await child.getByText("Run ended", { exact: true }).first().waitFor({ state: "visible" });
        assert.match(await child.locator("[data-native-clock]").innerText(), /3\.25/u);
        const tile = child.locator('.native-feed-card[data-site-id="farm"]');
        if (await tile.locator(".native-panel-menu").getAttribute("open") === null) await tile.locator(".native-panel-menu > summary").click();
        if (!await tile.locator(".native-controls").isVisible()) await tile.getByRole("button", { name: "Camera", exact: true }).click();
        assert.equal(await tile.getByRole("button", { name: "Move this view →", exact: true }).isDisabled(), true);
        const beforeEnd = (await readdir(commands)).length, endedClock = await child.locator("[data-native-clock]").innerText();
        await tile.locator(".native-panel-media").focus(); await child.keyboard.press("ArrowRight"); await page.waitForTimeout(1100);
        assert.equal((await readdir(commands)).length, beforeEnd, "ended detached feed issued a command");
        assert.equal(await child.locator("[data-native-clock]").innerText(), endedClock);
        const retired = child.waitForEvent("close");
        const nextSession = randomUUID(); view.sessionId = nextSession; view.state = "running"; delete view.inspection; delete view.study;
        feed.label = "farm"; feed.camera.summary = "farm"; view.sequence += 1; view.capturedAtUnixMs = Date.now();
        for (const regionalFeed of view.feeds) regionalFeed.capturedAtUnixMs = view.capturedAtUnixMs;
        await writeFile(registryPath, JSON.stringify([{ id: "regional", label: "Regional fixture", directory: producer, sessionId: nextSession }]));
        await save(); await retired;
        await page.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
        assert.equal(await page.locator('.native-feed-card:not([hidden])').count(), 3, "new session retained an old detached tile");
        child = await openFarm();
        await page.evaluate(() => { location.hash = "#questions"; });
        await page.locator("#native-view-state").waitFor({ state: "hidden" });
        const successorDirectory = join(parent, "successor"), successorSession = randomUUID();
        await mkdir(join(successorDirectory, "commands"), { recursive: true });
        await writeFile(join(successorDirectory, images[0].file), await readFile(join(producer, images[0].file)));
        await writeFile(join(successorDirectory, "latest.json"), JSON.stringify({ ...view, sessionId: successorSession, sequence: 1,
          capturedAtUnixMs: Date.now(), image: images[0], feeds: view.feeds.map(feed => ({ ...feed, image: images[0] })) }));
        await writeFile(registryPath, JSON.stringify([{ id: "regional", label: "Regional fixture", directory: producer, sessionId: nextSession },
          { id: "successor", label: "Successor fixture", directory: successorDirectory, sessionId: successorSession }]));
        const superseded = child.waitForEvent("close"); view.state = "ended"; view.sequence += 1; await save(); await superseded;
        await page.waitForTimeout(200);
        assert.equal(new URL(page.url()).hash, "#questions", "detached successor rewrote the human review route");
        assert.equal(await page.locator("#native-view-state").isVisible(), false);
        view.state = "running"; view.sequence += 1; view.capturedAtUnixMs = Date.now(); await save();
        await writeFile(registryPath, JSON.stringify([{ id: "regional", label: "Regional fixture", directory: producer, sessionId: nextSession }]));
        await page.evaluate(() => { location.hash = "#native-view?session=regional"; });
        await page.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
      }
      const regions = view.feeds; delete view.feeds; view.viewport = structuredClone(viewport); view.sequence += 1; await save();
      await page.waitForFunction(() => document.querySelector(".native-observatory-primary")?.hidden === false);
      const primary = page.locator(".native-observatory-primary .native-viewport"), box = await primary.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2, before = (await readdir(commands)).length;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.evaluate(() => { location.hash = "#questions"; });
      await page.locator("#native-view-state").waitFor({ state: "hidden" });
      await page.evaluate(() => { location.hash = "#native-view"; });
      await page.locator("#native-view-state").waitFor({ state: "visible" });
      await page.mouse.move(x + 72, y); await page.mouse.up(); await page.waitForTimeout(150);
      assert.equal((await readdir(commands)).length, before, "closed primary drag leaked into a reopened view");
      view.feeds = regions; delete view.viewport; view.sequence += 1; await save();
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
});

test("native terminal display preserves failure, observed time and source-owned continuation at four widths", {
  skip: process.env.MOUSECAT_BROWSER_TEST !== "1" ? "run with MOUSECAT_BROWSER_TEST=1 for isolated browser acceptance" : false,
}, async t => {
  const parent = await mkdtemp(join(tmpdir(), "mousecat-terminal-browser-"));
  t.after(async () => { assert.equal(dirname(resolve(parent)), resolve(tmpdir())); assert.ok(basename(parent).startsWith("mousecat-terminal-browser-")); await rm(parent, { recursive: true, force: true }); });
  const producer = join(parent, "producer"), commands = join(producer, "commands"), registryPath = join(parent, "registry.json");
  await mkdir(commands, { recursive: true });
  const sessionId = randomUUID(), now = Date.now(), bytes = png([70, 100, 130]);
  await writeFile(join(producer, "frame.png"), bytes);
  const view = { schema: "mousecat.native-view/1", sessionId, sequence: 1, capturedAtUnixMs: now,
    image: { file: "frame.png", sha256: createHash("sha256").update(bytes).digest("hex"), width: 1, height: 1 },
    state: "running", title: "Terminal display test", summary: "Synthetic terminal fixture.", people: [], lastCommandSequence: 0,
    camera: { mode: "automatic", personIds: [], summary: "Observed world." },
    inspection: { sequence: 1, capturedAtUnixMs: now, worldHours: 2.475, status: "available", message: "", omittedPeople: 0, omittedEvents: 0 },
    study: { id: randomUUID(), label: "Terminal fixture", status: "running", attempt: 1, attemptDurationSeconds: 7200,
      autoContinue: false, worldHours: 0, accumulatedWorldHours: 0, canCheckpoint: true, canContinue: false, updatedAtUnixMs: now, lastStopReason: "" } };
  const save = async () => { view.sequence += 1; await writeFile(join(producer, "latest.json"), JSON.stringify(view)); };
  await save();
  await writeFile(registryPath, JSON.stringify([{ id: "terminal", label: "Terminal fixture", directory: producer, sessionId }]));
  const app = await startOperatorServer({ port: 0, nativeViews: { registryPath } }); t.after(() => app.close());
  const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {}); t.after(() => browser.close());
  const errors = [], output = resolve(".mousecat/browser-check"); await mkdir(output, { recursive: true });
  for (const width of [1680, 760, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } }), page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      view.state = "running"; view.capturedAtUnixMs = Date.now();
      view.inspection = { sequence: view.sequence, capturedAtUnixMs: view.capturedAtUnixMs, worldHours: 2.475, status: "available", message: "", omittedPeople: 0, omittedEvents: 0 };
      Object.assign(view.study, { status: "running", worldHours: 0, accumulatedWorldHours: 0, canCheckpoint: true, canContinue: false, lastStopReason: "", reviewStatus: "not-eligible", reviewMessage: "Synthetic run has no verified outcomes." });
      await save(); await page.goto(app.url + "#native-view");
      await page.getByRole("button", { name: "Save session", exact: true }).waitFor({ state: "visible" });
      assert.match(await page.locator(".native-session-facts").innerText(), /running · world hour 2\.48/u);
      view.state = "ended";
      Object.assign(view.study, { status: "failed", canCheckpoint: false, lastStopReason: "incomplete" });
      await save();
      await page.waitForFunction(() => document.querySelector(".native-session-facts")?.textContent.includes("failed · last observed world hour 2.475"));
      assert.match(await page.locator(".native-session-facts").innerText(), /validated time 0\.00 hr.*incomplete/u);
      assert.equal(await page.getByText("Run complete", { exact: true }).count(), 0);
      await page.getByText("Run ended", { exact: true }).last().waitFor({ state: "visible" });
      assert.equal(await page.getByRole("button", { name: "Save session", exact: true }).isVisible(), false);
      assert.equal(await page.getByRole("button", { name: "Continue session", exact: true }).isVisible(), false);
      assert.equal(await page.getByRole("button", { name: "Pause", exact: true }).isDisabled(), true);
      const finalFrame = await page.locator(".native-frame-state").innerText();
      await page.waitForTimeout(1100);
      assert.equal(await page.locator(".native-frame-state").innerText(), finalFrame, "terminal frame timer continued");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `terminal overflow at ${width}`);
      await page.locator(".native-session-bar").scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(output, `native-terminal-${width}.png`), fullPage: true });
      Object.assign(view.study, { status: "saved", canContinue: true, accumulatedWorldHours: 0.475, worldHours: 2.475, lastStopReason: "checkpoint" });
      await save(); await page.getByText("Session saved", { exact: true }).waitFor({ state: "visible" });
      assert.equal(await page.getByRole("button", { name: "Continue session", exact: true }).isEnabled(), true);
      assert.match(await page.locator(".native-session-facts").innerText(), /saved · last observed world hour 2\.475 · validated time 0\.47 hr/u);
      delete view.inspection;
      await save();
      await page.waitForFunction(() => document.querySelector(".native-session-facts")?.textContent.includes("last observed world hour unavailable"));
      assert.equal((await readdir(commands)).length, 0, "terminal presentation wrote a native command");
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
});
