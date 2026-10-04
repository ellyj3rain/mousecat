import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

// Startup attestation contains digests only. Configuration contents and local
// paths never enter a public response; the service record is private local state.
export async function runtimeInputFingerprint(root, configPath) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name), name = relative(root, path).replaceAll("\\", "/");
      if (name === "src/operator/public") continue; // Served bytes have their own installed check.
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && /\.(?:mjs|js)$/u.test(entry.name)) files.push({ path, name });
    }
  }
  await visit(resolve(root, "src"));
  for (const name of ["package.json", "package-lock.json"]) files.push({ path: resolve(root, name), name });
  files.push({ path: configPath, name: "@configuration" });
  files.sort((a, b) => a.name.localeCompare(b.name, "en"));
  const digest = createHash("sha256");
  for (const { path, name } of files) {
    let content;
    try { content = await readFile(path); }
    catch (error) { if (!["package-lock.json", "@configuration"].includes(name) || error.code !== "ENOENT") throw error; }
    digest.update(JSON.stringify([name, content ? createHash("sha256").update(content).digest("hex") : name === "@configuration" ? "absent-use-defaults" : "absent-in-distribution"]));
  }
  return { schema: "mousecat.runtime-inputs/1", sha256: digest.digest("hex"), files: files.length, nodeVersion: process.versions.node };
}
