| Document | Mousecat Session State |
|---|---|
| Version | 0.1.5.0-alpha |
| Timestamp | 2026-07-04 05:30 UTC / 22:30 PDT |
| Status | ACTIVE - current working state. |

# Session State

## Current State

Mousecat is on branch `main` in the operator's OSS Mousecat checkout.

The active correction is that Mousecat is open-source bridge code. Private Neo tools are reached through an ignored local external-MCP connector, not embedded into the repository.

The current development slice is A10.6: private downstream secret-scan portability. Mousecat now runs the pinned open-source Gitleaks CLI directly in `secret-scan`, so public and private organization downstreams share the same check without marketplace-action licensing. The A10.1-A10.5 governance stack remains active: PR documentation runner, Kohai versioning, PolyForm Perimeter, local hooks, and stale upstream MCP runtime handling. `npm run pr:ready` remains the full local contribution gate. GitHub exposes stable `ci-verify`, Node 20 compatibility, CodeQL, dependency scan, secret scan, manual package dry run, PR classification traces, and read-only PR outcome observations before any auto-merge or publication authority is introduced.

## Immediate Next

Verify readiness after secret-scan portability with:

```powershell
npm run pr:ready
```

Then continue Mousecat development from `main` after local readiness passes. Keep publication or auto-merge tokens out until explicitly approved.

## Open Decisions

| Decision | Status |
|---|---|
| License | Ratified as PolyForm Perimeter 1.0.0; supersedes MPL-2.0 for Mousecat going forward. |
| Package namespace | Needs operator ratification before npm publication. |
| Live upstream priority | Private Neo connector first, then GitHub/browser/custom connectors behind the same permit boundary. |
| GitHub branch protection | Pending on the private downstream until the baseline check set is green; required check names remain `ci-verify`, `node-20-compat`, `dependency-scan`, `secret-scan`, and `codeql`. |
| Operator widget | Generic `mousecat.widget` facade owns availability, request, response, hold, and snapshot packets. |
| Kohai root odometer | Active. Root `VERSION` uses `major.minor.kohai.patch-maturity`; package metadata uses npm projection. |
| License-policy supersession | Closed by A10.3 / DR-014. Future supersession still requires a new decision record. |
| Local governance hooks | Active. Install with `npm run hooks:install`; verify with `npm run hooks:check`. |
| Stale upstream MCP runtime | Active. `MCP_RUNTIME_STALE` becomes `connector-runtime-stale` with restart guidance at discovery and invocation boundaries. |
