"use strict";
// Source-owned, opt-in installation observation. No input or operator profile.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function prepareInstallationCheck(app, argv = process.argv) {
  const args = argv.filter(value => value.startsWith("--installation-check="));
  if (!args.length) return null;
  if (args.length !== 1) throw new Error("One installation check directory is required");
  const directory = path.resolve(args[0].slice("--installation-check=".length));
  const temporary = fs.realpathSync(os.tmpdir());
  if (!directory.startsWith(temporary + path.sep) || fs.existsSync(directory)) throw new Error("Installation check requires a new directory under the current temporary root");
  fs.mkdirSync(directory);
  // Apply before engine imports; never point at the operator's private store.
  process.env.MC_DATA_DIR = path.join(directory, "state");
  process.env.MC_OPERATIONS_MANIFEST = path.join(directory, "unconfigured-operations.json");
  delete process.env.MC_NEO_PATH;
  delete process.env.MC_MODELS_MANIFEST;
  app.setPath("userData", path.join(directory, "profile"));
  app.setPath("sessionData", path.join(directory, "session"));
  return { directory, errors: [] };
}

async function observeInstallation({ app, win, check, planStanding }) {
  const receipt = { schema: "mc.desktop-installation-check/1", observedAt: new Date().toISOString(),
    executable: process.execPath, executableSha256: hash(process.execPath), packaged: app.isPackaged,
    appPath: app.getAppPath(), userData: app.getPath("userData"), profileIsolated: true,
    operatorProfileRead: false, operatorSourcesRead: false, windowShown: false, inputSent: false,
    evidenceScope: "Installed executable, exact packaged assets and synthetic approval lifecycle; no live fleet or operator acceptance claim", frames: [] };
  try {
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    receipt.presentation = await win.webContents.executeJavaScript(`(() => ({title:document.title,wordmark:document.querySelector('.wordmark')?.innerText,logoLoaded:!!document.querySelector('.wordmark img')?.naturalWidth,logoSource:document.querySelector('.wordmark img')?.getAttribute('src'),musingsVisible:/\\bMusings\\b/.test(document.body.innerText),navigation:[...document.querySelectorAll('.nav-seg button')].map(button=>button.innerText)}))()`);
    for (const [label, width, height] of [["wide",1320,860],["narrow",960,780]]) {
      win.setContentSize(width,height);
      await win.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const png=(await win.webContents.capturePage()).toPNG();
      const file=path.join(check.directory,label+".png"); fs.writeFileSync(file,png);
      receipt.frames.push({label,file,bytes:png.length,sha256:hash(file),width,height});
    }
    receipt.approvalLifecycle = await planStanding.reducePlanStanding(["issue","approve","begin","succeed"]);
    receipt.errors = check.errors;
    receipt.ok = receipt.packaged && receipt.presentation.title === "Mousecat" && receipt.presentation.wordmark === "Mousecat" && receipt.presentation.logoLoaded && !receipt.presentation.musingsVisible && receipt.approvalLifecycle.ok && receipt.approvalLifecycle.standing === "applied" && !check.errors.length;
  } catch (error) { receipt.ok=false; receipt.error=String(error.message || error); }
  fs.writeFileSync(path.join(check.directory,"receipt.json"),JSON.stringify(receipt,null,2));
  app.exit(receipt.ok ? 0 : 1);
}
module.exports={prepareInstallationCheck,observeInstallation};
