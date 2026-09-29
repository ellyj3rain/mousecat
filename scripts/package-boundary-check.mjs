#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function inspectPackageBoundary(files) {
  const paths = files.map(file => typeof file === "string" ? file : file.path);
  const forbidden = paths.filter(path => /(?:^|\/)(?:\.neo(?:-sandboxes)?|\.mousecat|runtime|traces|node_modules)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|(?:^|\/)mousecat\.config\.json$|decision-receipt|\.region(?:\.receipt)?\.json$|\.(?:docx|pdf|sqlite|sqlite3|db)$/iu.test(path));
  const required = ["LICENSE", "THIRD_PARTY_NOTICES.md", "licenses/lucide.txt", "licenses/webview2-license.txt", "licenses/webview2-notice.txt", "fixtures/operator-demo/README.md", "fixtures/operator-demo/observations.jsonl"];
  const missing = required.filter(path => !paths.includes(path));
  return { ok: forbidden.length === 0 && missing.length === 0, files: paths.length, forbidden, missing };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.npm_execpath) throw new Error("npm invocation required");
    // --ignore-scripts avoids recursively invoking this prepack check.
    const raw = execFileSync(process.execPath, [process.env.npm_execpath, "pack", "--dry-run", "--ignore-scripts", "--json"], { cwd: process.cwd(), timeout: 30000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    const packages = JSON.parse(raw.toString());
    if (packages.length !== 1 || !Array.isArray(packages[0]?.files)) throw new Error("Unexpected pack report");
    const report = inspectPackageBoundary(packages[0].files);
    // Boundary reports use stderr and never print source contents.
    console.error(JSON.stringify({ check: "package-boundary", ...report }));
    if (!report.ok) process.exitCode = 1;
  } catch {
    console.error("Package boundary could not be verified. Run this check through npm; no package was approved.");
    process.exitCode = 1;
  }
}
