import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { startOperatorServer } from "../src/operator/server.mjs";

const source = readFileSync(new URL("../src/operator/public/appearance.js", import.meta.url), "utf8");
function client(saved, blocked = false) {
  const handlers = {};
  const inputs = ["manuscript", "bw", "light"].map(value => ({ value, checked: false,
    addEventListener(type, listener) { this[type] = listener; } }));
  const root = { dataset: {} }, status = { textContent: "" };
  const controls = new Map([['#appearance-status', status]]);
  for (const id of ['#settings-dialog', '#settings-toggle', '#settings-close']) {
    controls.set(id, { addEventListener(type, fn) { this[type] = fn; },
      showModal() { this.open = true; }, close() { this.open = false; }, focus() {} });
  }
  const writes = [];
  vm.runInNewContext(source, {
    document: { documentElement: root, querySelector: id => controls.get(id),
      querySelectorAll: () => inputs, addEventListener: (type, fn) => { handlers[type] = fn; } },
    window: { addEventListener: (type, fn) => { handlers[type] = fn; } },
    localStorage: { getItem() { if (blocked) throw Error('blocked'); return saved; },
      setItem(key, value) { if (blocked) throw Error('blocked'); writes.push([key, value]); } }
  });
  return { root, status, handlers, inputs, writes };
}

test("appearance applies the saved scheme before rendering and bounds unsupported preferences", () => {
  for (const [value, expected] of [[null, 'manuscript'], ['unknown', 'manuscript'], ['bw', 'bw'], ['light', 'light']]) {
    const app = client(value);
    assert.equal(app.root.dataset.theme, expected);
    assert.deepEqual(app.writes, []);
    app.handlers.DOMContentLoaded();
    assert.equal(app.inputs.find(input => input.checked).value, expected);
  }
});

test("changing appearance writes only the preference and cross-tab changes update controls", () => {
  const app = client(null); app.handlers.DOMContentLoaded();
  const bw = app.inputs.find(input => input.value === 'bw'); bw.checked = true; bw.change();
  assert.equal(app.root.dataset.theme, 'bw');
  assert.deepEqual(app.writes, [['mousecat.appearance.v1', 'bw']]);
  app.handlers.storage({ key: 'mousecat.appearance.v1', newValue: 'light' });
  assert.equal(app.root.dataset.theme, 'light');
  assert.equal(app.inputs.find(input => input.checked).value, 'light');
  assert.equal(app.writes.length, 1);
  app.handlers.storage({ key: 'other', newValue: 'bw' });
  assert.equal(app.root.dataset.theme, 'light');
});

test("blocked preference storage retains a usable dark scheme and reports unsaved changes", () => {
  const app = client(null, true); app.handlers.DOMContentLoaded();
  assert.equal(app.root.dataset.theme, 'manuscript');
  const bw = app.inputs.find(input => input.value === 'bw'); bw.checked = true; bw.change();
  assert.equal(app.root.dataset.theme, 'bw');
  assert.match(app.status.textContent, /could not save/);
});

test("appearance assets are served under the shared local interface", async () => {
  const app = await startOperatorServer({ port: 0 });
  try {
    for (const path of ['/appearance.js', '/appearance.css']) {
      const response = await fetch(app.url + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    }
  } finally { await app.close(); }
});
