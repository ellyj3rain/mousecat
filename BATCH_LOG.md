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

## [A10] | 2026-06-26 18:58 UTC / 11:58 PDT | Generic operator-widget surface

*Scope:* Add the first host-facing widget facade above Mousecat's interaction runtime so AI hosts can use a generic operator interaction contract without depending on workflow-specific skill names.

*Deliverables:*
- Added `mousecat.widget` with availability, ask, respond, hold, and snapshot actions.
- Added `mousecat.operator-widget.contract/1`, `mousecat.operator-widget.request/1`, and `mousecat.operator-widget.result/1` surfaces.
- Added generic widget controls separate from compatibility skill buttons.
- Added `mousecat.visualizer.event/1` event-stream records to `mousecat.visualize`.
- Added `smoke:widget` to the public verify surface.
- Updated README, architecture, governance, and session state to use the broader widget framing.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`

*Version:* `0.1.0`.

## [A10.1] | 2026-07-04 02:04 UTC / 19:04 PDT | PR documentation runner governance hardening

*Scope:* Apply the Marshmallow Commons open-source governance direction to Mousecat by adding a clean-room documentation consistency runner to the public readiness gate.

*Deliverables:*
- Added the pure PR documentation runner core under `src/core/governance/doc-runner.mjs`.
- Added `scripts/pr-doc-runner.mjs` and wired `npm run docs:pr` into `npm run pr:ready`.
- Added node tests for doc-pack completeness, source-change documentation, append-only ledgers, local-only references, path-reference resolution, and reference extraction.
- Updated README, governance, agent, and CI documentation so the runner is part of the public Mousecat contribution surface.
- Added `DR-012` to record the governance decision without importing private Neo internals.

*Verification:*
- `npm run docs:pr -- --all`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`

*Version:* `0.1.0`.

## [A10.2] | 2026-07-04 02:17 UTC / 19:17 PDT | Kohai-aware governance alignment

*Scope:* Bring Mousecat's public governance floor up to the current Neo/GZDS Kohai version standard without importing private Neo implementation code.

*Deliverables:*
- Added `src/core/governance/version.mjs` as the Mousecat-owned version primitive for parsing the root odometer, computing tier movement, enforcing caps, and projecting npm metadata.
- Added tests for the four-coordinate root form, npm projection, and Kohai rollover.
- Changed root `VERSION` to `0.1.1.0-alpha` and package metadata to the npm projection `0.1.1-alpha`.
- Updated the governance floor and docs checks to reject malformed root versions, cap violations, and package projection drift.
- Routed MCP server and client identity through package metadata instead of hardcoded version strings.
- Updated README, governance, session state, and decision/finding ledgers to record the Kohai standard.

*Verification:*
- `node --test test/version.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`

*Version:* `0.1.0` -> `0.1.1.0-alpha`; package projection `0.1.1-alpha` (governance maturation -> Kohai).

## [A10.3] | 2026-07-04 02:26 UTC / 19:26 PDT | PolyForm Perimeter license supersession

*Scope:* Supersede Mousecat's MPL-2.0 posture with PolyForm Perimeter 1.0.0 and wire the license into the public readiness floor.

*Deliverables:*
- Replaced `LICENSE` with Mousecat's required notice plus the official PolyForm Perimeter License 1.0.0 text and URL.
- Updated package metadata from `MPL-2.0` to `SEE LICENSE IN LICENSE`.
- Changed root `VERSION` to `0.1.2.0-alpha` and package metadata to the npm projection `0.1.2-alpha`.
- Updated governance floor, docs check, README, governance, CI, AGENTS, and session state to make PolyForm Perimeter the active Mousecat license posture.
- Added `DR-014` and `F-005` to record the license supersession and the stale MPL gate risk.

*Verification:*
- `node --test test/version.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`

*Version:* `0.1.1.0-alpha` -> `0.1.2.0-alpha`; package projection `0.1.2-alpha` (license/governance policy supersession -> Kohai).

## [A10.4] | 2026-07-04 02:28 UTC / 19:28 PDT | Local governance hook installation

*Scope:* Add Mousecat-owned local Git hooks so governance checks run before commits and pushes from the workstation.

*Deliverables:*
- Added `scripts/install-hooks.mjs` with source-owned `commit-msg`, `pre-commit`, and `pre-push` hook bodies plus `--check` verification.
- Added `test/install-hooks.test.mjs` for hook bodies, install behavior, and stale-hook detection.
- Added package scripts `hooks:install` and `hooks:check`.
- Installed the hooks in the local checkout.
- Updated README, governance, CI, AGENTS, and session state to document local hook installation and remote CI authority.
- Added `DR-015` and `F-006` to record the hook posture and the previous drift risk.

*Verification:*
- `npm run hooks:install`
- `npm run hooks:check`
- `node --test test/install-hooks.test.mjs test/version.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`

*Version:* `0.1.2.0-alpha` -> `0.1.3.0-alpha`; package projection `0.1.3-alpha` (local governance automation -> Kohai).

## [A10.5] | 2026-07-04 03:02 UTC / 20:02 PDT | Stale upstream MCP runtime boundary hardening

*Scope:* Make the live Neo-primary tool path actionable without importing private Neo internals by recognizing upstream MCP stale-runtime failures at Mousecat's public connector boundary.

*Deliverables:*
- Added `connector-runtime-stale` normalization in `src/core/mcp-client.mjs` for JSON-RPC errors that carry or mention `MCP_RUNTIME_STALE`.
- Propagated `restartRequired`, `staleCode`, and `upstreamMessage` through the `mousecat.invoke` envelope so hosts can restart the upstream connector without digging through nested error data.
- Extended the mock MCP fixture to reproduce a stale runtime after `initialize`.
- Added connector tests for stale discovery and stale permitted invocation.
- Updated README, governance, CI notes, session state, decision, and finding records to describe the boundary behavior.

*Verification:*
- `node --test test/connectors.test.mjs test/runtime.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`

*Version:* `0.1.3.0-alpha` -> `0.1.4.0-alpha`; package projection `0.1.4-alpha` (connector/runtime boundary governance maturation -> Kohai).

## [A10.6] | 2026-07-04 05:30 UTC / 22:30 PDT | Private downstream secret-scan portability

*Scope:* Keep Mousecat's named secret-scan gate portable across the public upstream and private Ground Zero Solutions downstream without requiring a marketplace-action license.

*Deliverables:*
- Replaced `gitleaks/gitleaks-action@v3` with a pinned direct install of the open-source Gitleaks CLI in `.github/workflows/secret-scan.yml`.
- Documented that the secret scan is a shared public/private downstream check and does not require private secrets or action licensing.
- Corrected session state so branch protection is pending on the private downstream until the baseline check set is green.
- Updated Kohai/package metadata for the CI governance portability maturation.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run hooks:check`
- `git diff --check`

*Version:* `0.1.4.0-alpha` -> `0.1.5.0-alpha`; package projection `0.1.5-alpha` (CI governance portability -> Kohai).

## [CHORE] | 2026-07-09 02:49 UTC / 19:49 PDT | GitHub Actions checkout dependency update

*Scope:* Record Dependabot's GitHub Actions maintenance update for `actions/checkout` so the PR documentation runner can verify that workflow-source changes remain documented.

*Deliverables:*
- Documented the Dependabot update from `actions/checkout@v6` to `actions/checkout@v7` across Mousecat workflow files.
- Kept the change version-preserving because it updates CI dependency wiring without expanding Mousecat's public runtime, MCP, governance, or operator-widget contract.

*Verification:*
- `npm run pr:ready`

*Version:* Unchanged at `0.1.5.0-alpha`; package projection unchanged at `0.1.5-alpha`.

## [CHORE] | 2026-07-09 02:52 UTC / 19:52 PDT | GitHub CodeQL action dependency update

*Scope:* Record Dependabot's GitHub Actions maintenance update for `github/codeql-action` so the PR documentation runner can verify that workflow-source changes remain documented.

*Deliverables:*
- Documented the Dependabot update from `github/codeql-action@v3` to `github/codeql-action@v4` in the CodeQL workflow.
- Kept the change version-preserving because it updates CI analysis dependency wiring without expanding Mousecat's public runtime, MCP, governance, or operator-widget contract.

*Verification:*
- `npm run pr:ready`

*Version:* Unchanged at `0.1.5.0-alpha`; package projection unchanged at `0.1.5-alpha`.

## [A11.0] | 2026-07-04 08:19 UTC / 01:19 PDT | Live Neo connector smoke

*Scope:* Make the Neo-primary runtime path locally verifiable from Mousecat without committing private Neo internals or generated discovery output.

*Deliverables:*
- Added `scripts/neo-live-smoke.mjs` for ignored local private Neo connector verification.
- Added HTTP and `streamable-http` support to the external MCP connector client while preserving existing stdio behavior.
- Added connector posture fields for endpoint and token-env configuration without exposing token values, private schemas, generated catalogs, or local Neo paths.
- Updated the public example config and docs to point Neo consumers at an HTTP MCP endpoint with environment-referenced credentials.
- Checked required public Neo tool/resource names, bridge contract summary, route readiness, permit-gated invocation, and runtime identity/doctor resources.
- Sanitized runtime reporting to retain version, revision, readiness, counts, and public boundary facts while excluding local paths, launcher paths, raw payloads, credentials, and generated catalogs.
- Extended the mock MCP fixture behind `MOUSECAT_MOCK_MCP_LIVE_SMOKE=1` so existing connector tests keep their narrow default behavior.
- Added a mock HTTP MCP fixture and HTTP-path tests for discovery, bridge-contract reads, permit-gated invocation, stale-runtime normalization, and live-smoke reporting.
- Added `test/neo-live-smoke.test.mjs` coverage for readiness and path sanitization.
- Updated README, governance, AGENTS, session state, decision, finding, and Kohai/package metadata for the new local smoke surface.

*Verification:*
- `node --test test/neo-live-smoke.test.mjs test/connectors.test.mjs`
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`
- `npm test`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run hooks:check`
- `git diff --check`

*Version:* Unchanged at `0.1.5.0-alpha`; package projection unchanged at `0.1.5-alpha`.

## [A11.1] | 2026-07-04 08:32 UTC / 01:32 PDT | Host adapter render packets

*Scope:* Carry the originally planned A11 adapter harness after the live Neo preflight by giving hosts source-owned render packets without creating a parallel widget API.

*Deliverables:*
- Added host adapter profiles for generic MCP, Codex, Claude Code, JetBrains, Cursor, and CLI consumers.
- Added `mousecat.adapter.render-packet/1` and `mousecat.adapter.render-packets/1` records through the existing catalog and visualizer surfaces.
- Added `node src/cli.mjs adapters` and `npm run smoke:adapters` so host bindings can inspect render packets directly.
- Kept widget semantics centralized in `mousecat.widget`, `mousecat.ask`, `mousecat.queue`, `mousecat.visualize`, and `mousecat.route`.
- Updated catalog/runtime tests for adapter profiles, render packets, visualizer exposure, and widget availability presentation.
- Updated README, architecture, roadmap, core identity, governance, agent guidance, CI notes, session state, decision, finding, and version metadata.

*Verification:*
- `node --test test/catalog.test.mjs test/runtime.test.mjs`
- `npm run smoke:adapters`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run hooks:check`
- `git diff --check`

*Version:* `0.1.5.0-alpha` -> `0.2.0.0-alpha`; package projection `0.2.0-alpha` (public host adapter contract expansion -> minor).

## [A11.2] | 2026-07-09 03:15 UTC / 20:15 PDT | Neo HTTP example config alignment

*Scope:* Align the checked-in Neo example config with the HTTP connector basis that landed in A11.0 and the host adapter basis that landed in A11.1.

