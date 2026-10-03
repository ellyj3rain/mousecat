const MAX_SEGMENTS = 8;
const MAX_SURFACES = 16;
const MAX_BYTES = 32 * 1024 * 1024;

// One decoder owns the composite. Surfaces are presentation sinks, including
// canvases adopted into another same-origin document; they never own playback.
export function createNativeVideoPlayer({ onStatus, onFrame } = {}) {
  const video = document.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("aria-hidden", "true");
  video.dataset.nativeVideoDecoder = "";
  Object.assign(video.style, { position: "fixed", left: "-4px", top: "-4px", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  document.body.append(video);
  const composite = document.createElement("canvas"), context = composite.getContext("2d", { alpha: false });
  const surfaces = new Map(), geometry = new Map(), records = new Map();
  let generation = 0, destroyed = false, identity = "", streamId = null;
  let descriptor = null, urls = null, media = null, buffer = null, objectUrl = null, abort = null;
  let pumping = false, initialized = false, lastSequence = null, frameRequest = null, ready = false, lastStatus = "";
  let decodedFrames = 0, paintedSurfaces = 0, callbackErrors = 0, peakFetches = 0, activeFetches = 0, appendedSegments = 0;

  function emit(callback, value) {
    try { callback?.(value); } catch { callbackErrors += 1; }
  }
  function status(state, message, isReady = ready) {
    ready = isReady;
    const value = { state, message: String(message || ""), ready, streamId };
    const key = JSON.stringify(value);
    if (lastStatus !== key) { lastStatus = key; emit(onStatus, value); }
  }
  function clearSurfaces(state, message) {
    for (const surface of surfaces.values()) {
      surface.context.clearRect(0, 0, surface.canvas.width, surface.canvas.height); surface.ready = false;
      emit(surface.onPresent, { ready: false, state, message, streamId, alignment: "unknown", site: null, crop: null });
    }
  }
  function dispose() {
    generation += 1;
    abort?.abort(); abort = null;
    if (frameRequest !== null) video.cancelVideoFrameCallback?.(frameRequest);
    frameRequest = null;
    video.pause();
    video.removeAttribute("src"); video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null; media = null; buffer = null; initialized = false; pumping = false; lastSequence = null;
    geometry.clear(); records.clear(); ready = false;
  }
  function fail(message) {
    dispose();
    status("failed", message, false);
    clearSurfaces("failed", message);
  }
  function safeUrl(value) {
    const address = new URL(value, location.href);
    if (address.origin !== location.origin || !/^https?:$/u.test(address.protocol)) throw new Error("Video source is outside the current service.");
    return address.href;
  }
  async function bytes(address, signal) {
    activeFetches += 1; peakFetches = Math.max(peakFetches, activeFetches);
    try {
      const response = await fetch(address, { signal, credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Video source could not be read.");
      if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Video fragment exceeds the playback limit.");
      if (!response.body) {
        const data = await response.arrayBuffer();
        if (data.byteLength > MAX_BYTES) throw new Error("Video fragment exceeds the playback limit.");
        return data;
      }
      const reader = response.body.getReader(), chunks = [];
      let length = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          length += result.value.byteLength;
          if (length > MAX_BYTES) { await reader.cancel(); throw new Error("Video fragment exceeds the playback limit."); }
          chunks.push(result.value);
        }
      } finally { reader.releaseLock(); }
      const joined = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      return joined.buffer;
    } finally { activeFetches -= 1; }
  }
  function operation(action, token) {
    return new Promise((resolve, reject) => {
      const target = buffer;
      const cleanup = () => { target.removeEventListener("updateend", done); target.removeEventListener("error", error); abort?.signal.removeEventListener("abort", cancelled); };
      const done = () => { cleanup(); token === generation ? resolve() : reject(new DOMException("Playback replaced", "AbortError")); };
      const error = () => { cleanup(); reject(new Error("Video fragment could not be decoded.")); };
      const cancelled = () => { cleanup(); reject(new DOMException("Playback replaced", "AbortError")); };
      target.addEventListener("updateend", done, { once: true });
      target.addEventListener("error", error, { once: true });
      abort?.signal.addEventListener("abort", cancelled, { once: true });
      try { action(target); } catch (exception) { cleanup(); reject(exception); }
    });
  }
  function startPlayback(token) {
    if (token !== generation || !video.buffered.length) return;
    const first = video.buffered.start(0);
    if (video.currentTime < first) video.currentTime = first + 0.001;
    if (video.paused && !video.ended) video.play().catch(() => { if (token === generation) fail("Video playback is unavailable; the last image remains available."); });
  }
  function crop(site) {
    if (![site.left, site.top, site.width, site.height].every(Number.isFinite) || site.left < 0 || site.top < 0 || site.width <= 0 || site.height <= 0 || site.left + site.width > descriptor.width || site.top + site.height > descriptor.height) return null;
    return { left: site.left, top: site.top, width: site.width, height: site.height };
  }
  function schedule(token) {
    if (destroyed || token !== generation || frameRequest !== null) return;
    frameRequest = video.requestVideoFrameCallback((_now, metadata) => {
      frameRequest = null;
      if (destroyed || token !== generation) return;
      const time = metadata.mediaTime * 1000;
      const segment = [...records.values()].find(value => time >= value.ptsStartMs - 0.5 && time < value.ptsStartMs + value.durationMs - 0.5);
      if (segment) {
        if (video.videoWidth !== descriptor.width || video.videoHeight !== descriptor.height) { fail("Decoded video dimensions do not match the source."); return; }
        if (composite.width !== descriptor.width || composite.height !== descriptor.height) { composite.width = descriptor.width; composite.height = descriptor.height; }
        try { context.drawImage(video, 0, 0, composite.width, composite.height); }
        catch { fail("Decoded video could not be presented."); return; }
        decodedFrames += 1;
        const pictured = new Map(), currentCrops = new Map(), registeredSites = new Set([...surfaces.values()].map(surface => surface.siteId));
        const authoritative = Object.hasOwn(segment, "crops");
        if (authoritative) for (const id of registeredSites) geometry.delete(id);
        for (const receipt of authoritative ? Array.isArray(segment.crops) ? segment.crops : [] : segment.sites) {
          const bounds = crop(receipt);
          if (bounds && registeredSites.has(receipt.id)) { geometry.set(receipt.id, bounds); currentCrops.set(receipt.id, { ...bounds, slot: receipt.slot }); }
        }
        for (const site of segment.sites) {
          const bounds = currentCrops.get(site.id);
          if (bounds && ["left", "top", "width", "height", "slot"].every(key => bounds[key] === site[key])) pictured.set(site.id, site);
        }
        const facts = { ready: true, streamId, sequence: segment.sequence, mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames,
          capturedAtUnixMs: segment.capturedAtUnixMs, endCapturedAtUnixMs: segment.endCapturedAtUnixMs,
          worldHours: segment.worldHours, endWorldHours: segment.endWorldHours,
          firstFrameSequence: segment.firstFrameSequence, lastFrameSequence: segment.lastFrameSequence, observerSequence: segment.observerSequence };
        let painted = 0, aligned = 0;
        for (const surface of surfaces.values()) {
          const bounds = currentCrops.has(surface.siteId) ? geometry.get(surface.siteId) : !authoritative && segment.sites.length === 0 ? geometry.get(surface.siteId) : null;
          if (!bounds) {
            if (surface.ready) { surface.context.clearRect(0, 0, surface.canvas.width, surface.canvas.height); surface.ready = false; emit(surface.onPresent, { ready: false, streamId, alignment: "unknown", site: null, crop: null }); }
            continue;
          }
          if (surface.canvas.width !== bounds.width || surface.canvas.height !== bounds.height) { surface.canvas.width = bounds.width; surface.canvas.height = bounds.height; }
          surface.context.drawImage(composite, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
          surface.ready = true; painted += 1; paintedSurfaces += 1;
          if (pictured.has(surface.siteId)) aligned += 1;
          emit(surface.onPresent, { ...facts, site: pictured.get(surface.siteId) || null, crop: { ...bounds }, alignment: pictured.has(surface.siteId) ? "verified" : "unknown" });
        }
        if (painted) { status(descriptor.state, descriptor.message, true); emit(onFrame, { ...facts, surfaces: painted, alignment: aligned === painted ? "verified" : "unknown" }); }
        else if (surfaces.size) status(descriptor.state, "Waiting for source screen crops.", false);
      }
      schedule(token);
    });
  }
  async function pump(token) {
    if (pumping || !buffer || token !== generation || destroyed) return;
    pumping = true;
    try {
      if (!initialized) {
        const data = await bytes(safeUrl(urls.initUrl), abort.signal);
        if (token !== generation) return;
        await operation(target => target.appendBuffer(data), token);
        initialized = true;
      }
      while (token === generation) {
        const next = descriptor.segments.find(segment => lastSequence === null || segment.sequence > lastSequence);
        if (!next) break;
        if (lastSequence !== null && next.sequence !== lastSequence + 1) throw new Error("Video fragments are missing; waiting for a new source window.");
        const address = urls.segments.find(segment => segment.sequence === next.sequence)?.url;
        if (!address) break;
        const data = await bytes(safeUrl(address), abort.signal);
        if (token !== generation) return;
        records.set(next.sequence, structuredClone(next));
        await operation(target => target.appendBuffer(data), token);
        lastSequence = next.sequence; appendedSegments += 1;
        startPlayback(token);
        // Retain at most the source's eight-fragment window and one frame's
        // synchronous readback. Remove decoded history before accepting more.
        if (records.size > MAX_SEGMENTS) {
          const oldest = records.values().next().value;
          const boundary = (oldest.ptsStartMs + oldest.durationMs) / 1000;
          if (video.currentTime < boundary) video.currentTime = boundary + 0.001;
          if (buffer.buffered.length && boundary > buffer.buffered.start(0)) await operation(target => target.remove(0, boundary), token);
          records.delete(oldest.sequence);
        }
      }
      if (token === generation && descriptor.state === "ended" && descriptor.segments.at(-1)?.sequence === lastSequence && media.readyState === "open") media.endOfStream();
    } catch (error) {
      if (token === generation && error.name !== "AbortError") fail(error.message || "Video playback failed.");
    } finally { if (token === generation) pumping = false; }
  }
  function begin() {
    const token = generation;
    abort = new AbortController();
    media = new MediaSource();
    objectUrl = URL.createObjectURL(media);
    media.addEventListener("sourceopen", () => {
      if (token !== generation) return;
      try { buffer = media.addSourceBuffer(`${descriptor.mimeType}; codecs="${descriptor.codecs}"`); schedule(token); void pump(token); }
      catch { fail("This browser cannot decode the source video."); }
    }, { once: true });
    video.src = objectUrl;
  }
  const videoError = () => { if (media && !destroyed) fail("Video decoding failed; the last image remains available."); };
  const videoEnded = () => { if (descriptor?.state === "ended") status("ended", descriptor.message, ready); };
  video.addEventListener("error", videoError);
  video.addEventListener("ended", videoEnded);

  return {
    update(snapshot) {
      if (destroyed) return;
      const next = snapshot?.view?.video, nextUrls = snapshot?.videoUrls;
      const binding = snapshot?.binding?.bindingId || "", session = snapshot?.view?.sessionId || "";
      const nextIdentity = next ? JSON.stringify([binding, session, next.streamId, next.init?.sha256, next.codecs, next.width, next.height]) : "";
      if (identity !== nextIdentity) { dispose(); identity = nextIdentity; streamId = next?.streamId || null; clearSurfaces("starting", "Waiting for decoded video."); }
      if (!next || next.schema !== "mousecat.native-video/1") { dispose(); descriptor = null; status("unavailable", "Continuous video is unavailable.", false); clearSurfaces("unavailable", "Continuous video is unavailable."); return; }
      descriptor = { ...next, segments: [...(next.segments || [])].slice(-MAX_SEGMENTS).sort((a, b) => a.sequence - b.sequence) };
      if (next.state === "failed") { fail(next.message || "The source video failed."); return; }
      if (!next.init || !next.codecs) { dispose(); status(next.state, next.message || "Waiting for video.", false); clearSurfaces(next.state, next.message); return; }
      if (!nextUrls || nextUrls.streamId !== next.streamId) { fail("Video source binding does not match this view."); return; }
      urls = { ...nextUrls, segments: [...(nextUrls.segments || [])].slice(-MAX_SEGMENTS) };
      if (!globalThis.MediaSource || !video.requestVideoFrameCallback || !MediaSource.isTypeSupported(`${next.mimeType}; codecs="${next.codecs}"`)) { fail("This browser cannot decode the source video."); return; }
      if (!Number.isFinite(next.width) || !Number.isFinite(next.height) || next.width < 1 || next.height < 1 || next.width * next.height > 33554432) { fail("Video dimensions exceed the playback limit."); return; }
      try { safeUrl(urls.initUrl); } catch (error) { fail(error.message); return; }
      // A new retained window may have advanced beyond a slow reader. Restart at
      // its independently decodable boundary rather than joining missing time.
      if (media && lastSequence !== null && descriptor.segments[0]?.sequence > lastSequence + 1) { dispose(); clearSurfaces("starting", "Waiting for decoded video."); }
      status(next.state, next.message, ready);
      if (!media) begin(); else void pump(generation);
    },
    registerSurface(key, { canvas, siteId, onPresent }) {
      if (destroyed) return;
      if (!surfaces.has(key) && surfaces.size >= MAX_SURFACES) throw new Error("Too many video surfaces.");
      const surfaceContext = canvas?.getContext("2d", { alpha: false });
      if (!surfaceContext) throw new Error("A video surface requires a canvas.");
      const old = surfaces.get(key);
      surfaces.set(key, { canvas, context: surfaceContext, siteId, onPresent, ready: false });
      if (old && old.siteId !== siteId && ![...surfaces.values()].some(surface => surface.siteId === old.siteId)) geometry.delete(old.siteId);
      emit(onPresent, { ready: false, streamId, alignment: "unknown", site: null, crop: null });
    },
    unregisterSurface(key) {
      const old = surfaces.get(key); surfaces.delete(key);
      if (old && ![...surfaces.values()].some(surface => surface.siteId === old.siteId)) geometry.delete(old.siteId);
    },
    stats() { return { streamId, ready, decoderCount: destroyed ? 0 : 1, surfaces: surfaces.size, decodedFrames, paintedSurfaces, appendedSegments,
      retainedSegments: records.size, pendingSegments: descriptor?.segments.filter(segment => lastSequence === null || segment.sequence > lastSequence).length || 0,
      activeFetches, peakFetches, callbackErrors }; },
    destroy() {
      if (destroyed) return;
      destroyed = true; dispose(); clearSurfaces("ended", "Video player closed."); surfaces.clear();
      video.removeEventListener("error", videoError); video.removeEventListener("ended", videoEnded); video.remove(); composite.width = 1; composite.height = 1;
    },
  };
}
