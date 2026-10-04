#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeInputFingerprint } from "../src/service/installed-identity.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const samePath = (a, b) => typeof a === "string" && typeof b === "string"
  && (process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));
const readJson = async path => JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/u, ""));
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function listenerIdentity(desktop, record) {
  if (process.platform !== "win32") return false;
  // Only validated integer identifiers enter shell code; private paths are compared in JS.
  const command = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${record.pid}'; $owners=@(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort ${desktop.Port} -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess); @{pid=$p.ProcessId;executable=$p.ExecutablePath;command=$p.CommandLine;created=$p.CreationDate.ToUniversalTime().ToString('o');owners=$owners}|ConvertTo-Json -Compress`;
  const actual = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "utf8", windowsHide: true, timeout: 10000 }));
  const argv = [...actual.command.matchAll(/"([^"]*)"|(\S+)/gu)].map(match => match[1] ?? match[2]);
  const age = Date.parse(record.startedAt) - Date.parse(actual.created);
  return actual.pid === record.pid && actual.owners.includes(record.pid) && samePath(actual.executable, desktop.NodePath)
    && samePath(argv[1], record.runnerPath) && samePath(argv[argv.indexOf("--config") + 1], desktop.ConfigPath)
    && argv[argv.indexOf("--port") + 1] === String(desktop.Port) && age >= 0 && age < 60000;
}

// Read-only installation evidence. A browser/desktop interaction receipt separately
// establishes that the already-open client has actually loaded these served bytes.
export async function checkInstalledRuntime({ repositoryRoot = ROOT, desktop, record, fetchImpl = fetch, isAlive = processAlive, ownsListener = listenerIdentity }) {
  const failures = [], assets = [];
  const check = (condition, code) => { if (!condition) failures.push(code); };
  check(samePath(desktop?.RepositoryRoot, repositoryRoot), "desktop-checkout-mismatch");
  check(samePath(record?.workingDirectory, repositoryRoot), "service-checkout-mismatch");
  check(samePath(record?.runnerPath, resolve(repositoryRoot, "src/service/runner.mjs")), "service-runner-mismatch");
  check(samePath(record?.configPath, desktop?.ConfigPath), "service-config-mismatch");
  check(record?.serviceId === "mousecat-operator" && isAlive(record?.pid), "managed-service-not-running");
  check(Number.isInteger(desktop?.Port) && desktop.Port > 0 && desktop.Port <= 65535 && record?.port === desktop.Port, "service-port-mismatch");
  check(record?.persistence?.enabled === true, "persistent-workspace-required");
  if (failures.length) return { schema: "mousecat.installed-check/1", ok: false, failures, assets };
  try {
    check(await ownsListener(desktop, record), "service-listener-identity-mismatch");
    const config = await readJson(desktop.ConfigPath);
    check(config.state?.enabled === true && samePath(resolve(repositoryRoot, config.state?.path || ".mousecat/state.json"), record.persistence.path), "service-state-store-mismatch");
    const fingerprint = await runtimeInputFingerprint(repositoryRoot, desktop.ConfigPath);
    check(JSON.stringify(record.inputFingerprint) === JSON.stringify(fingerprint), "runtime-input-fingerprint-mismatch");
    const baseUrl = "http://127.0.0.1:" + desktop.Port;
    const response = await fetchImpl(baseUrl + "/api/snapshot", { signal: AbortSignal.timeout(5000) });
    const snapshot = await response.json();
    check(response.ok && snapshot.schema === "mousecat.operator-snapshot/2" && snapshot.status?.ok === true, "installed-endpoint-unhealthy");
    const publicDirectory = resolve(repositoryRoot, "src/operator/public");
    for (const entry of await readdir(publicDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(?:html|css|js)$/u.test(entry.name)) continue;
      const expected = await readFile(resolve(publicDirectory, entry.name));
      const actual = await fetchImpl(baseUrl + "/" + entry.name, { signal: AbortSignal.timeout(5000) });
      const digest = hash(new Uint8Array(await actual.arrayBuffer()));
      const matches = actual.ok && hash(expected) === digest;
      check(matches, "served-asset-mismatch:" + entry.name);
      assets.push({ name: entry.name, sha256: hash(expected), matches });
    }
  } catch { check(false, "installed-check-unavailable"); }
  return { schema: "mousecat.installed-check/1", ok: failures.length === 0, failures, assets };
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    if (process.platform !== "win32") throw new Error("windows-desktop-check-required");
    const desktop = await readJson(resolve(process.env.LOCALAPPDATA, "Mousecat/Desktop/desktop.json"));
    const record = await readJson(resolve(homedir(), ".mousecat/user-service.json"));
    const result = await checkInstalledRuntime({ desktop, record });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ schema: "mousecat.installed-check/1", ok: false, failures: [error.message === "windows-desktop-check-required" ? error.message : "installed-record-unavailable"] }));
    process.exitCode = 1;
  }
}
