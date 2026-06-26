| Document | Mousecat Session State |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 09:57 UTC / 02:57 PDT |
| Status | ACTIVE - current working state. |

# Session State

## Current State

Mousecat is on branch `mallowfluff-a2-oss-neo-connector` in the operator's OSS Mousecat checkout.

The active correction is that Mousecat is open-source bridge code. Private Neo tools are reached through an ignored local external-MCP connector, not embedded into the repository.

The current development slice is A8.1: public PR classifier scaffolding plus CI merge-base repair around the Mousecat source surface. `npm run pr:ready` is now the local and CI contribution gate: tests, GitHub classifier tests, runtime smokes, governance floor, governance ceiling, doc currency, strict hygiene, dependency audit, and GitHub Actions workflows must agree before review. Pull requests additionally run chronology and PR-shape gates.

## Immediate Next

Verify readiness with:

```powershell
npm run pr:ready
```

Then connect the GitHub remote and ratify branch protection once the operator confirms repository ownership and publication target.

## Open Decisions

| Decision | Status |
|---|---|
| OSS license | Ratified as MPL-2.0. |
| Package namespace | Needs operator ratification before npm publication. |
| Live upstream priority | Private Neo connector first, then GitHub/browser/custom connectors behind the same permit boundary. |
| GitHub remote and branch protection | Needs operator ratification before push/PR creation. |
