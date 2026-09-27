import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_ID = "mousecat-operator";
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUNNER_PATH = fileURLToPath(new URL("./runner.mjs", import.meta.url));
const DEFAULT_RECORD_PATH = resolve(homedir(), ".mousecat", "user-service.json");

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function commandLine(options = {}) {
  const parts = [quote(process.execPath), quote(RUNNER_PATH), "--port", String(options.port || 4317)];
  if (options.configPath) parts.push("--config", quote(resolve(options.configPath)));
  return parts.join(" ");
}

function windowsLauncher(options = {}) {
  const command = commandLine(options).replaceAll('"', '""');
  return `CreateObject("Wscript.Shell").Run "${command}", 0, False\r\n`;
}

function linuxUnit(options = {}) {
  return `[Unit]\nDescription=Mousecat operator and MCP plane\nAfter=default.target\n\n[Service]\nType=simple\nExecStart=${commandLine(options)}\nRestart=on-failure\nRestartSec=2\n\n[Install]\nWantedBy=default.target\n`;
}

function macPlist(options = {}) {
  const args = [process.execPath, RUNNER_PATH, "--port", String(options.port || 4317)];
  if (options.configPath) args.push("--config", resolve(options.configPath));
  const xmlArgs = args.map((arg) => `      <string>${String(arg).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n  <key>Label</key><string>dev.mousecat.operator</string>\n  <key>ProgramArguments</key><array>\n${xmlArgs}\n  </array>\n  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n</dict></plist>\n`;
}

export function userServicePlan(options = {}) {
  const platform = options.platform || process.platform;
  const home = options.home || homedir();
  if (platform === "win32") {
    const launcherPath = resolve(options.localAppData || process.env.LOCALAPPDATA || resolve(home, "AppData", "Local"), "Mousecat", "mousecat.vbs");
    return {
      platform,
      mechanism: "hkcu-run",
      id: "Mousecat",
      path: RUN_KEY,
      launcherPath,
      launcherContent: windowsLauncher(options),
      command: `wscript.exe ${quote(launcherPath)}`,
    };
  }
  if (platform === "linux") {
    const path = resolve(home, ".config", "systemd", "user", `${SERVICE_ID}.service`);
    return { platform, mechanism: "systemd-user", id: SERVICE_ID, path, content: linuxUnit(options) };
  }
  if (platform === "darwin") {
    const path = resolve(home, "Library", "LaunchAgents", "dev.mousecat.operator.plist");
    return { platform, mechanism: "launch-agent", id: "dev.mousecat.operator", path, content: macPlist(options) };
  }
  return { platform, mechanism: "unsupported", id: SERVICE_ID };
}

function readRecord(path = DEFAULT_RECORD_PATH) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function endpointAlive(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/snapshot`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return false;
    const snapshot = await response.json();
    return snapshot?.schema === "mousecat.operator-snapshot/2" && snapshot?.status?.ok === true;
  } catch {
    return false;
  }
}

async function waitForEndpoint(port, expected) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const running = await endpointAlive(port);
    if (running === expected) return running;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return endpointAlive(port);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  return { ok: result.status === 0, status: result.status, stdout: result.stdout?.trim() || "", stderr: result.stderr?.trim() || "" };
}

function installed(plan) {
  if (plan.mechanism === "hkcu-run") return existsSync(plan.launcherPath) && run("reg.exe", ["query", RUN_KEY, "/v", plan.id]).ok;
  if (plan.mechanism === "systemd-user") return existsSync(plan.path) && run("systemctl", ["--user", "is-enabled", SERVICE_ID]).ok;
  if (plan.mechanism === "launch-agent") return existsSync(plan.path) && run("launchctl", ["print", `gui/${process.getuid()}/${plan.id}`]).ok;
  return false;
}

function installRegistration(plan) {
  if (plan.mechanism === "hkcu-run") {
    mkdirSync(dirname(plan.launcherPath), { recursive: true });
    writeFileSync(plan.launcherPath, plan.launcherContent, "utf8");
    return run("reg.exe", ["add", RUN_KEY, "/v", plan.id, "/t", "REG_SZ", "/d", plan.command, "/f"]);
  }
  if (plan.mechanism === "systemd-user") {
    mkdirSync(dirname(plan.path), { recursive: true });
    writeFileSync(plan.path, plan.content, "utf8");
    const reload = run("systemctl", ["--user", "daemon-reload"]);
    const enable = reload.ok ? run("systemctl", ["--user", "enable", "--now", SERVICE_ID]) : reload;
    return enable;
  }
  if (plan.mechanism === "launch-agent") {
    mkdirSync(dirname(plan.path), { recursive: true });
    writeFileSync(plan.path, plan.content, "utf8");
    run("launchctl", ["bootout", `gui/${process.getuid()}`, plan.path]);
    return run("launchctl", ["bootstrap", `gui/${process.getuid()}`, plan.path]);
  }
  return { ok: false, status: null, stdout: "", stderr: "unsupported-platform" };
}

function uninstallRegistration(plan) {
  if (plan.mechanism === "hkcu-run") {
    const removed = run("reg.exe", ["delete", RUN_KEY, "/v", plan.id, "/f"]);
    rmSync(plan.launcherPath, { force: true });
    return removed;
  }
  if (plan.mechanism === "systemd-user") {
    run("systemctl", ["--user", "disable", SERVICE_ID]);
    rmSync(plan.path, { force: true });
    return run("systemctl", ["--user", "daemon-reload"]);
  }
  if (plan.mechanism === "launch-agent") {
    run("launchctl", ["bootout", `gui/${process.getuid()}`, plan.path]);
    rmSync(plan.path, { force: true });
    return { ok: true, status: 0, stdout: "", stderr: "" };
  }
  return { ok: false, status: null, stdout: "", stderr: "unsupported-platform" };
}

function managerStart(plan) {
  if (plan.mechanism === "systemd-user") return run("systemctl", ["--user", "start", SERVICE_ID]);
  if (plan.mechanism === "launch-agent") {
    const domain = `gui/${process.getuid()}`;
    if (!run("launchctl", ["print", `${domain}/${plan.id}`]).ok) {
      const bootstrapped = run("launchctl", ["bootstrap", domain, plan.path]);
      if (!bootstrapped.ok) return bootstrapped;
    }
    return run("launchctl", ["kickstart", "-k", `${domain}/${plan.id}`]);
  }
  return null;
}

function managerStop(plan) {
  if (plan.mechanism === "systemd-user") return run("systemctl", ["--user", "stop", SERVICE_ID]);
  if (plan.mechanism === "launch-agent") return run("launchctl", ["bootout", `gui/${process.getuid()}`, plan.path]);
  return null;
}

function windowsRunnerMatches(record) {
  const runnerPathMatches = process.platform === "win32"
    ? typeof record?.runnerPath === "string" && record.runnerPath.toLowerCase() === RUNNER_PATH.toLowerCase()
    : record?.runnerPath === RUNNER_PATH;
  if (!processAlive(record?.pid) || record?.serviceId !== SERVICE_ID || !runnerPathMatches) return false;
  const inspected = run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${record.pid}').CommandLine`,
  ]);
  const portPattern = new RegExp(`(?:^|\\s)--port\\s+${record.port}(?:\\s|$)`, "u");
  return inspected.ok && inspected.stdout.includes(RUNNER_PATH) && portPattern.test(inspected.stdout);
}

