| Document | Mousecat Decision Registry |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 10:04 UTC / 03:04 PDT |
| Status | ACTIVE - append-only decisions. |

# Decision Registry

## DR-001 | 2026-06-26 01:17 UTC / 18:17 PST | Mousecat instantiated as a host-facing MCP organ

*Decision:* Mousecat is instantiated as an open-source-ready MCP control plane that exposes one host-facing namespace for operator questions, sessions, decision queues, visualization, routing, invocation boundaries, status, and credential references.

*Rationale:* The host should not need to understand every upstream MCP server, AI tool, IDE state source, or workflow engine. Mousecat centralizes the live operator interaction and policy boundary while preserving upstream specificity behind route plans and work permits.

*Origin:* Operator direction to make Mousecat Neo-compatible and immediately usable with Crucible, Mass-Assault, and Total Recall style skills across IDEs, Claude Code, Codex, and CLI workflows.

## DR-002 | 2026-06-26 01:17 UTC / 18:17 PST | Skills surface as buttons through source-owned atomic records

*Decision:* Mousecat records Crucible, Mass-Assault, and Total Recall as atomic skill records with button metadata, tool targets, permit requirements, and framework membership.

*Rationale:* IDEs and coding apps need fast operator actions, not only prose instructions. Button-shaped skill atoms let a host render real UI while still routing through the MCP and governance boundary.

*Origin:* Operator requirement that atomic skills surface as buttons and compose into skill-framework and work-permit libraries.

## DR-003 | 2026-06-26 01:33 UTC / 18:33 PST | Private Neo remains external to open-source Mousecat

*Decision:* Mousecat ships an external MCP connector contract for private Neo instead of committing Neo internals, GZDS implementation details, private tool schemas, generated discovery output, local paths, or model/provider catalogs.

*Rationale:* The open-source project should let AI hosts reach operator-owned Neo tools inside a development environment without disclosing the operator's private implementation. Dynamic MCP discovery preserves integrated functionality while keeping private implementation details outside the public repository.

*Origin:* Operator correction that Mousecat should be a bridge or MCP connection that can update regularly and let local AI hosts utilize Neo tools, not a public dump of private Neo intelligence.

## DR-004 | 2026-06-26 04:40 UTC / 21:40 PDT | Operator chains are Mousecat interaction sessions

*Decision:* Mousecat represents longer governed operator workflows as interaction sessions with stable `sessionId`, `interactionId`, optional parent lineage, public interaction shapes, constraints, item statuses, and visualizer-safe events.

*Rationale:* AI coding hosts often cannot surface deep chains of atomic questions. Mousecat keeps those chains modular and host-agnostic while preserving enough structure for skills, queues, replay, and live visualization.

*Origin:* Operator direction that Mousecat should be a portable augmentation plane for AI coding apps, not only a single host UI gate.

## DR-005 | 2026-06-26 04:48 UTC / 21:48 PDT | Bridge contracts are public resource reads

*Decision:* Mousecat reads upstream compatibility contracts through MCP resources and summarizes them separately from tool invocation.

*Rationale:* Bridge contracts describe compatibility, policy, route shape, and stale-runtime handling. They should be observable without a tool-invocation permit and without executing private upstream behavior. Runtime tool calls remain behind `mousecat.invoke`.

*Origin:* Neo exposed `mousecat_bridge_contract_v1` as the public bridge contract for Mousecat consumption.

## DR-006 | 2026-06-26 04:57 UTC / 21:57 PDT | Mousecat uses MPL-2.0

*Decision:* Mousecat core source is licensed under MPL-2.0.

*Rationale:* Mousecat should remain usable by proprietary AI IDEs, coding apps, plugins, and local/private upstreams while keeping distributed modifications to Mousecat source files open. MPL-2.0 matches that file-level copyleft boundary better than permissive licensing or network/copyleft-heavy licensing.

*Origin:* Operator ratification of MPL-2.0 for the open-source posture.

## DR-007 | 2026-06-25 05:15 UTC / 22:15 PDT | OSS CI/CD uses GitHub Actions on the public verify surface

*Decision:* Mousecat's initial public CI/CD consists of a verify workflow exercising `npm run verify` (test + status/buttons/connectors/mcp smokes), a CodeQL analysis workflow, Dependabot config, and committed package-lock.json. All operate under default config (no private connector details) on ubuntu-latest.

*Rationale:* Transparent, reproducible gates for contributors using existing scripts. Standard GitHub-native security surfaces (code scanning, dep updates, secret scanning) without introducing private paths, secrets, or publication steps. Matrix on Node 20+ matches engines. Documentation and append-only records accompany the surface.

*Origin:* Operator mandate for Mousecat OSS CI/CD research pass on the mallowfluff-a2-oss-neo-connector branch; see-and-verify of the clean default runtime surface.

## DR-008 | 2026-06-26 09:57 UTC / 02:57 PDT | PR readiness is the public GZDS contribution gate

*Decision:* Mousecat uses `npm run pr:ready` as the public branch and pull-request readiness contract. The gate runs tests, runtime smokes, governance floor checks, governance ceiling checks, doc currency checks, and strict source hygiene before review. GitHub Actions reruns the same surface and adds named dependency and secret scanning.

*Rationale:* Mousecat is AI-native open source. Contributions must be auditable and discernible: source truth, docs, ledgers, package metadata, runtime catalogs, and policy boundaries need to agree before operator review.

*Origin:* Operator direction to adapt working GZDS contribution discipline into Mousecat instead of inventing a separate governance system.

## DR-009 | 2026-06-26 10:04 UTC / 03:04 PDT | Mousecat adopts portable PR classifiers

*Decision:* Mousecat uses source-owned PR chronology and PR-shape classifiers in its GitHub pull-request path. Shape classification blocks generated/local output, routes oversized or wide-surface changes to operator ratification, and requires governance-shaped changes to carry batch and decision companions.

*Rationale:* AI-native open source needs review surfaces that are legible before operator review. Neo's classifier scaffolding is applicable to Mousecat when adapted to Mousecat's public paths and boundaries.

*Origin:* Operator correction that the prior cross-reference did not deeply inspect Neo's newer governance classifiers and that Mousecat needs similar scaffolding for AI-native OSS development.

## DR-010 | 2026-06-26 18:05 UTC / 11:05 PDT | Mousecat CI emits governance observations before privileged automation

*Decision:* Mousecat adopts a stable `ci-verify` check, Node 20 compatibility check, named security checks, classifier trace artifacts, read-only PR outcome observation, and manual package dry runs as the public GitOps governance loop.

*Rationale:* Neo's current CI/CD posture shows that AI-native repositories need source-owned classifiers, durable evidence, protected check names, and policy visibility before automation can be trusted. Mousecat should inherit that discipline while remaining open-source-safe: observations are artifacts, private connector execution stays disabled in CI, and auto-merge or corpus-promotion tokens require later operator ratification.

*Origin:* Operator direction to assess Neo's new CI/CD/governance and integrate the stronger posture into Mousecat rather than merely report on it.

## DR-011 | 2026-06-26 18:58 UTC / 11:58 PDT | Operator widget is generic before workflow-specific

*Decision:* Mousecat exposes `mousecat.widget` as the generic host-facing operator interaction facade. It carries the public `operator_widget.available()` and `operator_widget.ask(payload)` semantics, typed responses, holds, snapshots, and visualizer event records separately from workflow-specific skill atoms.

*Rationale:* Mousecat should be usable as a default third-party execution and augmentation surface across AI IDEs and agent hosts. Hosts need a stable widget contract for long question chains and modular operator responses; they should not have to understand private or project-specific skill names to render the surface.

*Origin:* Operator critique that skill terms were too opaque for the open-source surface and direction to keep Mousecat broad, customizable, and host-facing.