*Deliverables:*
- Replaced the disabled Neo example connector's legacy stdio/private-root launcher shape with a disabled loopback HTTP MCP endpoint.
- Kept credentials environment-referenced through `tokenEnv` and avoided committing token values, generated catalogs, private Neo paths, raw runtime payloads, or private schemas.
- Left the connector implementation, live-smoke script, HTTP fixture coverage, and adapter render-packet surface unchanged because those already landed in A11.0/A11.1.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`

*Version:* No root/package version movement; A11.2 is example-config alignment inside the current `0.2.0-alpha` line.

## [A11.3] | 2026-07-09 03:21 UTC / 20:21 PDT | Local recursive state dockets

*Scope:* Let recursive Neo-assisted Mousecat work survive short-lived CLI and host process boundaries without committing generated state, private upstream data, credential values, or sensitive prompts.

*Deliverables:*
- Added optional ignored local JSON state controlled by `state.enabled`, defaulting under the ignored `.mousecat/` directory.
- Persisted sessions, interactions, decision queues, public events, and credential references across runtime instances.
- Redacted secret-shaped fields and sensitive interaction prompts, options, and answers before disk writes.
- Added `node src/cli.mjs session <action>` for session snapshots and total-recall dockets from the CLI.
- Updated public config/docs/governance/session state and recorded the local-state decision and finding.

*Verification:*
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`
- `node src/cli.mjs --config mousecat.config.json invoke neo infer_complexity_v1 profileId=tool-invocation "task=Add local untracked Mousecat state persistence for sessions, queues, events, credential references, and recursive handoff dockets without storing secrets or generated private Neo payloads."`
- `node src/cli.mjs --config mousecat.config.json invoke neo form_team_v1 profileId=tool-invocation "task=Implement Mousecat local state persistence and recursive session dockets with tests and source-owned governance docs."`
- `node --test test\runtime.test.mjs`

*Version:* `0.2.0.0-alpha` -> `0.3.0.0-alpha`; package projection `0.3.0-alpha` (public local-state runtime contract expansion -> minor).

## [A11.4] | 2026-07-09 03:27 UTC / 20:27 PDT | Bounded route-plan state

*Scope:* Extend the ignored local recursive state contract so route planning survives short-lived host and CLI processes without changing invocation permits or storing private upstream payloads.

*Deliverables:*
- Added bounded `routePlans` state with `state.maxRoutePlans`, defaulting to 100.
- Cached successful `mousecat.route` plans before the route-planned event persists local state.
- Exposed route-plan counts through `mousecat.status`, snapshots, and `mousecat.session total-recall`.
- Preserved permit-gated invocation behavior: route cache records plans only and does not execute upstream tools.
- Updated docs, example config, version metadata, and append-only governance records.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`
- `node src/cli.mjs --config mousecat.config.json route neo crucible_classify_v1`
- `node src/cli.mjs --config mousecat.config.json session total-recall`
- `node --test test\runtime.test.mjs`
- `node src/cli.mjs --config mousecat.config.json invoke neo infer_complexity_v1 profileId=tool-invocation "task=Add a bounded local route-plan cache to Mousecat state only; defer host-specific state adapters to a later slice."`
- `node src/cli.mjs --config mousecat.config.json invoke neo form_team_v1 profileId=tool-invocation "task=Implement bounded route-plan cache in Mousecat optional local state with focused tests and append-only governance records."`

*Version:* `0.3.0.0-alpha` -> `0.3.1.0-alpha`; package projection `0.3.1-alpha` (Kohai-level public state-contract maturation inside the A11 local-state line).

## [A11.5] | 2026-07-09 03:34 UTC / 20:34 PDT | Host-state adapter packets

*Scope:* Publish source-owned host-state adapter packets so each supported host profile can bind Mousecat state records without creating host-specific widget semantics or embedding private upstream state.

*Deliverables:*
- Added `mousecat.host-state-adapter/1` packets for generic MCP, Codex, Claude Code, JetBrains, Cursor, and CLI profiles.
- Added `mousecat.host-state-adapters/1` to the catalog and adapter render-packet surface.
- Defined host state scopes, readable records, writable interaction tools, sync triggers, and storage boundaries while keeping Mousecat the state-semantics owner.
- Updated catalog tests, entry-point docs, roadmap, session state, and governance ledgers.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`
- `node src/cli.mjs --config mousecat.config.json adapters`
- `node src/cli.mjs --config mousecat.config.json route neo crucible_classify_v1`
- `node src/cli.mjs --config mousecat.config.json session total-recall`
- `node src/cli.mjs --config mousecat.config.json invoke neo infer_complexity_v1 profileId=tool-invocation "task=Add host-state adapter packets to Mousecat adapter render contracts so each host knows how to consume optional local state without implementing host plugins."`
- `node src/cli.mjs --config mousecat.config.json invoke neo form_team_v1 profileId=tool-invocation "task=Implement host-state adapter packets in Mousecat adapter render contracts with tests and append-only governance docs."`

*Version:* `0.3.1.0-alpha` -> `0.4.0.0-alpha`; package projection `0.4.0-alpha` (public host-state adapter contract expansion -> minor).

## [A11.6] | 2026-07-09 03:41 UTC / 20:41 PDT | CLI host-state binding

*Scope:* Make the host-state adapter packet executable through the public MCP tool namespace and CLI so a real host path can consume Mousecat state without creating host-specific widget semantics or embedding private upstream state.

*Deliverables:*
- Added `mousecat.host-state` as an observer-readable public tool with a matching tool boundary.
- Added `node src/cli.mjs host-state <profile>` and `npm run smoke:host-state` for the first CLI/generic host binding proof.
- Returned `mousecat.host-state.binding/1` with the selected adapter, render packet, sync triggers, bounded records, readable/writable tool bindings, counts, limits, and safety boundaries.
- Redacted secret-shaped fields and sensitive interaction items in host-state binding responses.
- Rejected explicit unknown host profiles with `unknown-host-profile` instead of silently binding them as generic hosts.
- Updated runtime, catalog, MCP, CLI, documentation, version metadata, and append-only governance records.

*Verification:*
- `node --test test\catalog.test.mjs`
- `node --test test\runtime.test.mjs`
- `node src/cli.mjs --config .github/mousecat.ci.config.json host-state cli`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`
- `node src/cli.mjs --config mousecat.config.json host-state codex`
- `node src/cli.mjs --config mousecat.config.json route neo crucible_classify_v1`
- `node src/cli.mjs --config mousecat.config.json session total-recall`
- `node src/cli.mjs host-state missing-host`
- `node src/cli.mjs --config mousecat.config.json invoke neo infer_complexity_v1 profileId=tool-invocation "task=Add CLI and MCP host-state binding to Mousecat so host profiles can request redacted state packets without implementing host plugins."`
- `node src/cli.mjs --config mousecat.config.json invoke neo form_team_v1 profileId=tool-invocation "task=Implement CLI and MCP host-state binding in Mousecat with redaction, tests, smoke coverage, and append-only governance docs."`

*Version:* `0.4.0.0-alpha` -> `0.5.0.0-alpha`; package projection `0.5.0-alpha` (public host-state binding tool expansion -> minor).

## [A11.7] | 2026-07-09 03:47 UTC / 20:47 PDT | Adapter-profile config binding

*Scope:* Let hosts select their Mousecat adapter contract through config instead of overloading the freeform host label or passing a profile argument on every host-state sync.

*Deliverables:*
- Added `adapterProfile` to default runtime config, defaulting to `generic-mcp`.
- Preserved `hostProfile` as a freeform host/runtime label while reporting both `hostProfile` and `adapterProfile` in status.
- Made `mousecat.host-state` use configured `adapterProfile` when no explicit profile is requested.
- Added `hostProfile` and `adapterProfileSource` to successful `mousecat.host-state.binding/1` responses.
- Added `invalid-config-adapter-profile` for unknown configured adapter profiles while preserving explicit `unknown-host-profile` rejection.
- Updated config/runtime tests, session state, version metadata, and append-only governance records.

*Verification:*
- `node --test test\config.test.mjs`
- `node --test test\runtime.test.mjs`
- `node src/cli.mjs --config mousecat.config.example.json host-state`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`
- `node src/cli.mjs --config mousecat.config.json host-state codex`
- `node src/cli.mjs --config mousecat.config.json route neo crucible_classify_v1`
- `node src/cli.mjs --config mousecat.config.json session total-recall`
- `node src/cli.mjs --config mousecat.config.json invoke neo infer_complexity_v1 profileId=tool-invocation "task=Add adapter-profile config binding so Mousecat host-state uses a source-owned adapter profile separate from host labels."`
- `node src/cli.mjs --config mousecat.config.json invoke neo form_team_v1 profileId=tool-invocation "task=Implement adapterProfile config binding in Mousecat host-state with tests and governance docs."`

*Version:* `0.5.0.0-alpha` -> `0.6.0.0-alpha`; package projection `0.6.0-alpha` (public adapter-profile config contract expansion -> minor).

## [A11.8] | 2026-07-09 03:56 UTC / 20:56 PDT | Adapter-profile docs and safe config defaults

*Scope:* Move the checked-in config defaults and human entry-point docs onto the A11.7 adapter-profile contract as a separate review unit after the PR shape gate rejected the combined runtime/docs span.

*Deliverables:*
- Added safe `generic-mcp` `adapterProfile` defaults to `.github/mousecat.ci.config.json` and `mousecat.config.example.json`.
- Updated README, architecture, core, governance, and roadmap prose to distinguish freeform `hostProfile` labels from source-owned `adapterProfile` contracts.
- Preserved Mousecat's host/state ownership boundary: hosts own presentation and local persistence, while Mousecat owns state semantics, permits, route planning, and private-upstream withholding.
- Recorded the split as its own append-only batch, decision, finding, and session-state update instead of ratifying the oversized A11.7 PR.

*Verification:*
- `node src/cli.mjs --config .github/mousecat.ci.config.json status`
- `node src/cli.mjs --config mousecat.config.example.json host-state`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`
- `node src/cli.mjs --config mousecat.config.json host-state codex`
- `node src/cli.mjs --config mousecat.config.json route neo crucible_classify_v1`
- `node src/cli.mjs --config mousecat.config.json session total-recall`
- `node .github/scripts/check-pr-shape.mjs --base origin/main`
- `node scripts/pr-doc-runner.mjs --base origin/main --title "[A11.8] Document adapter profile defaults"`
- `git diff --check origin/main...HEAD`
- `node src/cli.mjs --config mousecat.config.json invoke neo infer_complexity_v1 profileId=tool-invocation "task=Document adapterProfile defaults and hostProfile boundary in Mousecat checked-in configs and entry-point docs."`
- `node src/cli.mjs --config mousecat.config.json invoke neo form_team_v1 profileId=tool-invocation "task=Verify A11.8 Mousecat adapterProfile documentation and safe config defaults with governance docs and PR gates."`

*Version:* Preserved at `0.6.0.0-alpha`; package projection remains `0.6.0-alpha` (documentation/config companion to A11.7).

## [A11.9] | 2026-07-09 04:02 UTC / 21:02 PDT | Host command packs

*Scope:* Turn adapter render/state packets into concrete host-consumption instructions without adding a new public tool or implementing host-specific plugins.

*Deliverables:*
- Added `mousecat.host-command-pack/1` templates for binding, snapshot, total recall, route preview, widget response, hold, queue enqueue, and credential-reference registration.
- Attached command packs to adapter render packets, host-state adapters, and `mousecat.host-state.binding/1` responses.
- Kept commands as templates: hosts fill placeholders, permits still gate invocation, and credential values remain withheld.
- Updated catalog/runtime tests, version metadata, session state, and append-only governance records.

*Verification:*
- `node --test test/catalog.test.mjs test/runtime.test.mjs`
- `node src/cli.mjs host-state cli 2`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`
- `node src/cli.mjs --config mousecat.config.json host-state codex 2`
- `node src/cli.mjs --config mousecat.config.json route neo crucible_classify_v1`
- `node src/cli.mjs --config mousecat.config.json session total-recall`
- `node .github/scripts/check-pr-shape.mjs --base origin/main`
- `node scripts/pr-doc-runner.mjs --base origin/main --title "[A11.9] Add host command packs"`
- `git diff --check origin/main...HEAD`
- `node src/cli.mjs --config mousecat.config.json invoke neo infer_complexity_v1 profileId=tool-invocation "task=Add source-owned host command pack templates to Mousecat adapter and host-state binding packets without adding host plugins."`
- `node src/cli.mjs --config mousecat.config.json invoke neo form_team_v1 profileId=tool-invocation "task=Verify A11.9 Mousecat host command pack templates with catalog/runtime tests and public governance gates."`

