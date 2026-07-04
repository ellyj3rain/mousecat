# Mousecat CI/CD and Governance

This directory holds the GitHub Actions configuration for PolyForm Perimeter 1.0.0, GZDS-governed Mousecat.

## Workflows

- `.github/workflows/ci-verify.yml`: Primary PR readiness gate. Runs on PR and push to main. Executes chronology and PR-shape gates, writes classifier trace artifacts, runs `npm ci`, `npm run pr:ready`, and `npm audit --audit-level=high`. The `pr:ready` surface includes `docs:pr`, the repository-local PR documentation runner.
- `.github/workflows/cd-dry-run.yml`: Manual package dry run. Runs the full CI verification surface before `npm pack --dry-run`.
- `.github/workflows/pr-outcome-corpus.yml`: Read-only outcome observation lane for closed PRs and completed required-check workflows. It uploads structured observations as artifacts and does not push corpus commits.
- `mousecat.ci.config.json`: Checked-in CI/default smoke config. It keeps public readiness independent from ignored local connector files.
- `.github/scripts/check-pr-chronology.mjs`: PR chronology gate. Skips draft PRs and blocks a ready PR while an older non-draft PR targets the same base.
- `.github/scripts/check-pr-shape.mjs`: PR shape classifier gate. Blocks generated/local output, routes large, wide, or governance-incoherent PRs through operator ratification labels, and can emit `mousecat.gitops.pr-classification/1` trace records.
- `.github/scripts/collect-pr-outcome.mjs`: Outcome observer. Emits `mousecat.gitops.pr-outcome-observation/1` records for PR and workflow-run events.
- `.github/workflows/codeql.yml`: CodeQL analysis for JavaScript. Publishes SARIF for GitHub code scanning (public repo surface).
- `.github/workflows/dependency-scan.yml`: Named dependency audit check for PRs, main pushes, scheduled runs, and manual dispatch.
- `.github/workflows/secret-scan.yml`: Pinned Gitleaks CLI scan for committed secret-shaped material on PRs, main pushes, scheduled runs, and manual dispatch.

## Dependabot

`.github/dependabot.yml` configures weekly PRs for npm and GitHub Actions.

## Security Posture (OSS)

- Least-privilege: workflows declare only required permissions (contents: read; codeql adds actions:read + security-events:write).
- No secrets referenced or required for core runs.
- Default config surface only: `mousecat.config.json` is gitignored; CI clones start with `connectors: {}` and safe "not-configured" posture for all upstreams (including neo). Private Neo paths, commands, or tokens are never present or executed.
- Reproducible installs via committed `package-lock.json`.
- Pinned action versions (major tags from trusted GitHub orgs), using Node 24-compatible GitHub-owned action majors.
- Native GitHub protections (secret scanning, push protection) complement the explicit `.github/workflows/secret-scan.yml` workflow. The workflow installs the open-source Gitleaks CLI directly so public and private organization downstreams do not depend on marketplace-action licensing.
- No automatic publication, deploy, or release. CD is a manual dry run until publication policy is ratified.

## Local Equivalence

```powershell
npm run ci:verify
# or equivalently
npm run pr:ready
```

This is what the required `ci-verify` gate runs before the audit step. See also AGENTS.md and root README.

`npm run docs:pr` is available as a targeted check for doc-pack completeness, source-change documentation, append-only ledger preservation, documentation path references, and batch-prefixed PR titles.

`npm run hooks:install` installs local checkout hooks and `npm run hooks:check` verifies them. CI does not require installed hooks; protected checks remain the remote authority.

Connector smokes run against the checked-in safe config and do not start private upstreams. Stale private MCP runtimes are handled by the public connector boundary as `connector-runtime-stale` when a local ignored config points Mousecat at that upstream.

## What this surface deliberately excludes

- Private Neo connector details or local paths.
- Publishing to npm or any registry.
- Deployment or hosting steps.
- Privileged runners.
- Scheduled issue auto-creation.
- Auto-merge or corpus-promotion authority.

## Branch Protection Recommendations (once remote connected)

Require status checks: `ci-verify`, `node-20-compat`, `dependency-scan`, `secret-scan`, `codeql`.

Require pull requests, up-to-date branches, linear history, conversation resolution, no force pushes, no deletions, and CODEOWNERS for governance-sensitive paths. Approval count can remain zero while distinct reviewer identity is not yet available, but review remains operator-owned.

## Future Slices

- Guarded auto-merge actuator after operator ratifies token scope and branch protection policy reads.
- Corpus promotion PRs after the artifact-only outcome observer proves stable.
- Publish gate when package publication policy is ratified.

This configuration is the first public GZDS-aligned OSS surface. All changes to it must be accompanied by updates to DECISION_REGISTRY.md and BATCH_LOG.md.
