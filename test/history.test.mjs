import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMousecatRuntime } from "../src/core/runtime.mjs";
import { createHistoryController, historyHash } from "../src/core/history.mjs";
import { startOperatorServer } from "../src/operator/server.mjs";

const permit = { profileId: "operator-interaction" };
const observer = { profileId: "observer" };
function record(overrides = {}) {
  return { ref:"note:example/method",kind:"method",title:"Compare sources before reuse",body:"Bounded method proposal",
    source:{kind:"host",host:"test",sessionId:"synthetic"},method:{purpose:"Compare",applicability:"Known sources",procedure:"Read then compare",failures:"Missing sources"},
    links:[{relation:"derived-from",target:"not-yet-indexed",basis:"Explicit author reference"}],...overrides };
}
test("history preserves exact responses across restart independently of event retention", () => {
  const dir = mkdtempSync(join(tmpdir(),"mousecat-history-"));
  try {
    const options={config:{state:{enabled:true,path:join(dir,"state.json"),maxEvents:0}}};
    const runtime=createMousecatRuntime(options);
    const asked=runtime.handleTool("mousecat.widget",{action:"ask",request:{interactionId:"history-original",title:"Original ruling",items:[{id:"one",shape:"decision",prompt:"Use this approach?",allowFreeform:true,options:[{label:"Yes",value:"approved"}]}]}});
    assert.ok(asked.interaction);
    runtime.handleTool("mousecat.widget",{action:"respond",interactionId:"history-original",responses:[{itemId:"one",selectedOption:"approved",value:"Only for the offline trial",notes:"Only for the offline trial"}]});
    const before=runtime.handleTool("mousecat.history",{action:"query",ref:"history-original",permit:observer});
    assert.equal(before.record.standing,"answered");
    assert.match(before.record.body,/Only for the offline trial/);
    assert.match(before.record.body,/Original choices/);
    assert.equal(before.record.items[0].options[0].label,"Yes");
    assert.ok(before.revisions.length>=2);
    const after=createMousecatRuntime(options);
    assert.equal(after.state.events.length,0);
    const restored=after.handleTool("mousecat.history",{action:"query",ref:"history-original",permit:observer});
    assert.equal(restored.record.revision,before.record.revision);
    assert.equal(after.state.interactions.size,0,"reading history must not revive archived work");
    assert.equal(restored.revisions[0].standing,"open");
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test("methods require provenance, remain proposals, resolve backlinks and refuse false approval",()=>{
  const runtime=createMousecatRuntime();
  assert.equal(runtime.handleTool("mousecat.history",{action:"register",record:record(),permit:observer}).ok,false);
  assert.equal(runtime.handleTool("mousecat.history",{action:"register",record:record({standing:"approved"}),permit}).ok,false);
  const added=runtime.handleTool("mousecat.history",{action:"register",record:record(),permit});
  assert.equal(added.ok,true);
  const first=runtime.handleTool("mousecat.history",{ref:record().ref,permit:observer});
  assert.equal(first.links[0].status,"unresolved");
  const again=runtime.handleTool("mousecat.history",{action:"register",record:record(),permit});
  assert.equal(again.record.revision,added.record.revision);
  runtime.handleTool("mousecat.history",{action:"register",record:record({ref:"note:example/result",kind:"result",title:"Trial result",links:[{relation:"tested-by",target:record().ref,basis:"Recorded trial relation"}]}),permit});
  assert.equal(runtime.handleTool("mousecat.history",{ref:record().ref,permit:observer}).backlinks.length,1);
  assert.equal(runtime.handleTool("mousecat.history",{query:"Compare sources",kind:"method",permit:observer}).total,1);
  const commit = "c".repeat(40);
  runtime.handleTool("mousecat.history",{action:"register",permit,record:record({ref:"note:git/source-one",kind:"evidence",aliases:[commit],standing:"reported"})});
  assert.equal(runtime.handleTool("mousecat.history",{ref:commit,permit:observer}).record.ref,"note:git/source-one");
  runtime.handleTool("mousecat.history",{action:"register",permit,record:record({ref:"note:git/source-two",kind:"evidence",aliases:[commit],standing:"reported"})});
  assert.equal(runtime.handleTool("mousecat.history",{ref:commit,permit:observer}).status,"ambiguous");
});
test("sensitive interactions and private continuation values cannot enter the history reader",()=>{
  const runtime=createMousecatRuntime();
  runtime.handleTool("mousecat.widget",{action:"ask",request:{interactionId:"private-one",title:"private title",items:[{id:"one",shape:"freeform",prompt:"confidential",description:"hidden evidence",sensitive:true}]}});
  const found=runtime.handleTool("mousecat.history",{ref:"private-one",permit:observer});
  assert.equal(found.record.standing,"redacted");
  assert.doesNotMatch(JSON.stringify(found),/private title|confidential|hidden evidence/);
  runtime.handleTool("mousecat.history",{action:"register",record:record({body:"speakeasy-continuation-standing continuation-12345678-1234-1234-1234-123456789012"}),permit});
  const safe=runtime.handleTool("mousecat.history",{ref:record().ref,permit:observer});
  assert.doesNotMatch(JSON.stringify(safe),/continuation-12345678/);
  assert.match(safe.record.body,/speakeasy-continuation-standing/);
});
test("registered sources retain addressable revisions, section anchors and missing-source coverage",()=>{
  const dir=mkdtempSync(join(tmpdir(),"mousecat-history-source-"));
  try {
    const path="DECISIONS.md";
    writeFileSync(join(dir,path),"# Initial decision\nKeep evidence.\n");
    const state={interactions:new Map(),archivedInteractions:new Map(),projectSurfaces:new Map([["example",{surfaceId:"example",projectRef:"project:example",root:dir,governingDocuments:[{path,label:"Decision ledger"}],dataSources:[]}]])};
    const history=createHistoryController({state,publicInteraction:x=>x,persist:()=>{}});
    assert.equal(history.indexSource({surfaceId:"example",path:"../outside"}).ok,false);
    const first=history.indexSource({surfaceId:"example",path});
    const old=history.query({ref:first.record.ref});
    writeFileSync(join(dir,"COPY.md"),"# Initial decision\nKeep evidence.\n");
    state.projectSurfaces.get("example").governingDocuments.push({path:"COPY.md"});
    history.indexSource({surfaceId:"example",path:"COPY.md"});
    const sameContentSection=history.query({ref:first.record.ref+"#initial-decision"});
    assert.equal(sameContentSection.links[0].status,"resolved");
    assert.equal(sameContentSection.links[0].ref,first.record.ref);
    assert.equal(history.query({ref:old.record.aliases[0]}).status,"ambiguous");
    const oldAlias=old.record.aliases.at(-1);
    writeFileSync(join(dir,path),"# Initial decision\nKeep revised evidence.\n");
    const next=history.indexSource({surfaceId:"example",path});
    assert.notEqual(next.record.revision,first.record.revision);
    assert.equal(history.query({ref:oldAlias}).record.revision,first.record.revision);
    const oldDocument = history.query({ref:oldAlias});
    const oldSectionLink = oldDocument.links.find(link => link.relation === "contains");
    const oldSection = history.query({ref:oldSectionLink.ref, revision:oldSectionLink.revision});
    assert.match(oldSection.record.body,/Keep evidence/);
    assert.doesNotMatch(oldSection.record.body,/revised/);
    const parentLink = oldSection.links.find(link => link.relation === "part-of");
    assert.equal(history.query({ref:parentLink.ref, revision:parentLink.revision}).record.revision,first.record.revision);
    assert.match(history.query({ref:first.record.ref+"#initial-decision"}).record.body,/revised/);
    rmSync(join(dir,path));
    assert.equal(history.indexSource({surfaceId:"example",path}).ok,false);
    assert.equal(history.query({ref:first.record.ref}).coverage.status,"missing");
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test("source aliases remain ambiguous across projects and sensitive JSON is redacted",()=>{
  const dir=mkdtempSync(join(tmpdir(),"mousecat-history-alias-"));
  try {
    const state={interactions:new Map(),archivedInteractions:new Map(),projectSurfaces:new Map()};
    const history=createHistoryController({state,publicInteraction:x=>x,persist:()=>{}});
    for(const id of ["one","two"]) {
      mkdirSync(join(dir,id)); writeFileSync(join(dir,id,"data.json"),'{"value":"same"}');
      state.projectSurfaces.set(id,{projectRef:"project:"+id,root:join(dir,id),governingDocuments:[],dataSources:[{path:"data.json"}]});
      history.indexSource({surfaceId:id,path:"data.json"});
    }
    assert.equal(history.query({ref:historyHash({value:"same"})}).status,"ambiguous");
    writeFileSync(join(dir,"one","data.json"),'{"sensitive":true,"password":"do-not-show","body":"secret fact"}');
    history.indexSource({surfaceId:"one",path:"data.json"});
    const privateRecord=history.query({ref:"source:one:data.json"});
    assert.equal(privateRecord.revisions.length,1);
    assert.doesNotMatch(JSON.stringify(privateRecord),/do-not-show|secret fact/);
    writeFileSync(join(dir,"one","data.json"),'{"password":SYNTHETIC_PRIVATE_VALUE}');
    history.indexSource({surfaceId:"one",path:"data.json"});
    assert.doesNotMatch(JSON.stringify(history.query()),/SYNTHETIC_PRIVATE/);
    assert.equal(state.historyCoverage.get("one:data.json").reason,"invalid-source-json");
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test("browser history endpoint is read-only and rejects missing records",async()=>{
  const runtime=createMousecatRuntime();
  runtime.handleTool("mousecat.history",{action:"register",record:record(),permit});
  const app=await startOperatorServer({runtime,port:0});
  try {
    const response=await fetch(app.url+"/api/history?kind=method");
    assert.equal(response.status,200);
    assert.equal((await response.json()).total,1);
    assert.equal((await fetch(app.url+"/api/history?ref=missing")).status,404);
    assert.notEqual((await fetch(app.url+"/api/history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"register",record:record()})})).status,200);
  } finally {await app.close();}
});
