"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createWorkspaceStore } = require("../engine/workspace-client.mjs");
function clock() {
  let at = 100000, id = 0; const timers = new Map();
  return { now: () => at,
    setTimer(fn, delay) { const key = ++id; timers.set(key, { fn, at: at + delay }); return key; },
    clearTimer(key) { timers.delete(key); },
    advance(ms) { at += ms; for (const [key, timer] of [...timers]) if (timer.at <= at) { timers.delete(key); timer.fn(); } },
  };
}
const doc = clock => ({ schema: "mc.workspace/1", observedAt: new Date(clock.now()).toISOString(), objects: [] });

test("a hung IPC producer cannot retain live evidence; deadline releases the next passive read", async () => {
  const time = clock(); let mode = "good", reads = 0, updates = 0;
  const store = createWorkspaceStore({ ...time, ttlMs: 100, timeoutMs: 200, read: () => { reads++; return mode === "hung" ? new Promise(() => {}) : doc(time); } });
  store.subscribe(() => updates++);
  await store.refresh(); assert.equal(store.getSnapshot().status, "live");
  mode = "hung"; const request = store.refresh();
  await Promise.resolve();
  time.advance(101);
  assert.equal(store.getSnapshot().status, "unavailable");
  assert.equal(store.getSnapshot().data.observedAt, new Date(100000).toISOString());
  time.advance(100); await request;
  mode = "good"; await store.refresh();
  assert.equal(store.getSnapshot().status, "live");
  assert.equal(reads, 3); assert.ok(updates >= 3);
});

test("offline selection wins over an outstanding read and late producer completion", async () => {
  const time = clock(); let forced = false, resolve;
  const store = createWorkspaceStore({ ...time, offline: () => forced, read: () => new Promise(done => { resolve = done; }) });
  const request = store.refresh(); await Promise.resolve();
  forced = true; await store.refresh();
  resolve(doc(time)); await request;
  assert.deepEqual(store.getSnapshot(), { data: null, status: "offline" });
});

test("a response already outside its source lifetime is never admitted live", async () => {
  const time = clock();
  const store = createWorkspaceStore({ ...time, ttlMs: 100, read: () => ({ ...doc(time), observedAt: new Date(time.now() - 101).toISOString() }) });
  await store.refresh(); assert.equal(store.getSnapshot().status, "unavailable");
  assert.equal(store.getSnapshot().data, null);
});