## DR-012 | 2026-07-04 02:04 UTC / 19:04 PDT | Mousecat adopts the PR documentation runner

*Decision:* Mousecat adds a repository-local PR documentation runner to `npm run pr:ready`. The runner checks doc-pack completeness, source-change documentation through `BATCH_LOG.md`, append-only ledger preservation, documentation path-reference consistency, and batch-prefix presence for PR or commit titles.

*Rationale:* AI-native OSS work needs a mechanical documentation consistency gate, not only social convention. The runner adapts the operator's Marshmallow Commons governance direction into Mousecat as a clean-room public check that imports no private Neo implementation.

*Origin:* Operator direction that the Marshmallow Commons/PolyForm governance conversation should also apply to Mousecat.

## DR-013 | 2026-07-04 02:17 UTC / 19:17 PDT | Mousecat adopts a Kohai-aware root odometer

*Decision:* Mousecat's root `VERSION` uses `major.minor.kohai.patch-maturity`. npm package metadata projects to `major.minor.kohai-maturity` when the root patch coordinate is zero. The governance floor enforces the root form, caps, and package projection.

*Rationale:* Mousecat is a public OSS bridge, but it should share the current Neo/GZDS governance semantics. Kohai is the third numeric coordinate: governance automation, release-discipline, classifier, hygiene, documentation, and OSS-readiness maturation move Kohai; runtime/API/public operator-contract growth moves minor; local repair moves patch.

*Origin:* Operator correction that the current standard is Kohai as a numeric version tier and that Mousecat was stale relative to Neo/GZDS governance.

## DR-014 | 2026-07-04 02:26 UTC / 19:26 PDT | Mousecat uses PolyForm Perimeter 1.0.0

*Decision:* Mousecat supersedes MPL-2.0 with PolyForm Perimeter License 1.0.0. The root `LICENSE` file carries Mousecat's required notice and the full PolyForm Perimeter 1.0.0 terms. npm metadata uses `SEE LICENSE IN LICENSE`.

*Rationale:* Mousecat is source-available bridge infrastructure for operator-governed agent tooling. PolyForm Perimeter keeps source visible and usable under the published grant while reserving competing-product use outside the license. The package metadata must point to the in-repo text because the active license is not represented as an SPDX expression in this repository.

*Origin:* Operator direction to switch Mousecat from the old MPL posture to the PolyForm governance posture already discussed for Marshmallow Commons-style OSS surfaces.

## DR-015 | 2026-07-04 02:28 UTC / 19:28 PDT | Mousecat owns local governance hooks

*Decision:* Mousecat provides a repository-local hook installer for `commit-msg`, `pre-commit`, and `pre-push`. The hooks enforce batch-prefixed commit messages, run governance/documentation/hygiene checks before commit, and run `npm run pr:ready` plus audit before push.

*Rationale:* CI is the remote authority, but workstation hooks prevent split-brain drift before a change leaves the local checkout. The hook bodies live in source and are test-covered so they can evolve under the same governance as the rest of Mousecat.

*Origin:* Operator direction to instantiate Mousecat with proper Neo-style governance and hooks rather than leaving standards as docs-only instructions.

## DR-016 | 2026-07-04 03:02 UTC / 20:02 PDT | Stale upstream MCP runtime is a first-class connector boundary result

*Decision:* Mousecat treats upstream MCP `MCP_RUNTIME_STALE` failures as `connector-runtime-stale` with `restartRequired: true` and a public stale code. The result appears at discovery and permit-gated invocation boundaries.

*Rationale:* Neo is the primary tool set for governance, routing, and iteration, while Mousecat is the development target. When a long-lived private Neo MCP process goes stale, Mousecat must make that state actionable for hosts without embedding private Neo source, generated schemas, local paths, or runtime internals.

*Origin:* Live Codex-to-Neo pre-flight reproduced `MCP_RUNTIME_STALE` from the Neo MCP process while beginning Mousecat development. A10.5 captures that failure mode as public connector behavior.

## DR-017 | 2026-07-04 05:30 UTC / 22:30 PDT | Secret scanning uses the open-source Gitleaks CLI

*Decision:* Mousecat's `secret-scan` workflow installs and runs a pinned open-source Gitleaks CLI release directly instead of using `gitleaks/gitleaks-action@v3`.

*Rationale:* Mousecat's public personal upstream and private Ground Zero Solutions downstream need the same named secret-scanning gate. The marketplace action requires a Gitleaks license for organization-owned private repositories, while the open-source CLI preserves the scan without introducing repository secrets or paid-action coupling.

*Origin:* The private `GroundZeroSolutions/mousecat` baseline run failed at `secret-scan` because the Gitleaks action license gate applies to organization/private repositories.

## DR-018 | 2026-07-04 08:19 UTC / 01:19 PDT | Live Neo connector smoke stays local and sanitized

*Decision:* Mousecat provides `node scripts/neo-live-smoke.mjs --config mousecat.config.json` as the local private Neo connector smoke. The command may use ignored local config over stdio, HTTP, or Streamable HTTP external MCP transport, but source only owns the generic bridge check, permit forwarding check, public required-name assertions, and sanitized runtime identity/doctor summary. HTTP connectors use environment-referenced bearer credentials and report endpoint posture without exposing token values.

*Rationale:* Neo is the primary governance, routing, and iteration tool set, while Mousecat is the open-source target bridge. The local connector must be easy to verify from Mousecat, including after Neo runtime authority directs normal clients to deployed HTTP MCP endpoints, but public source must not absorb private Neo paths, generated catalogs, schemas, credentials, token values, or raw runtime payloads.

*Origin:* Operator direction to proceed with Mousecat development using Neo as the primary tool set, plus live A11 work showing the stdio launcher boundary is not the correct normal-client path after Neo runtime authority repair.

## DR-019 | 2026-07-04 08:32 UTC / 01:32 PDT | Adapter harness emits render packets through existing widget semantics

*Decision:* Mousecat represents host adapters as source-owned profiles and `mousecat.adapter.render-packet/1` records exposed through the catalog, visualizer, and CLI. The render packets cover generic MCP, Codex, Claude Code, JetBrains, Cursor, and CLI consumers, but they do not create host-specific widget semantics.

*Rationale:* The original A11 plan was a widget adapter harness. A11.0 proved the live Neo path first; A11.1 now supplies the adapter contract while preserving the generic open-source surface. Hosts own rendering and persistence. Mousecat owns interaction semantics, event shape, permits, route planning, and private-upstream redaction.

*Origin:* Operator ratification that A11.0 should be treated as preflight and the originally planned adapter harness should continue as A11.1.

## DR-020 | 2026-07-09 03:15 UTC / 20:15 PDT | Neo example config uses HTTP endpoint posture

*Decision:* Mousecat's checked-in Neo example connector uses a disabled loopback HTTP MCP endpoint with environment-referenced bearer credentials. Stdio connectors remain supported, but the public example follows the normal Neo runtime-consumption posture instead of the legacy local launcher shape.

*Rationale:* A11.0 landed the HTTP-capable connector and live-smoke basis, while the checked-in example config still showed a private-root stdio launcher. The example must teach the current endpoint boundary without committing private Neo paths, raw runtime payloads, generated catalogs, schemas, credentials, or token values.

*Origin:* FIFO rework of the original A11.2 PR after the connector implementation had already landed in the A11.0 live-Neo basis.

## DR-021 | 2026-07-09 03:21 UTC / 20:21 PDT | Recursive dockets may persist in ignored local state

*Decision:* Mousecat may persist sessions, interaction packets, decision queues, public events, and credential references in ignored local JSON state when `state.enabled` is true. The default checked-in posture remains disabled, and local records live under the ignored `.mousecat/` directory.

