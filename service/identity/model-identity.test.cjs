"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),"mc-identity-test-"));
process.env.MC_DATA_DIR = path.join(temporary,"data");
const {ModelRegistry,configSource,attribute,readAttribution} = require("./model-identity.cjs");
const {buildRegistry} = require("./neo-adapter.cjs");
test("standalone identities and explicit compatible registry preserve attribution", async t => {
 t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
 const manifest=path.join(temporary,"models.json"); fs.writeFileSync(manifest,JSON.stringify([{id:"my-model",family:"custom",vendor:"example",label:"My model",aliases:["mm"]}]));
 const standalone=new ModelRegistry().addSource(configSource(manifest)); assert.equal(standalone.canonical("mm"),"my-model");
 const source=path.join(temporary,"engine # source"); fs.mkdirSync(path.join(source,"core","bridges"),{recursive:true}); fs.writeFileSync(path.join(source,"package.json"),JSON.stringify({type:"module"}));
 fs.writeFileSync(path.join(source,"core","bridges","model-registry.js"),'export const MODEL_REGISTRY=[{id:"source-model",family:"example",provider:"example-api",label:"Source model",tier:"standard",aliases:["source"],cliAlias:"sm",model:"source-1"}];');
 const registry=await buildRegistry({neoPath:source,manifestPath:manifest}); assert.equal(registry.canonical("source"),"source-model"); assert.equal(registry.canonical("sm"),"source-model"); assert.equal(registry.canonical("source-1"),"source-model"); assert.equal(registry.resolve("my-model").source,"config");
 const known=attribute(registry,"source",{kind:"input"});assert.equal(known.modelId,"source-model");assert.equal(known.resolved,true);
 const unknown=attribute(registry,"missing",{kind:"action"});assert.equal(unknown.modelId,null);assert.equal(unknown.resolved,false);assert.equal(readAttribution().length,2);
});
