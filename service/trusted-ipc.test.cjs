"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { isAllowedRendererUrl, isTrustedIpcEvent, assertTrustedIpcEvent } = require("../electron/trusted-ipc.cjs");

const html = path.resolve("dist", "index.html");

function fixture(url = pathToFileURL(html).href) {
  const mainFrame = { url };
  const webContents = { mainFrame };
  return {
    event: { sender: webContents, senderFrame: mainFrame },
    options: { webContents, isDev: false, devUrl: "http://127.0.0.1:5173", appHtmlPath: html },
  };
}

test("the exact packaged main frame is trusted", () => {
  const { event, options } = fixture();
  assert.equal(isTrustedIpcEvent(event, options), true);
  assert.doesNotThrow(() => assertTrustedIpcEvent(event, options));
});

test("same-origin subframes, second windows, and navigated main frames are refused", () => {
  const { event, options } = fixture();
  assert.equal(isTrustedIpcEvent({ ...event, senderFrame: { url: event.senderFrame.url } }, options), false);
  assert.equal(isTrustedIpcEvent({ sender: { mainFrame: event.senderFrame }, senderFrame: event.senderFrame }, options), false);
  event.senderFrame.url = "https://example.invalid/";
  assert.equal(isTrustedIpcEvent(event, options), false);
  assert.throws(() => assertTrustedIpcEvent(event, options), /current Mousecat main frame/);
});

test("development trust is limited to the configured origin and entry paths", () => {
  const options = { isDev: true, devUrl: "http://127.0.0.1:5173", appHtmlPath: html };
  assert.equal(isAllowedRendererUrl("http://127.0.0.1:5173/", options), true);
  assert.equal(isAllowedRendererUrl("http://127.0.0.1:5173/index.html", options), true);
  assert.equal(isAllowedRendererUrl("http://localhost:5173/", options), false);
  assert.equal(isAllowedRendererUrl("http://127.0.0.1:5173/?delegate=1", options), false);
});
