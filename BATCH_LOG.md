| Document | Mousecat Batch Log |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 10:04 UTC / 03:04 PDT |
| Status | ACTIVE - append-only batch history. |

# Batch Log

## [A1] | 2026-06-26 01:17 UTC / 18:17 PST | Mousecat MCP organ instantiated

*Scope:* Instantiate Mousecat as an open-source-ready MCP control plane with working CLI, stdio MCP server, atomic skill buttons, skill frameworks, work permits, routing descriptors, tool-boundary policy, and governance docs.

*Deliverables:*
- Repository doc-pack populated at the root.
- MCP tools exposed under `mousecat.*`.
- CLI commands for status, catalog, buttons, visualization, queue, permits, and MCP serving.
- Crucible, Mass-Assault, and Total Recall represented as source-owned atomic skill atoms.
- Skill-framework and work-permit catalogs established.
- Credential references explicitly separated from secret values.
- Tests and smoke scripts added.

*Verification:*
- `npm test`
- `npm run smoke:status`
- `npm run smoke:buttons`
- `npm run smoke:mcp`

*Version:* `0.1.0`.

## [A2] | 2026-06-26 01:33 UTC / 18:33 PST | OSS-safe Neo connector boundary

*Scope:* Correct Mousecat's open-source boundary so private Neo tools are consumed through a local MCP connector instead of being embedded as repository source, governance substrate, or committed tool intelligence.

*Deliverables:*
- Added a generic external MCP connector layer for stdio `tools/list` discovery and permitted `tools/call` forwarding.
- Added a minimal JSON-RPC stdio MCP client.
- Added disabled `connectors.neo` example config for local/private Neo endpoints.
- Added CLI commands for connector status and dynamic upstream tool discovery.
- Updated runtime route/invoke behavior so configured connectors can forward calls and missing connectors remain fail-closed.
- Added mock-MCP connector tests without importing private Neo tools.
- Updated docs and agent instructions to keep private Neo internals out of open source.

*Verification:*
- `npm test`
- `npm run smoke:status`
- `npm run smoke:connectors`
- `npm run smoke:buttons`
- `npm run smoke:mcp`

*Version:* `0.1.0`.

## [A3] | 2026-06-26 04:40 UTC / 21:40 PDT | Interaction sessions and visualizer event graph

*Scope:* Add the first public Mousecat augmentation-plane primitive beyond connector forwarding: structured operator interaction sessions, atomic multi-item chains, held queue items, and visualizer-safe graph snapshots.

*Deliverables:*
- `mousecat.ask` now returns `mousecat.interaction/1` with `sessionId`, `interactionId`, `parentInteractionId`, public interaction shapes, constraints, items, and a backward-compatible `question` alias.
- Legacy shapes normalize into public shapes without exporting host-specific vocabulary as canonical shape names.
- `mousecat.queue` can enqueue multiple atomic items, preserve session/interaction lineage, and hold items without fabricating answers.
- `mousecat.visualize` returns interaction sessions, public event categories, and live graph nodes/edges for upstreams, interactions, and queue items.
- Tests cover multi-item chains, held queue items, and visualizer graph output.

*Verification:*
- `npm test`

*Version:* `0.1.0`.

## [A4] | 2026-06-26 04:48 UTC / 21:48 PDT | Public bridge contract ingestion

*Scope:* Add Mousecat's first resource-facing upstream bridge path so a host can read Neo's public Mousecat contract through MCP without invoking private tools or exporting private implementation details.

*Deliverables:*
- External MCP connectors now support `resources/list` and `resources/read`.
- `mousecat.bridge` reads `mousecat_bridge_contract_v1` and returns `mousecat.bridge.summary/1`.
- Bridge summaries expose public schema names, versions, server method names, stale-runtime policy, counts, public route/button metadata, boundary classes, exported labels, and withheld labels.
- Bridge summaries omit raw input schemas by default and do not include private source paths, credentials, operator memory, runtime payloads, run traces, or private handlers.
- CLI commands `resources` and `bridge` exercise the connector path.
- Mock MCP fixture and tests cover resource discovery, bridge ingestion, and summary redaction.
- Config loading tolerates BOM-prefixed local JSON created by Windows tooling.

*Verification:*
- `npm test`
- `node src/cli.mjs resources neo`
- `node src/cli.mjs bridge neo`

*Version:* `0.1.0`.

## [A5] | 2026-06-26 04:57 UTC / 21:57 PDT | MPL-2.0 open-source posture

*Scope:* Ratify Mousecat's open-source license as MPL-2.0 before GitHub publication setup.

