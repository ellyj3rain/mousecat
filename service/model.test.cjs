/* ============================================================================
   Tests for engine/model.js — the data-interpretation layer EVERY surface renders
   from (health rollup, safety meter, timeline, attention, freshness). Also locks
   the DR-002 require()/import contract (M4) and the honesty invariant: every
   reconstructed timeline point is labeled, real anchors are not. Run: node service/model.test.cjs
   ============================================================================ */
"use strict";
// Node/ESM consumers go through model.mjs (the ESM entry). model.js is the
// browser-classic half — IIFE + globalThis only, no `export` — so app/index.html
// can load it as a plain <script> without a SyntaxError. require(esm) on .mjs (Node 24).
const NS = require("../engine/model.mjs");
const M = NS.default || NS;

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  PASS  " + l); } else { fail++; console.log("  FAIL  " + l); } };

// --- M4: the bridge contract (require returns the real API) ---
ok(typeof NS.buildTimelineEvents === "function" && typeof NS.rollupHealth === "function", "require('engine/model.mjs') exposes named API (DR-002 bridge)");
ok(M && typeof M.rollupHealth === "function", "default export is the MCModel object");

const now = new Date("2026-06-16T12:00:00Z").getTime();
const doc = { generatedAt: new Date(now).toISOString(), projects: [], services: [], secrets: [], families: [], governance: {} };
const mk = (o) => Object.assign({ id: "x", path: "/x", isRepo: true, branch: "main", dirty: 0, ahead: 0, behind: 0, lastCommit: "abc msg", remotes: ["origin"], remoteStanding: "configured-unverified", lossRisk: "none", drift: null }, o);

// --- rollupHealth (loss-risk first + escalations) ---
ok(M.rollupHealth(mk({ lossRisk: "zero-commit", dirty: 3 }), doc).health === "risk", "rollupHealth: zero-commit => risk");
ok(M.rollupHealth(mk({ lossRisk: "dirty-heavy", dirty: 30 }), doc).health === "risk", "rollupHealth: dirty-heavy => risk");
ok(M.rollupHealth(mk({ lossRisk: "no-remote", remotes: [] }), doc).health === "attention", "rollupHealth: no-remote => attention");
ok(M.rollupHealth(mk({ lossRisk: "none" }), doc).health === "ok", "rollupHealth: none => ok");
ok(M.rollupHealth(mk({ isRepo: false, lossRisk: "not-git" }), doc).health === "neutral", "rollupHealth: not-git => neutral");
ok(M.rollupHealth(mk({ lossRisk: "none", drift: { inSync: false } }), doc).health === "attention", "rollupHealth: drift escalates ok->attention");
const docCrit = Object.assign({}, doc, { secrets: [{ present: true, severity: "critical" }] });
ok(M.rollupHealth(mk({ lossRisk: "none" }), docCrit).health === "risk", "rollupHealth: present critical secret => risk");

// --- safetyMeter ---
const byKey = (sm) => Object.fromEntries(sm.map((s) => [s.key, s]));
const smZero = byKey(M.safetyMeter(mk({ lossRisk: "zero-commit", dirty: 5 })));
ok(smZero.saved.level === 0, "safetyMeter: zero-commit saved=0");
ok(smZero.tracked.level === 1, "safetyMeter: repo tracked=1");
ok(smZero.backed.level === 1 && smZero.backed.label === "Remote" && /not verified/i.test(smZero.backed.plain), "safetyMeter: remote configuration is distinct from verified backup");
ok(byKey(M.safetyMeter(mk({ lossRisk: "none", dirty: 0 }))).saved.level === 1, "safetyMeter: clean saved=1");
ok(byKey(M.safetyMeter(mk({ isRepo: false, lossRisk: "not-git" }))).tracked.level === 0, "safetyMeter: not-git tracked=0");

// --- attentionSignals (risk-first) ---
const dAtt = Object.assign({}, doc, { projects: [mk({ id: "a", lossRisk: "no-remote", remotes: [] }), mk({ id: "b", lossRisk: "zero-commit", dirty: 2 })] });
const sig = M.attentionSignals(dAtt);
ok(sig.length === 2 && sig[0].health === "risk", "attentionSignals: risk sorted before attention");

// --- freshness ---
ok(M.freshness({ observedAt: new Date(now - 5000).toISOString(), ttlSeconds: 20 }, now).stale === false, "freshness: within ttl => not stale");
ok(M.freshness({ observedAt: new Date(now - 60000).toISOString(), ttlSeconds: 20 }, now).stale === true, "freshness: past ttl => stale");
ok(M.freshness(null, now).stale === null, "freshness: no family => null");

// --- HONESTY: timeline synthetic labeling (never fabricate history) ---
const p = mk({ id: "proj", lossRisk: "none", lastCommit: "deadbeef Initial commit", drift: { versionFile: "0.3.0", inSync: true } });
const tl = M.buildTimelineEvents(p, Object.assign({}, doc, { governance: { latestBatch: "[A1]", latestDR: "DR-001" } }));
ok(tl.events.length > 0, "timeline: builds events");
const synth = tl.events.filter((e) => e.synthetic === true);
const real = tl.events.filter((e) => e.synthetic === false);
ok(synth.length > 0 && real.length > 0, "timeline: has both real anchors and synthetic points");
ok(synth.every((e) => /reconstructed|inferred|not a recorded/i.test(e.summary + " " + JSON.stringify(e.raw))), "HONESTY: every synthetic point is labeled reconstructed/inferred/NOT-recorded");
ok(real.every((e) => !/reconstructed|inferred/i.test(e.summary)), "HONESTY: real anchors are NOT labeled reconstructed");
const tlZero = M.buildTimelineEvents(mk({ lossRisk: "zero-commit", lastCommit: null, drift: null }), doc);
ok(tlZero.empty === true && tlZero.emptyKind === "zero-commit", "timeline: zero-commit => honest empty story, no synthetic points");

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
