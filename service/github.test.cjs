"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function isolated(platform, env, execFile) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, "github.cjs"), "utf8");
  vm.runInNewContext(source, { module, exports: module.exports, Buffer,
    process: { platform, env },
    require: (name) => name === "node:child_process" ? { execFile } : require(name),
  }, { filename: "github.cjs" });
  return module.exports;
}

test("sign-in launch failure is returned without an unhandled child error or success", async () => {
  const api = isolated("win32", {}, (_file, _args, _opts, done) => {
    queueMicrotask(() => done(Object.assign(new Error("launcher missing"), { code: "ENOENT" })));
  });
  const result = await api.launchLogin();
  assert.equal(result.ok, false);
  assert.equal(result.launched, false);
  assert.match(result.error, /launcher missing/);
});

test("selected GH_PATH is literal launch data and success waits for launcher acceptance", async () => {
  const configured = "C:\\Example Project & Tools\\gh.exe";
  let accepted, call;
  const api = isolated("win32", { GH_PATH: configured, SystemRoot: "C:\\Windows" }, (file, args, opts, done) => {
    call = { file, args, opts }; accepted = done;
  });
  let settled = false;
  const pending = api.launchLogin().then((value) => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(call.opts.env.MC_GH_AUTH_EXECUTABLE, configured);
  const script = Buffer.from(call.args.at(-1), "base64").toString("utf16le");
  assert.ok(script.includes("$env:MC_GH_AUTH_EXECUTABLE"));
  assert.ok(!script.includes(configured));
  assert.ok(script.includes("@('auth','login')"));
  accepted(null);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.launched, true);
  assert.match(result.note, /authentication has not been checked/);
});

test("unreceived terminal platforms return a manual command without spawning", async () => {
  let calls = 0;
  const api = isolated("linux", { GH_PATH: "/example/gh" }, () => { calls++; });
  const result = await api.launchLogin();
  assert.equal(result.ok, false);
  assert.equal(result.requiresTerminal, true);
  assert.equal(result.command.join(" "), "/example/gh auth login");
  assert.equal(calls, 0);
});

test("GitHub status parses synthetic account facts without reading an installed account", async () => {
  const text = "github.com\n  Logged in to github.com account fixture-user (fixture)\n  - Active account: true\n  - Git operations protocol: ssh\n  - Token scopes: 'repo', 'read:org'\n";
  const api = isolated("win32", { GH_PATH: "fixture-gh" }, (file, args, _opts, done) => {
    assert.equal(file, "fixture-gh");
    assert.equal(args.join(" "), "auth status");
    queueMicrotask(() => done(null, "", text));
  });
  const result = await api.status();
  assert.equal(result.available, true);
  assert.equal(result.authenticated, true);
  assert.equal(result.accounts[0].login, "fixture-user");
  assert.equal(result.accounts[0].active, true);
  assert.equal(result.protocol, "ssh");
  assert.equal(result.accounts[0].scopes.join(","), "repo,read:org");
});