*Version:* `0.6.0.0-alpha` -> `0.6.1.0-alpha`; package projection `0.6.1-alpha` (public host adapter contract maturation -> Kohai).

## [A11.10] | 2026-07-09 04:10 UTC / 21:10 PDT | Host command pack docs

*Scope:* Bring Mousecat's human entry points current with A11.9 host command packs as a separate docs review unit.

*Deliverables:*
- Updated README and architecture descriptions for `mousecat.host-command-pack/1`.
- Updated core, governance, and roadmap prose to name command packs as part of the host adapter contract.
- Preserved the runtime boundary: command packs are templates, hosts fill placeholders, permits still gate invocation, and credential values remain withheld.
- Recorded the docs companion as its own append-only batch, decision, finding, and session-state update.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `node .github/scripts/check-pr-shape.mjs --base origin/main`
- `node scripts/pr-doc-runner.mjs --base origin/main --title "[A11.10] Document host command packs"` (PASS with expected version-preserving docs-only warning)
- `git diff --check origin/main...HEAD`
- `node src/cli.mjs --config mousecat.config.json host-state codex 1`

*Version:* Preserved at `0.6.1.0-alpha`; package projection remains `0.6.1-alpha` (documentation companion to A11.9).

## [A11.11] | 2026-07-09 19:23 UTC / 12:23 PST | Post-FIFO state reconciliation

*Scope:* Close the A11 host-adapter batch after A11.0-A11.10 merged by reconciling canonical state documents, live branch-protection facts, and the next graphical product boundary.

*Deliverables:*
- Updated the roadmap version and milestone from stale A11.9 state to the completed A11.11 host-adapter foundation.
- Rewrote session state around canonical `main`, the completed FIFO, and the A12 graphical operator-surface input and acceptance boundary.
- Replaced the stale branch-protection note with the verified required checks and enforcement posture on GitHub `main`.
- Recorded DR-029 and F-019 so the A11 closure and the reason for the reconciliation remain auditable.
- Preserved A12 Open Ground CI work as a separate active worktree and excluded it from this GitHub FIFO cleanup.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `node .github/scripts/check-pr-shape.mjs --base origin/main`
- `node scripts/pr-doc-runner.mjs --base origin/main --title "[A11.11] Reconcile post-FIFO state"`
- `git diff --check origin/main...HEAD`
- `gh pr list --repo GroundZeroSolutions/mousecat --state open --json number,title,headRefName,baseRefName,isDraft,mergeStateStatus --limit 50`
- `gh api repos/GroundZeroSolutions/mousecat/branches/main/protection`

*Version:* Preserved at `0.6.1.0-alpha`; package projection remains `0.6.1-alpha` (state-only terminal reconciliation for A11).

## [A12.0] | 2026-07-09 19:52 UTC / 12:52 PST | Open Ground public CI gate

*Scope:* Establish a remotely executed Open Ground GitLab contribution gate on the synchronized A11.11 base before the A12 graphical surface begins.

*Deliverables:*
- Fast-forwarded Open Ground `main` to the already-reviewed GitHub A11.11 line before rebuilding the A12 branch.
- Added `.gitlab-ci.yml` jobs for full readiness, merge-request shape classification, Node 20 compatibility, dependency audit, and package dry run.
- Required both `zero-local` and `open-ground` tags so public jobs stay on the dedicated `open-ground-local-podman` group runner.
- Installed `git` and CA certificates in the slim Node jobs that execute strict hygiene and PR-shape checks, repairing the real remote pipeline failure.
- Extended governance assertions and contributor docs so the GitLab lane, executable-image requirement, and runner-tenancy boundary remain source-owned.
- Kept A12 coherent: A12.0 is the public CI preflight, and A12.1 is the first rendered graphical operator surface.

*Verification:*
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `node .github/scripts/check-pr-shape.mjs --base zero/main`
- `node scripts/pr-doc-runner.mjs --base zero/main --title "[A12.0] Add Open Ground GitLab CI gate"`
- `git diff --check zero/main...HEAD`
- Open Ground GitLab CI lint through `projects/7/ci/lint`

*Remote proof:* Open Ground pipeline 428 passed `ci-verify`, `merge-request-shape`, `node-20-compat`, `dependency-scan`, and `package-dry-run` on runner `open-ground-local-podman`; every job reported both `open-ground` and `zero-local` runner tags.

*Version:* Preserved at `0.6.1.0-alpha`; package projection remains `0.6.1-alpha` (public CI and runner-discipline preflight for A12).

## [A12.1] | 2026-07-09 21:05 UTC / 14:05 PDT | Operator host foundation

*Scope:* Establish the bounded loopback host that will carry Mousecat's first graphical surface without creating a second runtime semantics layer.

*Deliverables:*
- Added a loopback-only operator HTTP server that owns one long-lived Mousecat runtime, enforces loopback Host and same-origin write boundaries, bounds exact JSON requests, and catches malformed targets.
- Added `mousecat.operator-snapshot/1` over redacted `mousecat.host-state`, `mousecat.status`, and `mousecat.visualize` records.
- Hardened sensitive interaction, queue, event, and visualizer redaction through an explicit public item allowlist and removed raw delegated runtime results from browser responses.
- Extended `mousecat.host-command-pack/1` with queue answer, hold, and ratification templates plus package-stable `mousecat` CLI descriptors.
- Made operator writes command-pack driven for widget response and hold, typed queue answer and hold, queue ratification, and route preview; invocation, credential registration, queue clearing, raw tool names, and private discovery remain excluded.
- Added `operator`, `smoke:operator`, `--demo`, `--port`, and `--self-test` CLI paths plus operator server, security, lifecycle, redaction, IPv6, command, and demo tests.

*Verification:*
- `node --test test/operator-server.test.mjs test/runtime.test.mjs test/catalog.test.mjs`
- `npm test`
- `npm run smoke:operator`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`
- Neo connector complexity classification and focused review-team formation through the ignored local Mousecat config.

*Version:* `0.6.1.0-alpha` -> `0.7.0.0-alpha`; package projection `0.7.0-alpha` (first public operator-host command surface -> minor).

## [A12.2] | 2026-07-09 21:18 UTC / 14:18 PDT | Live graphical read surface

*Scope:* Render the first visible Mousecat workstation over the A12.1 operator host while keeping the review unit presentation-only and below the operator diff boundary.

*Deliverables:*
- Added the browser workstation shell, Lucide icon bundle dependency, package-owned static asset delivery, and content-security headers.
- Rendered runtime facts and the canonical host -> Mousecat -> upstream graph from the public visualizer packet.
- Rendered typed interaction state, FIFO queue state and local filters, cached route and permit posture, connector and credential-reference posture, and the public visualizer activity stream.
- Kept A12.2 read-only: refresh, interaction selection, and queue filtering change presentation only; no browser command call exists in this batch.
- Made operator snapshot reads side-effect-free so refresh does not append or displace events in the bounded runtime stream; activity displays the newest twenty records first.
- Added static-asset and package-smoke coverage while retaining the A12.1 host security and lifecycle tests.

*Verification:*
- `node --test test/operator-server.test.mjs`
- `npm run smoke:operator`
- `node --check src/operator/public/operator.js`
- `git diff --check`
- Browser desktop check at `1440x900`: live state, canonical sections, no horizontal overflow, and no undersized controls.
- Browser mobile check at `390x844`: live state, full-width interaction picker, no horizontal overflow, and no undersized controls.
- Browser interaction check for interaction selection and FIFO held filtering.
- Browser console check with no warnings or errors.

*Version:* Preserved at `0.7.0.0-alpha`; package projection remains `0.7.0-alpha` (graphical presentation companion to the A12.1 operator host).

## [A12.3] | 2026-07-09 21:37 UTC / 14:37 PDT | Typed graphical operator controls

*Scope:* Complete the first graphical workstation by binding the A12.1 operator-safe command set into the A12.2 live read model without adding browser-owned runtime semantics.

*Deliverables:*
- Added shape-aware controls for decision, freeform, parameter, review, checklist, and ranking interaction work with original primitive values preserved through submission.
- Added interaction response and hold flows plus FIFO answer, hold, ratification, and canonical status-filter controls over source-owned command-pack ids.
- Added typed FIFO dialogs with required checklist and unique ranking validation, accessible names, focus restoration, and redacted-item blocking.
- Added non-invoking route previews with upstream, capability, intent, readiness, and permit posture.
- Added busy locking, retained last-good state, explicit stale and rejected action errors, mobile-visible connection status, responsive wrapping, accessible contrast, and stable control dimensions.
- Preserved mixed-status interactions at item granularity, retained failed dialog input, restored focus after interaction writes, and rendered refreshed state from rejected action envelopes.
- Kept invocation, credential registration, queue clearing, raw tool names, connector discovery, and raw delegated runtime results outside the browser boundary.

*Verification:*
- `node --check src/operator/public/operator.js`
- `node --test test/operator-server.test.mjs test/runtime.test.mjs test/catalog.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- Browser interaction checks for decision plus freeform response, required checklist recovery, duplicate and unique ranking validation, typed FIFO checklist submission, focus restoration, ratification, and route preview.
- Browser viewport checks at `1440x900` and `390x844` for live state, no page overflow, no undersized command controls, and a clean console.

*Version:* Preserved at `0.7.0.0-alpha`; package projection remains `0.7.0-alpha` (typed command-control companion to the A12.1-A12.2 graphical foundation).

## [A12.4] | 2026-07-09 23:17 UTC / 16:17 PDT | Retire graphical diagnostic lanes

*Scope:* Begin the FIFO correction from workstation to summoned widget by removing machine diagnostics from the browser without changing their source-owned contracts or the typed interaction and queue workflows.

*Deliverables:*
- Removed runtime context facts, host-to-upstream topology, route planning, connector and credential posture, and visualizer event trace from the graphical DOM.
- Removed the corresponding browser renderers, listeners, loading and unavailable states, CSS, and responsive rules.
- Preserved typed interaction response and hold flows plus FIFO answer, hold, filtering, and ratification behavior.
- Preserved topology, route, connector, status, host-state, credential-reference, and visualizer records through MCP and CLI machine surfaces.
- Reframed A12.5 as interaction/queue convergence and A12.6 as the compact shared-runtime widget, with no operator exception for the aggregate diff.

*Verification:*
- `node --check src/operator/public/operator.js`
- `node --test test/operator-server.test.mjs`
- `npm test`
- `npm run smoke:operator`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`
- Browser desktop and mobile checks for typed interaction, FIFO filtering, no horizontal overflow, and absence of topology, route, connector, or activity lanes.

*Version:* Preserved at `0.7.0.0-alpha`; package projection remains `0.7.0-alpha` (presentation reduction with no public runtime-contract change).

## [A12.5] | 2026-07-09 23:32 UTC / 16:32 PDT | Converge on one chronological interaction

*Scope:* Remove the remaining browser workbench composition so Mousecat presents one automatically selected interaction before the shared-runtime widget lands.

*Deliverables:*
- Removed the interaction picker and selected-interaction presentation state.
- Removed the separate FIFO queue section, filters, item controls, dialogs, ratification path, controller functions, listeners, and styling.
- Selected the oldest open interaction, falling back to the oldest held interaction, directly from the redacted host binding.
- Preserved typed decision, freeform, parameter, checklist, ranking, response, and hold behavior for the active interaction.
- Preserved `mousecat.queue` as a source-owned MCP and CLI contract outside the graphical surface.

*Verification:*
- `node --check src/operator/public/operator.js`
- `node --test test/operator-server.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`
- Browser desktop and mobile checks for one interaction region, chronological selection, typed controls, no queue workbench, no horizontal overflow, and a clean console.

*Version:* Preserved at `0.7.0.0-alpha`; package projection remains `0.7.0-alpha` (graphical interaction convergence with no public runtime-contract change).

## [A12.6] | 2026-07-10 00:12 UTC / 17:12 PST | Shared interaction runtime

*Scope:* Establish the real host-to-operator-to-host loop while preserving the accepted A12.5 graphical surface as a compatible client. Compact widget promotion remains the separate A12.7 review unit.

*Deliverables:*
- Served versioned Streamable HTTP MCP at `/mcp` from the same loopback process and runtime as `GET /api/snapshot` and graphical `POST /api/command`.
- Added stable `ask` and `await`, bounded terminal waiters, arbitrary item and option counts, multiple selection, typed results, and cancellation-aware runtime context.
- Restricted MCP hosts to request and await operations while graphical commands exclusively own response and hold writes.
- Enforced the oldest open interaction and exact open-item prefix, response cardinality and freeform policy, and invalid or colliding identities without mutation; derived response status from the action.
- Replaced count-derived generated ids with UUID-backed identities that survive bounded-state reloads without collision.
- Extended sensitive public-event and local-state redaction to every typed response field and the metadata of any interaction containing sensitive work.
- Completed bounded HTTP and stdio lifecycle handling for early and active cancellation, client disconnect, protocol mismatch, session deletion, capacity, expiry, and server shutdown.
- Split the 2,821-line aggregate into A12.6 runtime and A12.7 widget units rather than seeking operator ratification or a PR-shape exception.

*Verification:*
- `node --check src/core/runtime.mjs`
- `node --check src/core/local-state.mjs`
- `node --check src/mcp/server.mjs`
- `node --check src/operator/server.mjs`
- `node --test test/catalog.test.mjs test/runtime.test.mjs test/operator-server.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `git diff --check`
- Live central MCP invocation of Neo Crucible classification and a browser-resolved structured result on the originating Mousecat call.

