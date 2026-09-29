| Document | Mousecat Architecture |
|---|---|
| Version | 1.7.1.0-alpha |
| Timestamp | 2026-09-29 22:19 UTC |
| Status | ACTIVE - system architecture. |

# Mousecat Architecture

Mousecat is a single Node.js package with headless stdio MCP compatibility and one loopback runtime shared by Streamable HTTP MCP callers and graphical operator commands. The package also carries a CLI, source-owned catalogs, external MCP connectors, API and CLI integration adapters, project-workbench contracts, adapter packets, diagnostic records, and optional ignored local state. Its native Unreal client consumes receipt-bound project-world data without becoming a second source of truth.

## Native observation and recorded scene data

`src/core/scene-preview.mjs` validates the optional `scenePreview` field inside
`mousecat.ml-review/1`. Its public JSON schema bounds coordinates, locations,
actors, chronological frames, personal information and communication references.
Every frame accounts for each person; the last frame is the declared decision.
The packet carries caller-owned provenance and uses schematic coordinates.
Unknown fields and dangling references refuse at intake.

Recorded scene packets remain readable through the existing review data. The
schematic graph renderer is retired. Review fingerprinting, sensitive redaction,
persistence and response authority remain with the ML review and interaction owners.

`src/core/native-view.mjs` binds registered local producer directories to the
shared loopback server. Ignored configuration supplies a nativeViews registryPath;
that registry declares each view's id, label, projectRef, directory and expected
sessionId. Browser projections contain opaque binding identities and source
observations. Filesystem paths remain on the server.

`src/operator/public/native-view.js` displays verified native PNG frames and cached
person sections/events through the installed Desktop's Simulation route. One
equal-panel observatory combines the current frame with bounded retained
activity views. The operator adjusts their shared size, hides or restores each
screen, collapses the person inspector, and independently toggles Activity,
Attention, Memory and Needs telemetry. Telemetry is an alpha-adjustable layer
within its source image; zero opacity removes the complete layer and group
selection remains independent. Its data stays bound to the source sample
timestamp preserved with that frame. The inspector projects summary lines,
bounded section rows, provenance, events and cognition into distinct visual
structures without changing their source authority. These presentation choices
do not publish simulation commands.

The native view preserves frame identity, independent inspection age, source
camera state and explicit command outcomes. Delayed running frames retain a
bounded command interval, and a deliberate pause retains its resume path. The
source-owned command pack supports bounded camera, time, selection, advertised
panel and cognition requests. Optional durable study state adds checkpoint,
configuration and saved-session continuation. Ended views remain write-closed
except for source-advertised configuration or continuation. Same-origin requests
become immutable consecutive command files; publication and source application
are separate acknowledgements.

## Flow

Appearance is a client-owned preference. `src/operator/public/appearance.js`
loads the saved scheme before styles render, validates the three supported values
and manages Settings. `src/operator/public/appearance.css` defines shared semantic palettes over the
operator and history styles. Manuscript is the default; B&W remains achromatic;
Light retains pale surfaces. The local profile stores `mousecat.appearance.v1`.
Same-origin tabs follow preference changes. The desktop reads the bounded theme
name to match its native frame; appearance never mutates runtime decisions.


The Windows desktop client at `apps/mousecat-desktop` embeds the shared operator
surface in WebView2 and connects to the same loopback runtime as the browser.
Its per-user launcher starts that service when absent and focuses an existing
client window on repeat launch. Window closure does not stop the service.
Restoration returns ordinary pending questions directly to the actionable map;
terminal and redacted-only records remain in history. Responding while a host is
disconnected preserves the original result and continuation capability for its
later return. Presentation adds no authority to answer or interpret a response.

```text
Codex / Claude Code / Neo / another MCP host
                    |
             Streamable HTTP MCP
                    v
       Mousecat shared loopback runtime
       skill intake -> canonical widget
          |                    |
  graphical operator           | permitted connector calls
          |                    v
  operator response       Neo / private MCPs / APIs
          |
          +------ structured result ------> originating host
```

## Public Tool Namespace

