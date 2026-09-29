import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPackageBoundary } from "../scripts/package-boundary-check.mjs";

const required = ["LICENSE", "THIRD_PARTY_NOTICES.md", "licenses/lucide.txt", "licenses/webview2-license.txt", "licenses/webview2-notice.txt", "fixtures/operator-demo/README.md", "fixtures/operator-demo/observations.jsonl"];

test("package boundary rejects automatically included local README documents", () => {
  assert.equal(inspectPackageBoundary([...required, "src/cli.mjs"]).ok, true);
  const report = inspectPackageBoundary([...required, "README.docx", "README.DOCX", ".env.local", ".mousecat/state.json"]);
  assert.equal(report.ok, false);
  assert.deepEqual(report.forbidden, ["README.docx", "README.DOCX", ".env.local", ".mousecat/state.json"]);
});

test("package boundary requires the complete license notices and demonstration inputs", () => {
  const report = inspectPackageBoundary(required.filter(path => path !== "licenses/lucide.txt"));
  assert.equal(report.ok, false);
  assert.deepEqual(report.missing, ["licenses/lucide.txt"]);
});

test("npm prepack blocks an ignored README document selected by npm itself", { timeout: 30000 }, t => {
  if (!process.env.npm_execpath) return t.skip("npm test supplies the npm CLI identity");
  const cwd = mkdtempSync(join(tmpdir(), "mousecat-prepack-"));
  try {
    for (const path of [...required, "src/fixture.mjs", "README.md"]) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), "Synthetic package fixture.\n");
    }
    copyFileSync(fileURLToPath(new URL("../scripts/package-boundary-check.mjs", import.meta.url)), join(cwd, "guard.mjs"));
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "synthetic-boundary-fixture", version: "1.0.0", type: "module", files: ["src", "licenses", "fixtures", "LICENSE", "THIRD_PARTY_NOTICES.md"], scripts: { prepack: "node guard.mjs" } }));
    writeFileSync(join(cwd, ".npmignore"), "*.[dD][oO][cC][xX]\n");
    const pack = (dryRun = true) => spawnSync(process.execPath, [process.env.npm_execpath, "pack", ...(dryRun ? ["--dry-run"] : []), "--json", "--silent"], { cwd, encoding: "utf8", timeout: 15000 });
    assert.equal(pack().status, 0);
    const marker = "Synthetic document contents must remain local.";
    writeFileSync(join(cwd, "README.DOCX"), marker);
    const blocked = pack(false);
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /README\.DOCX/u);
    assert.equal((blocked.stdout + blocked.stderr).includes(marker), false);
    assert.equal(readdirSync(cwd).some(path => path.endsWith(".tgz")), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