*Version:* `0.7.0.0-alpha` -> `0.8.0.0-alpha`; package projection `0.8.0-alpha` (shared MCP/operator runtime and expanded public interaction contract -> minor).

*CI hardening:* GitHub's Node 20 compatibility run exposed a keep-alive shutdown delay after MCP waiter cancellation. A12.6 now closes drained loopback connections after the cancellation response flush turn; the focused Node 20 shutdown test completes below the one-second contract.

## [A12.7] | 2026-07-10 03:01 UTC / 20:01 PDT | Compact summoned widget

*Scope:* Promote the intended widget as Mousecat's canonical graphical surface over the accepted A12.6 runtime.

*Deliverables:*
- Replaced the remaining application shell with one 440-pixel-bounded item surface, internal option scrolling, progress, optional context, Hold, and Return.
- Added minimal `mousecat.operator-snapshot/2` and removed queue, topology, connector, route, event, and runtime diagnostics from browser composition.
- Prevented stale or overlapping polls from repainting completed work while preserving typed drafts for an unchanged active item.
- Preserved arbitrary options, canonical multi-selection, freeform, checklist, ranking, numeric parameter, redaction, FIFO, whole-interaction Hold, and operator-only writes.

*Verification:*
- `node --test test/operator-server.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- Desktop, mobile, and 280-pixel browser proof with clean console; 20-seam Mass Assault, recursive Crucible, typed ranking/parameter, whole-interaction Hold, and originating MCP results.

*Version:* Preserved at `0.8.0.0-alpha`; package projection remains `0.8.0-alpha` (canonical presentation over the accepted public runtime).

## [A13] | 2026-07-10 04:13 UTC / 21:13 PDT | Cross-harness skill invocation and session intake

*Scope:* Make fresh Codex and Claude Code processes invoke Crucible and Mass Assault through Mousecat's canonical widget, then return normalized lineage-rich results to the originating model for recursion.

*Deliverables:*
- Added one discoverable `mousecat.skill` adapter with `invoke` and `await` above the existing `mousecat.widget` execution and rendering primitive.
- Added canonical mapped-seam and session intake with exact Crucible cardinality, unique complete seam timestamp or integer ordinal ordering for Mass Assault, deterministic seam identity, recommendation normalization, typed shapes, and recursive raw transcript rejection.
- Added session-scoped origin invocation identity, canonical request fingerprints, capability-gated idempotent replay, conflict rejection, and an opaque caller-held continuation capability whose hash alone survives ignored local persistence.
- Returned typed answers and holds with host, session, thread, chronology, and sequence lineage plus explicit Crucible or Mass Assault recursion obligations.
- Added flat cross-host MCP discovery schemas, host command-pack templates, adapter packets, work-permit and tool-boundary records, CLI smoke coverage, and shared-HTTP round-trip tests.
- Repointed the checked-in Codex project contract at the shared Streamable HTTP endpoint and aligned the active Codex and Claude Crucible/Mass Assault skill instructions with `mousecat.skill`.
- Preserved the A12.7 compact widget without adding workflow-specific chrome, transcript rendering, queue navigation, or another visual surface.

*Verification:*
- `node --check src/core/skill-invocation.mjs`
- `node --test test/catalog.test.mjs test/runtime.test.mjs test/operator-server.test.mjs` (49 pass)
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm run cd:dry-run`
- `node scripts/neo-live-smoke.mjs --config mousecat.config.json`
- Fresh Codex Crucible invocation through `mousecat.skill`, graphical response, capability-gated await, lineage, and `interpret-and-recurse` return.
- Fresh Claude Code Mass Assault invocation with two ordinal seams, two sequential graphical responses, lineage-order return, and `apply-in-lineage-order-then-recall`.
- Desktop and 390-by-700 browser proof with no horizontal overflow, 44-pixel controls, one compact widget, and a clean console.
- Recursive runtime, portability, and coherence review followed by focused repair and regression coverage for capability replay, ambiguous chronology, nested transcript fields, session identity, and cross-host schema keywords.

*Version:* `0.8.0.0-alpha` -> `0.9.0.0-alpha`; package projection `0.9.0-alpha` (first public named-skill invocation and normalized session-intake contract -> minor).

*Cross-host hardening:* The first fresh Claude run rejected a top-level conditional JSON Schema that Codex accepted. A13 now publishes one flat descriptor with typed nested records and keeps action-specific enforcement in the runtime; the repeated Claude run completed through the same tool and widget.

*Review hardening:* The pre-commit quality panel found continuation recovery by idempotent replay, inherited session timestamps, duplicate chronology values, and seam-level transcript fields. A13 now requires the caller-held capability on replay, uses only explicit unique seam chronology, and recursively rejects transcript-shaped intake before opening the widget.

## [A13.1] | 2026-07-10 04:37 UTC / 21:37 PDT | Close cross-harness invocation batch

*Scope:* Replace A13's pre-merge session state with accepted remote receipts, content parity, and proof from the restarted merged runtime without extending the feature boundary.

*Deliverables:*
- Recorded GitHub PR #24 and Open Ground MR !10 as the accepted A13 review units and preserved their ancestry-specific commit identities.
- Confirmed both remote `main` trees at `dba4b690` and removed both review branches.
- Replaced the pending A13 docket with A14's already-planned governed Neo council delegation and rejoin boundary.
- Kept A13.1 documentation-only: no public contract, runtime, package version, or graphical surface changed.

*Verification:*
- GitHub `ci-verify`, Node 20, dependency scan, secret scan, and CodeQL passed on PR #24.
- Open Ground pipeline #513 passed on MR !10.
- The merged operator returned HTTP 200 from `http://127.0.0.1:4317/`.
- A merged `neo.crucible` interaction returned `proven`, complete lineage, and `interpret-and-recurse`; replay without its capability failed closed.
- `git rev-parse origin/main^{tree}` and `git rev-parse zero/main^{tree}` both returned `dba4b6903aecd482d33e3f8d1e8ec792b2bd9eed`.

*Version:* Preserved at `0.9.0.0-alpha`; package projection remains `0.9.0-alpha` (post-merge state closure only).

## [A14.0] | 2026-07-10 05:31 UTC / 22:31 PDT | Delegation custody kernel

*Scope:* Establish the internal held-seam custody and persistence primitives required by later asynchronous delegation without publishing a new tool or changing the compact widget.

*Deliverables:*
- Added canonical held-origin, source-identity, target, timeout, and payload compilation with deterministic delegation identity and fingerprints.
- Recursively rejected transcript-shaped and secret-shaped payload fields before custody begins.
- Added immutable public delegation summaries and continuation envelopes with sensitive-origin withholding.
- Extended ignored local state with safe delegation provenance while excluding payloads, raw results, and plaintext capabilities.
- Restored in-flight work as interrupted with unknown outcome and completed resultless work as known-succeeded but unavailable.

*Verification:*
- `node --test test/delegation-core.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `git diff --check`

*Version:* Preserved at `0.9.0.0-alpha`; package projection remains `0.9.0-alpha` (internal custody kernel only; public invocation follows in A14.1).

## [A14.1] | 2026-07-10 05:37 UTC / 22:37 PDT | Asynchronous delegation start and await

*Scope:* Publish the permitted start/await lifecycle above the accepted A14.0 custody kernel while leaving result interpretation and graphical rejoin to A14.2.

*Deliverables:*
- Added discoverable `mousecat.delegation` start and await actions with a flat cross-host schema.
- Validated held origin capability, source identity, action-specific permits, connector readiness, deterministic replay, and conflict rejection before launch.
- Returned from start before upstream completion, preserved independent interaction progress, and capability-gated the raw result.
- Classified every post-dispatch connector failure as interrupted with unknown outcome; retry requires a fresh permit and explicit duplicate-side-effect acknowledgement.
- Added delegation records to safe status, recall, host-state, and machine graph surfaces without changing the browser client.

*Verification:*
- `node --test test/delegation-core.test.mjs test/delegation-runtime.test.mjs test/catalog.test.mjs test/runtime.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `git diff --check`

*Version:* `0.9.0.0-alpha` -> `0.10.0.0-alpha`; package projection `0.10.0-alpha` (first public asynchronous delegation contract -> minor).

## [A14.2] | 2026-07-10 05:56 UTC / 22:56 PDT | Existing-widget delegation rejoin

*Scope:* Return caller-interpreted council output to the originating decision lineage through Mousecat's canonical widget without adding a second visual surface.

*Deliverables:*
- Added operator-permitted `mousecat.delegation(rejoin)` above completed caller-capability-owned results.
- Bound the child Crucible seam to its origin interaction, origin item, delegation, and attempt lineage.
- Persisted safe deterministic rejoin intent before child creation so a lost response or crash can recover the same widget interaction.
- Kept recall open until the rejoined child is terminal and inherited sensitive custody through public and durable redaction boundaries.
- Added idempotent replay, lineage, graph, recall, crash-window, and sensitive-custody regression coverage.

*Verification:*
- `node --test test/delegation-rejoin.test.mjs test/catalog.test.mjs test/runtime.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `git diff --check`

*Version:* Preserved at `0.10.0.0-alpha`; package projection remains `0.10.0-alpha` (completes the existing delegation contract without a new product surface).

## [A14.3] | 2026-07-10 06:01 UTC / 23:01 PDT | Absolute connector deadline proof

*Scope:* Prove that an HTTP MCP delegation receives one bounded connector deadline across initialization and tool execution.

*Deliverables:*
- Added deterministic response delay support to the HTTP MCP fixture.
- Proved that initialize and tool-call latency consume one shared absolute deadline rather than receiving separate timeout windows.
- Preserved the existing `connector-timeout` boundary result for callers.

*Verification:*
- `node --test test/connectors.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `git diff --check`

*Version:* Preserved at `0.10.0.0-alpha`; package projection remains `0.10.0-alpha` (transport-boundary proof only).

## [A14.4] | 2026-07-10 06:05 UTC / 23:05 PDT | Delegation packaging and closure

*Scope:* Make the accepted delegation loop a permanent package gate and close the A14 milestone with current roadmap and state receipts.

*Deliverables:*
- Added `smoke:delegation` for held origin, asynchronous start, capability-owned await, and existing-widget rejoin lineage.
- Added the delegation smoke to every `verify`, `pr:ready`, and CI verification run.
- Advanced the roadmap from the completed A14 council loop to A15 cancellation acknowledgement.
- Reconciled session state with the accepted FIFO review units and live Neo proof.

