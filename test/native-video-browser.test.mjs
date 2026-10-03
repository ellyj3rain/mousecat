import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const widths = [1680, 760, 390, 320];
const enabled = process.env.MOUSECAT_BROWSER_TEST === "1";
const fixtureDirectory = process.env.MOUSECAT_NATIVE_VIDEO_FIXTURE;
const publicDirectory = resolve("src/operator/public");

const html = `<!doctype html><html lang="en" data-theme="manuscript"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/operator.css"><link rel="stylesheet" href="/appearance.css">
<style>body{margin:0;padding:16px;background:var(--page);font-family:system-ui,sans-serif}main{max-width:1500px;margin:auto}#surfaces{display:flex;gap:12px;margin-bottom:20px}figure{position:relative;margin:0;min-width:0;width:50%;aspect-ratio:16/9;background:var(--surface);border:1px solid var(--line-strong);overflow:hidden;border-radius:10px}figure img,figure canvas{width:100%;height:100%;object-fit:contain}figure canvas{position:absolute;inset:0}figure .overlay{position:absolute;bottom:8px;left:8px;color:var(--text);font-size:11px}figure [hidden]{display:none!important}@media(max-width:390px){body{padding:8px}#surfaces{gap:8px}}</style></head>
<body><main><div id="surfaces"><figure id="left"><img class="fallback" alt="Last accepted image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="><canvas hidden></canvas><span class="overlay" hidden>Source pose verified</span></figure><figure id="right"><img class="fallback" alt="Last accepted image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="><canvas hidden></canvas><span class="overlay" hidden>Source pose verified</span></figure></div></main>
<script type="module">
import { createNativeVideoPlayer } from '/native-video.js';
window.statuses=[];window.frames=[];window.presents={left:[],right:[]};
const bounded=(list,value,max=400)=>{list.push(value);if(list.length>max)list.shift()};
const originalDraw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(source,...args){originalDraw.call(this,source,...args);if(source.dataset?.nativeVideoDecoder!==undefined)window.decodedComposite=this.canvas;};
window.player=createNativeVideoPlayer({onStatus:value=>bounded(window.statuses,value,80),onFrame:value=>{
  const context=window.decodedComposite.getContext('2d');
  const left=document.querySelector('#left canvas'),right=window.rightCard.querySelector('canvas');
  const crops=['left','right'].map(key=>window.presents[key].at(-1)?.crop);
  const pixels=crops.every(Boolean)?crops.flatMap(crop=>[...context.getImageData(crop.left+20,crop.top+40,1,1).data]):null;
  const sinks=[...left.getContext('2d').getImageData(20,40,1,1).data,...right.getContext('2d').getImageData(20,40,1,1).data];
  bounded(window.frames,{...value,pixels,sinks});
}});
window.rightCard=document.querySelector('#right');
for(const key of ['left','right']){const card=document.querySelector('#'+key),canvas=card.querySelector('canvas');window.player.registerSurface(key,{canvas,siteId:key,onPresent:value=>{
  card.querySelector('.fallback').hidden=value.ready;canvas.hidden=!value.ready;card.querySelector('.overlay').hidden=!value.ready||value.alignment!=='verified';bounded(window.presents[key],value);
}})}
window.modulesReady=true;
</script></body></html>`;

