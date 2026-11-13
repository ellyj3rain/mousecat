"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");

async function assertOwnWorktreeRoot(selected, gitRead) {
  if (typeof selected !== "string" || !selected.trim()) throw new Error("Select an explicit source directory.");
  const root = path.resolve(selected);
  if (!(await fs.stat(root)).isDirectory()) throw new Error("The selected source is not a directory.");
  let marker;
  try { marker = await fs.lstat(path.join(root, ".git")); }
  catch (error) {
    if (error.code === "ENOENT") throw Object.assign(new Error("The selected source has no own Git marker."), { code: "NO_GIT_MARKER" });
    throw error;
  }
  if (!marker.isDirectory() && !marker.isFile()) throw new Error("The selected Git marker requires a qualified source adapter.");
  const top = (await gitRead(root, ["rev-parse", "--show-toplevel"])).trim();
  const [actual, expected] = await Promise.all([fs.realpath(top), fs.realpath(root)]);
  const normalize = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  if (normalize(actual) !== normalize(expected)) throw new Error("The selected source does not match its Git working-tree root.");
  return root;
}

/** Inspect attributes without invoking their conversion drivers. Global LFS
    configuration alone is harmless; selected paths requiring a clean/process
    driver need a separately qualified adapter before source observation. */
async function assertReadOnlyGitIntegrations(target, gitRead) {
  const staged = await gitRead(target, ["ls-files", "--stage", "-z"]);
  if (staged.split("\0").some((row) => row.startsWith("160000 "))) {
    throw new Error("Submodule source observation requires a qualified adapter.");
  }
  let keys;
  try { keys = await gitRead(target, ["config", "--includes", "--null", "--name-only", "--get-regexp", "^filter\\."]); }
  catch (error) { if (error.code === 1) return; throw error; }
  const drivers = new Set(keys.split("\0").map((key) => key.match(/^filter\.(.*)\.(?:clean|process)$/s)?.[1]).filter(Boolean));
  if (!drivers.size) return;
  const names = await gitRead(target, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  if (!names) return;
  const attributes = (await gitRead(target, ["check-attr", "filter", "-z", "--stdin"], { input: names })).split("\0");
  for (let index = 0; index + 2 < attributes.length; index += 3) {
    if (drivers.has(attributes[index + 2])) {
      throw new Error("Read-only observation refuses paths requiring executable Git clean/process filters.");
    }
  }
}


module.exports = { assertOwnWorktreeRoot, assertReadOnlyGitIntegrations };