*Verification:*
- `npm run smoke:delegation`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm pack --dry-run`
- live operator HTTP and delegation proof against the A14 runtime

*Version:* Preserved at `0.10.0.0-alpha`; package projection remains `0.10.0-alpha` (packaging and milestone closure only).

## [A15.0] | 2026-07-10 17:22 UTC / 10:22 PDT | Streamable HTTP transport foundation

*Scope:* Make Mousecat's upstream MCP clients lifecycle-correct, correlation-safe, and ready to distinguish standard cancellation from a separately negotiated status contract.

*Deliverables:*
- Completed HTTP and stdio initialization through `notifications/initialized` before normal operations.
- Added unique request identifiers, strict JSON-RPC response correlation, and JSON/SSE Streamable HTTP response support.
- Sent standard `notifications/cancelled` at one absolute execution deadline and ignored later original responses.
- Added an optional `mousecat/cancellation-ack` negotiation and separately correlated status request without changing delegation retry semantics.
- Added strict lifecycle, pre-dispatch timeout, concurrent cancellation, SSE, and malformed-response fixtures and tests.

*Verification:*
- `node --test test/connectors.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm pack --dry-run`

*Version:* Preserved at `0.10.0.0-alpha`; package projection remains `0.10.0-alpha` (transport foundation; public delegation integration follows FIFO in A15.1).

## [A15.1] | 2026-07-10 17:27 UTC / 10:27 PDT | Delegation cancellation contract

*Scope:* Integrate A15.0's negotiated cancellation status into Mousecat's public delegation state, persistence, recall, and retry contract.

*Deliverables:*
- Published `mousecat.delegation.contract/2`, `mousecat.delegation/2`, and `mousecat.delegation.summary/2` with explicit status and upstream-outcome enumerations.
- Added retry-safe `cancelled` only for an exactly correlated negotiated status carrying `sideEffects=none`.
- Preserved `interrupted` and duplicate-side-effect acknowledgement for notification-only or otherwise unknown post-dispatch outcomes.
- Recorded dispatch phase and safe cancellation provenance across runtime state, ignored persistence, events, and Total Recall.
- Added the configurable 100-5000 millisecond status grace with a 1000 millisecond default and aligned connector posture.
- Recursively adjudicated the extension architecture and grace parameter through Neo via Mousecat.

*Verification:*
- `node --test test/delegation-runtime.test.mjs test/delegation-core.test.mjs test/catalog.test.mjs test/runtime.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm pack --dry-run`
- live Neo connector smoke and merged operator HTTP proof

*Version:* `0.10.0.0-alpha` -> `0.11.0.0-alpha`; package projection `0.11.0-alpha` (public cancellation and delegation-state contract expansion -> minor).

## [A16.0] | 2026-07-10 19:40 UTC / 12:40 PDT | Universal recursive framework registry

*Scope:* Make Mousecat's skill and host contracts provider-neutral while preserving Recursive Deliberation as one source-owned framework and Neo as an optional compatible router.

*Deliverables:*
- Named Recursive Deliberation as the parent of Crucible, Total Recall, and Mass Assault, with contextual routing and no fixed transitions.
- Published `mousecat.skill-invocation.contract/2`, first-class Total Recall, capability-backed handoff receipts, and provider-neutral session heartbeats.
- Added `mousecat.registry` for permit-gated, namespace-owned, revisioned operator-interaction and presentation descriptors.
- Persisted sanitized custom descriptors, quarantined malformed records, and generalized known or custom host profiles.
- Proved custom invocation, custom handoff, restart persistence, source-id protection, module aliases, and fabricated-route rejection.

*Verification:*
- `node --test test/catalog.test.mjs test/framework-registry.test.mjs test/runtime.test.mjs`
- `npm test`
- live HTTP registration, five provider heartbeats, and a 12-seam Mass Assault through `http://127.0.0.1:4317/mcp`

*Version:* `0.11.0.0-alpha` -> `0.12.0.0-alpha`; package projection `0.12.0-alpha` (public extensibility and invocation contract expansion -> minor).

## [A16.1] | 2026-07-10 20:19 UTC / 13:19 PDT | Expanded registry-aware control plane

*Scope:* Preserve Mousecat as a compact summoned decision widget while making window expansion reveal the universal framework, session, recall, and sequence context already owned by the runtime.

*Deliverables:*
- Added a responsive compact, intermediate, and wide layout without a second application state or diagnostic dashboard.
- Projected all registered named-skill frameworks through a selector and safe presentation descriptors.
- Rendered cross-host sessions, open recall seams, and arbitrary-length chronological sequence progress.
- Added active-framework synchronization, canonical module-skill resolution, bounded accent fallbacks, sequence accessibility, and offline retry safety.
- Kept browser writes restricted to typed `respond` and `hold` command-pack projections.

*Verification:*
- `node --test test/operator-server.test.mjs test/framework-registry.test.mjs`
- `npm test`
- recursive surface-coherence review with all Critical and High findings closed
- live 12-seam Mass Assault and five provider heartbeats through the shared loopback runtime

*Version:* Preserved at `0.12.0.0-alpha`; package projection remains `0.12.0-alpha` (graphical projection of the A16.0 registry contract).

## [A16.2] | 2026-07-10 20:28 UTC / 13:28 PDT | Per-user service lifecycle

*Scope:* Keep the shared Mousecat operator and MCP runtime available across host sessions through one current-user service lifecycle rather than a manually maintained terminal.

*Deliverables:*
- Added `service install|start|status|stop|uninstall` to the CLI and package scripts.
- Added a shared service runner with bounded process records and graceful operator-server shutdown.
- Registered a short Windows LocalAppData launcher, a user systemd unit, or a macOS LaunchAgent according to platform.
- Routed Linux and macOS lifecycle through their native managers and verified Windows process identity before termination.
- Required Mousecat snapshot identity and requested lifecycle postconditions instead of accepting arbitrary port listeners.
- Added registry CLI smoke and cross-platform service-plan regression coverage.

