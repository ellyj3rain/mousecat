"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),os=require("node:os");
const {readContinuity,projectWork,selectHeads,bulletinRecord}=require("./continuity.cjs");
const row=(id,revision,owner="identity-a",supersedes)=>({id,type:"project-work",timestamp:new Date().toISOString(),source:"fixture:work-author",payload:{work:{schema:"neo.work-organization/1",id:"work-a",revision,owner:{role:"Principal",sessionId:owner},organization:{status:"active"},development:{units:[{id:"unit-a",target:"Keep the original qualitative goal",dependencies:[]}]},acceptance:[{id:"proof",condition:"Actual output",status:"pending",evidenceRefs:[]}],remaining:["Do the selected work"],changes:[{author:"Operator",reason:"Original direction",sourceRefs:["direction:one"]}]},supersedesOperationalStandingOf:supersedes}});
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),"mc-continuity-"));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const source=path.join(dir,"work.jsonl"),manifest=path.join(dir,"catalog.json");await fs.writeFile(source,JSON.stringify(row("r1","1"))+"\n");await fs.writeFile(manifest,JSON.stringify({schemaVersion:1,objects:[{id:"neo",label:"Neo fixture",kind:"repository",root:null,continuitySources:[{id:"work",format:"neo-project-data",path:source,workIds:["work-a"]}]}]}));return {dir,source,manifest};}

test("literal ownership and accepted revisions are not inferred; nested private payloads stay excluded",()=>{
 const raw=row("r1","1");raw.payload.quote="PRIVATE_SENTINEL";raw.payload.messages=["PRIVATE_SENTINEL"];raw.payload.work.owner.inactive=true;raw.payload.work.owner.token="PRIVATE_SENTINEL";raw.payload.work.development.units[0].raw="PRIVATE_SENTINEL";raw.payload.implementationOwnerSession="different-implementation-identity";
 const result=projectWork(raw,"line-pin");assert.equal(result.owner.sessionId,"identity-a");assert.equal(result.acceptedRevision,null);assert.equal(result.units[0].owner,null);assert.equal(result.units[0].status,null);assert.equal(result.implementationOwnerSession.payload,"different-implementation-identity");assert.equal(result.implementationOwnerSession.work,null);assert.equal(JSON.stringify(result).includes("PRIVATE_SENTINEL"),false);
});

test("structured obligations and declared execution survive projection without implying live standing",()=>{
 const raw=row("r-structured","1");raw.payload.work.development.units[0].execution={status:"complete",evidenceRefs:["proof:one"],privatePayload:"PRIVATE_SENTINEL"};
 raw.payload.work.remaining=["Legacy obligation",{id:"join",status:"pending",detail:"Connect the selected producer",owner:"Kernel owner",sourceRefs:["source:one"],raw:"PRIVATE_SENTINEL"}];
 const value=projectWork(raw,"pin");assert.equal(value.units[0].status,"Declared complete");assert.deepEqual(value.units[0].execution,{status:"complete",evidenceRefs:["proof:one"]});
 assert.deepEqual(value.remaining,["Legacy obligation","Connect the selected producer"]);assert.equal(value.remainingDetails[1].id,"join");assert.equal(value.remainingDetails[1].status,"pending");assert.deepEqual(value.remainingDetails[1].sourceRefs,["source:one"]);assert.equal(value.projectionComplete,true);assert.equal(JSON.stringify(value).includes("PRIVATE_SENTINEL"),false);
 raw.payload.work.remaining.push({unrecognized:"PRIVATE_SENTINEL"});assert.equal(projectWork(raw,"pin").projectionComplete,false);
});

test("heads require explicit same-work supersession; forks, cycles and missing/cross-work links remain uncertain",()=>{
 const a=projectWork(row("a","99"),"a"),b=projectWork(row("b","2","identity-b","a"),"b");assert.deepEqual(selectHeads([a,b]).heads[0].recordIds,["b"]);
 const c=projectWork(row("c","3","identity-c","a"),"c");assert.equal(selectHeads([a,b,c]).heads[0].ambiguous,true);
 const cycle={...a,operationalSupersedes:["b"]};assert.equal(selectHeads([cycle,b]).issues.some(item=>item.code==="supersession-cycle"),true);
 const foreign={...c,workId:"different-work",operationalSupersedes:["b"]};assert.equal(selectHeads([a,b,foreign]).issues.some(item=>item.code==="cross-work-supersession"),true);
 assert.deepEqual(selectHeads([a,{...b,operationalSupersedes:[],predecessorRecordId:"a"}]).heads[0].recordIds,["a","b"]);
 assert.equal(selectHeads([{...b,operationalSupersedes:["missing"]}]).heads[0].ambiguous,true);
});

