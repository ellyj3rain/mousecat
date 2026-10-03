// A feed changes its document, not its observation or command owner. The live
// tile, its event listeners and its decode/counter remain in the originating view.
export function createNativeFeedWindows({ returned, changed, failed, requestTime }) {
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
    entry.document = doc;
    entry.tools = entry.card.querySelector(".native-tool-options");
    entry.menu = entry.tools.parentElement; entry.menuWasOpen = entry.menu.open; entry.menu.open = false;
    entry.tools.classList.add("native-window-options");
    entry.caption = entry.card.querySelector(".native-panel-caption");
    entry.meta = entry.caption.querySelector(".native-panel-meta"); entry.tools.prepend(entry.meta);
    entry.follow = entry.caption.querySelector('.native-panel-tools > button[aria-label^="Follow "]');
    if (entry.follow) { entry.followHome = entry.follow.parentElement; entry.tools.prepend(entry.follow); }
    entry.playback = node(doc, "div", undefined, entry.tools, "native-window-playback");
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
    entry.settings = node(doc, "details", undefined, entry.tools, "native-window-settings");
    node(doc, "summary", "View settings", entry.settings);
    const presentation = node(doc, "div", undefined, entry.settings, "native-window-presentation");
    node(doc, "small", "This window", presentation);
    for (const [key, label, choices] of [["shape", "Shape", [["wide", "Wide"], ["square", "Square"], ["frame", "Frame"]]],
      ["framing", "Framing", [["fill", "Fill view"], ["fit", "Fit complete frame"]]]]) {
      const field = node(doc, "label", undefined, presentation); node(doc, "span", label, field);
      entry[key] = node(doc, "select", undefined, field); entry[key].setAttribute("aria-label", key === "shape" ? "View shape" : "Image framing");
      for (const [value, name] of choices) { const option = node(doc, "option", name, entry[key]); option.value = value; }
      entry[key].value = key === "shape" ? "frame" : "fit";
      entry[key].addEventListener("change", () => {
        viewFraming(entry.root, entry.shape.value, entry.framing.value); entry.fit?.();
      });
    }
    entry.dismiss = event => {
      if (event.type === "keydown" && event.key === "Escape" && entry.menu.open) {
        event.preventDefault(); entry.menu.open = false; entry.menu.querySelector("summary").focus();
      } else if (event.type === "pointerdown" && !entry.menu.contains(event.target)) entry.menu.open = false;
    };
    doc.addEventListener("keydown", entry.dismiss); doc.addEventListener("pointerdown", entry.dismiss);
  }
  function release(key, restore = true) {
    const entry = windows.get(key);
    if (!entry) return;
    windows.delete(key); clearInterval(entry.timer);
    entry.resize?.disconnect();
    entry.document?.removeEventListener("keydown", entry.dismiss); entry.document?.removeEventListener("pointerdown", entry.dismiss);
    entry.playback?.remove(); entry.settings?.remove(); entry.details?.remove();
    entry.caption?.prepend(entry.meta);
    if (entry.followHome) entry.followHome.insertBefore(entry.follow, entry.menu);
    if (entry.menu) { entry.menu.open = entry.menuWasOpen; entry.tools.classList.remove("native-window-options"); }
    entry.card.style.removeProperty("width");
    entry.media?.style.removeProperty("width");
    try { entry.window.removeEventListener("pagehide", entry.leaving); } catch { /* Already retired. */ }
    if (restore) returned(entry.card, key);
    try { if (!entry.window.closed) entry.window.close(); } catch { /* The host may already have closed it. */ }
    if (!closing) changed();
  }
  function refresh(facts) {
    for (const [key, entry] of windows) {
      if (entry.window.closed) { release(key); continue; }
      if (!entry.root) continue;
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
    open(key, { card, viewId, bindingId, label }) {
      if (windows.has(key)) { this.focus(key); return; }
      if (windows.size >= 16) { failed("Close or redock a feed window before opening another."); return; }
      const url = new URL("/native-feed.html", location.origin);
      url.search = new URLSearchParams({ view: viewId, binding: bindingId, screen: key });
      const aspect = Number(card.dataset.frameWidth) / Number(card.dataset.frameHeight) || 16 / 9;
      const chrome = 48;
      const height = Math.max(320, Math.min(screen.availHeight - 100, 960 / aspect + chrome));
      const width = Math.max(320, Math.min(960, screen.availWidth - 80, (height - chrome) * aspect));
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
              viewFraming(root, "frame", "fit");
              root.append(card); card.hidden = false;
              entry.root = root;
              windowControls(entry, popup.document);
              entry.leaving = () => release(key);
              popup.addEventListener("pagehide", entry.leaving, { once: true });
              entry.state = popup.document.querySelector("[data-native-state]");
              entry.clock = popup.document.querySelector("[data-native-clock]");
              entry.rate = popup.document.querySelector("[data-native-rate]");
              entry.command = popup.document.querySelector("[data-native-command]");
              entry.details = node(popup.document, "details", undefined, entry.tools, "native-detached-details");
              node(popup.document, "summary", "Session details", entry.details);
              entry.details.append(entry.clock, entry.rate, entry.command);
              entry.media = card.querySelector(".native-panel-media, .native-viewport");
              entry.fit = () => {
                if (windows.get(key) !== entry || !root.isConnected) return;
                const ratio = root.dataset.viewShape === "wide" ? 16 / 9 : root.dataset.viewShape === "square" ? 1
                  : Number(card.dataset.frameWidth) / Number(card.dataset.frameHeight) || 16 / 9;
                // Tools and source details overlay the same view; they never
                // subtract from the complete frame's available bounds.
                const fitted = Math.max(1, Math.min(root.clientWidth, root.clientHeight * ratio));
                if (Math.abs(parseFloat(entry.media.style.width) - fitted) > 0.5 || !entry.media.style.width) entry.media.style.width = `${fitted}px`;
              };
              entry.resize = new popup.ResizeObserver(entry.fit);
              entry.resize.observe(root);
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