*Deliverables:*
- Added the standard MPL-2.0 `LICENSE` file.
- Updated package metadata from `UNLICENSED` to `MPL-2.0`.
- Added `LICENSE` to the npm package file list.
- Updated README source policy to state Mousecat's file-level copyleft posture and proprietary integration allowance.
- Recorded the licensing decision in the decision registry.

*Verification:*
- `npm test`

*Version:* `0.1.0`.

## [A6] | 2026-06-25 05:15 UTC / 22:15 PDT | OSS CI/CD initial setup

*Scope:* Research and establish the first GitHub Actions CI/CD surface for Mousecat as open-source repository. Provide concrete, runnable verification and security for public contributions while strictly isolating private Neo connector configuration.

*Deliverables:*
- Committed package-lock.json for deterministic `npm ci` on runners.
- `.github/workflows/ci.yml`: matrixed verification on ubuntu-latest (Node 20, 22), `npm ci`, `npm run verify`, `npm audit`.
- `.github/workflows/codeql.yml`: JavaScript/TypeScript analysis with SARIF upload for public code scanning.
- `.github/dependabot.yml`: weekly updates for npm and GitHub Actions.
- Append-only records: DR-007 and this batch entry.
- README and AGENTS.md updated with CI surface notes.
- All under OSS constraints: default config only, no private paths/secrets/publishing, minimal permissions, pinned actions.

*Verification:*
- `npm test`
- `npm run verify` (status, buttons, connectors, mcp all pass under clean default config with no mousecat.config.json present)
- Local smoke execution confirmed before surface definition (see run output in session)
- Workflows follow patterns from reference private engine and GZDS surfaces adapted for OSS safety and simplicity.

*Version:* `0.1.0`.

## [A7] | 2026-06-26 09:57 UTC / 02:57 PDT | GZDS-aligned PR readiness spine

*Scope:* Harden the initial CI surface into a public Mousecat contribution gate that reflects GZDS-style auditability without depending on private upstream implementation.

*Deliverables:*
- Added `npm run pr:ready` as the canonical branch and pull-request readiness command.
- Added governance floor, governance ceiling, docs currency, and strict hygiene scripts under `scripts/`.
- Updated GitHub CI to execute `npm run pr:ready` on Node 20 and 22.
- Added named dependency and secret scan workflows for the public repository surface.
- Updated README, GOVERNANCE, AGENTS, SESSION_STATE, and CI notes around the AI-native readiness contract.
- Removed public-doc local-path leakage and kept `mousecat.config.json` ignored as the local connector boundary.

*Verification:*
- `npm run pr:ready`
- `git diff --check`

*Version:* `0.1.0`.

## [A8] | 2026-06-26 10:04 UTC / 03:04 PDT | PR classifier governance scaffolding

*Scope:* Cross-reference the current Neo GitOps governance classifier pattern and add the portable Mousecat scaffolding needed for AI-native open-source contribution review.

*Deliverables:*
- Added source-owned governed verdict and PR/merge classifier modules under `src/core/governance/`.
- Added tests for PR shape and merge-strategy classification.
- Added GitHub PR chronology and PR shape gate scripts with tests.
- Wired PR chronology and shape gates into GitHub CI for pull requests.
- Added PR template and CODEOWNERS for governance-sensitive review posture.
- Updated readiness documentation and ceiling checks so classifier scaffolding remains part of the public gate.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `git diff --check`

*Version:* `0.1.0`.

## [A8.1] | 2026-06-26 10:34 UTC / 03:34 PDT | CI PR shape merge-base repair

*Scope:* Repair the first GitHub Actions run for the PR shape classifier after the public remote was created.

*Deliverables:*
- Updated the primary CI checkout to use full fetch history so `origin/main...HEAD` has a merge base in pull-request runs.
- Kept the PR shape classifier itself unchanged.

*Verification:*
- `npm run pr:ready`
- GitHub PR checks on PR #1

*Version:* `0.1.0`.

## [A9] | 2026-06-26 18:05 UTC / 11:05 PDT | Governed CI/CD observation loop

*Scope:* Integrate the stronger Neo-style GitOps governance posture into Mousecat's public OSS contribution surface without importing private Neo implementation logic or adding privileged automation.

*Deliverables:*
- Renamed the primary workflow to stable `ci-verify` and preserved Node 20 compatibility as a separate check.
- Added classifier trace emission for `mousecat.gitops.pr-classification/1` records.
- Added read-only PR outcome observation workflow and script for `mousecat.gitops.pr-outcome-observation/1` artifact records.
- Added manual package dry-run workflow and `npm run cd:dry-run`.
- Updated GitHub-owned workflow actions to Node 24-compatible major versions.
- Updated CI, governance, README, AGENTS, and session-state docs around protected checks and future token-gated automation.
- Added focused tests for classifier traces and outcome observations.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`

*Version:* `0.1.0`.