async function fixtureServer(t, directory = null) {
  const requests = [], failures = new Set();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost"); requests.push(url.pathname);
    try {
      if (url.pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end(html); return; }
      if (failures.has(url.pathname)) { response.writeHead(503); response.end("Unavailable test fragment"); return; }
      const filename = basename(url.pathname);
      const modules = new Set(["native-video.js", "operator.css", "appearance.css"]);
      let data;
      if (modules.has(filename) && url.pathname === "/" + filename) {
        data = await readFile(join(publicDirectory, filename));
        response.setHeader("Content-Type", filename.endsWith(".css") ? "text/css" : "text/javascript");
      } else if (directory && url.pathname.startsWith("/media/") && /^video-[a-f0-9-]+-(?:init\.mp4|\d{16}\.m4s)$/u.test(filename)) {
        data = await readFile(join(directory, filename)); response.setHeader("Content-Type", "video/mp4");
      } else { response.writeHead(404); response.end(); return; }
      response.setHeader("Content-Length", data.length); response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return { url: `http://127.0.0.1:${server.address().port}/`, requests, failures };
}

function videoSnapshot(raw, binding = randomUUID(), stream = raw.streamId) {
  const sites = [{ id: "left", label: "Avery", slot: 0, x: 10, y: 20, z: 0, left: 0, top: 0, width: 160, height: 180, zoom: 1, targetZoom: 1 },
    { id: "right", label: "Blair", slot: 1, x: 18, y: 28, z: 0, left: 160, top: 0, width: 160, height: 180, zoom: 1, targetZoom: 1 }];
  const video = structuredClone(raw); video.schema = "mousecat.native-video/1"; video.streamId = stream;
  for (const segment of video.segments) segment.sites = segment.sites.length ? structuredClone(sites) : [];
  return { binding: { bindingId: binding }, view: { sessionId: "synthetic-video-session", video },
    videoUrls: { streamId: stream, initUrl: "/media/" + video.init.file, segments: video.segments.map(segment => ({ sequence: segment.sequence, url: "/media/" + segment.file })) } };
}

test("one actual H264 decoder paints congruent crops including adopted Window canvases and truthful fallback", {
  skip: !enabled ? "run with MOUSECAT_BROWSER_TEST=1" : !fixtureDirectory ? "set MOUSECAT_NATIVE_VIDEO_FIXTURE to an isolated native init/fragments proof" : false,
}, async t => {
  const raw = JSON.parse(await readFile(join(fixtureDirectory, "latest-video.json"), "utf8"));
  assert.equal(raw.mimeType, "video/mp4"); assert.ok(raw.segments.some(segment => segment.sites.length === 0), "proof must include a mixed-command interval");
  const server = await fixtureServer(t, resolve(fixtureDirectory)), browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
  t.after(() => browser.close()); const errors = [];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 950 } }), page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(server.url); await page.waitForFunction(() => window.modulesReady);
      const snapshot = videoSnapshot(raw);
      let release; const held = new Promise(resolve => { release = resolve; });
      await page.route(/\/media\/.+-init\.mp4$/u, async route => { await held; await route.continue(); });
      const requested = page.waitForRequest(request => request.url().endsWith("-init.mp4"));
      await page.evaluate(value => window.player.update(value), snapshot); await requested;
      assert.equal(await page.locator("#left .fallback").isVisible(), true, "PNG removed before decoding");
      assert.equal(await page.locator("#left canvas").isVisible(), false);
      release(); await page.unrouteAll({ behavior: "wait" });
      await page.waitForFunction(() => window.frames.length >= 4, null, { timeout: 15000 });
      assert.equal(await page.locator("#left .fallback").isVisible(), false);
      const popout = page.waitForEvent("popup");
      await page.evaluate(() => {
        window.detached = window.open("about:blank", "synthetic-video-window", "width=450,height=450,resizable=yes");
        const style = window.detached.document.createElement("style"); style.textContent = "body{margin:0}figure{margin:0;position:relative;width:100%}canvas,img{width:100%;height:auto}canvas{position:absolute;inset:0}[hidden]{display:none!important}";
        window.detached.document.head.append(style); window.detached.document.body.append(window.rightCard);
      });
      const detached = await popout; detached.on("pageerror", error => errors.push(error.message));
      await detached.setViewportSize({ width: Math.min(width, 600), height: 500 });
      await detached.locator("#right canvas").waitFor({ state: "visible" });
      await page.waitForFunction(sequence => window.frames.some(frame => frame.sequence === sequence), raw.segments.at(-1).sequence, { timeout: 15000 });
      const receipt = await page.evaluate(() => ({ frames: window.frames, presents: window.presents, stats: window.player.stats(), statuses: window.statuses }));
      assert.ok(receipt.frames.length > 25, `video did not play continuously at ${width}`);
      assert.equal(receipt.stats.decoderCount, 1); assert.equal(await page.locator("video").count(), 1); assert.equal(await detached.locator("video").count(), 0);
      assert.equal(receipt.stats.surfaces, 2); assert.equal(receipt.stats.peakFetches, 1);
      assert.ok(receipt.stats.retainedSegments <= 8); assert.ok(receipt.stats.pendingSegments <= 8);
      assert.equal(receipt.stats.callbackErrors, 0);
      await page.evaluate(value => { for (let index = 0; index < 5; index += 1) window.player.update(value); }, snapshot);
      assert.equal(await page.evaluate(() => window.player.stats().appendedSegments), receipt.stats.appendedSegments, "repeat snapshots re-appended the retained fragment window");
      for (const frame of receipt.frames) {
        assert.equal(frame.surfaces, 2, "shared callback omitted a surface");
        assert.deepEqual(frame.sinks, frame.pixels, "surface was not an exact crop of the same decoded frame");
        const left = receipt.presents.left.find(value => value.ready && value.presentedFrames === frame.presentedFrames);
        const right = receipt.presents.right.find(value => value.ready && value.presentedFrames === frame.presentedFrames);
        assert.equal(left.mediaTime, right.mediaTime); assert.equal(left.sequence, right.sequence);
        assert.equal(left.crop.left, 0); assert.equal(right.crop.left, 160); assert.equal(left.crop.width, 160); assert.equal(right.crop.width, 160);
      }
      const mixed = receipt.presents.left.filter(value => value.ready && value.alignment === "unknown");
      assert.ok(mixed.length > 0, "mixed-command segment was omitted from playback");
      assert.ok(mixed.every(value => value.site === null && value.crop.width === 160), "mixed interval acquired an invented camera pose");
      assert.ok(receipt.presents.left.some(value => value.ready && value.alignment === "verified" && value.sequence > mixed.at(-1).sequence));
      assert.equal(receipt.statuses.at(-1).state, "ended");
      await page.evaluate(() => { document.querySelector("#surfaces").append(window.rightCard); window.detached.close(); });
      const next = videoSnapshot(raw, randomUUID(), randomUUID());
      let nextRelease; const nextHeld = new Promise(resolve => { nextRelease = resolve; });
      await page.route(/\/media\/.+-init\.mp4$/u, async route => { await nextHeld; await route.continue(); });
      await page.evaluate(value => window.player.update(value), next);
      assert.equal(await page.locator("#left .fallback").isVisible(), true, "binding switch retained an old decoded surface");
      assert.equal(await page.locator("#left .overlay").isVisible(), false);
      assert.equal(await page.evaluate(() => window.player.stats().ready), false);
      nextRelease(); await page.unrouteAll({ behavior: "wait" });
      await page.waitForFunction(stream => window.frames.some(frame => frame.streamId === stream), next.view.video.streamId, { timeout: 15000 });
      const reinitialized = structuredClone(next); reinitialized.view.video.init.sha256 = "0".repeat(64);
      await page.evaluate(value => window.player.update(value), reinitialized);
      assert.equal(await page.evaluate(() => window.player.stats().ready), false, "init identity change retained old decoded content");
      await page.waitForFunction(() => window.player.stats().ready, null, { timeout: 15000 });
      const unsupported = structuredClone(next); unsupported.view.video.codecs = "avc1.ffffff";
      await page.evaluate(value => window.player.update(value), unsupported);
      assert.equal(await page.locator("#left .fallback").isVisible(), true);
      assert.equal(await page.evaluate(() => window.statuses.at(-1).state), "failed");
      const unavailable = structuredClone(next); unavailable.view.video.state = "starting"; unavailable.view.video.init = null; unavailable.view.video.codecs = null; unavailable.view.video.segments = [];
      await page.evaluate(value => window.player.update(value), unavailable);
      assert.equal(await page.evaluate(() => window.statuses.at(-1).state), "starting");
      assert.equal(await page.locator("#left .fallback").isVisible(), true);
      const bad = videoSnapshot(raw, randomUUID(), randomUUID()); bad.videoUrls.initUrl += "?unavailable=1";
      await page.route(/\?unavailable=1$/u, route => route.fulfill({ status: 503, body: "Unavailable test init" }));
      await page.evaluate(value => window.player.update(value), bad);
      await page.waitForFunction(() => window.statuses.at(-1).state === "failed");
      assert.equal(await page.locator("#left .fallback").isVisible(), true);
      assert.equal(await page.evaluate(() => window.player.stats().ready), false);
      const corrupt = videoSnapshot(raw, randomUUID(), randomUUID()); corrupt.videoUrls.segments[0].url += "?corrupt=1";
      await page.route(/\?corrupt=1$/u, route => route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from([0, 0, 0, 8, 109, 111, 111, 102]) }));
      await page.evaluate(value => window.player.update(value), corrupt);
      await page.waitForFunction(() => window.statuses.at(-1).state === "failed", null, { timeout: 5000 });
      assert.equal(await page.locator("#left .fallback").isVisible(), true, "decode error did not restore PNG");
      const mismatched = videoSnapshot(raw); mismatched.videoUrls.streamId = randomUUID();
      await page.evaluate(value => window.player.update(value), mismatched);
      assert.match(await page.evaluate(() => window.statuses.at(-1).message), /binding does not match/u);
      const crossOrigin = videoSnapshot(raw); crossOrigin.videoUrls.initUrl = "https://invalid.example/init.mp4";
      await page.evaluate(value => window.player.update(value), crossOrigin);
      assert.match(await page.evaluate(() => window.statuses.at(-1).message), /outside the current service/u);
      await page.evaluate(() => { window.player.unregisterSurface("right"); window.player.destroy(); });
      assert.equal(await page.locator("video").count(), 0);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
});