*Rationale:* Recursive Neo-assisted work needs continuity across short-lived CLI and host process boundaries. A local docket lets `mousecat.session`, `mousecat.queue`, and `mousecat.visualize` recover the same working state without making generated state canonical or committing private upstream payloads.

*Origin:* Continuing Mousecat development through live Neo showed the next durable bridge gap was not another connector transport, but recursive session continuity inside Mousecat itself.

## DR-022 | 2026-07-09 03:27 UTC / 20:27 PDT | Route plans are recallable local state

*Decision:* Mousecat may persist bounded route-plan history in ignored local state when `state.enabled` is true. The bound is source-owned through `state.maxRoutePlans`, and route-cache records remain planning facts rather than invocation authorization.

*Rationale:* Recursive Neo-assisted work needs to recover not only open decisions, but also the last route decisions that shaped the next action. Persisting route plans lets hosts and CLI recalls reconstruct routing context across processes while `mousecat.invoke` remains the only upstream execution path.

*Origin:* A11.3 made local dockets durable; the next smallest persistent-state extension was route recall without starting host-specific state adapters.

## DR-023 | 2026-07-09 03:34 UTC / 20:34 PDT | Host state binds through adapter packets

*Decision:* Mousecat represents host-specific state binding as `mousecat.host-state-adapter/1` records attached to adapter render packets. Each record names the host profile, state scope, storage posture, readable records, writable interaction tools, sync triggers, and boundaries.

*Rationale:* Hosts need concrete state binding instructions before real Codex, Claude Code, JetBrains, Cursor, CLI, or generic MCP integrations can render durable Mousecat work. Encoding that shape in the catalog keeps state semantics in Mousecat while letting hosts own local persistence.

*Origin:* A11.4 completed bounded route-plan recall; the remaining persistent-state roadmap item was host-specific adapter shape, not a host plugin implementation.

## DR-024 | 2026-07-09 03:41 UTC / 20:41 PDT | Host state binding is a public tool and CLI surface

*Decision:* Mousecat exposes host-state binding through `mousecat.host-state` and `node src/cli.mjs host-state <profile>`. The returned `mousecat.host-state.binding/1` packet includes the selected host-state adapter, adapter render packet, bounded public runtime records, sync triggers, readable and writable tool bindings, and redaction boundaries.

*Rationale:* A11.5 told hosts how to bind state, but a real host path still needed an executable packet that paired the adapter contract with current Mousecat records. Making the binding available through both MCP and CLI lets generic MCP hosts and the terminal profile consume the same contract before heavier Codex, Claude Code, JetBrains, or Cursor adapters are implemented.

*Origin:* Continuing the planned A11 host adapter line after A11.5 showed that the next smallest integration proof was a CLI/generic host binding, not another schema-only adapter or host-specific plugin.

## DR-025 | 2026-07-09 03:47 UTC / 20:47 PDT | Adapter profile selection is config-owned

*Decision:* Mousecat config separates the freeform `hostProfile` label from `adapterProfile`, which must name a source-owned host adapter profile such as `generic-mcp`, `codex`, `claude`, `jetbrains`, `cursor`, or `cli`. `mousecat.host-state` uses the configured adapter profile when no explicit profile is requested and returns `invalid-config-adapter-profile` when the configured profile is unknown.

*Rationale:* Host-state binding became executable in A11.6, but real hosts should not have to pass a profile argument on every state sync. Keeping `hostProfile` freeform preserves local host labels, while `adapterProfile` gives Mousecat a stable contract selector for render packets and state bindings.

*Origin:* Continuing the planned host-integration line after A11.6 showed that config-level adapter selection was the next smallest concrete host consumption step before building host-specific plugins or sidecars.

## DR-026 | 2026-07-09 03:56 UTC / 20:56 PDT | Checked-in configs present a safe adapter default

*Decision:* Mousecat checked-in CI and example configs present `adapterProfile: "generic-mcp"` as the safe default, while docs describe `hostProfile` as a freeform host/runtime label and `adapterProfile` as the source-owned adapter contract selector.

*Rationale:* A11.7 made adapter-profile selection executable, but examples and entry-point docs need to show the safe host-neutral selector explicitly. Keeping the default at `generic-mcp` avoids coupling public source to Codex, Claude, IDE, or private Neo-specific host assumptions.

*Origin:* The PR shape gate rejected the original combined A11.7 runtime/docs diff. The correct repair was to split the docs and checked-in config defaults into their own review unit instead of ratifying the larger span.

## DR-027 | 2026-07-09 04:02 UTC / 21:02 PDT | Host command packs are source-owned templates

*Decision:* Mousecat adapter packets include a `mousecat.host-command-pack/1` with source-owned MCP and CLI templates for binding, snapshot, recall, route preview, widget response, hold, queue enqueue, and credential-reference registration.

*Rationale:* Host adapters need concrete next calls after receiving a render or state binding packet. Encoding command templates in Mousecat lets hosts consume the same semantics without inventing parallel adapter instructions or bypassing permit and credential boundaries.

*Origin:* After A11.7 and A11.8 made adapter selection config-owned and documented, the next persistent-state roadmap step was concrete configured-adapter consumption without implementing host-specific plugins.

## DR-028 | 2026-07-09 04:10 UTC / 21:10 PDT | Human docs describe command packs as adapter contract

*Decision:* Mousecat README, architecture, core, governance, and roadmap docs name `mousecat.host-command-pack/1` as part of the source-owned host adapter contract alongside render packets, host-state adapters, and host-state bindings.

*Rationale:* A11.9 added command packs to the runtime packet surface. Human entry points need to explain that command packs are templates, not host plugin implementations, so hosts consume them without bypassing Mousecat-owned semantics, permits, route planning, or credential withholding.

*Origin:* A11.9 intentionally avoided widening the runtime PR with docs. A11.10 closes that docs currency gap as a separate small review unit.

## DR-029 | 2026-07-09 19:23 UTC / 12:23 PST | A11 closes at the host-adapter contract boundary

*Decision:* Mousecat closes A11 with the A11.11 state reconciliation after the connector, render-packet, durable-state, host-binding, adapter-selection, and command-pack contracts have landed. The first rendered graphical operator surface belongs to A12 and consumes those existing contracts.

*Rationale:* A11 is one coherent construction: it establishes how a host discovers, binds, recalls, routes, and acts on Mousecat state. Rendering that state as a visible interactive product changes the owned surface and its verification requirements, so it starts a new batch instead of extending A11 indefinitely.

*Origin:* The post-FIFO audit found that the runtime and documentation work had merged correctly while the active-state ledgers still named A11.9 and the deleted A11.10 branch. Closing that drift also made the already-planned graphical boundary explicit.

## DR-030 | 2026-07-09 19:52 UTC / 12:52 PST | A12 begins with a public CI preflight

*Decision:* A12.0 establishes the Open Ground GitLab gate before A12.1 ships the first graphical operator surface. The public lane mirrors Mousecat's repository-owned readiness checks and runs only on a dedicated Open Ground group runner selected by both `zero-local` and `open-ground` tags.

*Rationale:* The graphical surface changes Mousecat's user-visible product and needs a real public merge gate before it lands. Treating the gate as A12.0 keeps the graphical batch coherent while ensuring its remote verification is operational rather than merely configured.

*Origin:* The preserved Open Ground branch had reached real runner execution but failed because its slim Node image lacked `git`. Rebuilding that branch on canonical A11.11 exposed the correct order: synchronize the mirror, repair and prove CI, then build the graphical surface.

## DR-031 | 2026-07-09 21:05 UTC / 14:05 PDT | The operator boundary is a redacted command-pack host

