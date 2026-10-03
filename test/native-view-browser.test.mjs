import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { startOperatorServer } from "../src/operator/server.mjs";

function png(color, width = 1, height = 1) {
  const chunk = (kind, bytes) => {
    const content = Buffer.concat([Buffer.from(kind), bytes]); let crc = 0xffffffff;
    for (const byte of content) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, content, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((1 + width * 4) * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) rows.set([...color, 255], y * (1 + width * 4) + 1 + x * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

async function assertFrameRatio(surface, ratio, message, fit = "contain") {
  const result = await surface.evaluate(element => {
    const box = element.getBoundingClientRect(), image = element.querySelector("img");
    return { ratio: box.width / box.height, fit: getComputedStyle(image).objectFit };
  });
  assert.ok(Math.abs(result.ratio - ratio) < 0.01, `${message}: expected ${ratio}, received ${result.ratio}`);
  assert.equal(result.fit, fit, `${message}: image framing changed`);
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
    await page.addInitScript(() => {
      localStorage.setItem("mousecat.native-view.shape", JSON.stringify("frame"));
      localStorage.setItem("mousecat.native-view.framing", JSON.stringify("fit"));
      const original = window.fetch.bind(window);
      let active = 0;
      window.peakNativeSnapshotRequests = 0;
      window.fetch = async (...args) => {
        if (!/\/api\/native-views\/[^/]+\/snapshot(?:\?|$)/u.test(String(args[0]))) return original(...args);
        active += 1;
        window.peakNativeSnapshotRequests = Math.max(window.peakNativeSnapshotRequests, active);
        try {
          const response = await original(...args);
          await response.clone().arrayBuffer();
          return response;
        }
        finally { active -= 1; }
      };
    });
    page.on("pageerror", error => errors.push(error.message));
    try {
      view.sequence += 1; view.capturedAtUnixMs = Date.now();
      for (const feed of view.feeds) feed.capturedAtUnixMs = view.capturedAtUnixMs;
      await save();
      await page.goto(app.url + "#native-view");
      await page.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
      await page.waitForFunction(() => [...document.querySelectorAll('.native-feed-card img')].every(image => image.complete && image.naturalWidth));
      assert.equal(await page.locator(".native-inspector").isVisible(), false, "person inspector should start collapsed");
      assert.equal(await page.locator('.native-stage > .native-controls').getByRole("button", { name: /^Follow /u }).count(), 0, "global camera controls duplicate the regional tools");
      assert.equal(await page.evaluate(() => window.peakNativeSnapshotRequests), 1,
        'live snapshot requests overlapped after removing the polling delay');
      const cameraOrder = await page.locator('.native-feed-card').evaluateAll(cards => cards.map(card => card.dataset.siteId));
      for (const feed of view.feeds) {
        const card = page.locator(`.native-feed-card[data-site-id="${feed.siteId}"]`);
        assert.equal(await card.locator('.native-panel-meta strong').innerText(), feed.label);
        assert.equal(await card.locator('img').getAttribute('alt'), `Native view: ${feed.label}`);
        await assertFrameRatio(card.locator(".native-panel-media"), feed.image.width / feed.image.height, `docked geometry at ${width}`);
        for (const selector of ['.native-feed-subject', '.native-feed-age']) {
          assert.equal(await card.locator(selector).evaluate(element => getComputedStyle(element).whiteSpace), 'normal', `docked caption clipped at ${width}`);
        }
      }
      const details = page.getByRole("button", { name: "Hide details", exact: true }); if (await details.isVisible()) await details.click();
      const popout = page.waitForEvent("popup");
      await page.locator('.native-feed-card[data-site-id="farm"]').getByRole("button", { name: "Window", exact: true }).click();
      const detached = await popout;
      await detached.setViewportSize({ width, height: 640 });
      detached.on("pageerror", error => errors.push(error.message));
      const detachedRequests = []; detached.on("request", request => {
        if (/\/api\/native-views(?:$|\/[^/]+\/(?:snapshot|command))/u.test(new URL(request.url()).pathname)) detachedRequests.push(request.url());
      });
      const farm = detached.locator('.native-feed-card[data-site-id="farm"]');
      await farm.waitFor({ state: "visible" });
      await farm.locator(".native-panel-menu > summary").click();
      assert.equal(await page.locator(".native-camera strong").textContent(), "farm · Camera follows Casey");
      assert.equal(await farm.locator('.native-feed-subject').innerText(), 'Following Casey');
      assert.equal(await page.locator(".native-camera span").textContent(), "farm");
      assert.equal(await farm.getByRole("button", { name: "Move this view →", exact: true }).isEnabled(), true);
      await assertFrameRatio(farm.locator(".native-panel-media"), 1, `detached geometry at ${width}`);
      const fitted = await farm.boundingBox(), available = await detached.locator("[data-native-feed-root]").boundingBox();
      assert.ok(fitted.width <= available.width + 1 && fitted.height <= available.height + 1, `detached frame exceeded its window at ${width}`);
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
      await verify("auto", () => farm.getByRole("button", { name: "Follow Casey", exact: true }).click());
      await farm.locator(".native-panel-menu > summary").click();
      const media = farm.locator(".native-panel-media");
      await verify("pan", async () => { await media.focus(); await detached.keyboard.press("ArrowLeft"); });
      await verify("zoom", async () => { await media.hover(); await detached.mouse.wheel(0, 100); });
      await verify("pan", async () => {
        const box = await media.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        await detached.mouse.move(x, y); await detached.mouse.down(); await detached.mouse.move(x + 70, y, { steps: 3 }); await detached.mouse.up();
      });
      assert.equal(await page.evaluate(() => window.peakNativeSnapshotRequests), 1,
        'snapshot requests overlapped during successive camera interactions');
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
        await farm.locator(".native-panel-menu > summary").click();
        await farm.getByRole("button", { name: "Info", exact: true }).click();
        await farm.getByRole("button", { name: "Info", exact: true }).click();
        await farm.locator(".native-panel-menu > summary").click();
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
          const loadedTime = feed.capturedAtUnixMs;
          feed.capturedAtUnixMs = view.capturedAtUnixMs = Date.now(); feed.camera.personIds = ['person-1'];
          view.people[2].label = 'Changed name in pending snapshot';
          feed.overlay = { personId: 'person-1', capturedAtUnixMs: feed.capturedAtUnixMs,
            groups: [{ id: 'attention', label: 'Attention', rows: [{ label: 'State', value: 'Pending frame state' }] }] };
          view.sequence += 1; await save(); await requested;
          assert.equal(await farm.locator('.native-feed-age').textContent().then(text => text.includes('Loading image')), false, "normal pending decode must not flash loading text");
          assert.equal(await farm.locator('.native-feed-subject').innerText(), 'Following Casey', 'undecoded image changed the displayed subject');
          assert.equal(await farm.locator('.native-feed-age').getAttribute('title'), new Date(loadedTime).toISOString(), 'undecoded image changed the displayed time');
          assert.equal(await farm.locator('.native-panel-telemetry').innerText(), '', 'undecoded image changed the displayed overlay');
          feed.capturedAtUnixMs = loadedTime; feed.camera.personIds = ['person-3']; delete feed.overlay;
          view.people[2].label = 'Casey';
          feed.image = loadedImage; feed.camera.summary = "Returned to the loaded image."; view.sequence += 1; await save();
          await page.waitForFunction(() => document.querySelector(".native-camera span")?.textContent === "Returned to the loaded image.");
          const completed = page.waitForResponse(response => new URL(response.url()).searchParams.get("file") === delayedFile);
          release(); await (await completed).finished(); await page.waitForTimeout(150);
          assert.ok((await farm.locator("img").getAttribute("src")).includes("farm-updated.png"), "superseded decode replaced the current regional image");
          await page.waitForTimeout(2200);
          assert.equal(await page.locator(".native-frame-state span:last-child").textContent(), "0.0 images/s", "superseded decode counted as a delivery");
        } finally { release(); await page.unrouteAll(); }
        const displayedTime = feed.capturedAtUnixMs;
        feed.overlay = { personId: 'person-3', capturedAtUnixMs: displayedTime,
          groups: [{ id: 'attention', label: 'Attention', rows: [{ label: 'State', value: 'Displayed frame state' }] }] };
        view.sequence += 1; await save();
        await farm.locator('.native-panel-telemetry').filter({ hasText: 'Displayed frame state' }).waitFor();
        await page.route(/\/api\/native-views\/.+\/image\?/u, async route => {
          if (new URL(route.request().url()).searchParams.get('file') === delayedFile) await route.fulfill({ status: 503, body: 'Unavailable' });
          else await route.continue();
        });
        try {
          feed.image = { file: delayedFile, sha256: createHash('sha256').update(delayedBytes).digest('hex'), width: 1, height: 1 };
          feed.capturedAtUnixMs = view.capturedAtUnixMs = Date.now(); feed.camera.personIds = ['person-1'];
          view.people[2].label = 'Changed during failed image';
          feed.overlay = { personId: 'person-1', capturedAtUnixMs: feed.capturedAtUnixMs,
            groups: [{ id: 'attention', label: 'Attention', rows: [{ label: 'State', value: 'Replacement frame state' }] }] };
          view.sequence += 1; await save();
          await farm.locator('.native-feed-age').filter({ hasText: 'Image unavailable' }).waitFor();
          assert.equal(await farm.locator('.native-feed-subject').innerText(), 'Following Casey');
          assert.equal(await farm.locator('.native-feed-age').getAttribute('title'), new Date(displayedTime).toISOString());
          assert.match(await farm.locator('.native-panel-telemetry').innerText(), /Displayed frame state/u);
        } finally { await page.unrouteAll(); }
        view.sequence += 1; await save();
        await farm.locator('.native-panel-telemetry').filter({ hasText: 'Replacement frame state' }).waitFor();
        assert.ok((await farm.locator('img').getAttribute('src')).includes(delayedFile));
        assert.equal(await farm.locator('.native-feed-subject').innerText(), 'Following Avery');
        assert.equal(await farm.locator('.native-feed-age').getAttribute('title'), new Date(feed.capturedAtUnixMs).toISOString());
        view.people[2].label = 'Casey'; feed.camera.personIds = ['person-3']; delete feed.overlay;
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
      assert.equal(await farm.locator('.native-feed-subject').evaluate(element => getComputedStyle(element).whiteSpace), 'normal', `subject clipped at ${width}`);
      assert.equal(await farm.locator('.native-feed-age').evaluate(element => getComputedStyle(element).whiteSpace), 'normal', `image status clipped at ${width}`);
      await detached.screenshot({ path: join(output, `native-detached-${width}.png`) });
      const redocked = detached.waitForEvent("close");
      await farm.getByRole("button", { name: "Redock", exact: true }).click(); await redocked;
      assert.equal(await page.locator('.native-feed-card:not([hidden])').count(), 3);
      assert.deepEqual(await page.locator('.native-feed-card').evaluateAll(cards => cards.map(card => card.dataset.siteId)), cameraOrder, 'producer reordering moved regional cameras');
      if (width === 1680) {
        const openFarm = async () => {
          const opened = page.waitForEvent("popup");
          await page.locator('.native-feed-card[data-site-id="farm"]').getByRole("button", { name: "Window", exact: true }).click();
          const child = await opened; child.on("pageerror", error => errors.push(error.message));
          await child.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
          return child;
        };
        let child = await openFarm();
        await child.close();
        await page.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
        await page.locator('.native-feed-card[data-site-id="farm"]').getByRole("button", { name: "Window", exact: true }).waitFor();
        assert.equal(await page.locator('.native-feed-card:not([hidden])').count(), 3, "closing a window lost its feed");
        child = await openFarm();
        const reloaded = child.waitForEvent("close");
        await child.reload().catch(error => { assert.match(error.message, /has been closed/u); }); await reloaded;
        await page.locator('.native-feed-card[data-site-id="farm"]').waitFor({ state: "visible" });
        await page.locator('.native-feed-card[data-site-id="farm"]').getByRole("button", { name: "Window", exact: true }).waitFor();
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
        assert.match(await child.locator("[data-native-clock]").textContent(), /3\.25/u);
        const tile = child.locator('.native-feed-card[data-site-id="farm"]');
        if (await tile.locator(".native-panel-menu").getAttribute("open") === null) await tile.locator(".native-panel-menu > summary").click();
        assert.equal(await tile.getByRole("button", { name: "Move this view →", exact: true }).isDisabled(), true);
        const beforeEnd = (await readdir(commands)).length, endedClock = await child.locator("[data-native-clock]").textContent();
        await tile.locator(".native-panel-media").focus(); await child.keyboard.press("ArrowRight"); await page.waitForTimeout(1100);
        assert.equal((await readdir(commands)).length, beforeEnd, "ended detached feed issued a command");
        assert.equal(await child.locator("[data-native-clock]").textContent(), endedClock);
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

test("named subject frames promote geometry and facts together without fresh-status chatter at four widths", {
  skip: process.env.MOUSECAT_BROWSER_TEST !== "1" ? "run with MOUSECAT_BROWSER_TEST=1 for isolated browser acceptance" : false,
}, async t => {
  const parent = await mkdtemp(join(tmpdir(), "mousecat-subject-browser-"));
  t.after(async () => { assert.equal(dirname(resolve(parent)), resolve(tmpdir())); assert.ok(basename(parent).startsWith("mousecat-subject-browser-")); await rm(parent, { recursive: true, force: true }); });
  const producer = join(parent, "producer"), commands = join(producer, "commands"), registryPath = join(parent, "registry.json");
  await mkdir(commands, { recursive: true });
  const image = async (file, width, height, color) => {
    const bytes = png(color, width, height); await writeFile(join(producer, file), bytes);
    return { file, width, height, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const first = await image("first.png", 16, 9, [70, 100, 130]);
  const portrait = await image("portrait.png", 4, 5, [40, 120, 90]);
  const wide = await image("wide.png", 2, 1, [130, 80, 50]);
  const failed = await image("failed.png", 1, 2, [50, 70, 140]);
  const sessionId = randomUUID(), view = { schema: "mousecat.native-view/1", sessionId, sequence: 1, capturedAtUnixMs: Date.now(),
    image: first, state: "running", title: "Subject display test", summary: "Synthetic observation metadata.", lastCommandSequence: 0,
    camera: { mode: "automatic", personIds: ["person-1"], summary: "Observed Avery." },
    people: ["Avery", "Blair"].map((label, index) => ({ id: `person-${index + 1}`, label, summary: "Observed." })),
    feeds: [first, portrait].map((image, index) => ({ id: `subject-${index + 1}`, siteId: `subject-${index + 1}`,
      label: ["Avery", "Blair"][index], capturedAtUnixMs: Date.now(), image,
      camera: { mode: "automatic", personIds: [`person-${index + 1}`], summary: "Subject camera." } })) };
  const save = async () => { view.sequence += 1; await writeFile(join(producer, "latest.json"), JSON.stringify(view)); };
  await writeFile(registryPath, JSON.stringify([{ id: "subjects", label: "Subject fixture", directory: producer, sessionId }]));
  await save();
  const app = await startOperatorServer({ port: 0, nativeViews: { registryPath } }); t.after(() => app.close());
  const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {}); t.after(() => browser.close());
  const errors = [], output = resolve(".mousecat/browser-check"); await mkdir(output, { recursive: true });
  for (const width of [1680, 760, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } }), page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const beforeCommands = (await readdir(commands)).length;
    const feed = view.feeds[1];
    view.state = "running"; view.capturedAtUnixMs = Date.now(); view.people[1].label = feed.label = "Blair";
    feed.image = portrait; for (const regional of view.feeds) regional.capturedAtUnixMs = view.capturedAtUnixMs;
    await save();
    try {
      await page.goto(app.url + "#native-view");
      const card = page.locator('.native-feed-card[data-site-id="subject-2"]');
      await page.waitForFunction(() => document.querySelector('[data-site-id="subject-2"] img')?.naturalHeight === 5);
      await assertFrameRatio(card.locator(".native-panel-media"), 16 / 9, `wide default at ${width}`, "cover");
      assert.equal(await card.locator(".native-panel-meta").innerText(), "Blair", `subject name should appear once at ${width}`);
      assert.equal(await card.locator(".native-feed-age").isVisible(), false);
      assert.equal(await page.locator(".native-summary").isVisible(), false, "observation metadata should stay behind view settings");
      await page.screenshot({ path: join(output, `native-subject-wide-${width}.png`) });
      await page.locator(".native-view-options > summary").click();
      const shape = page.getByRole("combobox", { name: "View shape", exact: true });
      const framing = page.getByRole("combobox", { name: "Image framing", exact: true });
      assert.equal(await shape.inputValue(), "wide"); assert.equal(await framing.inputValue(), "fill");
      await shape.selectOption("square"); await framing.selectOption("fit");
      await page.reload();
      await page.waitForFunction(() => document.querySelector('[data-site-id="subject-2"] img')?.naturalHeight === 5);
      await assertFrameRatio(card.locator(".native-panel-media"), 1, `persisted square view at ${width}`);
      await page.locator(".native-view-options > summary").click();
      assert.equal(await shape.inputValue(), "square"); assert.equal(await framing.inputValue(), "fit");
      await shape.selectOption("frame");
      await assertFrameRatio(card.locator(".native-panel-media"), 4 / 5, `frame docked at ${width}`);
      const popup = page.waitForEvent("popup"); await card.getByRole("button", { name: "Window", exact: true }).click();
      const child = await popup; child.on("pageerror", error => errors.push(error.message));
      await child.setViewportSize({ width, height: 640 });
      const tile = child.locator('.native-feed-card[data-site-id="subject-2"]'); await tile.waitFor({ state: "visible" });
      await assertFrameRatio(tile.locator(".native-panel-media"), 4 / 5, `portrait focused at ${width}`);
      for (const [value, ratio] of [["wide", 16 / 9], ["square", 1], ["frame", 4 / 5]]) {
        await shape.selectOption(value);
        for (const [choice, fit] of [["fill", "cover"], ["fit", "contain"]]) {
          await framing.selectOption(choice);
          await assertFrameRatio(page.locator('[data-site-id="subject-1"] .native-panel-media'), value === "frame" ? 16 / 9 : ratio, `${value}/${choice} docked at ${width}`, fit);
          await assertFrameRatio(tile.locator(".native-panel-media"), ratio, `${value}/${choice} focused at ${width}`, fit);
          if (value === "wide" && choice === "fill") await child.screenshot({ path: join(output, `native-subject-wide-focused-${width}.png`) });
        }
      }
      await page.locator(".native-view-options > summary").click();
      await child.waitForFunction(() => {
        const frame = document.querySelector('.native-feed-card')?.getBoundingClientRect();
        const area = document.querySelector('[data-native-feed-root]')?.getBoundingClientRect();
        return frame && area && frame.width <= area.width + 1 && frame.height <= area.height + 1;
      });
      let release;
      const permit = new Promise(resolve => { release = resolve; });
      await page.route(/\/api\/native-views\/.+\/image\?/u, async route => {
        if (new URL(route.request().url()).searchParams.get("file") === wide.file) await permit;
        await route.continue();
      });
      feed.capturedAtUnixMs = view.capturedAtUnixMs = Date.now(); await save();
      await child.waitForFunction(timestamp => document.querySelector('.native-feed-age')?.title === timestamp, new Date(feed.capturedAtUnixMs).toISOString());
      const displayedTime = feed.capturedAtUnixMs;
      try {
        const requested = page.waitForRequest(request => new URL(request.url()).searchParams.get("file") === wide.file);
        feed.image = wide; feed.label = view.people[1].label = "Blair Renamed";
        feed.capturedAtUnixMs = view.capturedAtUnixMs = Date.now(); await save(); await requested;
        await child.waitForTimeout(150);
        await assertFrameRatio(tile.locator(".native-panel-media"), 4 / 5, `pending decode geometry at ${width}`);
        assert.equal(await tile.locator(".native-panel-meta strong").innerText(), "Blair");
        assert.equal(await tile.locator(".native-feed-age").getAttribute("title"), new Date(displayedTime).toISOString());
        assert.equal(await tile.locator(".native-panel-meta").innerText(), "Blair", "pending normal image should keep the caption quiet");
        release();
        await child.waitForFunction(() => document.querySelector('.native-panel-meta strong')?.textContent === "Blair Renamed");
        await assertFrameRatio(tile.locator(".native-panel-media"), 2, `accepted decode geometry at ${width}`);
        assert.equal(await tile.locator(".native-panel-meta").innerText(), "Blair Renamed");
      } finally { release(); await page.unrouteAll(); }
      const acceptedTime = feed.capturedAtUnixMs;
      await page.route(/\/api\/native-views\/.+\/image\?/u, async route => {
        if (new URL(route.request().url()).searchParams.get("file") === failed.file) await route.fulfill({ status: 503, body: "Unavailable" });
        else await route.continue();
      });
      feed.image = failed; feed.label = view.people[1].label = "Unaccepted name";
      feed.capturedAtUnixMs = view.capturedAtUnixMs = Date.now(); await save();
      await tile.locator(".native-feed-age").filter({ hasText: "Image unavailable" }).waitFor({ state: "visible" });
      await assertFrameRatio(tile.locator(".native-panel-media"), 2, `failed decode geometry at ${width}`);
      assert.equal(await tile.locator(".native-panel-meta strong").innerText(), "Blair Renamed");
      assert.equal(await tile.locator(".native-feed-age").getAttribute("title"), new Date(acceptedTime).toISOString());
      await page.unrouteAll();
      feed.image = wide; feed.label = view.people[1].label = "Blair Renamed";
      feed.capturedAtUnixMs = acceptedTime; await save();
      await tile.locator(".native-feed-age").filter({ hasText: "Image unavailable" }).waitFor({ state: "hidden" });
      view.state = "paused"; await save(); await child.getByText("Paused", { exact: true }).first().waitFor({ state: "visible" });
      view.state = "running"; await save();
      await tile.locator(".native-feed-age").filter({ hasText: "Delayed frame" }).waitFor({ state: "visible" });
      feed.capturedAtUnixMs = view.capturedAtUnixMs = Date.now(); await save();
      await tile.locator(".native-feed-age").waitFor({ state: "hidden" });
      assert.equal(await tile.locator(".native-panel-meta").innerText(), "Blair Renamed");
      await page.route(/\/api\/native-views\/.+\/snapshot$/u, route => route.fulfill({ status: 503,
        contentType: "application/json", body: JSON.stringify({ code: "Fixture feed failure" }) }));
      await page.locator('.native-stage > .native-command-status').filter({ hasText: "Fixture feed failure" }).waitFor({ state: "visible" });
      await page.unrouteAll();
      await page.waitForFunction(() => document.querySelector('.native-connection')?.textContent === "Running"
        && document.querySelector('.native-stage > .native-command-status')?.textContent === "");
      assert.equal(await child.locator("[data-native-clock]").isVisible(), false, "focused metadata should stay behind session details");
      assert.equal(await child.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `subject focused overflow at ${width}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `subject docked overflow at ${width}`);
      await child.screenshot({ path: join(output, `native-subject-focused-${width}.png`) });
      const redocked = child.waitForEvent("close"); await tile.getByRole("button", { name: "Redock", exact: true }).click(); await redocked;
      await card.waitFor({ state: "visible" }); await assertFrameRatio(card.locator(".native-panel-media"), 2, `redocked geometry at ${width}`);
      await page.screenshot({ path: join(output, `native-subject-docked-${width}.png`) });
      assert.equal((await readdir(commands)).length, beforeCommands, "presentation wrote a native command");
      for (const [siteId, label] of [["subject-1", "Avery"], ["subject-2", "Blair Renamed"]]) {
        await page.locator(`[data-site-id="${siteId}"]`).getByRole("button", { name: `Follow ${label}`, exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.native-stage > .native-command-status')?.textContent.includes("awaiting"));
        const files = (await readdir(commands)).filter(file => /^\d{16}\.json$/u.test(file)).sort();
        const request = JSON.parse(await readFile(join(commands, files.at(-1)), "utf8"));
        assert.equal(request.action, "auto"); assert.equal(request.siteId, siteId);
        view.lastCommandSequence = request.sequence; view.commandResult = { sequence: request.sequence, status: "applied", message: `Following ${label}.` };
        view.capturedAtUnixMs = Date.now(); for (const regional of view.feeds) regional.capturedAtUnixMs = view.capturedAtUnixMs;
        await save(); await page.waitForFunction(label => document.querySelector('.native-stage > .native-command-status')?.textContent.includes(`Following ${label}.`), label);
      }
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
});

test("Window controls use current zoom samples, preserve unavailable subjects and remain independent at four widths", {
  skip: process.env.MOUSECAT_BROWSER_TEST !== "1" ? "run with MOUSECAT_BROWSER_TEST=1 for isolated browser acceptance" : false,
}, async t => {
  const parent = await mkdtemp(join(tmpdir(), "mousecat-window-controls-"));
  t.after(async () => { assert.equal(dirname(resolve(parent)), resolve(tmpdir())); assert.ok(basename(parent).startsWith("mousecat-window-controls-")); await rm(parent, { recursive: true, force: true }); });
  const producer = join(parent, "producer"), commands = join(producer, "commands"), registryPath = join(parent, "registry.json");
  await mkdir(commands, { recursive: true });
  const image = async (file, width, height, color) => {
    const bytes = png(color, width, height); await writeFile(join(producer, file), bytes);
    return { file, width, height, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const oldImage = await image("held.png", 4, 3, [40, 100, 150]), nextImage = await image("pending.png", 8, 3, [90, 140, 60]);
  const viewport = { zoom: 0.5, targetZoom: 0.5, zoomLevels: [0.5, 1, 2] }, now = Date.now(), sessionId = randomUUID();
  const view = { schema: "mousecat.native-view/1", sessionId, sequence: 1, capturedAtUnixMs: now, image: oldImage,
    state: "running", title: "Window controls fixture", summary: "Synthetic current-control observations.", lastCommandSequence: 0,
    viewport: structuredClone(viewport), cameraControls: { capturedAtUnixMs: now, viewport: { ...viewport, zoom: 2, targetZoom: 2 } },
    camera: { mode: "automatic", personIds: ["person-1"], summary: "Assigned Avery." },
    people: ["Avery", "Blair"].map((label, index) => ({ id: `person-${index + 1}`, label, summary: "Observed." })),
    feeds: ["Avery", "Blair"].map((label, index) => ({ id: `subject-${index + 1}`, siteId: `subject-${index + 1}`, label,
      capturedAtUnixMs: now, image: oldImage, viewport: structuredClone(viewport),
      cameraControls: { capturedAtUnixMs: now, viewport: { ...viewport, zoom: 2, targetZoom: 2 } },
      camera: { mode: "automatic", personIds: [`person-${index + 1}`], summary: `Assigned ${label}.` } })) };
  const save = async () => {
    view.sequence += 1; view.capturedAtUnixMs = Date.now(); view.cameraControls.capturedAtUnixMs = view.capturedAtUnixMs;
    for (const feed of view.feeds) feed.cameraControls.capturedAtUnixMs = view.capturedAtUnixMs;
    await writeFile(join(producer, "latest.json"), JSON.stringify(view));
  };
  await writeFile(registryPath, JSON.stringify([{ id: "windows", label: "Window controls fixture", directory: producer, sessionId }]));
  await save();
  const app = await startOperatorServer({ port: 0, nativeViews: { registryPath } }); t.after(() => app.close());
  const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {}); t.after(() => browser.close());
  const errors = [], output = resolve(".mousecat/browser-check"); await mkdir(output, { recursive: true });
  for (const width of [1680, 760, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } }), page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const feed = view.feeds[1];
    feed.image = oldImage; feed.viewport = structuredClone(viewport); feed.camera.personIds = ["person-2"]; feed.camera.summary = "Assigned Blair.";
    feed.cameraControls.viewport = { ...viewport, zoom: 2, targetZoom: 2 }; feed.capturedAtUnixMs = Date.now(); view.state = "running";
    await save();
    try {
      await page.goto(app.url + "#native-view");
      const card = page.locator('[data-site-id="subject-2"]');
      await page.waitForFunction(() => document.querySelector('[data-site-id="subject-2"] img')?.naturalWidth === 4);
      assert.equal(await card.getByRole("button", { name: "Focus", exact: true }).count(), 0, "old product name remains");
      const popup = page.waitForEvent("popup"); await card.getByRole("button", { name: "Window", exact: true }).click();
      const child = await popup; child.on("pageerror", error => errors.push(error.message)); await child.setViewportSize({ width, height: 640 });
      const tile = child.locator('[data-site-id="subject-2"]'); await tile.waitFor({ state: "visible" });
      await tile.locator(".native-panel-menu > summary").click();
      const zoomIn = tile.getByRole("button", { name: "Zoom this view in", exact: true }), zoomOut = tile.getByRole("button", { name: "Zoom this view out", exact: true });
      assert.equal(await zoomIn.isEnabled(), true, "held image minimum must not disable the current camera's inward step");
      assert.equal(await zoomOut.isDisabled(), true, "current camera maximum should bound controls");
      assert.equal(await tile.locator(".native-camera-controls > span").innerText(), "200%", "current sample changed pictured zoom");
      const verify = async (action, operate, fields = {}, state) => {
        const previous = view.lastCommandSequence; await operate();
        await page.waitForFunction(() => document.querySelector('.native-stage > .native-command-status')?.textContent.includes("awaiting"));
        const files = (await readdir(commands)).filter(file => /^\d{16}\.json$/u.test(file)).sort();
        const request = JSON.parse(await readFile(join(commands, files.at(-1)), "utf8"));
        assert.equal(request.action, action); assert.equal(request.sequence, previous + 1); assert.equal(request.sessionId, sessionId);
        for (const [key, value] of Object.entries(fields)) assert.equal(request[key], value);
        if (["pause", "resume", "speed"].includes(action)) assert.equal(Object.hasOwn(request, "siteId"), false, "time controls inherited a camera site");
        view.lastCommandSequence = request.sequence; view.commandResult = { sequence: request.sequence, status: "applied", message: `Window ${request.sequence} acknowledged.` };
        if (state) view.state = state; await save();
        await page.waitForFunction(sequence => document.querySelector('.native-stage > .native-command-status')?.textContent.includes(`Window ${sequence} acknowledged.`), request.sequence);
      };
      await verify("zoom", () => zoomIn.click(), { siteId: "subject-2", value: -1 });
      let release;
      const permit = new Promise(resolve => { release = resolve; });
      await page.route(/\/api\/native-views\/.+\/image\?/u, async route => {
        if (new URL(route.request().url()).searchParams.get("file") === nextImage.file) await permit;
        await route.continue();
      });
      try {
        const requested = page.waitForRequest(request => new URL(request.url()).searchParams.get("file") === nextImage.file);
        feed.image = nextImage; feed.viewport = { ...viewport, zoom: 1, targetZoom: 1 }; feed.capturedAtUnixMs = Date.now();
        feed.cameraControls.viewport = { ...viewport, zoom: 1, targetZoom: 1 }; await save(); await requested;
        await child.waitForFunction(() => !document.querySelector('[aria-label="Zoom this view out"]')?.disabled);
        assert.equal(await tile.locator(".native-camera-controls > span").innerText(), "200%", "undecoded image changed pictured zoom");
        await verify("zoom", () => zoomOut.click(), { siteId: "subject-2", value: 1 });
        release(); await child.waitForFunction(() => document.querySelector('.native-feed-card img')?.naturalWidth === 8);
        await child.waitForFunction(() => document.querySelector('.native-camera-controls > span')?.textContent === "100%");
      } finally { release(); await page.unrouteAll(); }
      feed.cameraControls.viewport = { ...viewport, zoom: 0.5, targetZoom: 0.5 }; await save();
      await child.waitForFunction(() => document.querySelector('[aria-label="Zoom this view in"]')?.disabled);
      assert.equal(await tile.locator(".native-camera-controls > span").innerText(), "100%", "control minimum changed accepted image zoom");
      await tile.locator(".native-panel-menu > summary").click();
      const beforeBoundedWheel = (await readdir(commands)).length;
      await tile.locator(".native-panel-media").hover(); await child.mouse.wheel(0, -100); await child.waitForTimeout(200);
      assert.equal((await readdir(commands)).length, beforeBoundedWheel, "wheel ignored the current control minimum");
      feed.cameraControls.viewport = { ...viewport, zoom: 1, targetZoom: 1 }; await save();
      await verify("zoom", async () => { await tile.locator(".native-panel-media").hover(); await child.mouse.wheel(0, -100); }, { siteId: "subject-2", value: -1 });
      for (const message of ["Waiting for assigned subject image", "Assigned subject unavailable: person is dead"] ) {
        feed.camera.personIds = []; feed.camera.summary = message; await save();
        await child.waitForFunction(message => document.querySelector('.native-feed-subject')?.textContent === message, message);
        assert.equal(await tile.locator(".native-feed-subject").innerText(), message);
        assert.equal(await tile.getByRole("button", { name: "Follow Blair", exact: true }).isDisabled(), true);
        assert.equal(await tile.locator(".native-panel-meta").innerText().then(text => text.includes("Following activity")), false);
        assert.equal(await page.locator('[data-site-id="subject-1"] .native-panel-meta strong').innerText(), "Avery");
      }
      feed.camera.personIds = ["person-2"]; feed.camera.summary = "Assigned Blair."; await save();
      await tile.locator(".native-feed-subject").waitFor({ state: "hidden" });
      await page.evaluate(() => { location.hash = "#questions"; }); await page.locator("#native-view-state").waitFor({ state: "hidden" });
      await verify("pause", () => child.getByRole("button", { name: "Pause", exact: true }).click(), {}, "paused");
      await child.getByRole("button", { name: "Resume", exact: true }).waitFor({ state: "visible" });
      await verify("resume", () => child.getByRole("button", { name: "Resume", exact: true }).click(), {}, "running");
      await verify("speed", () => child.getByRole("combobox", { name: "Playback speed", exact: true }).selectOption("2"), { value: 2 });
      await child.locator(".native-window-settings > summary").click();
      await child.getByText("Applies to all views", { exact: true }).waitFor({ state: "visible" });
      await child.getByRole("combobox", { name: "View shape", exact: true }).selectOption("square");
      await child.getByRole("combobox", { name: "Image framing", exact: true }).selectOption("fit");
      await assertFrameRatio(tile.locator(".native-panel-media"), 1, `Window-owned square framing at ${width}`);
      assert.equal(await page.locator('[aria-label="View shape"]').inputValue(), "square");
      assert.equal(await page.locator('[aria-label="Image framing"]').inputValue(), "fit");
      await child.locator(".native-window-settings > summary").click();
      await verify("auto", () => tile.getByRole("button", { name: "Follow Blair", exact: true }).click(), { siteId: "subject-2" });
      await child.setViewportSize({ width: width === 320 ? 390 : 320, height: 720 });
      await assertFrameRatio(tile.locator(".native-panel-media"), 1, `resized Window at ${width}`);
      assert.equal(await child.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Window controls overflow at ${width}`);
      await child.screenshot({ path: join(output, `native-window-controls-${width}.png`) });
      await page.evaluate(() => { location.hash = "#native-view?session=windows"; }); await page.locator("#native-view-state").waitFor({ state: "visible" });
      const redocked = child.waitForEvent("close"); await tile.getByRole("button", { name: "Redock", exact: true }).click(); await redocked;
      await card.waitFor({ state: "visible" });
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
      await page.locator(".native-session-settings > summary").click();
      assert.match(await page.locator(".native-session-facts").innerText(), /running · world hour 2\.48/u);
      view.state = "ended";
      Object.assign(view.study, { status: "failed", canCheckpoint: false, lastStopReason: "incomplete" });
      await save();
      await page.waitForFunction(() => document.querySelector(".native-session-facts")?.textContent.includes("failed · last observed world hour 2.475"));
      assert.match(await page.locator(".native-session-facts").innerText(), /validated time 0\.00 hr.*incomplete/u);
      assert.equal(await page.getByText("Run complete", { exact: true }).count(), 0);
      await page.getByText("Run ended", { exact: true }).first().waitFor({ state: "visible" });
      assert.equal(await page.getByRole("button", { name: "Save session", exact: true }).isVisible(), false);
      assert.equal(await page.getByRole("button", { name: "Continue session", exact: true }).isVisible(), false);
      assert.equal(await page.getByRole("button", { name: "Pause", exact: true }).isVisible(), false);
      const finalFrame = await page.locator(".native-frame-state").textContent();
      await page.waitForTimeout(1100);
      assert.equal(await page.locator(".native-frame-state").textContent(), finalFrame, "terminal frame timer continued");
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
