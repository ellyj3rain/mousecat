# Mousecat CI

This directory holds the GitHub Actions configuration for MPL-2.0, GZDS-governed Mousecat.

## Workflows

- `ci.yml`: Primary PR readiness gate. Runs on PR and push to main. Matrix Node 20 + 22 on ubuntu-latest. Executes `npm ci` then `npm run pr:ready` and `npm audit --audit-level=high`.
- `mousecat.ci.config.json`: Checked-in CI/default smoke config. It keeps public readiness independent from ignored local connector files.
- `.github/scripts/check-pr-chronology.mjs`: PR chronology gate. Blocks a ready PR while an older non-draft PR targets the same base.
- `.github/scripts/check-pr-shape.mjs`: PR shape classifier gate. Blocks generated/local output and routes large, wide, or governance-incoherent PRs through operator ratification labels.
- `codeql.yml`: CodeQL analysis for JavaScript. Publishes SARIF for GitHub code scanning (public repo surface).
- `dependency-scan.yml`: Named dependency audit check for PRs, main pushes, scheduled runs, and manual dispatch.
- `secret-scan.yml`: Gitleaks scan for committed secret-shaped material on PRs, main pushes, scheduled runs, and manual dispatch.

## Dependabot

`.github/dependabot.yml` configures weekly PRs for npm and GitHub Actions.

## Security Posture (OSS)

- Least-privilege: workflows declare only required permissions (contents: read; codeql adds actions:read + security-events:write).
- No secrets referenced or required for core runs.
- Default config surface only: `mousecat.config.json` is gitignored; CI clones start with `connectors: {}` and safe "not-configured" posture for all upstreams (including neo). Private Neo paths, commands, or tokens are never present or executed.
- Reproducible installs via committed `package-lock.json`.
- Pinned action versions (major tags from trusted GitHub orgs).
- Native GitHub protections (secret scanning, push protection) complement the explicit `secret-scan.yml` workflow.
- No publication, deploy, or release steps in initial slice (gated/manual only per mandate).

## Local Equivalence

```powershell
npm run ci:verify
# or equivalently
npm run pr:ready
```

This is what CI runs (modulo matrix and audit). See also AGENTS.md and root README.

## What this surface deliberately excludes

- Private Neo connector details or local paths.
- Publishing to npm or any registry.
- Deployment or hosting steps.
- Multi-OS or privileged runners.
- Scheduled issue auto-creation (can be added later).

## Branch Protection Recommendations (once remote connected)

Require status checks: `verify (node-20)`, `verify (node-22)`, `dependency-scan`, `secret-scan`, `codeql`.

Require the PR template for human review notes and keep CODEOWNERS enabled for governance-sensitive paths once the remote is connected.

Require PR reviews and up-to-date branches.

## Future slices (operator direction only)

- Additional smoke or integration once safe public test fixtures exist.
- Publish gate (manual or release-triggered) when publication policy ratified.

This configuration is the first public GZDS-aligned OSS surface. All changes to it must be accompanied by updates to DECISION_REGISTRY.md and BATCH_LOG.md.