test("passive append preserves original direction and explicit succession; torn/unavailable sources retain uncertain last observation",async t=>{
 const f=await fixture(t);const read=()=>readContinuity({manifestPath:f.manifest,id:"neo"});
 const first=await read();assert.equal(first.records.length,1);assert.equal(first.heads[0].recordIds[0],"r1");
 const next=row("r2","2","identity-b","r1");next.payload.work.changes.push({author:"Operator",reason:"Refined direction",sourceRefs:["direction:two"]});await fs.appendFile(f.source,JSON.stringify(next)+"\n");
 const second=await read();assert.equal(second.records.length,2);assert.equal(second.records[0].directions[0].reason,"Original direction");assert.equal(second.records[1].owner.sessionId,"identity-b");assert.deepEqual(second.heads[0].recordIds,["r2"]);
 await fs.appendFile(f.source,'{"id":"unfinished');const torn=await read();assert.equal(torn.sources[0].coverage.tornTail,true);assert.equal(torn.records.length,2);assert.equal(torn.status,"partial");assert.equal(torn.heads[0].ambiguous,true);
 await fs.rename(f.source,f.source+".retained");const missing=await read();assert.equal(missing.status,"unavailable");assert.equal(missing.sources[0].stale,true);assert.equal(missing.records[1].owner.sessionId,"identity-b");assert.equal(missing.records[1].stale,true);
});

test("bounded coverage and source rebinding do not manufacture empty assignments or borrow another source's cache",async t=>{
 const f=await fixture(t);await fs.writeFile(f.source," ".repeat(2*1024*1024)+"\n"+JSON.stringify(row("tail","1"))+"\n");
 const current=await readContinuity({manifestPath:f.manifest,id:"neo"});assert.equal(current.sources[0].coverage.complete,false);assert.equal(current.records.length,1);assert.equal(current.heads[0].ambiguous,true);assert.equal(current.status,"partial");
 const doc=JSON.parse(await fs.readFile(f.manifest));doc.objects[0].continuitySources[0].path=path.join(f.dir,"unknown.jsonl");await fs.writeFile(f.manifest,JSON.stringify(doc));const rebound=await readContinuity({manifestPath:f.manifest,id:"neo"});assert.equal(rebound.status,"unavailable");assert.equal(rebound.records.length,0);assert.equal(rebound.sources[0].stale,false);
 doc.objects[0].continuitySources[0].path=path.join(f.dir,"sessions/private.jsonl");await fs.writeFile(f.manifest,JSON.stringify(doc));assert.equal((await readContinuity({manifestPath:f.manifest,id:"neo"})).sources[0].code,"SOURCE_NOT_ADMITTED");
});

test("bulletin revision/attribution and conceptual links never become task assignments or dependencies",()=>{
 const value=bulletinRecord({ideaId:"idea-a",projectRef:"project:neo",revision:2,title:"A direction",source:{author:"Operator",sessionId:"source-session",quote:"PRIVATE_SENTINEL"},history:[{revision:1,action:"capture",title:"Original"},{revision:2,action:"amend",title:"Refined"}],links:[{ideaId:"idea-b",relation:"relates"},{ideaId:"idea-c",relation:"depends-on"}],raw:"PRIVATE_SENTINEL"});
 assert.equal(value.assignment,null);assert.equal(value.attribution.sessionId,"source-session");assert.equal(value.history.length,2);assert.equal(value.links[0].relation,"relates");assert.equal(value.links[1].relation,"depends-on");assert.equal(JSON.stringify(value).includes("PRIVATE_SENTINEL"),false);
 const nested=bulletinRecord({ideaId:"bad-revision",revision:{quote:"PRIVATE_SENTINEL"},history:[{revision:{messages:["PRIVATE_SENTINEL"]}}]});assert.equal(nested.revision,null);assert.equal(nested.history[0].revision,null);assert.equal(JSON.stringify(nested).includes("PRIVATE_SENTINEL"),false);
 const raw=row("redaction","1");raw.payload.work.development.units[0].dependencies=["Bearer private-token"];assert.equal(projectWork(raw,"pin").units[0].dependencies[0],"Bearer [credential-redacted]");
});

