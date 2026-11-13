/* ============================================================================
   HTTP test for the gated engine dev server: proves the renderer-reachable path
   (HTTP /api/* -> engine) carries a real dry-run plan, a gated apply, and honest
   state, against a throwaway git repo. Run: node service/dev-server.test.cjs
   ============================================================================ */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-http-test-"));
const PORT = 7331;
process.env.MC_DATA_DIR = path.join(TMP, "data");
process.env.MC_ENGINE_PORT = String(PORT);
require("./dev-server.cjs"); // starts listening on PORT

const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log("  PASS  " + l); } else { fail++; console.log("  FAIL  " + l); } };
const g = (cwd, args) => execFileSync("git", args, { cwd, windowsHide: true }).toString().trim();

function req(method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(BASE + p, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try { resolve({ status: response.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch (error) { reject(error); }
      });
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end(body ? JSON.stringify(body) : undefined);
  });
}
async function waitHealth() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + "/api/health"); if (r.ok) return true; } catch {}
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("dev server did not come up");
}

(async () => {
  const repo = path.join(TMP, "proj");
  fs.mkdirSync(repo, { recursive: true });
  g(repo, ["init", "-q"]); g(repo, ["config", "user.email", "fixture@example.invalid"]); g(repo, ["config", "user.name", "Fixture"]); g(repo, ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "wip\n");

  await waitHealth();
  const qp = encodeURIComponent(repo);

  for (const method of ["GET", "POST"]) {
    for (const headers of [
      { Host: `untrusted.example:${PORT}` },
      { Host: `127.0.0.1:${PORT + 1}` },
      { Origin: "https://untrusted.example" },
      { Origin: "null" },
    ]) {
      const denied = await req(method, "/api/health", undefined, headers);
      ok(denied.status === 403 && !Object.hasOwn(denied.json, "dataDir"), `${method} rejects foreign Host/port or browser Origin without exposing engine data`);
    }
  }
  for (const origin of ["http://127.0.0.1:5173", "http://localhost:4173", BASE]) {
    const local = await req("GET", "/api/health", undefined, { Origin: origin });
    ok(local.status === 200 && local.json.ok === true, `local browser/proxy origin ${origin} reaches the engine`);
  }
  const localhost = await req("GET", "/api/health", undefined, { Host: `localhost:${PORT}` });
  ok(localhost.status === 200, "local no-Origin client retains localhost authority access");

  const s0 = await req("GET", `/api/state?path=${qp}`);
  ok(s0.json.isRepo && s0.json.zeroCommit && s0.json.dirty === 1, `GET /api/state: zero-commit + 1 dirty`);

  const pl = await req("POST", "/api/plan", { action: "commit", path: repo });
  ok(pl.json.feasible && pl.json.action === "commit" && pl.json.standing === "issued"
    && !Object.hasOwn(pl.json, "commands"), "POST /api/plan: real opaque commit plan");

  const sDry = await req("GET", `/api/state?path=${qp}`);
  ok(sDry.json.zeroCommit && sDry.json.dirty === 1, "DRY RUN over HTTP: /api/plan changed nothing");

  const blocked = await req("POST", "/api/apply", { planId: pl.json.id, approve: false });
  ok(!!blocked.json.error || blocked.json.ok === false, "GATE over HTTP: apply without approve is refused");

  const ap = await req("POST", "/api/apply", { planId: pl.json.id, approve: true });
  ok(ap.json.ok === true, "POST /api/apply (approve:true): ok");

  const s1 = await req("GET", `/api/state?path=${qp}`);
  ok(!s1.json.zeroCommit && s1.json.dirty === 0, "after apply: real commit, tree clean");
  ok(g(repo, ["log", "-1", "--pretty=%s"]) === pl.json.message, "after apply: commit message matches the plan");

  const retired = await req("POST", "/api/rollback", {
    appliedId: ap.json.id, target: TMP, commands: [["reset", "--hard"]],
  });
  ok(retired.status === 410 && retired.json.retired === true, "legacy HTTP rollback is explicitly retired");
  ok(g(repo, ["rev-list", "--count", "HEAD"]) === "1", "crafted HTTP rollback payload cannot change the repository");

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("TEST ERROR:", e); process.exit(2); });
