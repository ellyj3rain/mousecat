#!/usr/bin/env node

import {
  candidateFiles,
  failIf,
  readText,
  report,
  runGit,
} from "./lib/check-utils.mjs";

const errors = [];
const files = candidateFiles();
const forbiddenPaths = [
  /^mousecat\.config\.json$/u,
  /^node_modules\//u,
  /^runtime\//u,
  /^traces\//u,
  /^artifacts\/local\//u,
  /^\.mousecat\//u,
  /^\.neo(?:-sandboxes)?\//u,
  /^design\/.*decision-receipt.*\.json$/u,
  /^apps\/mousecat-world\/Content\/MousecatWorld\/Generated\/.*\.region(?:\.receipt)?\.json$/u,
  /^\.env(?:\.|$)/u,
  /\.(sqlite|sqlite3|db|docx|pdf)$/u,
];
const localPathPatterns = [
  new RegExp(["C:", "\\\\", "Users", "\\\\"].join(""), "u"),
  new RegExp(["C:", "/", "Users", "/"].join(""), "u"),
  new RegExp(["Peanut", " Butter"].join(""), "u"),
];

for (const file of files) {
  const normalized = file.replace(/\\/gu, "/");
  for (const pattern of forbiddenPaths) {
    failIf(errors, pattern.test(normalized), `${file} must not be tracked or proposed for commit.`);
  }

  const text = readText(file);
  failIf(errors, localPathPatterns.some((pattern) => pattern.test(text)), `${file} contains a local operator path.`);
  failIf(errors, /BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY/u.test(text), `${file} contains private-key shaped material.`);
  failIf(errors, /(password|token|secret|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/iu.test(text), `${file} contains secret-shaped assignment text.`);
}

const ignoredConfig = runGit(["check-ignore", "mousecat.config.json"]);
failIf(errors, ignoredConfig.trim() !== "mousecat.config.json", "mousecat.config.json must be ignored.");

report("hygiene:strict", errors);