| Tool | Contract |
|---|---|
| `mousecat.history` | Query durable source-linked records and exact revisions; index declared project documents; register proposed methods and reported results with provenance. |
| `mousecat.projects` | Registers and inspects source-owned project surfaces and retained threads. |
| `mousecat.workbench` | Inspects and operates project adapters under declared effect and permit contracts. |
| `mousecat.widget` | Requests, awaits, answers, holds, and snapshots Mousecat-owned operator interactions. MCP transports expose ask and await; browser commands own answer and hold. |
| `mousecat.skill` | Invokes built-in or registered operator-interaction skills and returns typed responses with source lineage and contextual continuation obligations. |
| `mousecat.registry` | Lists or registers permit-gated, namespace-owned declarative skill-framework and presentation descriptors. |
| `mousecat.delegation` | Starts and awaits permitted asynchronous upstream work from one capability-owned held skill seam, then rejoins caller-interpreted output through the existing widget. |
| `mousecat.ask` | Returns a structured interaction session with atomic items, lineage, and button sets for host rendering. |
| `mousecat.session` | Starts, snapshots, and reconstructs working-session state. |
| `mousecat.queue` | Enqueues, lists, answers, holds, and ratifies decision chains. |
| `mousecat.visualize` | Returns buttons, interactions, queue, permit, route, boundary, public events, and live graph snapshots. |
| `mousecat.host-state` | Returns a selected host profile's state adapter, render packet, host command pack, redacted records, sync triggers, and binding commands. |
| `mousecat.route` | Resolves an upstream route plan without executing it. |
| `mousecat.bridge` | Reads a public upstream bridge contract and returns a sanitized compatibility summary. |
| `mousecat.invoke` | Guards upstream invocation behind permit, route, connector, and adapter checks. |
| `mousecat.status` | Reports runtime health and configured upstream posture. |
| `mousecat.credentials` | Stores credential references only, never secret values. |

## Source Layout

The history controller owns local revisioned records, an alias index, explicit
relationships and source coverage. Interaction ingestion preserves public,
redacted question items, original choices and responses. Source indexing is
restricted to exact files declared by registered project surfaces, within their
resolved roots and size limits. Markdown sections retain source-line locations
and pinned parent/child revisions; verified content hashes resolve evidence
without manufacturing relationships from textual similarity.

The browser reads history through GET /api/history. Hash routes address records,
revisions and search filters; the history reader preserves in-session reading
position and leaves the existing review draft model in place. The existing
command boundary exclusively owns operator responses. Host registration requires
provenance, accepts proposed/reported standing, and cannot mint an operator ruling.
Sensitive records and secret-bearing fields are redacted before persistence.

| Path | Responsibility |
|---|---|
| `src/core/catalog.mjs` | Atomic skills, skill frameworks, work permits, upstreams, tool boundaries, host adapter profiles, host-state adapters, host command packs, render packets, tool descriptors. |
| `src/core/skill-invocation.mjs` | Crucible and Mass Assault intake normalization, deterministic seam identity, chronology, lineage, transcript rejection, idempotency fingerprints, and caller-return envelopes. |
| `src/core/ml-review.mjs` | Versioned ML review validation for situation, system role, causal path, player impact, decision precedent, literal input, proposed learning, effects, exclusions, and evidence. |
| `src/core/framework-registry.mjs` | Source and custom framework resolution, compatibility matching, descriptor ownership, revision checks, and safe presentation normalization. |
| `src/core/delegation.mjs` | Held-origin validation, delegation fingerprints, secret and transcript rejection, public summaries, and capability-bearing continuation envelopes. |
| `src/core/bridge-contracts.mjs` | Public bridge-contract ingestion and OSS-safe summaries. |
| `src/core/integration-contracts.mjs` | Provider-neutral adapter definitions, immutable manifests, registry projection, and MCP-style capability descriptors. |
| `src/core/integration-adapters.mjs` | Source-owned provider capability maps and literal command compilation; currently includes GitLab API v4 over `glab`. |
| `src/core/integration-runner.mjs` | Schema and confirmation enforcement, executable pinning, environment allowlisting, process bounds, outcome classification, and secret redaction. |
| `src/core/project-workbench.mjs` | Project-adapter, workbench-session, and development-representation validation; effect, evidence-class, source-vector, and write-authorization boundaries. |
| `src/core/connectors.mjs` | External MCP and integration-adapter summaries, route plans, capability discovery, resource reads, and permitted forwarding. |
| `src/core/mcp-client.mjs` | Minimal JSON-RPC stdio and Streamable HTTP MCP client used by external connectors. |
| `src/core/config.mjs` | Default config and optional local config loading. |
| `src/core/local-state.mjs` | Optional ignored local JSON persistence for sessions, queues, route plans, public events, and credential references. |
| `src/core/runtime.mjs` | Tool handlers, events, queues, credential references, permits, and local-state handoff. |
| `src/mcp/server.mjs` | JSON-RPC MCP request handler and initialized, cancellation-aware headless stdio compatibility server. |
| `src/operator/server.mjs` | Loopback-only shared runtime, Streamable HTTP MCP sessions, redacted snapshot composer, operator command dispatcher, demo seed, and self-test. |
| `src/operator/public/` | Responsive decision wall: every actionable item, lineage-derived decision atlas, descriptive provenance, validated local drafts, pre-return review, and the operator-safe command projection. |
| `src/service/user-service.mjs` | Plans and manages per-user login registration, native manager lifecycle, health identity, and postconditions. |
| `src/service/runner.mjs` | Runs the shared loopback operator/MCP process and records its bounded process identity. |
| `src/sdk/` | Dependency-free Streamable HTTP client, provider reference descriptors, fixed host-session bindings, and contextual continuation helpers for harness authors. |
| `src/cli.mjs` | CLI commands and MCP server entry point. |
| `test/` | Node test coverage for catalogs, runtime behavior, and MCP request handling. |

