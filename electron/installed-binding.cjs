"use strict";
const fs = require("node:fs");
const path = require("node:path");
// An external installation pointer, never a bundled machine inventory or grant.
function loadInstalledBinding(app, { installationCheck = false } = {}) {
  if (!app.isPackaged || installationCheck || process.env.MC_OPERATIONS_MANIFEST) return { status: "not-selected" };
  const file = path.join(app.getPath("appData"), "marshmallow-commons", "desktop-binding.json");
  let info;
  try { info=fs.lstatSync(file); } catch(error) { if(error.code === "ENOENT") return { status: "unconfigured" }; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) throw new Error("Invalid Mousecat installation binding file");
  const binding=JSON.parse(fs.readFileSync(file,"utf8"));
  if (binding.schema !== "mc.desktop-source-binding/1" || typeof binding.operationsManifest !== "string" || !path.isAbsolute(binding.operationsManifest) || Object.keys(binding).some(key=>!["schema","operationsManifest"].includes(key))) throw new Error("Invalid Mousecat installation source binding");
  process.env.MC_OPERATIONS_MANIFEST=binding.operationsManifest;
  return { status: "selected", file, operationsManifest: binding.operationsManifest };
}
module.exports={loadInstalledBinding};
