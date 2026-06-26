import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function pathFromRoot(path) {
  return resolve(REPO_ROOT, path);
}

export function readText(path) {
  return readFileSync(pathFromRoot(path), "utf8").replace(/^\uFEFF/, "");
}

export function readJson(path) {
  return JSON.parse(readText(path));
}

export function fileExists(path) {
  return existsSync(pathFromRoot(path));
}

export function runGit(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function candidateFiles() {
  const output = runGit(["ls-files", "--cached", "--others", "--exclude-standard"]);
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((path) => existsSync(pathFromRoot(path)) && statSync(pathFromRoot(path)).isFile())
    .sort();
}

export function failIf(errors, condition, message) {
  if (condition) errors.push(message);
}

export function report(name, errors) {
  if (errors.length > 0) {
    console.error(`${name}: failed`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`${name}: ok`);
}

export function markdownTableItems(markdown, headerName = "Tool") {
  const lines = markdown.split(/\r?\n/u);
  const out = [];
  let inTable = false;

  for (const line of lines) {
    if (!line.startsWith("|")) {
      if (inTable) break;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 2) continue;
    if (cells[0] === headerName) {
      inTable = true;
      continue;
    }
    if (inTable && /^-+$/u.test(cells[0].replace(/:/gu, ""))) continue;
    if (inTable) {
      const match = /`([^`]+)`/u.exec(cells[0]);
      if (match) out.push(match[1]);
    }
  }

  return out;
}

export function latestHeading(markdown, prefix) {
  const headings = markdown
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(prefix));
  return headings.at(-1) || null;
}