*Decision:* Mousecat's operator surface runs on a loopback-only server over one long-lived runtime. Client reads are composed from redacted `mousecat.host-state`, `mousecat.status`, and `mousecat.visualize` records. Client writes name an operator-safe `mousecat.host-command-pack/1` command template, which the server materializes and delegates to the existing runtime. The host boundary excludes raw tool names, upstream invocation, credential registration, queue clearing, connector discovery, raw delegated results, and unredacted snapshots.

*Rationale:* A graphical host must make existing Mousecat work visible and executable without becoming a parallel policy or state engine. Source-owned command templates prevent action drift, while a public-redaction boundary lets topology, interaction, queue, route, connector, and event records reach the browser without exposing sensitive state or private upstream payloads.

*Origin:* A12 implementation and the recursive code-quality panel showed that direct tool allowlists, raw visualizer records, and partially redacted item spreads would violate the A11 presentation-only boundary. The corrected host consumes the canonical packets and fails closed around the smaller operator-safe command set before rendering begins.

## DR-032 | 2026-07-09 21:18 UTC / 14:18 PDT | The first graphical review unit is a live read model

*Decision:* A12.2 renders the canonical redacted operator snapshot and carries only presentation-local refresh, interaction selection, and FIFO filtering. Browser mutations remain a separate A12.3 review unit over the source-owned command pack.

*Rationale:* The graphical read model is independently useful and verifiable: it makes Mousecat's host, runtime, upstream topology, typed work, FIFO state, route posture, connectors, and activity visible without introducing a second state engine. Separating writes keeps each PR below the operator review boundary and gives the command path its own behavioral review.

*Origin:* The assembled A12 surface was functionally coherent but exceeded Mousecat's operator diff budget. Decomposing it by host, read model, and command-control ownership preserves the planned product while restoring strict FIFO reviewability.

## DR-033 | 2026-07-09 21:37 UTC / 14:37 PDT | Graphical controls are typed command-pack projections

*Decision:* The graphical workstation may execute only the operator-safe `respond`, `hold`, `queueAnswer`, `queueHold`, `queueRatify`, and `routePreview` command ids. Controls preserve each interaction or queue item's canonical shape and value types; the server resolves every id through the selected `mousecat.host-command-pack/1` before runtime delegation.

*Rationale:* A graphical client must make Mousecat executable without becoming a second tool router or state engine. Shape-aware controls retain contract meaning, while command-pack materialization keeps action ownership in the source catalog and leaves permit-gated invocation and credential mutation outside the browser.

*Origin:* A12.3 completed the command layer after the host and read model had independently merged and passed their remote gates. Browser validation proved the same canonical records can drive typed interaction, FIFO, ratification, and route-preview flows without raw tool calls.

## DR-034 | 2026-07-09 23:17 UTC / 16:17 PDT | Diagnostic contracts do not compose the operator surface

*Decision:* Runtime topology, route planning, connector and credential posture, and visualizer event traces remain public machine-readable Mousecat contracts but are not rendered in the graphical operator surface. The browser retains typed interaction and FIFO decision work while the surface converges on the summoned widget contract.

*Rationale:* Visibility into every runtime record turned the operator surface into a workstation rather than a focused judgment surface. Removing diagnostic lanes first is a coherent review unit: it preserves the diagnostic APIs and every decision workflow while reducing the visual product before the interaction and queue paths are unified.

*Origin:* The operator reasserted Mousecat's original purpose as a small MCP-mediated widget and explicitly rejected ratifying one oversized replacement. A12.4 begins the FIFO correction with the independently removable diagnostic composition.

## DR-035 | 2026-07-09 23:32 UTC / 16:32 PDT | The browser has one chronological interaction surface

*Decision:* The graphical operator selects the oldest open interaction, falling back to the oldest held interaction, and renders it directly. It does not expose an interaction picker, queue workbench, queue filters, queue dialogs, or queue ratification controls. Decision queues remain source-owned MCP and CLI contracts and may supply future interaction sequences without becoming a parallel browser surface.

*Rationale:* A separate picker and FIFO workbench required the operator to navigate Mousecat as an application. One chronological interaction surface establishes the sequencing behavior needed by Crucible and Mass Assault while retaining typed values and runtime ownership.

*Origin:* A12.4 removed diagnostics as the first independently reviewable reduction. A12.5 removes the second workstation composition before A12.6 binds the compact surface to a shared host runtime.

## DR-036 | 2026-07-10 00:12 UTC / 17:12 PST | MCP callers and graphical commands share one interaction runtime

*Decision:* The loopback operator process serves versioned Streamable HTTP MCP and graphical operator commands over one Mousecat runtime. MCP hosts may request and await interactions. Only the graphical command boundary may answer or hold, and every mutation must target the oldest open interaction and an exact prefix of its remaining items. Held work is terminal for the originating caller.

*Rationale:* Mousecat cannot normalize a harness decision loop if the host that asks and the browser that answers inhabit different state. Separating caller reads from operator writes also prevents a model from bypassing the operator surface or chronological sequence through its own MCP connection.

*Origin:* The first A12.6 aggregate proved the end-to-end loop but exceeded the repository review boundary at 2,821 changed lines. A12.6 retains the independently operable runtime construction; A12.7 owns compact widget promotion without a classifier exception.

## DR-037 | 2026-07-10 03:01 UTC / 20:01 PDT | The canonical graphical surface is a summoned widget

*Decision:* Mousecat renders one oldest-open item in a width-bounded widget with sequence progress, internal option scrolling, optional freeform context, Hold, and Return. `mousecat.operator-snapshot/2` carries only the state required for that surface.

*Rationale:* Mousecat extends host decision and tool boundaries; it is not a workstation. Minimal presentation keeps Crucible and Mass Assault visible without duplicating runtime diagnostics or queue navigation.

*Origin:* A12.4-A12.6 removed the old composition and established the shared loop. A12.7 makes the intended widget the canonical browser client.

## DR-038 | 2026-07-10 03:49 UTC / 20:49 PDT | Named skills enter through one normalized invocation adapter

*Decision:* Mousecat exposes `mousecat.skill` as the first-class Crucible and Mass Assault invocation contract above canonical `mousecat.widget` semantics. The caller supplies stable origin identity and already-mapped seams. Mousecat validates exact Crucible cardinality, complete multi-seam chronology, deterministic lineage, idempotent fingerprints, and an opaque caller-held continuation capability before returning typed results for recursion.

*Rationale:* Separate workflow tools would duplicate the same widget and return machinery, while raw widget payloads leave fresh hosts to reconstruct Mousecat's normalization rules. One semantic adapter gives every harness the same invocation grammar without turning Mousecat into the inference engine or adding another visual surface.

*Origin:* A13 fresh-host preparation and recursive architecture review converged on one adapter, then exposed silent chronology fallback, underspecified discovery, retry ambiguity, and interaction-id-only continuation as the material gaps to close before live Codex and Claude acceptance.

## DR-039 | 2026-07-10 05:37 UTC / 22:37 PDT | Held seams enter one capability-owned asynchronous lifecycle

*Decision:* Mousecat exposes `mousecat.delegation(start|await)` above the A14.0 custody kernel. A delegation begins from one server-resolved held `mousecat.skill` item and requires its originating capability, matching source identity, a tool-invocation permit, an enabled connector route, and a separate caller-held delegation capability. Raw payloads and results remain memory-only.

*Rationale:* Long Neo or external MCP work must not consume the originating host response window or block later operator decisions. One generic lifecycle lets any permitted capability run asynchronously while Mousecat owns custody, authorization, safe provenance, and explicit unknown-outcome retry posture rather than upstream semantics.

*Origin:* The first direct Neo topology call exceeded the synchronous connector window. The aggregate A14 implementation proved the lifecycle but the remote shape classifier required independent FIFO review units; A14.1 publishes only the operable start/await boundary.

## DR-040 | 2026-07-10 05:56 UTC / 22:56 PDT | Delegated results rejoin through the canonical widget

