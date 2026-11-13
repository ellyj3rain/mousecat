import test from "node:test";
import assert from "node:assert/strict";
import {workObservatory} from "./work-observatory.mjs";
test("source work preserves open obligations and does not invent execution or acceptance",()=>{
 const now=Date.parse("2026-01-01T00:00:00Z");const record={recordId:"r",workId:"w",outcome:"Import documents",owner:{role:"Implementer"},units:[{id:"u",status:"complete"}],remaining:["Consumer receiving"]};
 const workspace={objects:[{id:"p",label:"Project",continuity:{status:"observed",observedAt:new Date(now).toISOString(),heads:[{workId:"w",recordIds:["r"],ambiguous:false}],records:[record]}}]};
 let view=workObservatory(workspace,"live",now);assert.equal(view.rows[0].state,"Declared work");assert.deepEqual(view.rows[0].remaining,["Consumer receiving"]);assert.equal(view.authorityGranted,false);assert.equal(view.automaticExecution,false);
 workspace.objects[0].continuity.heads[0].ambiguous=true;view=workObservatory(workspace,"live",now);assert.equal(view.rows[0].current,false);assert.match(view.rows[0].observation,/Conflicting/);
});
