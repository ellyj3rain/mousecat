// A feed changes its document, not its observation or command owner. The live
// tile, its event listeners and its decode/counter remain in the originating view.
export function createNativeFeedWindows({ returned, changed, failed }) {
  const windows = new Map();
  let closing = false;
  function release(key, restore = true) {
    const entry = windows.get(key);
    if (!entry) return;
    windows.delete(key); clearInterval(entry.timer);
    try { entry.window.removeEventListener("pagehide", entry.leaving); } catch { /* Already retired. */ }
    if (restore) returned(entry.card, key);
    try { if (!entry.window.closed) entry.window.close(); } catch { /* The host may already have closed it. */ }
    if (!closing) changed();
  }
  function refresh(facts) {
    for (const [key, entry] of windows) {
      if (entry.window.closed) { release(key); continue; }
      if (!entry.root) continue;
      entry.root.style.setProperty("--native-info-opacity", facts.opacity);
      entry.state.textContent = facts.state;
      entry.state.dataset.state = facts.connectionState;
      entry.clock.textContent = facts.clock;
      entry.rate.textContent = facts.rate;
      entry.command.textContent = facts.command;
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
      const popup = window.open(url.href, `mousecat-native-${viewId}-${bindingId}-${key}`, "popup,width=960,height=640");
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
              root.append(card); card.hidden = false;
              entry.root = root;
              entry.leaving = () => release(key);
              popup.addEventListener("pagehide", entry.leaving, { once: true });
              entry.state = popup.document.querySelector("[data-native-state]");
              entry.clock = popup.document.querySelector("[data-native-clock]");
              entry.rate = popup.document.querySelector("[data-native-rate]");
              entry.command = popup.document.querySelector("[data-native-command]");
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