*Decision:* A completed delegation remains caller-capability owned until the caller maps its result into one seam. `mousecat.delegation(rejoin)` then requires an operator-interaction permit and creates or recovers one deterministic Crucible child in the existing widget with origin, delegation, and attempt lineage.

*Rationale:* Mousecat should expose the consequential decision produced by a council without publishing raw model output or creating a council dashboard. Reusing the canonical widget preserves one chronological operator surface while deterministic intent and inherited sensitivity keep recovery aligned with delegation custody.

*Origin:* A14.1 established non-blocking execution and caller-only result custody. A14.2 completes the loop from a held origin through Neo and back to the operator surface.

## DR-041 | 2026-07-10 16:56 UTC / 09:56 PDT | Cancellation acknowledgement requires a negotiated status extension

*Decision:* Mousecat requests cancellation with standard MCP `notifications/cancelled` in the original session and ignores any later response to the original tool call. Retry-safe cancellation is available only when the server negotiated `mousecat/cancellation-ack` during initialization and a separate `mousecat/cancellation/status` response exactly correlates the request with schema `mousecat.mcp.cancellation-ack/1`, `status=cancelled`, and `sideEffects=none`. Notification acceptance, local abort, disconnect, and grace expiry do not prove upstream termination.

*Rationale:* Standard MCP cancellation is a fire-and-forget notification, and a sender must ignore a later response to the cancelled request. HTTP transport success proves only that the notification reached the server boundary. Mousecat therefore recognizes retry-safe cancellation only through a separately negotiated, exactly correlated status response that guarantees `sideEffects=none`; otherwise it preserves unknown outcome and duplicate-risk acknowledgement.

*Origin:* The A14 live oversized council timed out locally while Neo retained provider work. Neo recursively classified the handshake as architectural and the grace interval as a continuum parameter.

## DR-042 | 2026-07-10 19:40 UTC / 12:40 PDT | Mousecat is a universal declarative translation plane

*Decision:* Mousecat owns one provider-neutral MCP, state, interaction, routing-receipt, and presentation-descriptor contract. Recursive Deliberation is one source-owned framework containing Crucible, Total Recall, and Mass Assault. Operator-permitted clients may register namespace-owned declarative operator-interaction frameworks and skills. The calling host model or configured upstream selects contextual handoffs; Neo is supported but is neither required nor the default presentation ontology.

*Rationale:* A central widget is universally useful only when OpenAI, Anthropic, Google, xAI, Ollama, IDE, CLI, and custom clients can project their own decision systems through shared semantics. Declarative registration preserves extensibility while source-id protection, revisions, prior-result capabilities, and separate tool-invocation permits preserve authority boundaries.

*Origin:* The operator clarified that seeing the Neo workflow is the immediate proof target, not the product boundary. The same control plane must expand host UI and workflow customizability across flagship and custom harnesses.

## DR-043 | 2026-07-10 20:19 UTC / 13:19 PDT | Compact and expanded Mousecat are one adaptive surface

*Decision:* Compact Mousecat renders the active chronological operator item. Expanding the same window reveals registered frameworks and skill grammar, cross-host sessions, recall seams, and sequence progress from the same redacted runtime snapshot. Expansion does not create a dashboard, alternate state engine, transcript view, or second command boundary.

*Rationale:* A fixed compact widget proves immediate cross-harness decisions, while an expandable window must earn its area by exposing framework and session context. One adaptive surface preserves Mousecat's widget identity and avoids the full-screen application drift the operator rejected.

*Origin:* Live use showed that the compact widget worked but a resizable empty shell contradicted the product boundary. The operator required expressive skill visualization and cross-session awareness without turning Mousecat into the place where all work occurs.

## DR-044 | 2026-07-10 20:28 UTC / 13:28 PDT | Mousecat runs as a current-user native service

*Decision:* Mousecat's shared loopback operator and MCP runtime may install at current-user login without administrator privileges. Windows uses a short LocalAppData launcher under the user Run key; Linux uses user systemd; macOS uses a LaunchAgent. Lifecycle status validates Mousecat identity and requested postconditions, and termination is delegated to the native manager or a verified Windows runner record.

*Rationale:* Every supported harness needs the same endpoint to exist before it can summon a decision. A per-user lifecycle removes the manual terminal dependency without turning Mousecat into a machine-wide daemon or binding it to one provider's process model.

*Origin:* The operator selected per-user login service lifecycle through Mousecat. Recursive service review then rejected long Windows Run commands, unmanaged Linux/macOS processes, unverified PID termination, and port-only health checks.

## DR-045 | 2026-07-10 20:42 UTC / 13:42 PDT | Host SDKs bind identity and preserve Mousecat capabilities

*Decision:* Mousecat publishes one dependency-free JavaScript SDK over its shared Streamable HTTP endpoint. A host adapter fixes provider-neutral host, session, and optional thread identity at construction, then exposes heartbeat, declarative framework registration, skill invocation, await, and contextual handoff. Handoff authority is derived only from a terminal Mousecat continuation receipt, and no dispatched tool call is automatically replayed.

*Rationale:* Declarative adapter packets tell a harness what Mousecat owns but still leave every author to rebuild session negotiation, JSON-RPC envelopes, error boundaries, identity custody, and continuation handling. A source-owned executable adapter removes that duplication without importing provider SDKs, choosing model behavior, answering operator decisions, or creating host-specific semantics.

*Origin:* A16 proved live registration and provider-neutral session presence through hand-authored MCP calls. A17 turns that proof into the universal harness-author boundary named in the roadmap.

The service remains one operator-local trust domain. Permit profile ids are policy selectors rather than credentials, and logical session ids are provenance rather than transport-ownership capabilities. Authenticated multi-tenant or mutually untrusted local access requires a separate ratified boundary.

## DR-046 | 2026-07-10 22:17 UTC / 15:17 PDT | Decision access is nonlinear and session-grouped

*Decision:* Mousecat exposes every open or deferred decision simultaneously. Compact width renders the selected active item; expanded width groups the complete actionable docket by host and session and permits direct navigation to any item. `defer` preserves the caller wait and item chronology, `respond` resolves only the targeted item, and `hold` records an intentional item hold. Chronology is immutable provenance and an optional ordering signal, never an eligibility gate. Batch construction consumes decision outcomes afterward and does not govern interaction order.

*Rationale:* Mousecat exists to exceed native harness question limits and let the operator move rapidly across concurrent Codex, Claude, Neo, and custom-host decisions. Requiring oldest-interaction or prefix order concealed relevant work, conflated unrelated sessions, and made expansion informationally empty.

*Origin:* Live operation of a twelve-item Mass Assault exposed that the A12 single-item constraint had incorrectly turned a compact rendering default into a runtime sequencing rule. The operator corrected the product model and distinguished GitOps FIFO from decision navigation.

## DR-047 | 2026-07-10 23:00 UTC / 16:00 PDT | Active documentation follows the nonlinear decision contract

*Decision:* Mousecat's active product, architecture, governance, roadmap, and session documents describe decision access according to DR-046: all actionable work is simultaneously visible, navigation is nonlinear, deferral remains pending, chronology is provenance, and batch composition occurs after decision outcomes exist. Append-only records retain earlier decisions as historical evidence and are superseded by later records where the product contract changed.

*Rationale:* Leaving FIFO interaction language in active documentation after the runtime correction would preserve the same category error as an implementation instruction. The current artifact set must present one coherent operating model while preserving the audit history that explains how it changed.

*Origin:* A18.3 corrected the runtime and graphical surface. A18.4 reconciles the active documentation to that accepted behavior and records the documentation rule required by both forge shape gates.

## DR-048 | 2026-07-10 22:44 UTC / 15:44 PDT | Nonlinear interaction language governs every active contract

