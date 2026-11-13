"use strict";
const EVENTS = new Set(["issue", "approve", "refuse", "stale", "expire", "begin", "succeed", "fail"]);
const TRANSITIONS = Object.freeze({
  unissued: Object.freeze({ issue: "issued" }),
  issued: Object.freeze({ approve: "approved", refuse: "refused", stale: "stale", expire: "expired" }),
  approved: Object.freeze({ begin: "executing", refuse: "refused", stale: "stale", expire: "expired" }),
  executing: Object.freeze({ succeed: "applied", fail: "failed" }),
});
async function reducePlanStanding(events) {
  if (!Array.isArray(events) || events.length > 8 || !events.every(event => typeof event === "string" && EVENTS.has(event))) {
    return { ok: false, standing: "unknown", evaluation: "unavailable", reason: "invalid-events" };
  }
  let standing = "unissued";
  for (const event of events) standing = TRANSITIONS[standing]?.[event] ?? "unknown";
  return { ok: true, standing, evaluation: "available" };
}
module.exports = { reducePlanStanding };
