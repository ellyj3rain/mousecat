"use strict";
const { pathToFileURL } = require("node:url");

function isAllowedRendererUrl(value, { isDev, devUrl, appHtmlPath }) {
  let candidate;
  try { candidate = new URL(String(value || "")); }
  catch { return false; }
  if (isDev) {
    const allowed = new URL(devUrl);
    return candidate.origin === allowed.origin
      && (candidate.pathname === "/" || candidate.pathname === "/index.html")
      && candidate.search === ""
      && candidate.hash === "";
  }
  return candidate.href === pathToFileURL(appHtmlPath).href;
}

/** Engine authority belongs only to the current Mousecat window's exact main
    frame. Same-origin subframes and second Electron windows are not principals. */
function isTrustedIpcEvent(event, options) {
  const webContents = options && options.webContents;
  const frame = event && event.senderFrame;
  if (!webContents || event.sender !== webContents || !frame) return false;
  if (!webContents.mainFrame || frame !== webContents.mainFrame) return false;
  return isAllowedRendererUrl(frame.url, options);
}

function assertTrustedIpcEvent(event, options) {
  if (!isTrustedIpcEvent(event, options)) {
    const error = new Error("refused: engine IPC requires the current Mousecat main frame");
    error.code = "MC_UNTRUSTED_ENGINE_FRAME";
    throw error;
  }
}

module.exports = { isAllowedRendererUrl, isTrustedIpcEvent, assertTrustedIpcEvent };