*Decision:* Every active Mousecat artifact uses nonlinear interaction language for operator access, navigation, and response eligibility. Chronology remains valid for source seam intake, immutable lineage, optional sorting, and GitOps review ordering, but those uses do not define the graphical surface or constrain which actionable decision the operator may address.

*Rationale:* Correct runtime behavior is not enough when architecture, governance, roadmap, or participant-facing entry points still instruct implementers to reconstruct the superseded restriction. One vocabulary across active artifacts prevents lineage chronology from being mistaken for an interaction scheduler.

*Origin:* The A18.4 review unit corrected the primary product descriptions, but the A18.5 preflight found additional active chronological-surface, prefix-response, command-boundary, and milestone statements. A18.4.1 closes that documentation delta before runtime integration resumes.

## DR-049 | 2026-07-10 22:58 UTC / 15:58 PDT | Provider authority is enforced by the runner

*Decision:* The integration runner validates every payload against its declared capability schema, requires `confirm=true` for every non-read capability, rejects secret-shaped keys or values before command construction, and redacts secret-bearing successful output and failure messages. Adapter compilers may add provider-specific checks but cannot weaken these central boundaries.

*Rationale:* Provider manifests are executable authority contracts, not discovery hints. Relying on each adapter compiler to repeat confirmation, validation, and secret handling would let custom adapters advertise a safe contract while executing a weaker one.

*Origin:* Recursive review of the first runtime-composition draft reproduced unconfirmed custom writes, schema-invalid dispatch, secret-bearing arguments and results, and unnormalized runner rejection. A18.5 closes those High findings before any shared-runtime activation.

## DR-050 | 2026-07-10 23:06 UTC / 16:06 PDT | Provider discovery precedes execution activation

*Decision:* Integration-adapter manifests compose into Mousecat's catalog, upstream status, connector discovery, and route planning before capability execution is enabled. `mousecat.invoke` may return the source-owned tool manifest, but provider capability calls return a not-dispatched `integration-execution-unavailable` result. Asynchronous delegation rejects integration-adapter targets.

*Rationale:* Discovery and route composition prove registry identity, configuration posture, and capability selection without silently expanding every generic connector caller into a provider execution boundary. A separate execution unit can then activate only the intended `mousecat.invoke` path over the hardened A18.5 runner.

*Origin:* Recursive review of the aggregate composition draft found that adding `cli-json` to generic connector readiness also made provider calls reachable through delegation. A18.6 separates inspectable composition from authority-bearing execution.

## DR-051 | 2026-07-10 23:17 UTC / 16:17 PDT | Provider execution has one shared-runtime entrypoint

*Decision:* Recognized integration capabilities execute only through permit-gated `mousecat.invoke`. The active registry determines provider identity and capability authority, connector config supplies the pinned executable and host-managed environment, and the integration runner owns validation, confirmation, process execution, outcome classification, and redaction. `mousecat.delegation` remains unavailable for integration targets.

*Rationale:* One execution entrypoint keeps provider calls inside Mousecat's existing permit, route, event, and result contract while preventing generic connector consumers from inheriting a new authority-bearing transport. Separating discovery in A18.6 made this activation independently reviewable.

*Origin:* A18.5 hardened provider execution and A18.6 proved registry-owned discovery and route composition without dispatch. A18.7 joins those accepted boundaries and proves the path through the installed shared service.

## DR-052 | 2026-07-10 23:36 UTC / 16:36 PDT | Host conformance is one executable lifecycle

*Decision:* Mousecat publishes one host-neutral conformance function and packaged shell runner that initialize the SDK transport, verify runtime health and bound host identity, complete an operator-owned Crucible round trip, inspect contextual continuation, optionally prove configured-provider discovery and read execution, and close the host session. The report distinguishes checked from skipped conditional requirements and excludes operator response values and capability tokens.

*Rationale:* Individual SDK and runtime tests prove components but do not give harness authors one repeatable acceptance path through the actual Mousecat decision medium. A single lifecycle demonstrates interoperability without embedding provider SDKs, reconstructing host-specific UI, simulating the operator, or treating an absent provider as a passed integration check.

*Origin:* A17 shipped executable host adapters, A18.3 established nonlinear operator ownership, and A18.7 activated the permit-gated provider path. A18.8 composes those accepted contracts into the milestone's reference-host proof.

## DR-053 | 2026-07-14 07:54 UTC / 00:54 PST | The graphical operator is one responsive decision wall

*Decision:* Mousecat renders every item in each pending interaction inside one scrollable decision wall at every viewport. Cards group only by explicit source lineage, with an interaction-local fallback when no parent lineage exists. Search, a semantic section outline, and on-demand framework and session context preserve orientation. The operator may prepare any actionable subset and return one validated response set per interaction through the existing `respond` boundary; individual `hold` and `defer` commands remain available. The browser continues to read the redacted snapshot and may issue only `respond`, `hold`, or `defer`.

This decision supersedes DR-043's compact-versus-expanded content split and DR-046's compact-selected-item/expanded-docket presentation clauses only. DR-046's nonlinear eligibility, deferred-state, and chronology-as-provenance rules remain authoritative, and Mousecat retains one widget, one runtime, and one command boundary.

*Rationale:* A selected-card editor beside a second navigation list made simultaneous access technically possible but kept actual deliberation behind a one-card bottleneck. The runtime snapshot and typed response contract already carry the complete work and arbitrary item identity, so the proportional correction belongs in presentation and interaction continuity rather than a new topology, state engine, or authority surface.

*Origin:* The operator requested a full-pane, scrollable wall of decisions that reflects Mousecat's real recursive-deliberation role while holding the implementation to the accepted VALIS Canvas specification standard.

## DR-054 | 2026-07-14 09:10 UTC / 02:10 PDT | Mass Assault is a descriptive decision instrument

*Decision:* Mousecat's Mass Assault grammar renders one lineage-derived decision atlas over the complete wall. Atlas families and ordinals come only from explicit source lineage. Cards expose source-owned recommendation metadata and literal evidence and thread provenance. Edits remain local drafts with ready or incomplete validation; prepared sets enter a modal review showing answer, amendment, family, evidence, and originating interaction before size-bounded per-interaction requests cross the existing `respond` boundary. Earlier successful bounded requests remain committed if a later request fails.

Mousecat does not infer pins, importance, relationships, truth, health, or topology from presentation.

*Rationale:* Simultaneous cards removed the single-card bottleneck but did not give 125 decisions an inspectable state map or a trustworthy pre-return workflow. Existing snapshot, lineage, validation, and presentation descriptors already carry the required meaning.

*Origin:* The operator requested that the wall become more visually descriptive and interactively important while retaining Mousecat's established ontology and authority boundary.

## DR-055 | 2026-07-16 22:13 UTC / 15:13 PST | The playable world is a native Unreal runtime

*Decision:* Mousecat's playable mutable world lives in the same Mousecat repository as the native Unreal Engine 5.8 application at `apps/mousecat-world`. The browser walkable-world lab remains a compiler, reference, and evidence surface; it is not the production renderer and is not embedded through a WebView. The native runtime consumes deterministic exported world data, and every `sampled-source` manifest must pass its sibling receipt's filename, byte-count, SHA-256, world, region, and semantic-hash bindings before geometry is promoted.

World One graphical parity is earned only as native systems consume its map semantics, traversal, portals, parcels, interiors, structures, and mutable simulation contracts. Terrain, hydrology, groves, collision streaming, operator movement, camera, and receipt-verified ingestion constitute the first native foundation rather than a claim that those later systems already exist.

*Rationale:* The detailed browser scene exceeded the interactive envelope of the WebGL laboratory. A native renderer supplies the streaming, physics, asset, profiling, and graphical headroom the world requires while preserving the proven compilers and source geography instead of porting the browser scene graph or its prototype artifacts.

