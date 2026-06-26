#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_API_URL = "https://api.github.com";

export function pullRequestContext(event) {
  const pr = event && event.pull_request;
  if (!pr) return null;
  return {
    currentNumber: Number(pr.number),
    baseRefName: pr.base && pr.base.ref ? pr.base.ref : null,
    repository: event.repository && event.repository.full_name ? event.repository.full_name : null,
    isDraft: Boolean(pr.draft ?? pr.isDraft),
  };
}

export function normalizePullRequest(pr) {
  return {
    number: Number(pr.number),
    title: String(pr.title || ""),
    url: String(pr.html_url || pr.url || ""),
    baseRefName: pr.baseRefName || (pr.base && pr.base.ref) || null,
    isDraft: Boolean(pr.isDraft ?? pr.draft),
  };
}

export function findBlockingPullRequests({ currentNumber, baseRefName, openPullRequests }) {
  return (openPullRequests || [])
    .map(normalizePullRequest)
    .filter((pr) => Number.isInteger(pr.number))
    .filter((pr) => pr.number < currentNumber)
    .filter((pr) => pr.baseRefName === baseRefName)
    .filter((pr) => !pr.isDraft)
    .sort((a, b) => a.number - b.number);
}

function readEvent(path) {
  if (!path) throw new Error("GITHUB_EVENT_PATH is required for pull_request chronology checks");
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireToken(env) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required for pull_request chronology checks");
  return token;
}

function nextLink(linkHeader) {
  const parts = String(linkHeader || "").split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

async function githubJson(url, token, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "mousecat-pr-chronology-check",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${text || response.statusText}`);
  }
  return {
    data: await response.json(),
    next: nextLink(response.headers.get("link")),
  };
}

export async function listOpenPullRequests({ apiUrl = DEFAULT_API_URL, repository, token, baseRefName, fetchImpl = fetch }) {
  if (!repository) throw new Error("repository is required for pull_request chronology checks");
  const root = apiUrl.replace(/\/$/, "");
  let url = `${root}/repos/${repository}/pulls?state=open&base=${encodeURIComponent(baseRefName)}&per_page=100`;
  const pulls = [];
  while (url) {
    const page = await githubJson(url, token, fetchImpl);
    pulls.push(...page.data);
    url = page.next;
  }
  return pulls;
}

function formatBlockers(blockers) {
  return blockers
    .map((pr) => `#${pr.number} ${pr.title}${pr.url ? ` (${pr.url})` : ""}`)
    .join("\n");
}

export async function run(env = process.env) {
  if (env.GITHUB_EVENT_NAME !== "pull_request") {
    process.stdout.write("PR chronology gate: skipped outside pull_request event\n");
    return 0;
  }

  const context = pullRequestContext(readEvent(env.GITHUB_EVENT_PATH));
  if (!context || !context.currentNumber || !context.baseRefName) {
    throw new Error("pull_request event did not include number and base branch");
  }

  if (context.isDraft) {
    process.stdout.write(`PR chronology gate: skipped for draft PR #${context.currentNumber}\n`);
    return 0;
  }

  const token = requireToken(env);
  const openPullRequests = await listOpenPullRequests({
    apiUrl: env.GITHUB_API_URL || DEFAULT_API_URL,
    repository: context.repository,
    token,
    baseRefName: context.baseRefName,
  });
  const blockers = findBlockingPullRequests({
    currentNumber: context.currentNumber,
    baseRefName: context.baseRefName,
    openPullRequests,
  });

  if (blockers.length) {
    process.stderr.write(
      `PR chronology gate: BLOCKED - PR #${context.currentNumber} cannot merge while older non-draft PRs target ${context.baseRefName}:\n${formatBlockers(blockers)}\n`,
    );
    return 1;
  }

  process.stdout.write(`PR chronology gate: OK - no older non-draft PR blocks #${context.currentNumber}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`PR chronology gate: ERROR - ${err.message}\n`);
      process.exit(1);
    });
}