## Compatibility Model

Mousecat does not import upstream private runtimes. It records upstream descriptors and resolves route plans. Live invocation remains blocked unless a work permit, enabled upstream, and configured external connector all allow the action.

Integration adapters use `cli-json` as a distinct connector transport. The active registry owns provider identity and capabilities; connector config cannot reclassify an integration upstream as generic MCP. `mousecat.invoke` is the only shared-runtime execution entrypoint, requires a tool-invocation permit, validates the selected manifest capability, and delegates process execution to the hardened integration runner. `mousecat.delegation` does not accept integration-adapter targets.

Neo compatibility enters as an MCP bridge, not as embedded private source. The open repository ships a generic external-MCP connector for stdio and Streamable HTTP MCP endpoints. A local ignored `mousecat.config.json` can point `connectors.neo` at a private Neo MCP endpoint with credential values supplied by environment references. Mousecat then calls `tools/list` and `resources/list` for dynamic discovery, reads public bridge contracts through `resources/read`, and forwards permitted `tools/call` requests without committing Neo's tool catalog, schemas, prompts, governance internals, local paths, runtime traces, or model/provider maps.

The public Neo bridge resource is `mousecat_bridge_contract_v1`. Mousecat summarizes it as `mousecat.bridge.summary/1`: schema and version names, server method names, stale-runtime code, counts, public tool/resource/prompt names, skill buttons/routes, exported labels, withheld labels, and policy strings. Raw private handlers, local source paths, credentials, operator memory, runtime payloads, traces, and unregistered skills are outside the summary contract.

## Interaction And Visualization Contract

Operator interaction sessions use public Mousecat shapes: `decision`, `parameter`, `ratification`, `queue`, `review`, `freeform`, `ranking`, and `checklist`. Stable interaction ids support bounded ask and resumable await calls. Mousecat accepts arbitrary ordered item and option counts, permits any open or deferred item to be answered independently, and resolves waiters only when every actionable item reaches a terminal answered or held state.

An interaction item may carry `mousecat.ml-review/1` when an ML ruling cannot be understood from an abstract proposition alone. The source supplies the human situation, system role, ordered causal path, player-visible impact, decision precedent, literal input, proposed learning, approval effects, remaining exclusions, and evidence as bounded text. Mousecat validates and renders that record in the decision card and prepared-return review, includes it in skill invocation identity, and redacts it with a sensitive item. Mousecat does not derive, summarize, or upgrade any of those claims.

## Project Workbench Contract Foundation

`src/core/project-workbench.mjs` defines the first executable boundary for the
Mousecat Project Workbench. A project adapter retains the target project's own
schemas while declaring source authorities, connector identity, supported
operations, effect classes, permits, and project-side write authorization.
Workbench sessions bind one development inquiry to a source vector and adapter.
Development representations contain one or more views whose layers independently
declare `source-fact`, `deterministic-projection`, `derived-summary`,
`illustration`, or `unknown` evidence.

The contract validators reject executable or secret-bearing descriptor fields,
write effects without project authorization, project mismatches, unbound operations,
and projected layers without a named producer and revision.
`src/core/project-workbench-runtime.mjs` connects registered adapters to bounded
`mousecat.workbench` open, snapshot, operate and close paths. Operations carry
source vectors and receipts; drift marks a representation stale. Stage-write and
source-write effects remain closed. Fixture execution proves the shared runtime
path; a target project's live acceptance remains independent evidence.

Conversation remains the control plane. Host-native artifacts and the native
Mousecat world are clients of the same semantic representation; neither may
upgrade an illustration into project truth or turn a draft into applied state.
The existing browser operator remains the decision and diagnostic surface, not
a universal development dashboard.