test("geometry-only receipts paint the first moving-camera fragment and replace or withhold crops authoritatively", {
  skip: !enabled ? "run with MOUSECAT_BROWSER_TEST=1" : !fixtureDirectory ? "set MOUSECAT_NATIVE_VIDEO_FIXTURE to an isolated native init/fragments proof" : false,
}, async t => {
  const raw = JSON.parse(await readFile(join(fixtureDirectory, "latest-video.json"), "utf8"));
  const server = await fixtureServer(t, resolve(fixtureDirectory)), browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
  t.after(() => browser.close()); const errors = [];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 950 } }), page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(server.url); await page.waitForFunction(() => window.modulesReady);
      const popup = page.waitForEvent("popup");
      await page.evaluate(() => {
        window.detached = window.open("about:blank", "moving-camera-window", "width=450,height=450,resizable=yes");
        const style = window.detached.document.createElement("style"); style.textContent = "body{margin:0}figure{margin:0;position:relative;width:100%}canvas,img{width:100%;height:auto}canvas{position:absolute;inset:0}[hidden]{display:none!important}";
        window.detached.document.head.append(style); window.detached.document.body.append(window.rightCard);
      });
      const child = await popup; child.on("pageerror", error => errors.push(error.message)); await child.setViewportSize({ width: Math.min(width, 600), height: 500 });
      const snapshot = videoSnapshot(raw), crops = [{ id: "left", slot: 0, left: 0, top: 0, width: 160, height: 180 }, { id: "right", slot: 1, left: 160, top: 0, width: 160, height: 180 }];
      const segments = snapshot.view.video.segments;
      for (const segment of segments) { segment.sites = []; segment.crops = structuredClone(crops); }
      segments[1].crops[0].left = 160; segments[1].crops[1].left = 0;
      segments[2].crops = [];
      delete segments[3].crops;
      for (const crop of segments[5].crops) crop.width = snapshot.view.video.width + 1;
      const append = async count => {
        const next = structuredClone(snapshot); next.view.video.state = count === segments.length ? "ended" : "running";
        next.view.video.segments = structuredClone(segments.slice(0, count));
        await page.evaluate(value => window.player.update(value), next);
      };
      await append(1);
      await page.waitForFunction(() => window.frames.length >= 4);
      assert.equal(await page.locator("#left canvas").isVisible(), true, "first fragment required a historical stable pose to paint");
      assert.equal(await child.locator("#right canvas").isVisible(), true, "first geometry-only fragment omitted the adopted canvas");
      assert.equal(await page.locator("#left .overlay").isVisible(), false); assert.equal(await child.locator("#right .overlay").isVisible(), false);
      const first = await page.evaluate(() => ({ left: window.presents.left.at(-1), right: window.presents.right.at(-1), stats: window.player.stats() }));
      assert.equal(first.left.sequence, segments[0].sequence); assert.equal(first.right.sequence, segments[0].sequence);
      assert.equal(first.left.mediaTime, first.right.mediaTime); assert.equal(first.left.site, null); assert.equal(first.right.site, null);
      assert.equal(first.left.alignment, "unknown"); assert.equal(first.stats.decoderCount, 1); assert.equal(first.stats.callbackErrors, 0);
      await append(2);
      await page.waitForFunction(sequence => window.presents.left.at(-1)?.sequence === sequence, segments[1].sequence);
      const changed = await page.evaluate(() => ({ left: window.presents.left.at(-1), right: window.presents.right.at(-1) }));
      assert.equal(changed.left.crop.left, 160); assert.equal(changed.right.crop.left, 0, "explicit geometry retained the previous rectangles");
      assert.equal(changed.left.site, null); assert.equal(changed.left.alignment, "unknown");
      await append(4);
      await page.waitForFunction(() => !window.player.stats().ready);
      // The fragment end includes dropped-frame time; require playback within
      // the legacy interval instead of assuming a sample at its final boundary.
      await page.waitForFunction(start => document.querySelector("video").currentTime >= start, (segments[3].ptsStartMs + 30) / 1000);
      assert.equal(await page.locator("#left .fallback").isVisible(), true); assert.equal(await child.locator("#right .fallback").isVisible(), true);
      assert.equal(await page.locator("#left canvas").isVisible(), false, "withheld geometry reused a prior crop");
      assert.equal(await child.locator("#right canvas").isVisible(), false, "legacy mixed interval resurrected explicitly withdrawn geometry");
      await append(5);
      await page.waitForFunction(sequence => window.presents.left.at(-1)?.sequence === sequence, segments[4].sequence);
      assert.equal(await page.locator("#left canvas").isVisible(), true);
      await append(6);
      await page.waitForFunction(() => !window.player.stats().ready);
      assert.equal(await page.locator("#left .fallback").isVisible(), true, "invalid geometry retained the previous canvas crop");
      assert.equal(await child.locator("#right canvas").isVisible(), false);
      await append(segments.length);
      await page.waitForFunction(sequence => window.presents.right.at(-1)?.sequence === sequence, segments.at(-1).sequence);
      const receipt = await page.evaluate(() => ({ frames: window.frames, presents: window.presents, stats: window.player.stats() }));
      assert.equal(receipt.stats.decoderCount, 1); assert.equal(receipt.stats.callbackErrors, 0); assert.ok(receipt.stats.retainedSegments <= 8);
      for (const frame of receipt.frames) { assert.equal(frame.surfaces, 2); assert.equal(frame.alignment, "unknown"); assert.deepEqual(frame.sinks, frame.pixels); }
      for (const key of ["left", "right"]) assert.ok(receipt.presents[key].filter(value => value.ready).every(value => value.site === null && value.alignment === "unknown"));
      assert.equal(await page.locator("#left .overlay").isVisible(), false); assert.equal(await child.locator("#right .overlay").isVisible(), false);
      await page.evaluate(() => { document.querySelector("#surfaces").append(window.rightCard); window.detached.close(); window.player.destroy(); });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
});