function startRunner(options = {}) {
  const args = [RUNNER_PATH, "--port", String(options.port || 4317)];
  if (options.configPath) args.push("--config", resolve(options.configPath));
  const child = spawn(process.execPath, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return child.pid;
}

export async function manageUserService(action = "status", options = {}) {
  const port = Number.isInteger(options.port) && options.port > 0 && options.port <= 65535 ? options.port : 4317;
  const plan = userServicePlan({ ...options, port });
  const recordPath = options.recordPath || DEFAULT_RECORD_PATH;
  if (plan.mechanism === "unsupported") return { schema: "mousecat.user-service/1", ok: false, action, ...plan };

  if (action === "install") {
    const registration = installRegistration(plan);
    if (!registration.ok) return { schema: "mousecat.user-service/1", ok: false, action, plan, registration };
    if (plan.mechanism === "hkcu-run" && !(await endpointAlive(port))) startRunner({ ...options, port });
  } else if (action === "start") {
    if (!(await endpointAlive(port))) {
      const started = managerStart(plan);
      if (started && !started.ok) return { schema: "mousecat.user-service/1", ok: false, action, plan, registration: started };
      if (!started) startRunner({ ...options, port });
    }
  } else if (action === "stop" || action === "uninstall") {
    const record = readRecord(recordPath);
    const stopped = managerStop(plan);
    if (stopped && !stopped.ok) return { schema: "mousecat.user-service/1", ok: false, action, plan, registration: stopped };
    if (!stopped && windowsRunnerMatches(record)) process.kill(record.pid, "SIGTERM");
    if (action === "uninstall") {
      const registration = uninstallRegistration(plan);
      if (!registration.ok) return { schema: "mousecat.user-service/1", ok: false, action, plan, registration };
    }
  } else if (action !== "status") {
    return { schema: "mousecat.user-service/1", ok: false, action, code: "unknown-service-action" };
  }

  const record = readRecord(recordPath);
  const expectedRunning = ["install", "start"].includes(action) ? true : ["stop", "uninstall"].includes(action) ? false : null;
  const running = expectedRunning === null ? await endpointAlive(port) : await waitForEndpoint(port, expectedRunning);
  return {
    schema: "mousecat.user-service/1",
    ok: expectedRunning === null || running === expectedRunning,
    action,
    installed: installed(plan),
    running,
    managedProcessAlive: processAlive(record?.pid),
    endpoint: `http://127.0.0.1:${port}/mcp`,
    operatorUrl: `http://127.0.0.1:${port}/`,
    plan: { platform: plan.platform, mechanism: plan.mechanism, id: plan.id, path: plan.path || null },
  };
}