*Origin:* The operator directed Mousecat to stop visualizing the increasingly detailed world in the browser and give it its own UE5 application.

## DR-056 | 2026-07-16 23:38 UTC / 16:38 PST | Source maps are native spatial-construction authority

*Decision:* Receipt-verified source maps drive native physical and decorative realization through their decoded semantic grids, traversal grids, coordinate transform, parcels, and portal records. Terrain and mapped surfaces share one two-metre horizontal lattice and snapped rendered height. Overlap priority resolves per emitted subcell rather than deleting an entire source cell; exterior door and building anchors remain eligible when an included higher-priority interior occupies their ground layer.

Only paired warp endpoints with both maps present become active runtime portals. Walk boundaries remain continuous space, and external endpoints remain inactive source records until their destination maps are included. Portal selection is qualified by active map context, and destination collision is ready before teleport.

*Rationale:* The source maps already encode the meaningful placement and relationships of towns, routes, forests, structures, interiors, and transitions. Treating them as construction authority preserves that geography while allowing the native world to increase scale, detail, mutability, and graphical quality without reproducing handheld tile restrictions or inventing unrelated layout.

*Origin:* A19.0 established the native renderer but deliberately withheld detailed map geometry. A19.1 decodes and realizes that deferred authority, then closes review findings around whole-cell overlap loss, terrain-lattice drift, portal ambiguity, destination collision, and opaque mapped water.

## DR-057 | 2026-08-16 02:54 UTC / 19:54 PST | Mousecat includes a general project workbench

*Decision:* Mousecat includes a project-workbench capability through which an
AI host and operator can inspect, find, compose, represent, stage, and apply a
target project's meaningful state without depending on that product's normal UI
or runtime. Project adapters preserve the target project's own schemas,
generation rules, source authorities, validation, and write boundary. Mousecat
owns the cross-host session, source vector, operation effect, permit,
representation, draft continuity, and linked receipt.

Development representations may combine direct source facts, deterministic
project projections, derived summaries, illustrations, and unresolved state,
but each layer must identify its own evidence class. Conversation remains the
primary authoring surface; visual, spatial, causal, tabular, executable, or
playable representations appear when the subject requires them rather than as
one permanent development dashboard.

Colonist Awareness world and colony authoring is the first proving adapter. It
does not become Mousecat's generic ontology.

*Rationale:* The CA offline creator showed that an agent can work much faster
and expose missing product behavior by operating against the authoritative
model directly, but a tile inventory still forced the operator to mentally
reconstruct the place. Generalizing the whole loop--not merely the renderer--gives
Mousecat a coherent role in development: make the actual system inspectable and
authorable while preserving truth, authority, and receipts.

*Origin:* The operator directed that the CA backend creator and its vivid,
multi-scale representation become a Mousecat feature and be expanded to orient
Mousecat's broader role in aiding development.

## DR-058 | 2026-09-22 04:38 UTC / 21:38 PDT | ML rulings carry source-owned narrative context

*Decision:* A Mousecat decision item may carry one bounded `mousecat.ml-review/1` record containing the human situation, system role, ordered causal path, player-visible impact, decision precedent, literal input, proposed learning, approval effects, remaining exclusions, and evidence. Mousecat displays the narrative and path before artifact detail in the open decision card and prepared-return review, searches the complete record, binds it into normalized skill invocation identity, and withholds it whenever the item is sensitive.

The originating system owns every substantive claim in the review. It must identify a consequential policy or behavior the operator's answer governs; mechanical evidence without such a precedent does not become an operator decision. Mousecat does not infer the learned statement, translate confidence into fact, expand approval effects, or remove exclusions. An ML ruling without enough narrative and concrete context remains unpresentable.

*Rationale:* A technically exact candidate hash, repository standing and field comparison still did not explain the candidate's causal role in the ML system, eventual effect in play, or precedent established by approval. Requiring the operator to reconstruct that story outside the decision surface defeats Mousecat's purpose and can turn a mechanical receipt into a false design decision.

*Origin:* The operator rejected two Speakeasy knowledge-admission presentations: the first hid the input, and the second exposed the record without explaining its causal role or showing that no operator-owned decision existed.

## DR-059 | 2026-09-23 07:13 UTC / 00:13 PDT | Source-linked history and reusable methods

*Decision:* Mousecat maintains a persistent cabinet of retained interactions
and explicitly indexed project sources. Records carry stable identities,
revisions, original context and responses, named source-backed relationships
and backlinks. Search and navigation preserve the distinction between source
facts, operator answers and host-authored proposed or reported records.
Reusable methods carry purpose, applicability, procedure, known failures and
supporting evidence. Missing or ambiguous references remain inspectable gaps.

*Rationale:* An operator must be able to follow a proposed plan back through
the decisions, evidence and history that explain it, then return to the current
review without reconstructing that context or losing a draft.

*Origin:* The operator requested a navigable web of decisions and history and
a deep cabinet of method. The linked-history Field Test was approved with
"Let's try it." The independent pending implementation plan remains unanswered.

## A19.5 - Shared platform authority and compositional review

*Timestamp:* 2026-09-23 20:39 UTC / 13:39 PDT

The operator explicitly authorized improving Mousecat's shared platform and
clarified that ordinary use, skill invocation or project association does not
authorize platform source changes. Hosts provide meaning, source material and
typed choices; Mousecat owns shared presentation and navigation. Consumer-specific
work uses declared data and adapters.

The operator's diagnosis concerns information hierarchy and composition around
the judgment being made. The operator rejected the assistant's narrower account
that explanations before controls were an experienced problem. The revised
layout is an implementation for review, not a ratified solution inferred from
automated or browser checks. Existing questions and answers retain their standing.

## A19.6 - Personal workspace with desktop and browser access

*Origin:* The operator requested a normal desktop application with durable
unanswered questions, then clarified that desktop and browser should both remain
possible. Mousecat is its own established project serving personal agent-assisted
workflows; its foundation must not be inferred backwards from SAO, ZAO, Speakeasy
or another consumer's immediate needs.

Mousecat owns shared questions, plans, typed responses, revisions and linked
history. Each operator can connect their own agents and project contexts through
the established generic contracts. Agents own interpretation and subsequent
actions. Their presence does not determine whether saved ordinary questions are
available to the operator. Desktop and browser access the same local service and
state. Native visualization and project-world work remain independently owned
capabilities outside this implementation.

This request authorizes the desktop and restoration work. It does not answer the
four standing behavioral comparisons or approve their candidates. Implementation
verification and human judgments retain distinct standing.

## A19.7 - Operator-controlled shared appearance

The operator explicitly requested transferring OTL color-scheme rules into
Mousecat with settings suitable for sustained data evaluation. Mousecat owns
shared Manuscript, B&W and Light palettes. Manuscript is the warm dark default;
B&W is achromatic; Light remains selectable. The choice belongs to the client
profile and applies across projects and skills. This platform request supplies
no response to the standing ML judgments.

### A19.7 continuation - Concurrent work

The operator clarified that development should continue while they use the
computer. Avoid desktop activation, tab switching and input interference; use
background source, build and test operations. This clarification supplies no
answer to pending questions and no acceptance of the broader UI composition.

## A19.8 - Shared visual scenario review

The operator requested simulation previews through Mousecat, with scenario and
teaching data supplied by Speakeasy, and explicitly answered yes to extending
Mousecat with a shared map-and-timeline renderer. Mousecat owns the generic
presentation primitive in its existing ML review surface. The caller owns
scenario facts, teaching targets and dataset admission. This implementation
authorization grants no scenario judgment or training-data ratification.

## A19.9 - Adjustable multi-view simulation observation

