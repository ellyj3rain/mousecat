"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {reducePlanStanding}=require("./plan-standing.cjs");const {observeRemoteEvidence}=require("./remote-standing.cjs");
test("application approval lifecycle retains every selected transition and refuses malformed input",async()=>{
 const cases=[[[],"unissued"],[["issue"],"issued"],[["issue","approve"],"approved"],[["issue","refuse"],"refused"],[["issue","stale"],"stale"],[["issue","expire"],"expired"],[["issue","approve","begin"],"executing"],[["issue","approve","refuse"],"refused"],[["issue","approve","stale"],"stale"],[["issue","approve","expire"],"expired"],[["issue","approve","begin","succeed"],"applied"],[["issue","approve","begin","fail"],"failed"],[["begin"],"unknown"],[["issue","approve","begin","succeed","begin"],"unknown"]];
 for(const [events,expected] of cases)assert.deepEqual(await reducePlanStanding(events),{ok:true,standing:expected,evaluation:"available"});
 for(const value of [null,"issue",["invalid"],Array(9).fill("issue")])assert.equal((await reducePlanStanding(value)).ok,false);
});
test("configured remotes are observations rather than verified backups",async()=>{
 assert.deepEqual(await observeRemoteEvidence([]),{standing:"no-remote-observed",observation:"observed",evaluation:"available"});
 assert.deepEqual(await observeRemoteEvidence(["origin"]),{standing:"configured-unverified",observation:"observed",evaluation:"available"});
 for(const value of [null,"origin",[{}]])assert.deepEqual(await observeRemoteEvidence(value),{standing:"unknown",observation:"unavailable",evaluation:"unavailable"});
});
