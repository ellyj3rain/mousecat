// A feed changes its document, not its observation or command owner. The live
// tile, its event listeners and its decode/counter remain in the originating view.
export function createNativeFeedWindows({ returned, changed, failed, requestTime, setFraming }) {
  const windows = new Map();
  let closing = false;
  function viewFraming(root, shape, framing) {
    root.dataset.viewShape = shape;
    if (shape === "frame") root.style.removeProperty("--native-view-aspect");
    else root.style.setProperty("--native-view-aspect", shape === "square" ? "1 / 1" : "16 / 9");
    root.style.setProperty("--native-frame-fit", framing === "fit" ? "contain" : "cover");
  }
  function node(doc, tag, text, parent, className) {
    const value = doc.createElement(tag);
    if (text !== undefined) value.textContent = text;
    if (className) value.className = className;
    parent?.append(value); return value;
  }
  function windowControls(entry, doc) {
    const toolbar = node(doc, "div", undefined, null, "native-window-toolbar");
    entry.root.before(toolbar);
    entry.playback = node(doc, "div", undefined, toolbar, "native-window-playback");
    entry.pause = node(doc, "button", "Pause", entry.playback, "button secondary-button"); entry.pause.type = "button"; entry.pause.disabled = true;
    entry.pause.addEventListener("click", () => void requestTime("pause"));
    entry.speed = node(doc, "select", undefined, entry.playback); entry.speed.disabled = true;
    entry.speed.setAttribute("aria-label", "Playback speed"); entry.speed.title = "Simulation speed (all views)";
    const placeholder = node(doc, "option", "Speed", entry.speed); placeholder.value = ""; placeholder.disabled = true;
    for (const [value, label] of [[1, "Normal"], [2, "Fast"], [3, "Fastest"]]) {
      const option = node(doc, "option", label, entry.speed); option.value = String(value);
    }
    entry.speed.value = "";
    entry.speed.addEventListener("change", () => {
      const value = Number(entry.speed.value); entry.speed.value = "";
      void requestTime("speed", { value });
    });
    const settings = node(doc, "details", undefined, toolbar, "native-window-settings");
    node(doc, "summary", "View settings", settings);
    const presentation = node(doc, "div", undefined, settings, "native-window-presentation");
    node(doc, "small", "Applies to all views", presentation);
    for (const [key, label, choices] of [["shape", "Shape", [["wide", "Wide"], ["square", "Square"], ["frame", "Frame"]]],
      ["framing", "Framing", [["fill", "Fill view"], ["fit", "Fit complete frame"]]]]) {
      const field = node(doc, "label", undefined, presentation); node(doc, "span", label, field);
      entry[key] = node(doc, "select", undefined, field); entry[key].setAttribute("aria-label", key === "shape" ? "View shape" : "Image framing");
      for (const [value, name] of choices) { const option = node(doc, "option", name, entry[key]); option.value = value; }
      entry[key].addEventListener("change", () => setFraming({ shape: entry.shape.value, framing: entry.framing.value }));
    }
  }
  function release(key, restore = true) {
    const entry = windows.get(key);
    if (!entry) return;
    windows.delete(key); clearInterval(entry.timer);
    entry.resize?.disconnect();
    if (entry.layoutFrame) entry.window.cancelAnimationFrame(entry.layoutFrame);
    entry.card.style.removeProperty("width");
    try { entry.window.removeEventListener("pagehide", entry.leaving); } catch { /* Already retired. */ }
    if (restore) returned(entry.card, key);
    try { if (!entry.window.closed) entry.window.close(); } catch { /* The host may already have closed it. */ }
    if (!closing) changed();
  }
  function refresh(facts) {
    for (const [key, entry] of windows) {
      if (entry.window.closed) { release(key); continue; }
      if (!entry.root) continue;
      viewFraming(entry.root, facts.shape, facts.framing);
      if (entry.shape.value !== facts.shape) entry.shape.value = facts.shape;
      if (entry.framing.value !== facts.framing) entry.framing.value = facts.framing;
      entry.playback.hidden = facts.playback.state === "ended";
      entry.pause.textContent = facts.playback.state === "paused" ? "Resume" : "Pause";
      entry.pause.title = `${entry.pause.textContent} simulation (all views)`;
      entry.pause.disabled = entry.speed.disabled = !facts.playback.commandable;
      entry.root.style.setProperty("--native-info-opacity", facts.opacity);
      entry.state.textContent = facts.state;
      entry.state.dataset.state = facts.connectionState;
      entry.clock.textContent = facts.clock;
      entry.rate.textContent = facts.rate;
      entry.command.textContent = facts.command;
      const label = entry.card.querySelector(".native-panel-meta strong")?.textContent;
      if (label) entry.window.document.title = `${label} · Mousecat`;
      entry.fit?.();
    }
  }
  function stillAttached(entry, url) {
    try { return !entry.window.closed && entry.window.location.href === url.href
      && entry.root.isConnected && entry.card.ownerDocument === entry.window.document; }
    catch { return false; }
  }
  return {
    get size() { return windows.size; },
    has(key) { return windows.has(key); },
    focus(key) { try { windows.get(key)?.window.focus(); } catch { /* Retirement is reconciled by the owner. */ } },
    open(key, { card, viewId, bindingId, label, shape, framing }) {
      if (windows.has(key)) { this.focus(key); return; }
      if (windows.size >= 16) { failed("Close or redock a feed window before opening another."); return; }
      const url = new URL("/native-feed.html", location.origin);
      url.search = new URLSearchParams({ view: viewId, binding: bindingId, screen: key });
      const aspect = shape === "wide" ? 16 / 9 : shape === "square" ? 1 : Number(card.dataset.frameWidth) / Number(card.dataset.frameHeight) || 16 / 9;
      const height = Math.max(320, Math.min(screen.availHeight - 100, 960 / aspect + 110));
      const width = Math.max(320, Math.min(960, screen.availWidth - 80, (height - 110) * aspect));
      const popup = window.open(url.href, `mousecat-native-${viewId}-${bindingId}-${key}`, `popup,resizable=yes,width=${Math.round(width)},height=${Math.round(height)}`);
      if (!popup) { failed("The feed window could not open. Allow Mousecat pop-ups and try again."); return; }
      const entry = { window: popup, card, bindingId, started: performance.now(), root: null };
      windows.set(key, entry);
      const ready = () => {
        if (windows.get(key) !== entry) return;
        if (popup.closed) { release(key); return; }
        try {
          if (popup.location.href !== url.href) {
            if (popup.location.href !== "about:blank") { release(key); return; }
          } else {
            const root = popup.document.querySelector("[data-native-feed-root]");
            if (root) {
              clearInterval(entry.timer);
              popup.document.title = `${label} · Mousecat`;
              viewFraming(root, shape, framing);
              root.append(card); card.hidden = false;
              entry.root = root;
              windowControls(entry, popup.document);
              entry.leaving = () => release(key);
              popup.addEventListener("pagehide", entry.leaving, { once: true });
              entry.state = popup.document.querySelector("[data-native-state]");
              entry.clock = popup.document.querySelector("[data-native-clock]");
              entry.rate = popup.document.querySelector("[data-native-rate]");
              entry.command = popup.document.querySelector("[data-native-command]");
              const details = popup.document.createElement("details");
              details.className = "native-detached-details";
              const summary = popup.document.createElement("summary"); summary.textContent = "Session details";
              details.append(summary, entry.clock, entry.rate);
              entry.command.before(details);
              entry.fit = () => {
                if (entry.layoutFrame || windows.get(key) !== entry) return;
                entry.layoutFrame = popup.requestAnimationFrame(() => {
                  entry.layoutFrame = null;
                  if (!root.isConnected) return;
                  const media = card.querySelector(".native-panel-media, .native-viewport");
                  const ratio = root.dataset.viewShape === "wide" ? 16 / 9 : root.dataset.viewShape === "square" ? 1
                    : Number(card.dataset.frameWidth) / Number(card.dataset.frameHeight) || 16 / 9;
                  // Fit the complete frame into the window's remaining space.
                  // The media keeps the accepted image's ratio at every size.
                  for (let pass = 0; pass < 2; pass += 1) {
                    const chrome = card.getBoundingClientRect().height - media.getBoundingClientRect().height;
                    const fitted = Math.max(1, Math.min(root.clientWidth, (root.clientHeight - chrome) * ratio + 2));
                    if (Math.abs(card.getBoundingClientRect().width - fitted) > 0.5) card.style.width = `${fitted}px`;
                  }
                });
              };
              entry.resize = new popup.ResizeObserver(entry.fit);
              entry.resize.observe(root); entry.resize.observe(card.querySelector(".native-panel-caption"));
              entry.fit();
              popup.document.querySelector("[data-native-waiting]").remove();
              // Reloading or leaving the child document retires that presentation,
              // just like closing it. Its original live tile returns to the owner.
              entry.timer = setInterval(() => { if (!stillAttached(entry, url)) release(key); }, 250);
              changed(); return;
            }
          }
        } catch { /* Await the same-origin child while its native WebView initializes. */ }
        if (performance.now() - entry.started >= 10000) {
          release(key); failed("The feed window did not become available; its tile remains in the observatory.");
        }
      };
      entry.timer = setInterval(ready, 50); ready(); changed();
    },
    release, refresh,
    reconcile(bindingId, keys) {
      for (const [key, entry] of windows) if (entry.bindingId !== bindingId || !keys.has(key)) release(key);
    },
    closeAll() {
      closing = true;
      for (const key of [...windows.keys()]) release(key);
      closing = false;
    },
  };
}
