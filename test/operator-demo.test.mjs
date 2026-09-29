import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("CLI demo ignores private configuration and leaves existing local state untouched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mousecat-demo-isolation-"));
  let child;
  try {
    const config = join(directory, "config.json");
    const state = join(directory, "state.json");
    const sentinel = "Existing private state stays byte-for-byte unchanged.";
    await writeFile(config, "Invalid private configuration must not be read by the demo.");
    await writeFile(state, sentinel);
    child = spawn(process.execPath, ["src/cli.mjs", "--config", config, "operator", "--demo", "--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
    const ready = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Demo startup timed out")), 10000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Demo exited before readiness (${code})`)); });
      child.stdout.on("data", chunk => {
        output += chunk;
        try { const value = JSON.parse(output); clearTimeout(timer); resolve(value); } catch { /* bounded JSON startup record may arrive in chunks */ }
      });
    });
    const snapshot = await (await fetch(ready.url + "/api/snapshot")).json();
    assert.equal(snapshot.projects.length, 1);
    assert.equal(snapshot.projects[0].surface.projectRef, "project:water-sharing-demo");
    assert.equal(snapshot.widget.interactions.length, 3);
    assert.equal(await readFile(state, "utf8"), sentinel);
  } finally {
    if (child && child.exitCode === null) {
      const closed = new Promise(resolve => child.once("exit", resolve));
      child.kill(); await closed;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