## Skill Invocation Contract

`mousecat.skill-invocation.contract/2` defines one extensible adapter above `mousecat.widget`. Recursive Deliberation contains Crucible, Total Recall, and Mass Assault. Total Recall is read-shaped; Crucible requires one seam; Mass Assault accepts chronological mapped sets. Runtime-registered operator-interaction skills declare single-seam or mapped-seams intake. Raw transcript and message arrays remain rejected.

Mousecat creates deterministic seam ids, uses complete unique seam timestamps first, complete unique integer ordinal sets second, and accepts input order only for one seam. Each terminal `mousecat.skill-invocation/2` response names its framework, previous skill, available compatible skills, and a null fixed next skill. Handoff requires the prior terminal result reference and opaque routing capability, then records the selected router and reason. A skill in more than one compatible framework requires an explicit framework reference.

`mousecat.framework-registry/1` combines source-owned and runtime descriptors. Registration requires an operator-interaction permit, namespace ownership, and a monotonically advancing revision; identical retries are idempotent. Persisted malformed descriptors are quarantined from snapshots. Presentation fields are bounded data with generic fallbacks, never executable code. Registered descriptors create mapped operator interactions; external MCP or API execution stays behind `mousecat.invoke` and its separate tool-invocation permit.

The MCP descriptor uses a flat top-level object because supported host schema subsets differ. Nested source, session, seam, and option records remain typed in discovery; action-specific required fields and cardinality are enforced by the runtime so Codex and Claude receive identical behavior.

## Asynchronous Delegation Contract

`mousecat.delegation.contract/2` publishes `start`, `await`, and `rejoin`. Start resolves a held `mousecat.skill` item server-side, validates its originating capability and source identity, requires a tool-invocation permit, writes safe provenance, and schedules one connector call before returning. Await requires the separate caller-held delegation capability. Rejoin requires that same capability, a caller-interpreted seam, and an operator-interaction permit; it creates or recovers one deterministic Crucible child in the existing widget and preserves origin, delegation, and attempt lineage. Payload and result custody remains in memory outside persisted state, host-state, events, and visualizer records.

HTTP MCP tool calls carry one absolute execution deadline followed by a separately bounded cancellation-status grace. On deadline, Mousecat sends standard `notifications/cancelled` in the same MCP session and ignores any later response to the original request. Standard notification acceptance is never cancellation proof. A separately negotiated `mousecat/cancellation-ack` extension may expose `mousecat/cancellation/status`; only an exactly correlated response with schema `mousecat.mcp.cancellation-ack/1`, `status=cancelled`, and `sideEffects=none` produces the retry-safe `cancelled` state. No such status response produces `interrupted` with unknown outcome.

## Host Adapter Harness

Adapter profiles live in `src/core/catalog.mjs` and emit `mousecat.adapter.render-packet/1` records for generic MCP hosts, Codex, Claude Code, JetBrains, Cursor, and CLI consumers. Every profile names the same Mousecat-owned summoned surface. Mousecat owns intake normalization, presentation, navigation, accessibility, response capture, runtime state, permits, route planning, and private-upstream withholding; hosts own recall, seam mapping, option compilation, summons, result consumption, and continuation.

`src/sdk/` makes that contract executable for JavaScript harnesses without embedding provider SDKs or host UI assumptions. `MousecatClient` owns one initialized Streamable HTTP session and returns structured tool content. `createMousecatHostAdapter` fixes provider-neutral host, session, and thread identity; emits heartbeats; registers declarative frameworks; invokes and awaits skills; and derives handoff arguments only from terminal Mousecat continuation receipts. Namespace and result tokens remain caller-held plaintext capabilities. Transport, JSON-RPC, and tool failures have distinct typed errors, and calls are never automatically replayed after dispatch.

`mousecat.sdk-host-conformance/1` is the executable host acceptance contract. `runMousecatHostConformance` proves transport negotiation, runtime health, construction-bound identity, one operator-owned Crucible round trip, contextual continuation, optional configured-provider discovery and read execution, and host-session closure. One deadline bounds the operational lifecycle and separately bounded cleanup closes a started host session. Provider checks are explicitly skipped when no provider probe is requested. The report exposes check names and bounded public provenance but omits decision values and every namespace, continuation, and result capability. `scripts/host-conformance.mjs` packages the contract as a host-neutral shell runner and waits for the standalone Mousecat surface rather than simulating an operator response.

