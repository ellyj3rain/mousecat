/* ============================================================================
   GitHub surface for the gated engine. Resolves the `gh` CLI, reads auth status
   (read-only), and is the home for GitHub account MANAGEMENT (sign in / switch /
   sign out) and GitHub-specific command building (repo create / connect). The
   engine composes this into the acting half; pb-core is never involved.

   Account management facilitates the operator's own `gh` auth: this module never
   reads or enters credentials. Sign-in opens an interactive terminal the operator
   completes; switch / sign-out shell `gh auth` with explicit host + user.
   ============================================================================ */
"use strict";
const { execFile } = require("node:child_process");
const path = require("node:path");

/** Use the explicitly configured CLI or resolve gh through PATH. */
function resolveGh() {
  return process.env.GH_PATH || "gh";
}

function ghRun(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(resolveGh(), args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 20000, ...opts }, (err, stdout, stderr) => {
      resolve({
        code: err ? (err.code ?? 1) : 0,
        enoent: !!(err && err.code === "ENOENT"),
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
      });
    });
  });
}

/** Read GitHub auth status (read-only): every account, active flag, scopes, protocol. */
async function status() {
  const r = await ghRun(["auth", "status"]);
  if (r.enoent) {
    return { available: false, authenticated: false, accounts: [], note: "GitHub CLI (gh) is not installed." };
  }
  const text = `${r.stdout}\n${r.stderr}`;
  const accounts = [];
  // each account block: "Logged in to <host> account <login> ..." followed by "- ..." detail lines
  const re = /Logged in to (\S+) (?:account |as )([A-Za-z0-9-]+)[^\n]*\n((?:[ \t]+-[^\n]*\n?)*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const host = m[1];
    const login = m[2];
    const block = m[3] || "";
    const active = /Active account:\s*true/i.test(block);
    const protocol = (block.match(/Git operations protocol:\s*(\S+)/) || [])[1] || null;
    const scopesRaw = (block.match(/Token scopes:\s*(.+)/) || [])[1] || "";
    const scopes = scopesRaw.split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
    accounts.push({ host, login, active, protocol, scopes });
  }
  if (accounts.length === 0) {
    // tolerant fallback for older gh output shapes
    const re2 = /Logged in to (\S+) (?:account |as )([A-Za-z0-9-]+)/g;
    let m2;
    while ((m2 = re2.exec(text)) !== null) accounts.push({ host: m2[1], login: m2[2], active: true, protocol: null, scopes: [] });
  }
  const protocol = (accounts.find((a) => a.active) || accounts[0] || {}).protocol || null;
  return { available: true, authenticated: accounts.length > 0, accounts, protocol };
}

/** Request a separate Windows console for operator-completed gh authentication.
    Other platforms use their own terminal; no authentication success is inferred. */
async function launchLogin() {
  if (process.platform !== "win32") {
    return { ok: false, launched: false, requiresTerminal: true, command: [resolveGh(), "auth", "login"],
      error: "Open your terminal and run gh auth login, then Refresh. Automatic sign-in terminals are supported on Windows only." };
  }
  const launcher = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  // The executable is an environment value, never interpolated into shell source.
  const script = "$ErrorActionPreference = 'Stop'; try { Start-Process -FilePath $env:MC_GH_AUTH_EXECUTABLE -ArgumentList @('auth','login') -ErrorAction Stop | Out-Null } catch { Write-Error $_; exit 1 }";
  return new Promise((resolve) => {
    const failed = (error) => resolve({ ok: false, launched: false,
      error: `Could not open the GitHub sign-in terminal: ${error && error.message ? error.message : String(error)}` });
    try {
      execFile(launcher, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
        windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024,
        env: { ...process.env, MC_GH_AUTH_EXECUTABLE: resolveGh() },
      }, (error) => {
        if (error) return failed(error);
        resolve({ ok: true, launched: true, note: "The sign-in process started in a separate terminal. Complete authentication there, then Refresh; authentication has not been checked yet." });
      });
    } catch (error) { failed(error); }
  });
}

/** Switch the active GitHub account (non-interactive). */
async function switchAccount({ host = "github.com", user } = {}) {
  if (!user) return { ok: false, error: "which account to switch to was not given" };
  const r = await ghRun(["auth", "switch", "--hostname", host, "--user", user]);
  return { ok: r.code === 0, output: (r.stdout || r.stderr).trim(), error: r.code === 0 ? undefined : (r.stderr || r.stdout).trim() };
}

/** Sign out of a GitHub account. Confirmed in the UI before this runs. */
async function logout({ host = "github.com", user } = {}) {
  const args = ["auth", "logout", "--hostname", host];
  if (user) args.push("--user", user);
  const r = await ghRun(args);
  return { ok: r.code === 0, output: (r.stdout || r.stderr).trim(), error: r.code === 0 ? undefined : (r.stderr || r.stdout).trim() };
}

module.exports = { resolveGh, ghRun, status, launchLogin, switchAccount, logout };