*Verification:*
- `node --test test/user-service.test.mjs`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm pack --dry-run`
- recursive build review with all Critical and High findings closed
- live Windows current-user registration and managed runner proof on port `4317`

*Version:* Preserved at `0.12.0.0-alpha`; package projection remains `0.12.0-alpha` (host lifecycle packaging over accepted A16 contracts).

## [A17] | 2026-07-10 20:42 UTC / 13:42 PDT | Executable SDK reference adapters

*Scope:* Give third-party harness authors one executable, provider-neutral path for Mousecat session presence, framework registration, skill invocation, result waiting, and contextual handoff without hand-authoring JSON-RPC calls.

*Deliverables:*
- Added a dependency-free Streamable HTTP `MousecatClient` with lazy initialization, one MCP session, structured tool returns, explicit close, injected fetch, and distinct transport, JSON-RPC, and tool errors.
- Added fixed host-session adapters and reference descriptors for OpenAI, Anthropic, Google, xAI, Ollama, generic MCP, and custom consumers.
- Added heartbeat, namespace-owned framework registration, skill invoke/await, and capability-preserving contextual handoff helpers.
- Derived SDK host descriptors from the canonical catalog and prevented descriptor mutation, per-call identity spoofing, capability substitution, operator response writes, implicit transition choice, and automatic replay after dispatch.
- Completed Streamable HTTP lifecycle behavior with dual-media negotiation, initialized notification, correlated JSON or SSE responses, expired-session invalidation, and recursive handoff awaiting.
- Exported the SDK from `mousecat` and `mousecat/sdk` and added the SDK integration smoke to the permanent verification gate.

*Verification:*
- `node --test test/sdk-client.test.mjs`
- `npm test`
- `npm run pr:ready`
- `npm audit --audit-level=high`
- `npm pack --dry-run`
- packaged SDK import against the installed loopback service

*Version:* `0.12.0.0-alpha` -> `1.0.0.0-alpha`; package projection `1.0.0-alpha` (public SDK contract expansion exhausts the minor cap and rolls the root odometer major coordinate).

## [A18.1] | 2026-07-10 21:55 UTC / 14:55 PDT | Provider-neutral integration contract

*Scope:* Publish the dependency-free definition and registry grammar that external adapter packages use to describe bounded API or CLI capabilities.

*Deliverables:*
- Added immutable integration adapter definitions with executable, authentication, capability, provenance, and environment metadata.
- Added provider-neutral registry projection for public manifests and MCP-style tools.
- Exported the contract from `mousecat/integration` for package consumers.

*Verification:*
- `node --test test/integration-contracts.test.mjs`
- `npm test`
- `npm run pr:ready`

*Version:* Preserved at `1.0.0.0-alpha`; package projection remains `1.0.0-alpha` until the complete A18 runtime stack is accepted.

## [A18.2] | 2026-07-10 22:01 UTC / 15:01 PDT | Secure GitLab reference provider

*Scope:* Implement the first source-owned integration provider and its bounded process runner on the accepted A18.1 contract.

*Deliverables:*
- Added ten typed GitLab v4 project, merge-request, pipeline, and job capabilities over `glab api`.
- Added SHA-256 executable pinning, source-allowlisted environment, shell-free execution, literal raw fields, bounded output, redacted failures, and process termination bounds.
- Required explicit confirmation for every write and classified every post-dispatch write failure as an unknown outcome.

*Verification:*
- `node --test test/integration-runner.test.mjs`
- `npm test`
- `npm run pr:ready`

*Version:* Preserved at `1.0.0.0-alpha`; package projection remains `1.0.0-alpha` until A18.3 composes the provider into the public runtime.

## [A18.3] | 2026-07-10 22:17 UTC / 15:17 PDT | Nonlinear cross-host decision surface

*Scope:* Correct Mousecat's decision model and expanded operator surface so concurrent host and session decisions remain visible and independently actionable.

*Deliverables:*
- Removed oldest-interaction and item-prefix response gates from the runtime.
- Added a deferred item state that remains pending and can be answered later.
- Exposed the complete actionable interaction set in the operator snapshot.
- Rebuilt expanded mode around a directly navigable host-and-session-grouped docket, framework capabilities, cross-host presence, and open seams.
- Preserved compact active-decision behavior and local drafts across expanded navigation.
- Reserved response, hold, and defer writes for the graphical operator boundary.
- Rejected caller-authored terminal item status and preserved drafts when deferred items are revisited.

*Verification:*
- `node --test test/runtime.test.mjs test/operator-server.test.mjs`
- recursive Critical/High review closure
- `npm test`
- `npm run pr:ready`

*Version:* Preserved at `1.0.0.0-alpha`; this corrects the accepted operator contract without opening a new version line.

## [A18.4] | 2026-07-10 22:33 UTC / 15:33 PDT | Nonlinear surface documentation reconciliation

*Scope:* Reconcile every active participant-facing description with the accepted nonlinear, session-grouped decision model.

*Deliverables:*
- Updated README, architecture, core, and governance descriptions of compact and expanded Mousecat.
- Recorded the Critical design finding and its runtime, ownership, draft-preservation, and visual resolution.
- Removed active claims that oldest-item or item-prefix order governs decision eligibility.

*Verification:*
- `npm run docs:check`
- `npm run docs:pr`
- `npm run pr:ready`

*Version:* Preserved at `1.0.0.0-alpha`; documentation reconciliation for the accepted A18.3 correction.

## [A18.4.1] | 2026-07-10 22:44 UTC / 15:44 PDT | Active nonlinear contract hardening

*Scope:* Finish the A18.4 active-document reconciliation after review found remaining product-identity, ownership, command-boundary, and roadmap language inherited from the superseded chronological interaction model.

*Deliverables:*
- Replaced chronological product-surface and interaction-sequencing claims with the accepted nonlinear, cross-session navigation contract.
- Corrected the operator command boundary to include `defer` and independent targeting of open or deferred items.
- Distinguished chronological Mass Assault intake and lineage from operator decision eligibility.
- Advanced the roadmap from the completed A17 milestone to the active A18 integration milestone.

*Verification:*
- `npm run docs:check`
- `npm run docs:pr`
- `npm run pr:ready`

*Version:* Preserved at `1.0.0.0-alpha`; this is the documentation hardening delta for A18.4 and changes no runtime behavior.

## [A18.5] | 2026-07-10 22:58 UTC / 15:58 PDT | Provider execution boundary hardening

*Scope:* Harden the accepted provider-neutral runner before integration adapters become reachable through the shared Mousecat runtime.

*Deliverables:*
- Enforced capability input schemas and central confirmation for every non-read provider operation before compilation or dispatch.
- Rejected secret-shaped input keys and values, recursively redacted successful provider output, and generalized failure-message redaction.
- Normalized argument-builder and rejected-runner failures into explicit pre-dispatch or unknown-outcome results.
- Added adversarial provider-neutral regression coverage for confirmation, schemas, secret material, output redaction, and thrown execution stages.

*Verification:*
- `node --test test/integration-runner.test.mjs`
- `npm test`
- `npm run pr:ready`
- recursive security and build review with all Critical and High findings closed

*Version:* Preserved at `1.0.0.0-alpha`; this hardens the accepted A18 provider boundary before runtime composition.

## [A18.6] | 2026-07-10 23:06 UTC / 16:06 PDT | Provider discovery and route composition

*Scope:* Project accepted integration adapters through Mousecat's catalog, configured upstreams, connector status, capability discovery, route validation, and credential-reference boundaries without activating provider execution.

*Deliverables:*
- Added `integration-adapter` and `cli-json` connector discovery with source-owned manifests for built-in and injected registries.
- Derived configured integration upstream identity and capabilities from the active registry instead of static provider metadata.
- Required absolute accepted executable names and structurally valid SHA-256 pins before a provider connector reports ready.
- Exposed provider tools through permit-gated `mousecat.invoke` discovery while returning `integration-execution-unavailable` for capability calls.
- Rejected integration targets from asynchronous delegation so the new transport cannot inherit a second execution path.

*Verification:*
- `npm run smoke:integrations`
- `node --test test/integration-runtime.test.mjs test/runtime.test.mjs test/delegation-runtime.test.mjs`
- `npm test`
- `npm run pr:ready`
- recursive runtime and security review with all Critical and High findings closed

*Version:* Preserved at `1.0.0.0-alpha`; provider discovery and routing land independently before execution activation.

## [A18.7] | 2026-07-10 23:17 UTC / 16:17 PDT | Permit-gated provider execution activation

*Scope:* Activate recognized integration capabilities through `mousecat.invoke` over the hardened provider runner while preserving the A18.6 registry ownership and delegation exclusions.

*Deliverables:*
- Marked recognized integration capabilities execution-ready only after active-registry and connector-binding validation.
- Routed provider capability calls through the A18.5 schema, confirmation, executable-pin, environment, timeout, outcome, and redaction boundary.
- Preserved the existing tool-invocation permit before provider execution and kept unknown capabilities and mislabeled connectors fail-closed.
- Kept asynchronous delegation closed to integration adapters and added runtime tests for injected providers, GitLab reads, write confirmation, route bypasses, and delegation exclusion.
- Updated the canonical architecture, core, governance, and README contracts for provider execution.

*Verification:*
- `npm run smoke:integrations`
- `node --test test/integration-runtime.test.mjs test/integration-runner.test.mjs test/runtime.test.mjs test/delegation-runtime.test.mjs`
- `npm test`
- `npm run pr:ready`
- live authenticated `gitlab.user.get` through the installed shared Mousecat service
- recursive runtime and security review with all Critical and High findings closed

*Version:* Preserved at `1.0.0.0-alpha`; execution activates the already accepted A18 contracts without changing the operator surface.

## [A18.8] | 2026-07-10 23:36 UTC / 16:36 PDT | SDK host conformance lifecycle

*Scope:* Make the accepted SDK, nonlinear operator contract, and provider-read path executable as one reusable host-neutral acceptance lifecycle for flagship and custom harness authors.

*Deliverables:*
- Added `mousecat.sdk-host-conformance/1` with transport initialization, runtime health, construction-bound host identity, operator-owned Crucible round trip, contextual continuation, optional provider discovery and read execution, and host-session closure checks.
- Added checked and skipped requirement reporting so runs without a configured provider do not claim provider execution coverage.
- Kept operator response values and namespace, continuation, and result capabilities out of the conformance receipt.
- Added a packaged shell runner that blocks on the standalone Mousecat surface and can be executed by Codex, Claude Code, or any shell-capable custom harness.
- Focused compact Mousecat on the most recently updated pending interaction so a newly summoned host proof is visible without changing expanded nonlinear navigation or chronology.
- Added fixture coverage for Codex and Claude-compatible identities, provider reads, mismatch failure, redaction, and cleanup after both successful and failed runs.

*Verification:*
- `node --test test/sdk-conformance.test.mjs test/sdk-client.test.mjs`
- `npm test` (151 passing)
- `npm run smoke:conformance`
- fresh Codex and Claude Code live-host proofs through the installed shared service
- recursive SDK, runtime, and security review with all Critical and High findings closed

*Version:* Preserved at `1.0.0.0-alpha`; conformance operationalizes the accepted A18 public contracts without expanding runtime authority.

## [A18.8.1] | 2026-07-10 23:44 UTC / 16:44 PDT | Conformance authority and summoned-focus hardening

*Scope:* Close the recursive review findings against the A18.8 conformance lifecycle and compact summoned-decision behavior before live-host acceptance.

*Deliverables:*
- Restricted optional integration proof to an explicit tool-invocation permit and capabilities advertised and returned as reads; write capabilities fail before dispatch.
- Made host-session closure mandatory, removed synthetic decision resolution from the public conformance API, and omitted server-controlled exception messages from runner receipts.
- Applied one deadline across initialization, health, provider probing, decision await, and continuation, with a separate bounded cleanup deadline.
- Published the runner as the `mousecat-conformance` package binary and exercised its arguments, process exit, stdout receipt, redaction, and real child-process decision round trip.
- Made compact Mousecat follow the latest server focus through quiet refresh, preserve explicit expanded-docket selection, return to newest focus on collapse, and capture drafts before automatic focus changes.

*Verification:*
- `node --check src/operator/public/operator.js`
- `node --test test/sdk-conformance.test.mjs test/operator-server.test.mjs`
- `npm test` (154 passing)
- recursive SDK, security, runtime, and operator review with all Critical and High findings closed

*Version:* Preserved at `1.0.0.0-alpha`; this hardens the A18.8 acceptance surface without adding runtime authority.

## [A18.8.2] | 2026-07-10 23:48 UTC / 16:48 PDT | Integration provenance and heartbeat cleanup closure

*Scope:* Close the final recursive security re-review findings against provider provenance and the heartbeat response-loss window.

*Deliverables:*
- Required both public route and discovery results to identify a registry-owned integration before trusting a provider tool's read-only annotation.
- Marked host-session cleanup required before heartbeat dispatch, so an independently bounded close still runs when the heartbeat commits server-side but its response is lost.
- Preserved a stable cleanup failure code alongside the primary conformance failure when both the lifecycle and cleanup fail.
- Added no-dispatch coverage for falsely read-only external tools and an end-to-end lost-heartbeat-response cleanup proof.

*Verification:*
- `node --test test/sdk-conformance.test.mjs` (9 passing)
- recursive security re-review with no remaining Critical or High findings

*Version:* Preserved at `1.0.0.0-alpha`; this closes failure windows inside the existing conformance authority boundary.

## [A18.9] | 2026-07-14 07:54 UTC / 00:54 PST | Responsive decision-wall operator

*Scope:* Replace the single-card and duplicate-navigation graphical composition with one responsive wall that embodies Mousecat's accepted nonlinear decision contract while preserving the existing snapshot, command, and runtime authority boundaries.

*Deliverables:*
- Rendered every item from every pending interaction in one scrollable workspace at desktop, tablet, and mobile widths.
- Grouped cards only by explicit interaction-local lineage, with semantic section navigation, search, accurate open and Later counts, and framework and session context available on demand.
- Added per-card drafts, visible prepared state, individual response actions, and arbitrary-subset return through validated per-interaction `responses[]` batches.
- Preserved draft values, disclosure state, focused controls, caret position, and wall scroll position across live snapshot reconstruction.
- Added collision-safe record identity, unique per-render control identifiers, accessible parameter and continuum labeling, reduced-motion navigation, mobile announcements, and high-contrast focus treatment.
- Updated the Mass Assault presentation grammar and reconciled active product, architecture, governance, roadmap, and session documentation to DR-053.

*Verification:*
- `node --check src/operator/public/operator.js`
- `node --test test/operator-server.test.mjs test/catalog.test.mjs`
- `npm test`
- `npm run smoke:operator`
- live browser proof with 125 decisions across five explicit lineage sections at desktop and mobile viewports
- recursive correctness, accessibility, and platform-coherence review with every Critical and High finding closed
- `npm run pr:ready`

*Version:* Preserved at `1.0.0.0-alpha`; the wall corrects presentation within the existing Mousecat product and authority contract.

## [A18.9.1] | 2026-07-14 09:10 UTC / 02:10 PDT | Descriptive decision atlas and reviewed return

*Scope:* Make the accepted decision wall visually descriptive and operationally consequential without adding runtime state or browser authority.

*Deliverables:*
- Added a source-owned Mass Assault presentation with a lineage-derived decision atlas, five explicit families, state-bearing ordinal cells, roving keyboard focus, family transfer, and stable live-update restoration.
- Added recommendation previews only for option-selection shapes, literal evidence and decision-thread provenance, and provenance-aware search without inferred importance, pins, relationships, or topology.
- Distinguished local drafts as ready or incomplete through the existing response validator and added a focus-stable modal review of answers, amendments, family, evidence, and originating interaction before return.
- Split prepared returns into exact UTF-8, size-bounded, per-interaction requests; locked decision controls in flight and retained explicit partial-commit semantics if a later request fails.
- Restored focus after local mutation, filtered-atlas navigation, review reset, live reconstruction, and quiet transition to the idle workspace while preventing repeated unchanged draft announcements.
- Resolved source presentation by exact namespaced skill identity and extended the Mass Assault presentation grammar with decision-atlas, recommendation, readiness, review, batch-response, and lineage primitives.

*Verification:*
- `node --check src/operator/public/operator.js`
- `node --check src/operator/public/operator-model.js`
- `node --test test/operator-server.test.mjs test/catalog.test.mjs` (27 passing)
- `npm test` (160 passing)
- `npm run smoke:operator`
- live browser proof with 125 open decisions across five lineage families, exact provenance search, one visible roving tab stop per filtered family, truthful draft states, focus-stable review, desktop and mobile layout, and no submitted live response
- two-stage correctness, accessibility, and platform-coherence review with no remaining Critical or High findings

*Version:* Preserved at `1.0.0.0-alpha`; this strengthens the graphical decision instrument within the accepted Mousecat ontology and command boundary.

## [A19.0] | 2026-07-16 22:13 UTC / 15:13 PST | Native Unreal world foundation

*Scope:* Move the playable World One proof out of the browser renderer and into a packaged Unreal Engine 5.8 application while retaining the browser laboratory as the deterministic export and evidence surface.

*Deliverables:*
- Added the standalone C++ `MousecatWorld` UE 5.8 application under `apps/mousecat-world` with no browser or WebView dependency.
- Added deterministic World One export and receipt generation for the continuous Azalea-Ilex-Route 34-Goldenrod region.
- Ingested the exact 185 by 170 sampled terrain and water-depth grids into nine bounded procedural terrain chunks with near-player collision, non-colliding clipped shoreline water, and 1,120 generated trees.
- Added a human-scale neutral operator pawn with keyboard, mouse, and controller movement, look, jump, and sprint controls.
- Kept map, city, route, forest, and interior records nonphysical and hidden by default instead of converting semantic envelopes into fake structures or collision.
- Required sampled-source receipts to bind filename, bytes, SHA-256, world id, first region id, and semantic hash before startup; retained the synthetic fixture as an explicit receipt-free smoke input.
- Cooked the native vertex-color dependency, staged generated world data as NonUFS, and produced the standalone Windows Development package.

*Verification:*
- `node test-export-unreal-region.mjs`
- `MousecatWorldEditor Win64 Development` and `MousecatWorld Win64 Development` with Visual Studio 2022, UBA/XGE disabled, and one parallel action
- full `BuildCookRun -build -cook -stage -pak -iostore -archive` with `BUILD SUCCESSFUL`
- packaged default-authority boot: 9 terrain chunks, 3 physical object chunks, 0 semantic marker chunks, 1 region, 8 semantic landmarks, and 1,120 trees
- packaged missing-receipt and unsafe-path rejection without world promotion
- source and packaged manifest SHA-256: `39717d3f23b030bbfb077bd12bd9b3d1b3d35cfe24e361c8ae7527f4e59da567`
- `neo project assess --target . --json`: `standard`, zero findings
- code-quality-delta review closed the semantic-slab, initial-collision, packaged-material, shoreline, and receipt-authority findings

*Version:* Preserved at `1.0.0.0-alpha`; this establishes the native runtime boundary. Native map, traversal, portal, parcel, interior, structure, agent, persistence, and high-detail voxel realization remain subsequent batches.

## [A19.1] | 2026-07-16 23:38 UTC / 16:38 PST | Source-mapped voxel world realization

*Scope:* Turn World One's decoded source geography into the native playable environment on one coherent voxel lattice without reviving map-envelope collision, fake markers, or browser-renderer geometry.

*Deliverables:*
- Added typed decoding for coordinate transforms, eight source maps, semantic and traversal grids, parcels, and portal records while preserving receipt-bound manifest authority.
- Realized 5,540 semantic cells and 1,883 passable cells as terrain-aligned paths, floors, water, walls, ledges, vegetation, source-derived buildings, and shared-state interiors.
- Established one two-metre horizontal voxel lattice and 0.25-metre vertical snap for terrain and mapped surfaces, with per-subcell priority ownership that preserves partially overlapped exterior doors and shells.
- Activated only paired warp endpoints whose source and target maps are present, retained 24 external endpoints as inactive records, and kept eight walk-boundary seams spatially continuous.
- Qualified co-located portals by the active source map, synchronously primed destination collision before long traversal, and prevented immediate reciprocal bounce.
- Added component-built trees, grass, rocks, brick structures, windows, stepped roofs, open-roof interior treatment, and a neutral human-scale voxel operator; open-roof cutaways no longer retain floating chimneys.
- Made `M_VoxelWater` the default for terrain and mapped water while retaining the readable vertex-colour surface path and an explicit opt-in experimental lit surface material.
- Refreshed the participant and native-runtime READMEs and produced a current Windows Development package at `apps/mousecat-world/Artifacts/Win64/Development/MousecatWorld.exe`.

*Verification:*
- `MousecatWorld Win64 Development` with Visual Studio 2022, UBA/XGE disabled, and one parallel action
- full `BuildCookRun -cook -stage -pak -iostore -archive`: `BUILD SUCCESSFUL`
- final post-review `BuildCookRun -skipcook -stage -pak -iostore -archive`: `BUILD SUCCESSFUL`
- packaged authoritative and synthetic NullRHI boot/shutdown smokes
- live packaged boot: 36 terrain chunks, 11 physical object chunks, 32 mapped-place chunks, 53 decorative chunks, eight source maps, 18 active portals, one region, and 1,120 trees
- cooked and staged `M_VoxelSurface` and `M_VoxelWater`; no Mousecat material fallback, crash, assertion, portal, collision, or authority error
- `MAPPED_LATTICE_REPLAY_PASS` with the half-overlapped Azalea exterior door retaining eight of sixteen subcells
- three-way code-quality-delta review with no remaining Critical or High findings
- `neo project assess --target . --json`: `standard`, zero findings

*Version:* Preserved at `1.0.0.0-alpha`; A19.1 realizes already accepted native map, traversal, portal, interior, and voxel-foundation scope without expanding public runtime authority.

## [A19.2] | 2026-08-16 02:54 UTC / 19:54 PST | Project Workbench contract foundation

*Scope:* Generalize the Colonist Awareness offline world-authoring loop into a
Mousecat-owned development-workbench contract without flattening project
ontologies or claiming adapter execution before a real connector-backed path
exists.

*Deliverables:*
- Defined the Project Workbench as one conversational loop over inspect, find,
  compose, represent, stage, and apply effects, with CA as the first proving
  adapter rather than the generic model.
- Added the project-adapter, bounded workbench-session, and layered
  development-representation contract in `src/core/project-workbench.mjs`.
- Required source authorities, source vectors, adapter identity, current
  project schemas, operation effects, Mousecat permits, project-side write
  authorization, and linked receipts to remain distinct.
- Classified representation layers as source facts, deterministic projections,
  derived summaries, illustrations, or unknown; deterministic and derived
  layers require named producer identity and revision.
- Rejected executable or secret-bearing adapter fields, missing write
  authorization, project mismatches, unknown operations, and invalid view-layer
  references.
- Added a CA-shaped proof covering saved-world search, regional composition,
  multi-scale landscape representation, staging authority, and unresolved
  cell-level projection without importing CA as Mousecat ontology.
- Reconciled project identity, architecture, governance, participant README,
  roadmap, memory index, and session state to the accepted direction while
  retaining the honest boundary that runtime adapter registration and execution
  are not implemented yet.

*Verification:*
- `node --check src/core/project-workbench.mjs`
- `node --test test/project-workbench.test.mjs` (6 passing)
- project-adapter proof retains CA-owned schema references and operation effects
- security proof rejects executable and secret-bearing descriptor fields
- authority proof rejects stage writes without project-side authorization
- evidence proof rejects deterministic projections without producer revision

*Version:* Preserved at `1.0.0.0-alpha`; A19.2 establishes internal contracts
and validated source foundations. The future public runtime/API growth unit will
advance the minor coordinate when adapter registration and workbench execution
become externally callable.

## [A19.3] | 2026-09-22 04:38 UTC / 21:38 PDT | Narrative ML decision review

*Scope:* Let the operator understand where an ML decision sits, how it reaches play, what their answer changes, and which precedent it sets before returning a ruling through the existing Mousecat decision wall.

*Deliverables:*
- Added the bounded `mousecat.ml-review/1` item record for the human situation, system role, ordered causal path, player impact, decision precedent, literal input, proposed learning, effects, exclusions, and evidence.
- Validated the record before interaction creation in direct widget, queue, and normalized skill paths; malformed records fail without partial state mutation.
- Bound the complete review into skill invocation fingerprints so a continuation cannot approve altered learning context under the same invocation identity.
- Rendered the narrative and causal path before artifact detail in the open decision card and prepared-return review, added all fields to decision search, and retained a one-column narrow layout with wider comparison and meaning grids.
- Kept interpretation and truth with the source caller. Mousecat validates and presents the supplied claims without generating missing evidence, confidence, or effects.
- Extended the existing sensitive-item boundary so the complete review remains absent from public snapshots and ignored local state.

*Verification:*
- `node --check src/core/ml-review.mjs src/core/catalog.mjs src/core/skill-invocation.mjs src/core/runtime.mjs src/operator/public/operator.js`
- `node --test test/catalog.test.mjs test/runtime.test.mjs test/operator-server.test.mjs` (69 passing)
- missing-narrative, malformed-field, invocation-conflict, public-snapshot, and sensitive-redaction regressions
- desktop and narrow live operator inspection with a consequential retriever-policy example

*Version:* Preserved at `1.0.0.0-alpha`; A19.3 adds an evidence projection within the accepted skill item, wall, fingerprint, and redaction contracts without adding a tool, action, effect, or authority surface.

## [A19.4] | 2026-09-23 07:13 UTC / 00:13 PDT | Linked history and methods cabinet

*Scope:* Make retained decisions, plans, evidence and reusable methods searchable
and traversable through their explicit source relationships.

| Surface | Delivered behavior |
|---|---|
| History runtime | Revisioned records independent of event retention; exact original choices and responses; source coverage; labeled links and backlinks. |
| Source ingestion | Exact declared project files, bounded reads, redaction, Markdown section locations, source-identity and revision-pinned navigation. |
| Operator reader | Search and filters, record/revision routes, Back/Forward, reading-position recovery, original answers, connected records and return to unfinished review drafts. |
| Methods | Host-authored purpose, applicability, procedure, failures and evidence; proposed/reported standing remains distinct from an operator ruling. |
| Plan presentation | Structured document rendering, supporting disclosures, internal history links and source details outside the main summary. |

*Verification:* 207 repository tests passed; GitHub-script tests and all 14
runtime smoke commands passed. Independent history/navigation reviews were
addressed. Live desktop and 390x844 checks exercised source navigation, filtered
result links, deep-link reload, reading position, disclosure state and temporary
draft preservation without submitting an answer. A managed-service restart
retained the indexed method before re-indexing and resumed the same pending
review through its original continuation.

*Release standing:* Local upgrade, not a published release. The wider dirty
checkout retains inherited governance-floor permit errors, a missing native
world documentation target and hygiene findings. Documentation tool tables now
match the runtime. Existing work is preserved.

*Version:* `1.1.0.0-alpha` (npm `1.1.0-alpha`); minor advances for the new public
history tool and operator navigation contract.

## A19.5 - Project context and review composition

*Timestamp:* 2026-09-23 20:39 UTC / 13:39 PDT

*Request and correction:* The operator identified overloaded composition,
ineffective project/subproject navigation and ancillary information competing
with qualitative judgment. The assistant initially inferred that explanation
preceding response controls was an experienced defect. The operator explicitly
corrected that account: the issue was compositional. Control placement is an
implementation choice, not evidence for that rejected diagnosis. Functional
verification does not establish operator acceptance of the revised composition.

*Implemented:* Stable Projects, Questions and History navigation; clickable groups,
subprojects and work-specific question routes; registered sources consolidated by
project reference. Direct and unassigned questions remain accessible. Documents
expand without shrinking and refresh while retaining reading state. ML reviews
foreground situation and comparable content, with adjacent desktop responses and
supporting rationale/evidence on demand. Document reviews retain a reading layout.
Draft editing returns to the originating work from any project view.

Skill intake carries optional project ownership. Explicit surface interaction
associations contextualize existing work without rewriting original ownership,
questions or continuations. Project thread summaries use public redaction.

*Verification:* Two independent reviewers found draft-revision routing,
intermediate-width compression, scoped skill identity and sensitive-summary
issues; these were repaired and reviewed again. `npm run verify` passed 211 tests,
GitHub script checks and all 14 smoke commands. Follow-up context tests passed
11 cases. Desktop and mobile browser checks covered project entry, comparison,
source expansion and refreshed document content. A separate synthetic runtime
verified a draft across projects, history return, revision and submission.
At 1200px, material retained 557px and responses 267px; at 390x844, page bounds
remained 390x844. Actual pending operator judgments were not submitted by tests.

*Standing:* Locally implemented; compositional acceptance remains with the
operator. Full readiness retains inherited action-defined permit errors, a
missing native-world manifest reference and native artifact/private-path hygiene
findings. Pre-existing work is preserved. No published release is claimed.

*Version:* `1.2.0.0-alpha` (npm `1.2.0-alpha`), minor for additive public context
fields and scoped navigation.

### A19.5 continuation - Complete the compositional review

*Timestamp:* 2026-09-23 20:48 UTC / 13:48 PDT

The operator challenged the premature closeout after correcting the diagnosis.
The existing implementation and functional checks were retained; a specific
composition review then examined the actual rendered interface. It found repeated
work/family/count scaffolding, weak numbered navigation, unnecessary prominence
for framework metadata and source-registration IDs, and indistinct historical
outcomes. These findings concern composition; they do not reinstate the rejected
claim about separation between explanations and response controls.

The continued implementation consolidates identity and progress, moves framework
details to an on-demand dialog, names destinations in small question collections,
indicates the viewed question and aligns navigation with its beginning. Project
documents/data prioritize their labels and preserve attribution inside each entry.
History distinguishes outcomes. Retained unanswered records lead to history
with their reconnection standing rather than an unavailable live response form.

Verification: 212 automated tests, GitHub script checks and all 14 functional
smokes passed. Browser checks verified named navigation and current indication,
context focus return, consolidated documents, a document-shaped synthetic plan
and draft preservation through the context dialog. At 390x844, the page stayed
within viewport bounds with approximately 509px of reading space; the desktop
reading pane measured 530px at a 720px viewport. These measurements establish
layout behavior, not a substitute for the operator's qualitative assessment.
The pending four real judgments remained unsubmitted. Inherited release blockers
and the unpublished local standing are unchanged.

## A19.6 - Desktop access and persistent questions

The operator requested a normal, reopenable desktop application and corrected
the project framing: Mousecat is a personal, host-independent platform with
shared workflow contracts; browser and desktop remain complementary access
paths. Consumer projects supply their context through those contracts. Their
current use does not define Mousecat's foundation.

The Windows x64 client embeds the existing operator surface through WebView2,
uses the shared safe command boundary and installs Desktop/Start menu shortcuts.
Repeat launch focuses one window. Closing it leaves the service running; opening
it starts the managed service when absent. The installed private configuration
selects the repository, Node executable, configuration and port. Effective
persistence and workspace identity are checked against the live service's private
record before attachment. No native script bridge or alternative response store
is introduced. Unsubmitted drafts remain in the open view.

Runtime recovery now restores ordinary open/deferred questions immediately,
including previously archived pending records. Operator responses survive another
restart and return through the original capability with exact typed values and
lineage. Completed and redacted-only work stays archived; redacted content cannot
be answered. Withdrawing archived work immediately resolves its pending waiters.

Read-only review found and repaired service/configuration mismatch acceptance and
the archived-waiter withdrawal regression. The final native build is warning-free;
desktop contract checks cover origin, snapshot and effective persistent-workspace
identity. Runtime tests cover repeated restarts, disconnected-host responses,
capability retrieval, deferred work, completed history and sensitive redaction.
The full readiness run retains the previously recorded workbench/projects permit
blockers; this unit makes no clean repository-release or publication claim.

Actual desktop verification opened the four original pending questions, closed
the window, stopped the shared service and relaunched through the Desktop shortcut.
All four returned open without any caller await or reconnect. Repeat launch left
one client instance. The final installed window is visible with zero submitted
judgments. Tests use separate synthetic questions; none supplies an operator
answer. A state backup and local visual/check receipts remain ignored runtime
evidence. Existing unrelated work and release blockers are preserved.

Version: `1.3.0.0-alpha` (npm `1.3.0-alpha`), minor for the desktop access path and
durable operator availability contract.

Final verification: 216 runtime/repository tests, 16 GitHub-script tests and all
14 functional smoke commands pass. The desktop contract executable passes 23
checks; Release build reports zero warnings and errors. Documentation currency
and governance ceiling also pass. Full readiness stops at the two inherited
permit declarations recorded above; downstream PR documentation/hygiene release
standing is not promoted by these results.

## A19.7 - Persistent appearance settings

The operator requested OTL color-scheme rules in Mousecat and an alternative to
the bright white workspace. Settings > Appearance now offers Manuscript (default
warm charcoal, cream and brass), B&W (black with achromatic white/silver) and
Light. Semantic tokens cover questions, projects, history, dialogs and controls;
workflow accents remain neutral in B&W. Preferences apply before initial paint,
persist per profile, and synchronize across same-origin browser tabs. The native
window follows the selected scheme through a bounded read of the theme name.
Question content, drafts and runtime response authority are unchanged.

Browser verification covered all options, saved preference on reload, desktop
and 390x844 layouts, and themed history and questions. Native UI automation
confirmed B&W remained selected after closing and reopening the installed app.
Four original judgments remain open. This is a local implementation; existing
release blockers are retained. Version: 1.4.0.0-alpha (npm 1.4.0-alpha), minor
for the shared public appearance settings.

A19.7 final checks: 220 automated tests (including four appearance tests), 16
GitHub classifier tests, all 14 runtime smokes and 23 desktop contract checks
pass. Governance ceiling and documentation currency pass. Full readiness stops
at the inherited workbench/projects unknown-permit declarations; downstream
PR documentation and strict hygiene were not reached. Visual checks establish
rendering and persistence, not operator acceptance of the broader composition.
The operator subsequently prohibited desktop focus changes while working; all
interactive verification stopped and remaining checks ran in the background.

### A19.7 continuation - Background completion of readiness checks

The operator clarified that concurrent desktop use does not pause development.
Further work stayed in background file and test operations. The projects and
workbench catalogs now use the established action-specific permit declaration.
The floor verifies complete action coverage, rejects unknown permits and limits
adapter-resolved permission to workbench operation dispatch. Runtime checks still
require both the operation grant and the registered adapter profile; a negative
control verifies rejection before connector execution and a permitted control
executes once. No runtime grant or operator authority was expanded.

The downstream documentation links now resolve. Native packaged build output is
ignored at its existing Artifacts directory and remains on disk. Test-only invalid
capabilities are named fixture values, preserving exact test behavior while keeping
the source secret scanner strict. The historical world-decision receipt retains
its exact canonical payload and SHA-256; only its metadata source location becomes
repository-relative. The original local metadata is preserved in ignored evidence.

Continuation verification: the complete npm run pr:ready sequence passes: 224
Node tests, 16 GitHub classifier tests, all 14 smoke commands, governance floor
and ceiling, documentation currency, PR documentation and strict source hygiene.
The working tree remains unpublished. No live-service restart, window activation,
browser navigation or operator response occurred during this continuation.

## [A19.8] Declarative scene previews in ML review

The operator explicitly authorized a shared map-and-timeline renderer in the
existing review panel. A bounded optional scene contract carries caller-owned
provenance, places, people, chronological states, personal information and
communication status. Intake checks references and decision horizon. Responsive
SVG rendering, timeline controls and person inspection run without simulation
or answer writes. Prepared-return review uses the same renderer. Existing
review hashing, persistence and sensitive redaction cover the full packet.

Version: 1.5.0.0-alpha (npm 1.5.0-alpha), minor for the additive public review
contract. The existing unpublished tree is preserved. Verification follows
below after the complete repository and browser checks.

A19.8 final verification: 229 Node tests, 16 GitHub classifier tests, every
runtime smoke and the complete npm run pr:ready gate pass. Headless browser
checks cover 1440x1100 and 390x844 interaction layouts, timeline stepping, keyboard
input, person information and zero answer submissions. Responsive SVG labels
retain readable size on narrow screens. A background service update preserves
all 34 previous interaction records; a fresh headless client renders the exact
queued scene. No desktop activation, existing-tab navigation or operator answer
occurred. This is a local deployment on the existing unpublished working tree.

## A19.9 - Native simulation observatory

*Timestamp:* 2026-09-27 10:08 UTC / 03:08 PDT

The operator requested a low-latency multi-feed simulation view, automatic
successor-session switching, and a panel of equally sized, adjustable and
toggleable screens with minimal perceptual-state overlays. The native-view
contract now accepts the current engine frame and up to four retained activity
frames with immutable image identities. Each optional overlay binds one pictured
person, its own source sample time and bounded Activity, Attention, Memory and
Needs rows. Validation rejects unknown groups, oversized projections, missing
people and state sampled after its pixels.

The Simulation route presents every visible screen at one shared adjustable
size, while letting the operator hide or restore individual screens and toggle
each overlay group. Attention is the only default overlay. Frame age remains
visible per screen; state lag is stated on the image whenever an overlay is
present. The screens are retained samples from one renderer, so the surface
does not describe them as simultaneous cameras. Camera, speed, zoom, person,
game-panel and cognition commands retain the existing producer-owned boundary.

The installed B&W Desktop displayed the active resumed six-person native world
with equal panels and the existing person inspector. Headless browser checks
proved common resizing from 320 to 640 pixels, individual hide/restore, overlay
hide/restore, exact Attention and Memory rows, and a 760-pixel layout without
horizontal overflow. The browser recorded no page errors or failed responses.
The successor feed remained `unreviewed` with zero training rows and teaching
targets. Watching or configuring this observatory supplies no scenario ruling.

Version: `1.6.0.0-alpha` (npm `1.6.0-alpha`), minor for the additive native
observation contract and shared simulation surface.

A19.9 final verification: all 291 Node tests pass with two Windows symlink
skips; 16 GitHub classifier tests, every runtime smoke, governance floor and
ceiling, documentation currency, PR documentation and strict hygiene also pass
through the complete `npm run pr:ready` gate. The installed active Desktop and
headless interaction evidence remain in ignored local verification storage.

### A19.9 publication repair - Remove generated Android file-server credential

GitHub's pinned Gitleaks check identified Unreal's generated Android file-server
token in `DefaultEngine.ini`. Mousecat does not ship or use that network service;
the public configuration now disables the plugin and network connection and
leaves its token empty. The rejected commit is replaced so the generated value
does not remain in branch history. Native Windows world and observatory behavior
are unchanged.

The Node 20 compatibility lane then exposed that `AbortSignal.timeout` could
leave a stalled SDK conformance initialization pending without a referenced
event-loop handle. The conformance lifecycle and its independent cleanup now use
explicit bounded timers that keep their promises live and are cleared on every
exit. The focused nine-test conformance suite passes under both Node 20 and the
current local Node runtime, including the stalled-initialization deadline and
real child-process round trip.

The two older Dependabot pull requests blocked Mousecat's chronological merge
gate while separately proposing `actions/setup-node` 7 and CodeQL action 4.37.4.
Their exact workflow-only updates are included in this already-ratified
publication batch; the older requests can close as superseded. The runtime Node
versions remain 22 and 20, with no workflow permission or trigger changes.

## A19.9.1 - Observatory surface repair

*Timestamp:* 2026-09-27 19:41 UTC / 12:41 PDT

The operator identified four basic failures in the first multi-view surface:
perceptual information covered the world, the fixed person inspector consumed
screen width, live controls expired after three seconds, and ended-session ages
continued advancing. Telemetry now occupies a compact shelf below each image.
The inspector can yield its full width and the client retains that choice,
panel size and selected telemetry groups.

Command liveness is separate from ideal frame freshness. A delayed running
frame remains controllable for thirty seconds, and an explicitly paused session
retains its resume path at any age. Ended and disconnected sessions remain
write-closed. Ended views freeze final-frame, retained-frame and inspection
timing, stop the half-second age interval and reduce successor discovery from
ten polls per second to one.

Focused native-view verification passes 62 assertions with two expected Windows
symlink skips. Headless Chrome at 1600 by 1050 and 760 by 900 proves that
telemetry begins exactly below the image, hiding the inspector expands the stage
from 1000 to 1538 pixels, preferences survive reload, final timing does not move,
long-paused controls remain enabled, and neither viewport overflows. The complete
`npm run pr:ready` gate passes 293 Node tests with two expected Windows symlink
skips, 16 GitHub classifier tests, every runtime smoke, governance, documentation
and strict hygiene. The rebuilt installed Desktop and restarted port 4317 service
pass the same browser checks. Version remains `1.6.0.0-alpha`; this repairs the
existing A19.9 surface.

## A19.9.2 - Observatory information legibility

*Timestamp:* 2026-09-27 20:07 UTC / 13:07 PDT

The prior repair moved telemetry but did not implement the requested opacity or
improve the diagnostic presentation. Each screen now owns one in-image
information layer with persisted 0-100% alpha, a 55% default and a true zero
state. Activity, Attention, Memory and Needs selection remains independent from
layer opacity.

The person inspector no longer presents the summary and cognition model as a
flat stream. It separates role, synopsis facts, live section facts, provenance,
event timing, model version, belief status, confidence and association detail.
Immediate person state appears before the deeper cognition tree.

The focused native-view suite passes 62 assertions with two expected Windows
symlink skips. Headless Chrome against the installed port 4317 service verifies
the real three-screen ended session at 1680 by 950 and 760 by 900: default,
zero and changed opacity, persistence through reload, inspector hierarchy, 52
fact cards, no horizontal overflow, no page errors and no failed responses.
Version remains `1.6.0.0-alpha` as an in-place A19.9 repair.

## A20 - Durable study-session controls

*Timestamp:* 2026-09-28 07:02 UTC / 00:02 PST

The Simulation route now accepts optional producer-owned durable session state.
Running attempts expose Save session; normally saved attempts expose Continue
session. Attempt duration and automatic continuation live inside an expandable
Session settings section. The public contract bounds attempt duration from 30
seconds through seven days, validates exact Boolean continuation state and
admits lifecycle requests only when the source advertises their current use.

Ended views remain write-closed except for saved-session continuation and
configuration. Every request uses the existing same-origin, immutable,
consecutive command transport. Mousecat receives no local path, executable,
arbitrary command, save implementation or dataset authority. Successor selection
continues to wait for a complete source frame.

Version: `1.7.0.0-alpha` (npm `1.7.0-alpha`), minor for the additive public
study-session and operator-control contract. The complete `npm run pr:ready`
gate passes 293 Node tests with two expected Windows symlink skips, every smoke,
governance, documentation and strict-hygiene check. Headless Chrome against the
source service verifies the real three-screen observatory at 1680 by 950 and 760
by 900. The saved session exposes Continue, the closed settings expand to a
120-minute attempt and automatic-continuation control, the mobile document has
no horizontal overflow, and the page reports no runtime errors.