The operator requested a multi-feed native simulation view with lower latency
and automatic replacement of completed sessions, then specified equally sized,
adjustable and individually toggleable screens with minimal data overlays and
controls for aspects of an observed person's perceptual state. Mousecat owns the
shared presentation and validates the bounded view contract. The simulation and
Speakeasy bridge own pixels, people, source timestamps and reported state.

Retained screens are historical renderer outputs with explicit ages, not claims
of simultaneous viewpoints. A state projection can appear only on pixels
captured at or after that source sample. Client visibility, size and overlay
choices do not mutate the simulation. This implementation authorization grants
no behavioral verdict, dataset admission or teaching label.

## A19.9.1 - The observatory yields space to observation

*Timestamp:* 2026-09-27 19:41 UTC / 12:41 PDT

The operator explicitly required non-occlusive screen information, a toggleable
right-side inspector, richer use of available information space, controls that
do not expire prematurely, and timing that stops when a run ends. Perceptual
telemetry therefore sits outside the pixels. The inspector is optional and its
width returns to the screen grid. Frame freshness may warn before command
liveness closes; a deliberate pause always retains its resume command. Ended
sessions preserve final relative timing and stop their age interval. These are
shared Mousecat presentation and command-liveness rules and create no simulation
judgment or dataset admission.

## A19.9.2 - Screen information is one adjustable visual layer

*Timestamp:* 2026-09-27 20:07 UTC / 13:07 PDT

The operator clarified that opacity applied to the information within each
screen and that moving the same raw output did not improve it. Each image
therefore owns one continuous-alpha information layer. Opacity ranges from zero
to full visibility and persists independently from the data-group selection.
The selected-person inspector presents source facts according to their meaning:
identity and immediate state first, bounded sections and provenance next, and
the competing cognition model as deeper inspection. This presentation decision
does not reinterpret simulation evidence or admit a training rule.

## A20 - Study duration and continuation remain producer-owned lifecycle state

*Timestamp:* 2026-09-28 07:02 UTC / 00:02 PST

Mousecat may display and forward bounded study-session operations only when the
registered producer supplies exact current lifecycle state. A running session
may checkpoint; a normally saved session may continue; settings may change the
next finite attempt. The producer owns process launch, save validation, reload,
automatic continuation and successor publication.

The primary valid action stays visible. Duration and automatic continuation use
progressive disclosure. No lifecycle action carries paths, executables, native
simulation verbs, scenario verdicts or dataset admission.

## [A21] - Public preparation preserves human review and private provenance

*Timestamp:* 2026-09-29 22:19 UTC / 15:19 PDT

The operator requested improved Mousecat fixtures, clickthroughs and outlines,
current-project quality, private-material removal and correct licensing before
making the repository public again. Review needs durable visibility even before
an answer draft exists. This authorization covers shared operator presentation,
synthetic examples, release checks and privacy cleanup; the operator retains the
visibility decision. Routine implementation is not an additional human-review gate.

PolyForm Perimeter 1.0.0 remains the ratified license. Third-party notices travel
with redistributed code. Public demonstration uses synthetic inputs and isolated
state. Private source dossiers and raw operator records stay outside the public
tree; original provenance remains private rather than being treated as public
fixtures. Historical PR refs must be addressed before the existing repo changes
visibility. No model evaluation, dataset admission or npm publication is inferred.

## [A22] - Native camera targeting follows advertised regional identity

*Timestamp:* 2026-09-30 06:01 UTC / 23:01 PDT

The operator requested adjustable simultaneous camera views, local activity
observation and useful focus tools. Each native region carries its declared
source identity through its bounded camera request. The viewer validates the
advertised target and routes the existing camera verbs; the native producer
owns movement, residency and observation. Global time and session lifecycle
retain their shared-world scope. Existing single-view feeds remain compatible.

## [A22.1] - Native feed presentation preserves outcome and measurement authority

*Timestamp:* 2026-09-30 07:55 UTC / 00:55 PDT

The operator requested accurate ended-session controls and simulation state.
An ended feed is presented as ended; completion remains a producer-owned outcome.
The observed inspection world clock, final-frame summary and validated study
duration retain their separate meanings. Failed/incomplete status and review
eligibility remain source facts. This correction uses the existing bounded
contract and changes only presentation.
Image delivery counts successful accepted identities from primary and regional
views. Duplicate display of one image and unchanged presentation rerenders do
not inflate the rate. The aggregate images/s label retains its transport meaning.

## [A23] - Detached feeds retain one observation and control owner

*Timestamp:* 2026-09-30 10:04 UTC / 03:04 PDT

The operator requested a movable desktop feed window with redock and contextual
tools. A detached feed is a presentation of the existing live tile. Its source
identity, polling, image acceptance and commands stay with the originating view.
Window close and Redock restore that tile; source-session replacement retires
its window. The native host admits only exact, user-initiated owned-origin feed
requests, using the existing WebView2 environment/profile. The shared runtime
and persistent review/configuration authority remain unchanged. This requested
host/frontend/test/documentation slice is one reviewed A23 batch.

## [A23.1] - Canonical workspace identity and one native popup completion

*Timestamp:* 2026-09-30 10:56 UTC / 03:56 PDT

The installed desktop compares fully qualified normalized Windows paths against
the owned service record. Equivalent separators retain the same location;
foreign roots and persistence paths retain refusal. Each native popup request
completes its deferral once through Dispose. These corrections preserve the
existing feed-window contract and persistent runtime authority.

## [A23.2] - Simultaneous cameras retain stable and truthful presentation

*Timestamp:* 2026-10-02 21:43 UTC / 14:43 PDT

The operator approved the identified simulation legibility and function repairs.
Regional camera identity determines tile continuity; incoming report order does
not assign temporal rank to simultaneous views. Source labels identify each
region and observed subject, and shared controls identify their selected camera.
Image decoding owns the presentation handoff: the displayed frame retains its
person labels, timestamp and overlay until the replacement image is available.
Delivery failure remains visible while the previous frame stays inspectable.
These repairs use the existing viewer and command contracts; simulation state
and session lifecycle remain producer-owned.

## [A23.3] - Source readiness determines live polling

*Timestamp:* 2026-10-02 22:44 UTC / 15:44 PST

The operator requests removal of artificial simulation frame ceilings. The viewer
retains one sequential poller and yields without an added active-feed delay.
Source and decoder readiness determine cadence; failed and ended feeds retain
backoff. No timing setting changes simulation authority or promises delivery FPS.

## DR-060 | 2026-10-03 03:29 UTC / 20:29 PST | Independent subject Windows

The operator selected persistent subjects, strategy-style browsing and resizable
Window views. Each Window adopts the original feed DOM, shares the source command
owner, and carries its own camera tools plus simulation playback controls. View
shape and Fit/Fill presentation remain shared preferences. Current source camera
controls keep their acquisition clock separately from pictured projection metadata.

## DR-061 | 2026-10-03 04:02 UTC / 21:02 PST | Source-bound video and graph facts

The operator selected actual continuous native video and a normalized ancillary
observation map/graph. Optional typed source receipts preserve the actual captured
frame clock, camera epoch and graph provenance. Initialization and fragments are
verified before delivery under the registered source binding. Unknowns, private
claims and predicted effects retain their attribution; receipt references govern
selected actions and reported results. Simulation commands retain their owner.

## DR-062 | 2026-10-03 04:36 UTC / 21:36 PST | Complete-frame Windows and retained navigation

The operator selected Window fit to frame, neater command arrows and useful
navigation after simulation end or subject disappearance, then clarified
progressive disclosure in the same view. Window starts with complete native-frame
Fit and independent settings. Compact Tools reveals navigation, playback,
settings and details over the image without resizing it. One source-bound decoder
and existing command owner supply its pixels and live controls. Ended or
disconnected arrows, wheel, drag and Fit inspect retained pixels locally. A
missing subject does not remove a live source site's browsing capability.