The loopback server is one operator trust domain, not a tenant-authentication boundary. Permit profiles classify allowed actions but are not credentials, and session ids are host-supplied provenance rather than transport ownership tokens. Deployments that admit mutually untrusted local clients require an authenticated gateway or a future server authorization contract outside the shared-user service.

## Operator Host Boundary

`src/operator/server.mjs` owns one long-lived Mousecat runtime and binds only to loopback. `POST /mcp` negotiates bounded, idle-expiring MCP sessions; `GET /api/snapshot` returns minimal `mousecat.operator-snapshot/2`; and `POST /api/command` accepts only `respond`, `hold`, or `defer`. Browser responses resolve only their targeted items, while deferred items keep the originating MCP waiter pending.

Operator clients do not own runtime reducers or route policy. Runtime rejection becomes a non-success HTTP action envelope. Sensitive items are reconstructed from an explicit public allowlist before either host-state or visualizer records cross the loopback host boundary.

## Graphical Operator Client

`src/operator/public/` presents project context and task-specific review composition.
`project-model.js` consolidates registered sources by explicit project reference;
`project-view.js` renders group, project, work, document and history navigation.
Groups retain declared membership. Project and interaction routes scope the visible
questions while the complete pending set and draft maps remain available. Direct
question links and all-question access include work without a registered project.
History returns to the originating route without losing a draft or reading position.

ML review items put scenario and source-provided candidate content beside the
response controls, with rationale and provenance in closed disclosures. Document
reviews retain a reading layout; shape-specific controls preserve typed responses.
Mousecat never infers which candidate corresponds to an option from prose. Draft
review foregrounds the prepared answer and permits reopening the comparison.
Expanded cards use the available width, with stacked material and controls on
narrow displays. Mobile navigation preserves the reading pane's scrolling boundary.

The work header carries one identity and progress summary. Framework and session
metadata live in an on-demand context dialog. Up to eight visible questions per
family receive named navigation; denser collections retain the ordinal atlas.
Current-question indication follows the reading pane, and selecting a question
aligns its beginning with the pane. Project document/data lists prioritize their
human labels and retain source attribution inside each entry. Retained historical
threads retain their standing but do not advertise an available response form
until the originating interaction is live again.

Skill invocation passes optional `projectRef` through to the underlying question.
It participates in invocation identity only when supplied, preserving fingerprints
of existing unscoped invocations. Surface `interactionIds` explicitly associate
legacy work for navigation; they do not alter recorded authorial ownership or
continuation capabilities. Project thread summaries use the public redaction path.


Browser writes name only `respond`, `hold`, or `defer`. The server materializes those ids from `mousecat.host-command-pack/1`; the browser never sends raw Mousecat tool names. Decision, freeform, parameter, checklist, and ranking values stay typed through validation and submission. Runtime rejection returns a non-success action envelope and the client retains the last good snapshot.

## Runtime State

The default runtime is local and memory-only. When ignored config sets `state.enabled: true`, Mousecat persists sessions, interactions, normalized non-sensitive skill-intake summaries, decision queues, bounded route-plan history, visualizer-safe events, and credential references to `.mousecat/state.json` or another local path. This gives recursive Neo-assisted work a durable docket across short-lived CLI or host processes while keeping generated state untracked. The persisted record redacts secret-shaped fields, redacts sensitive interaction items and invocation identity, bounds route history with `state.maxRoutePlans`, and does not store credential values, raw transcripts, raw private upstream payloads, generated discovery output, or local Neo internals.

## User Service Lifecycle

`mousecat service` keeps the shared loopback runtime available independently of any one AI host. Windows writes a short current-user Run command to a LocalAppData VBS launcher and verifies the recorded runner before termination. Linux writes and controls a user systemd unit through `enable --now`, `start`, `stop`, and `disable`. macOS bootstraps and boots out a current-user LaunchAgent. Start and stop report success only when the Mousecat snapshot identity reaches the requested running state.

## Synthetic operator demonstration

`src/operator/demo.mjs` registers `fixtures/operator-demo` through the existing
project and history contracts, then supplies explicitly synthetic reviews. The
CLI's demo path creates a memory-only runtime from default configuration and
loads no saved state, native feeds or private connectors. Typed demonstration
returns enter only that runtime's history. The package allowlist includes the
fixture documents and observations so the installed package can run the same demo.

Explicit record references share one text-only renderer across documents and ML
evidence. Deliberate history navigation focuses the selected heading; an in-record
outline jumps to supplied document sections. Small question outlines display
literal titles and draft states. Narrow layouts retain the waiting-review count.
Browser contracts exercise these mechanisms on isolated demo servers in CI.
