import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { startOperatorServer } from "../src/operator/server.mjs";

test("actual Windows desktop popup moves and redocks the same feed without another service", {
  skip: process.platform !== "win32" || process.env.MOUSECAT_DESKTOP_TEST !== "1"
    ? "run MOUSECAT_DESKTOP_TEST=1 on Windows with .NET9 and WebView2" : false,
  timeout: 90000,
}, async t => {
  const folder = await mkdtemp(join(tmpdir(), "mousecat-native-window-"));
  t.after(async () => {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir())); assert.ok(basename(folder).startsWith("mousecat-native-window-"));
    // WebView2 may release its isolated profile asynchronously after host exit.
    await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const producer = join(folder, "producer"), registry = join(folder, "registry.json");
  await mkdir(join(producer, "commands"), { recursive: true });
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwS2n6DwAETAIsoJ1HtQAAAABJRU5ErkJggg==", "base64");
  await writeFile(join(producer, "frame.png"), bytes);
  const sessionId = randomUUID(), timestamp = Date.now();
  const image = { file: "frame.png", sha256: createHash("sha256").update(bytes).digest("hex"), width: 1, height: 1 };
  await writeFile(join(producer, "latest.json"), JSON.stringify({ schema: "mousecat.native-view/1", sessionId,
    sequence: 1, capturedAtUnixMs: timestamp, image, state: "running", title: "Native host fixture", summary: "Synthetic native host fixture.",
    people: [], lastCommandSequence: 0, camera: { mode: "automatic", personIds: [], summary: "Fixture." },
    feeds: [{ id: "farm", siteId: "farm", label: "Farm", capturedAtUnixMs: timestamp, image,
      camera: { mode: "automatic", personIds: [], summary: "Fixture." } }] }));
  await writeFile(registry, JSON.stringify([{ id: "regional", label: "Native fixture", directory: producer, sessionId }]));
  const app = await startOperatorServer({ port: 0, nativeViews: { registryPath: registry } }); t.after(() => app.close());
  const child = spawn("dotnet", ["run", "--project", "apps/mousecat-desktop/tests/NativeWindows/NativeWindows.csproj", "-c", "Release", "--", app.url, folder],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
  const deadline = setTimeout(() => child.kill(), 80000); t.after(() => { clearTimeout(deadline); if (child.exitCode === null) child.kill(); });
  const exitCode = await new Promise((resolveExit, reject) => { child.on("exit", resolveExit); child.on("error", reject); });
  clearTimeout(deadline);
  const report = resolve(".mousecat/native-window-check"); await mkdir(report, { recursive: true });
  await writeFile(join(report, "stdout.log"), output);
  assert.equal(exitCode, 0, output);
  assert.equal(JSON.parse(await readFile(join(folder, "result.json"), "utf8")).success, true);
  assert.match(output, /PASS actual redock closes native Form/u);
  console.log(output.trim());
});