test("HTTP bulletin reads are scoped, fresh, bounded and refusal-latched without changing source permissions",async t=>{
 const f=await fixture(t);const doc=JSON.parse(await fs.readFile(f.manifest));doc.objects[0].continuitySources=[{id:"bulletin",format:"mousecat-bulletin",url:"http://127.0.0.1:4317/mcp",projectRef:"project:neo"}];await fs.writeFile(f.manifest,JSON.stringify(doc));let revision=1,calls=0,refused=false;
 const fetcher=async(_url,options)=>{calls++;const request=JSON.parse(options.body);if(refused)return new Response("",{status:403});let result={};if(request.method==="tools/list")result={tools:[{name:"mousecat_bulletin"}]};if(request.method==="tools/call"){assert.equal(request.params.arguments.action,"query");assert.equal(request.params.arguments.projectRef,"project:neo");assert.deepEqual(request.params.arguments.permit,{profileId:"observer"});result={structuredContent:{schema:"mousecat.bulletin/1",ok:true,records:[{ideaId:"direction",revision,title:"Current direction",source:{author:"Operator"},history:[],links:[]}],quarantined:[]}};}return new Response(request.id?JSON.stringify({jsonrpc:"2.0",id:request.id,result}):"",{status:200,headers:{"content-type":"application/json"}});};
 const read=()=>readContinuity({manifestPath:f.manifest,id:"neo",fetcher});assert.equal((await read()).directives[0].revision,1);revision=2;assert.equal((await read()).directives[0].revision,2);
 refused=true;const denied=await read();assert.equal(denied.sources[0].status,"denied");assert.equal(denied.directives[0].revision,2);const before=calls;await read();assert.equal(calls,before);
 doc.objects[0].continuitySources[0].id="renamed-metadata";await fs.writeFile(f.manifest,JSON.stringify(doc));assert.equal((await read()).sources[0].code,"PRIOR_DENIAL_HELD");assert.equal(calls,before);
 doc.objects[0].continuitySources[0].url="HTTP://127.0.0.1:04317/mcp";await fs.writeFile(f.manifest,JSON.stringify(doc));assert.equal((await read()).sources[0].code,"PRIOR_DENIAL_HELD");assert.equal(calls,before);
 doc.objects[0].continuitySources[0].id={quote:"PRIVATE_SENTINEL"};await fs.writeFile(f.manifest,JSON.stringify(doc));const invalid=await read();assert.equal(invalid.code,"INVALID_SOURCES");assert.equal(JSON.stringify(invalid).includes("PRIVATE_SENTINEL"),false);assert.equal(calls,before);
});

test("canonical source admission refuses a harmless junction into a session directory",async t=>{
 const f=await fixture(t),blocked=path.join(f.dir,"sessions"),alias=path.join(f.dir,"alias");await fs.mkdir(blocked);await fs.writeFile(path.join(blocked,"private.jsonl"),JSON.stringify(row("private","1"))+"\n");
 await fs.symlink(blocked,alias,process.platform==="win32"?"junction":"dir");const doc=JSON.parse(await fs.readFile(f.manifest));doc.objects[0].continuitySources[0].path=path.join(alias,"private.jsonl");await fs.writeFile(f.manifest,JSON.stringify(doc));const value=await readContinuity({manifestPath:f.manifest,id:"neo"});assert.equal(value.sources[0].code,"SOURCE_NOT_ADMITTED");assert.equal(value.records.length,0);
});

test("unconfigured continuity is an honest default, independent of an unbound Git root",async t=>{const f=await fixture(t);const doc=JSON.parse(await fs.readFile(f.manifest));delete doc.objects[0].continuitySources;await fs.writeFile(f.manifest,JSON.stringify(doc));const value=await readContinuity({manifestPath:f.manifest,id:"neo"});assert.equal(value.status,"unconfigured");assert.deepEqual(value.records,[]);});

test("project and passive workspace expose fresh identity obligations while an unbound Git target receives no probe",async t=>{
 const f=await fixture(t);const {createOperations}=require("./operations/index.cjs"),{createWorkspace}=require("./workspace.cjs");
 const ops=createOperations({manifestPath:f.manifest});const first=await ops.project("neo");assert.equal(first.source.status,"unconfigured");assert.equal(first.continuity.records[0].owner.sessionId,"identity-a");
 let probes=0;const snapshot=createWorkspace({operations:ops,inspect:async()=>{probes++;throw Error("Held root must not be inspected");}});
 const original=await snapshot();assert.equal(probes,0);assert.equal(original.objects[0].continuity.records.length,1);
 await fs.appendFile(f.source,JSON.stringify(row("r2","2","identity-b","r1"))+"\n");const next=await snapshot();assert.equal(probes,0);assert.equal(next.objects[0].continuity.records.length,2);assert.deepEqual(next.objects[0].continuity.heads[0].recordIds,["r2"]);
});
