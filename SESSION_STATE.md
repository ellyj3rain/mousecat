| Document | Mousecat Session State |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 09:57 UTC / 02:57 PDT |
| Status | ACTIVE - current working state. |

# Session State

## Current State

Mousecat is on branch `mallowfluff-a10-widget-surface` in the operator's OSS Mousecat checkout.

The active correction is that Mousecat is open-source bridge code. Private Neo tools are reached through an ignored local external-MCP connector, not embedded into the repository.

The current development slice is A10: generic operator-widget surface and visualizer event stream. `npm run pr:ready` remains the local contribution gate. GitHub exposes stable `ci-verify`, Node 20 compatibility, CodeQL, dependency scan, secret scan, manual package dry run, PR classification traces, and read-only PR outcome observations before any auto-merge or publication authority is introduced.

## Immediate Next

Verify readiness with:

```powershell
npm run pr:ready
```

Then open the A10 pull request once local readiness passes. Keep publication or auto-merge tokens out until explicitly approved.

## Open Decisions

| Decision | Status |
|---|---|
| OSS license | Ratified as MPL-2.0. |
| Package namespace | Needs operator ratification before npm publication. |
| Live upstream priority | Private Neo connector first, then GitHub/browser/custom connectors behind the same permit boundary. |
| GitHub branch protection | Required checks, linear history, conversation resolution, and no force-push/delete posture are active. |
| Operator widget | Generic `mousecat.widget` facade owns availability, request, response, hold, and snapshot packets. |
