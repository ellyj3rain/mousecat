| Document | Mousecat README |
|---|---|
| Version | 2.2.0.0-alpha |
| Timestamp | 2026-10-04 12:01 UTC / 05:01 PST |
| Status | ACTIVE - participant entry point. |

# Mousecat

Mousecat gives AI coding hosts and their operator one local workspace for questions,
project ideas, source evidence, decision history and live simulation feeds. Codex, Claude Code,
Neo and other MCP clients can bring work into the same responsive surface and
receive the operator's structured response. One loopback process serves the
browser, Windows desktop and Streamable HTTP MCP endpoint. Optional project
adapters and a native Unreal client preserve each producer's source authority.

Mousecat is PolyForm Perimeter 1.0.0-licensed, GZDS-governed source-available bridge code. It does not ship private Neo tools. A local ignored config can point Mousecat at a private Neo MCP server, then Mousecat discovers tools dynamically and forwards permitted calls at runtime.

Mousecat uses a Kohai-aware root odometer: `VERSION` is `major.minor.kohai.patch-maturity`, with npm package metadata projected to `major.minor.kohai-maturity` when the root patch coordinate is zero. Governance automation and release-discipline maturation move Kohai; runtime or public contract expansion moves minor.

ML reviews carry the caller's situation, model proposals, evidence and the effects
of the human response. Recorded scene-preview data remains validated and retained
with explicit provenance; the retired schematic renderer is not presented as a
live simulation. The Simulation view displays actual producer-supplied native
frames and source-timed information, with adjustable panels and per-camera tools.
The live viewer requests its next snapshot after the previous request completes
and yields to the browser scheduler. Producer and decoding speed determine
delivery; the images/s counter measures accepted images rather than game FPS.

Registered native producers can also supply source-bound H264 fragment receipts
and a typed observation graph. The media API verifies complete initialization and
fragment bytes, source clocks and retained descriptor identity. Graph intake keeps
reported observations, private accounts, predictions and unknowns attributable
to their source records. PNG remains available independently of media delivery.

Continuous native video uses one source-bound decoder for the composite and
paints each declared camera into its own subject view. Native Windows adopt the
same feed and start with Frame shape and Fit complete frame, preserving its
pixel ratio. Compact Tools reveals navigation, playback, settings and details
over the same view without shrinking the picture. Compact arrows,
wheel, drag and Fit browse the retained picture after a source ends or
disconnects. Fresh video keeps live controls available when PNG delivery lags.
Crop geometry grants no pose, person acknowledgement or pictured zoom.

The collapsed Observation map presents a source's typed graph through Positions
and Evidence views. Inspect people, context, beliefs, predictions, actions,
outcomes and missing evidence with their source clocks and perspective. Pan,
zoom, recenter and keyboard selection browse the map; selecting a person opens
the existing inspector. Unknown times and recorded positions remain labeled,
and references follow explicit source receipts. Snapshot export includes the
same canonical graph.

The top-level **Graphs** button opens a searchable selector across registered
projects. Each card previews actual graph nodes and connections and opens its
canvas directly. The selector is also available at `/#graphs`.

The top-level **Bulletin** button opens project memory at `/#bulletin`. Project
islands contain source-linked idea cards and explicit connections. Pan, zoom,
Fit, the overview and keyboard controls expose the same records as MCP queries.
Select a card to inspect its proposition, original conversation anchor and
revision history; capture or amend an idea, change its standing, or prune it
through the graphical controls. Project pages open their scoped board directly.

`mousecat.bulletin` supports observer-permitted `query` and
operator-interaction-permitted `capture` and `amend`. Hosts supply propositions
with author, host, session, message and time anchors. Corrections append their own
anchors while preserving initial ownership. Standing changes and pruning belong
to the graphical operator. Archive retains content; prune retains a tombstone
with identity, provenance and content hashes. Local memory survives service
restarts. Limits are 2,000 records, 64 revisions, 24 explicit links per record and
8 MiB; capacity refuses additional writes without eviction, and the final
revision remains available for pruning. Sensitive text is redacted at intake.

Projects can display a registered development continuity graph with source-owned
nodes, typed relationships, measured implementation/verification/publication status
and exact provenance. Search, source-provided views, kind/relation filters, keyboard
selection and relationship navigation expose the same graph as its JSON export.
The full-workspace canvas connects every matching record in one continuous space.
Colored regions, curved directed paths, neighborhood emphasis and a minimap
support exploration through pan, zoom, fit and touch or keyboard controls.
Details open on demand over the graph. Source and
media references remain descriptive metadata; graph data supplies no executable
links. The platform accepts up to 10,000 nodes, 30,000 relationships and 16 MiB.

## Quick Start

Install Node.js 20 or newer, clone this repository and install the pinned dependencies:

```powershell
npm ci
```

Try the current interface with entirely synthetic work:

```powershell
node src/cli.mjs operator --demo --port 0
```

Open the printed `url`. The demo has a project, a comparison review, a follow-up
plan, indexed evidence and an earlier example answer. Follow an evidence link,
return to the draft, and inspect a prepared answer before returning it. Demo
answers stay in a separate memory-only runtime; restarting resets it. Local
configuration, connectors and saved questions are not loaded by this command.
Port zero chooses a free loopback port, so the demo can coexist with your workspace.

On Windows, install the [desktop client](apps/mousecat-desktop/README.md):

```powershell
powershell -NoProfile -File scripts/install-desktop.ps1
```

App development includes updating the installed runtime and checking the actual
desktop. After activation, run `npm run installed:check` from the intended
checkout: it verifies the service/desktop binding, persistent state store, runtime
freshness and exact served interface files. Reload or reopen the installed client
and exercise the changed surface to complete delivery. Preview and CI receipts
retain their separate purposes.

Open **Mousecat** from the Desktop or Start menu. It shares questions and history
with the browser and starts the local service when needed. Unanswered work
survives service restarts without requiring the originating agent to reconnect.
Closing the desktop window leaves the service running. Browser access remains
available for users and hosts that prefer it.

Use **Settings (gear) > Appearance** to choose **Manuscript** (warm charcoal,
cream and brass), **B&W** (true black and neutral silver) or **Light**. Manuscript
is the default. Changes apply immediately across questions, projects and history
and persist in the current desktop or browser profile.

```powershell
npm test
node src/cli.mjs status
node src/cli.mjs connectors
node src/cli.mjs buttons
node src/cli.mjs adapters
node src/cli.mjs host-state cli
node src/cli.mjs session total-recall
node src/cli.mjs skill crucible Choose the next contract
node src/cli.mjs operator
node src/cli.mjs service status
```

Start the shared graphical surface and Streamable HTTP MCP endpoint:

```powershell
node src/cli.mjs operator
```

The command prints both `url` and `mcpUrl`; register `mcpUrl` with each host. The checked-in `.Codex/settings.json` records the same shared-runtime boundary. Current Codex and Claude Code registration commands are:

```powershell
codex mcp add mousecat --url http://127.0.0.1:4317/mcp
claude mcp add --transport http --scope user mousecat http://127.0.0.1:4317/mcp
```

The separate command below remains the initialized headless stdio compatibility path for diagnosis. It does not share state with the graphical process:

```powershell
node src/cli.mjs mcp
```

Use `--port <port>` when the default `4317` is occupied and `operator --self-test` for a non-interactive smoke check.

Install the same loopback runtime for the current user's login, then inspect or control its lifecycle without an administrator account:

```powershell
node src/cli.mjs --config mousecat.config.json service install
node src/cli.mjs --config mousecat.config.json service status
node src/cli.mjs --config mousecat.config.json service stop
node src/cli.mjs --config mousecat.config.json service start
node src/cli.mjs --config mousecat.config.json service uninstall
```

Windows uses a short LocalAppData launcher registered under the current-user Run key. Linux uses a user systemd unit, and macOS uses a LaunchAgent. Status validates the Mousecat snapshot schema rather than accepting any process that answers on the port.

## PR Readiness

Mousecat is AI-native and GZDS-governed. Contributions are expected to satisfy the public readiness surface before review.

```powershell
npm run pr:ready
```

That command runs tests, GitHub classifier tests, runtime smokes against `.github/mousecat.ci.config.json`, adapter render-packet, host-state binding, and operator-host smokes, governance floor, governance ceiling, doc currency, the PR documentation runner, and strict hygiene. GitHub Actions runs the required `ci-verify` gate on push to `main` and on pull requests, then runs `npm audit --audit-level=high`. Pull requests also run chronology, PR-shape, and documentation-consistency gates, and CI uploads structured PR classification observations for review. Open Ground GitLab mirrors the contribution gate through `.gitlab-ci.yml` on a dedicated public-group runner; its jobs require both `zero-local` and `open-ground` tags and never reuse a private-group runner.

Install local governance hooks once per checkout:

```powershell
npm run hooks:install
npm run hooks:check
```

The installed hooks enforce batch-prefixed commit messages, run governance/doc/hygiene checks before commits, and run `npm run pr:ready` plus audit before pushes.

CodeQL, dependency maintenance, secret scanning, Node 20 compatibility, package dry runs, and read-only PR outcome observation are separate public governance/security surfaces. Secret scanning uses the pinned open-source Gitleaks CLI so public and private organization downstreams share the same check. Protected check names are `ci-verify`, `node-20-compat`, `dependency-scan`, `secret-scan`, and `codeql`.

The server exposes:

| Tool | Purpose |
|---|---|
| `mousecat.history` | Search retained decisions, plans and methods; resolve exact revisions and backlinks; index explicitly registered project sources. |
| `mousecat.projects` | Register and inspect source-owned project surfaces and their retained threads. |
| `mousecat.bulletin` | Query, capture and amend source-linked project ideas with revisioned provenance. |
| `mousecat.workbench` | Inspect and operate registered project adapters within their declared effect and permit boundaries. |
| `mousecat.widget` | Request, await, answer, hold, or inspect typed operator interactions. MCP callers request and await; graphical operator commands own answer and hold writes. |
| `mousecat.skill` | Invoke built-in or registered operator-interaction skills, normalize chronology and lineage, and return typed results for contextual recursion. |
| `mousecat.registry` | List or register permit-gated, namespace-owned declarative skill-framework and presentation descriptors. |
| `mousecat.delegation` | Start permitted asynchronous upstream work from one capability-owned held skill seam, await its caller-only result, and rejoin a caller-interpreted seam through the existing widget. |
| `mousecat.ask` | Create structured operator interaction sessions with atomic items and button payloads. |
| `mousecat.session` | Start, snapshot, and reconstruct session dockets. |
| `mousecat.queue` | Manage Mass-Assault style decision queues, held items, and long-chain lineage. |
| `mousecat.visualize` | Return a live visualizer snapshot/event graph for IDE/app widgets. |
| `mousecat.host-state` | Return a host-profile state binding packet with adapter metadata, command templates, and redacted public records. |
| `mousecat.route` | Resolve upstream route plans and availability. |
| `mousecat.bridge` | Read and summarize public upstream bridge contracts. |
| `mousecat.invoke` | Permit-gated upstream invocation and external MCP forwarding boundary. |
| `mousecat.status` | Report configured upstreams, permits, and runtime state. |
| `mousecat.credentials` | Register and inspect credential references without storing secret values. |

## First Surfaces

The History control opens a searchable cabinet of retained decisions, plans,
source documents, reported results and proposed methods. Each record exposes
its original context, answer, revision, outgoing references and backlinks.
Follow a reference, use Back or Forward, then Return to review to resume an
unfinished draft. Search can narrow by project, record kind, standing and date.
Methods carry their purpose, applicability, procedure, known failures and
supporting sources.

Literal decision ids, evidence digests and source commit ids in review prose
are clickthrough references. Existing plan text remains unchanged. Missing or
ambiguous destinations open an explicit coverage view. Hosts may register
bounded commit-id aliases on provenance-bearing reported records; collisions
remain ambiguous and never replace an exact original interaction identity.

History persists in ignored local state independently of the short event log.
Coverage includes retained Mousecat interactions and explicitly indexed files
declared by registered project surfaces. Older external transcripts become
searchable when registered and indexed. Missing and ambiguous references remain
visible. Host-authored methods and findings retain proposed or reported standing;
the original operator response remains the authority for a decision.

Mousecat ships a generic operator-widget facade, normalized skill and asynchronous delegation adapters, one nonlinear cross-session graphical interaction surface, one shared loopback MCP/browser runtime, one native Unreal world runtime, and the validated contract foundation for project workbenches. Hosts can request arbitrary ordered items and options without inheriting native question limits, then await typed results while Mousecat preserves provenance, redaction, lineage, and operator-only response writes.

## Project Workbench Foundation

The Project Workbench lets a host and operator inspect and author a project's
meaningful objects without requiring the target application's normal UI.
Conversation carries intent. A project adapter retains the project's own
schemas and generation rules, while Mousecat binds the source revision,
operation effect, permission, representation, draft, and receipt.

The first source boundary validates project-adapter descriptors, bounded
workbench sessions, and multi-view development representations. Each visual
layer states whether it is a direct source fact, deterministic project
projection, derived summary, illustration, or unresolved. Executable rendering
code and secret-bearing adapter fields are rejected, and every declared write
must name both its Mousecat permit and project-side authorization.

Colonist Awareness is the proving adapter: an agent can search an exact saved
planet, compose a connected starting region, show the landscape at the scales
needed for judgment, and eventually stage the selected result into CA's current
plan schema. The same contract applies to interaction flows, architecture,
runtime traces, fixtures, data changes, and deployment topology without
flattening those subjects into one generic model.

The runtime supports namespace-owned adapter registration, connector-backed
read/draft operations, representation delivery and source invalidation through
`mousecat.workbench`. Stage-write and source-write effects remain closed. Fixture
acceptance does not establish live target-project acceptance. The accepted
contract direction is documented in
`design/mousecat-project-workbench-20260816-0254Z-1954PST.md`.

## Skill Invocation Loop

`mousecat.skill(action=invoke)` is the first-class host path for the source-owned Recursive Deliberation Framework and runtime-registered operator-interaction frameworks. Recursive Deliberation contains Crucible, Total Recall, and Mass Assault as contextually routed skills, not a fixed pipeline. The calling host model or configured upstream selects each compatible handoff from live context; Neo is optional rather than the default ontology or visualizer.

`mousecat.registry(action=register)` accepts declarative framework, skill, intake, and presentation descriptors under an operator-interaction permit. Registrations are namespace-owned and revisioned, survive ignored local-state restarts, and cannot replace source-owned ids or inject executable presentation code. Registered operator-interaction skills use the same mapped-seam widget and structured-return contract; upstream tool execution remains separately permit-gated through Mousecat's connector boundary.

The caller resumes or retries with the exact returned `continuation.arguments`, including its opaque capability token. Mousecat never reissues that capability from interaction identity alone. Answered and held responses carry source host, session, thread, chronology, and sequence lineage. The return contract explicitly sends Crucible back to interpretation and recursion, and Mass Assault back to lineage-order application followed by recall.

## Asynchronous Delegation

`mousecat.delegation(action=start)` accepts one item already held by `mousecat.skill`, validates the originating capability and host-session identity, checks the tool-invocation permit and connector route, commits only safe provenance, and returns immediately with a separate caller-held capability. Independent widget interactions remain available while work runs. When an HTTP MCP deadline elapses, Mousecat sends standard `notifications/cancelled`; notification acceptance and any later response to the original request remain non-authoritative. Retry-safe `status=cancelled` requires a separately negotiated `mousecat/cancellation-ack` extension status response that correlates the request and guarantees `sideEffects=none`. Without that response, the upstream outcome remains unknown and retry requires duplicate-side-effect acknowledgement. After interpreting a completed caller-only result, `rejoin` opens one lineage-bound Crucible seam in the existing widget under an operator-interaction permit. Raw payloads and results remain memory-only.

## Graphical Operator Surface

`node src/cli.mjs operator` starts one long-lived Mousecat runtime behind a loopback-only HTTP surface. The browser and `POST /mcp` use that same runtime. The browser presents every actionable item in one responsive, scrollable decision wall. An ordinal decision atlas maps multiple items inside their explicit source-lineage sections; a single item uses the available reading width. Cards expose the source-owned recommendation, description, source references, and response controls. Descriptions support text-only Markdown headings, paragraphs, lists and tables, plus explicit `<details>` / `<summary>` supporting sections. Tables stack into labeled rows on narrow screens. Other HTML remains literal text. Source identifiers live in an expandable section. Search spans propositions, options, and provenance; framework, session, and recall context remains available on demand from the same state engine.

Decision access is nonlinear. Any open or deferred item from any interaction can be opened and answered without resolving earlier items first. Operators may return one answer immediately or prepare an arbitrary local draft set across the wall. Mousecat distinguishes ready drafts from drafts that need completion, then presents the selected answers, amendments, lineage sections, evidence, and originating interaction boundaries in a review drawer before return. Ready sets use bounded requests through the existing typed per-interaction contract; earlier successful requests remain committed if a later request fails. `Later` defers the selected item while preserving its caller wait and chronology; `Hold` records an intentional terminal hold for that item. Chronology informs provenance and optional sorting; it neither creates graph edges nor governs response eligibility.

ML rulings may add a `mousecat.ml-review/1` record to the existing decision item. The open card first explains the human situation, the decision's place in the larger system, the causal path into play, the eventual player-visible consequence, and the precedent the answer sets. It then places the literal input beside the proposed learning and lists the exact approval effects, remaining exclusions, and evidence. The prepared-return review repeats that context. Mousecat validates and displays caller-owned claims without inventing an interpretation, and changing the review changes the skill invocation fingerprint.

## Native Simulation Observatory

The Simulation route displays verified source-native images and separate
source-timed person information. Each subject appears once in its caption.
Fresh images stay quiet; delayed, paused, failed and final frames retain clear
status and their capture time. Inspector and source metadata open on demand.

View settings offer Wide, Square and Frame shape, plus Fill or Fit framing.
Wide and Fill are the defaults. Fill crops without distortion; Fit retains the
complete captured frame; Frame follows accepted native image geometry. These
choices persist and apply to docked and independent windows. Each declared
site keeps its own camera tools: wheel zoom, drag/arrow browsing, and Follow.
Only source-owned commands change the native camera or simulation.

Window opens a real movable, resizable view with camera and playback tools.
Redock or closing it returns the same view. Source binding and subject identity
remain stable across feed reordering. Optional current camera control samples
carry their own clock; an older image does not remove a supported zoom operation
or acquire the later projection. Source unavailable-subject reports remain
visible even when they have no pictured person.

Detached feeds remain live while the main window opens Questions or Reviews.
They share the original source polling, command owner and aggregate images/s
measurement. Ending a run preserves its final frame and observed clock while
disabling native camera commands. Replacing its source session retires its
windows. The Windows client provides native windows; browsers use their normal
pop-up windows and may require pop-up permission.

A producer may attach bounded Activity, Attention, Memory and Needs groups to a
retained frame. Compact telemetry sits inside its corresponding image and carries
its own source sample time. A continuous opacity control changes the complete
information layer from fully hidden to fully visible, while independent group
controls determine what information exists on screen. The inspector presents
the selected person's synopsis, live facts, provenance, events and cognition as
separate visual structures instead of a raw diagnostic stream. Camera, time,
person selection, native panel and cognition requests continue through the
declared command pack; view presentation remains client-only. Delayed running
frames remain controllable for a bounded interval, deliberate pauses can always
resume, and ended runs freeze their final timing while remaining inspectable.

When a producer supplies durable study-session state, the primary control is
Save session during a running attempt or Continue session after a normal save.
Attempt duration and clean wall-time continuation remain inside Session settings.
Mousecat validates and forwards these bounded lifecycle requests; the producer
owns saving, resumption and successor publication. Session operation remains
unreviewed and has no dataset-admission control.

## Native World Runtime

`apps/mousecat-world` is the optional Unreal Engine 5.8 native client source. Its
compiler accepts receipt-verified local exports, including semantic/traversal
grids, source-relative placement, buildings, interiors and paired portals.
The public default is a synthetic procedural smoke world. Real project exports
are supplied locally and are not bundled as public fixture data. External warp
endpoints remain inactive until their destination maps are supplied.
The present native foundation uses a two-meter horizontal voxel lattice, stepped terrain, hydrology, source-derived paths and structures, component-built vegetation, map-priority overlap resolution, streamed collision with destination prewarming, and a neutral human-scale voxel operator. Interiors and exteriors occupy the same world state, with open-roof treatment where an included interior shares an exterior footprint. This is the structurally mapped voxel foundation, not the final high-realism art or mutable-life simulation pass; hierarchical near-field detail, richer material and asset families, component mutation, camera-driven interior cutaways, agent simulation, and persistence remain active development scope.

After building a local Windows development package, launch it directly:

```powershell
apps\mousecat-world\Artifacts\Win64\Development\MousecatWorld.exe
```

Movement uses `WASD` or the left stick, camera uses the mouse or right stick, `Space` or the bottom face button jumps, and `Shift` or the left shoulder runs. Native source, export contracts, build tooling and the synthetic public manifest live under `apps/mousecat-world`; project exports are supplied locally.

## Host Adapter Harness

`node src/cli.mjs adapters` returns `mousecat.adapter.render-packets/1` for generic MCP hosts, Codex, Claude Code, JetBrains, Cursor, and CLI consumers. Every profile points to the same Mousecat-owned summoned surface. Host packets describe origin and transport; Mousecat keeps interaction presentation, sequencing, accessibility, response capture, permit checks, route planning, state meaning, and private-upstream redaction.

Harness authors can import the dependency-free SDK from `mousecat/sdk`. It initializes one Streamable HTTP MCP session, emits provider-neutral heartbeats, registers namespace-owned frameworks, invokes and awaits skills, and carries terminal result capabilities into contextual handoffs without reconstructing JSON-RPC envelopes.

```javascript
import { createMousecatClient, createMousecatHostAdapter } from "mousecat/sdk";

const client = createMousecatClient({ endpoint: "http://127.0.0.1:4317/mcp" });
const mousecat = createMousecatHostAdapter(client, {
  profileId: "codex",
  sessionId: "host-session-id",
  threadId: "host-thread-id",
});

await mousecat.heartbeat({ objective: "Resolve the current architecture seam" });
const invocation = await mousecat.invokeSkill({
  skillRef: "crucible",
  invocationId: "stable-host-invocation-id",
  intake: { seams: [{ id: "architecture", prompt: "Which architecture should continue?" }] },
});
const result = await mousecat.awaitSkill(invocation, { waitMs: 30000 });
```

`runMousecatHostConformance` exercises that boundary as one reusable lifecycle: initialize transport, read runtime health, bind host identity, summon a Crucible decision, wait for its Mousecat response, inspect contextual continuation, optionally discover and execute a configured provider read, and close the host session. The returned `mousecat.sdk-host-conformance/1` receipt contains no response values or capability tokens. The packaged reference runner exposes the same proof to any shell-capable harness:

```powershell
mousecat-conformance --profile codex --session codex-proof --thread host-thread --gitlab-read
```

The command remains active until the operator answers its attributed decision in the standalone Mousecat surface. `--gitlab-read` is optional and proves the configured `gitlab.user.get` path through the same permit-gated runtime.

Reference descriptors cover generic MCP, Codex, Claude Code, ChatGPT, OpenAI and Anthropic SDKs, Google GenAI and Antigravity, xAI and Grok Build, and Ollama. Unknown profile ids become custom MCP hosts. Adapter construction fixes host and session identity; per-call payloads cannot replace that identity or substitute Mousecat-issued continuation capabilities.

## Private Neo Connector

Copy `mousecat.config.example.json` to ignored `mousecat.config.json`, choose a known adapter descriptor or any custom host identifier, and enable `connectors.neo` only when Neo compatibility is wanted. Known descriptors cover generic MCP, Codex, Claude, ChatGPT, OpenAI and Anthropic SDKs, Google GenAI and Antigravity, xAI and Grok Build, Ollama, JetBrains, Cursor, and CLI clients. Unknown identifiers normalize through the generic MCP contract rather than being rejected.

Set `state.enabled` to `true` in ignored local config when a host needs recursive dockets to survive process boundaries. Mousecat writes sessions, interactions, decision queues, route plans, public events, and credential references to `.mousecat/state.json` by default. The directory is ignored, credential values are never stored, secret-shaped fields are redacted, sensitive interactions are written without identifying metadata, prompts, options, or answers, and route-plan history is bounded by `state.maxRoutePlans`.

```powershell
node src/cli.mjs connectors
node src/cli.mjs tools neo
node src/cli.mjs resources neo
node src/cli.mjs bridge neo
node src/cli.mjs invoke neo <neo-tool-name> profileId=tool-invocation example=payload
node scripts/neo-live-smoke.mjs --config mousecat.config.json
node src/cli.mjs host-state cli
node src/cli.mjs session total-recall
```

Dynamic MCP discovery comes from the configured server's `tools/list` and `resources/list` responses over stdio or HTTP. Provider-neutral API and CLI integrations use source-owned `mousecat.integration-adapter/1` manifests over the distinct `cli-json` transport. Their capabilities appear through the same connector status, route, and `tools/list` surfaces; permit-gated capability execution enters only through `mousecat.invoke`, validates the active registry binding, and runs through a SHA-256-pinned executable with host-managed authentication. Integration capabilities are not delegation targets.

HTTP connector summaries publish the cancellation handshake and a bounded `cancellationGraceMs` parameter from 100 through 5000 milliseconds, defaulting to 1000. `mousecat.bridge` reads the public `mousecat_bridge_contract_v1` resource and returns a sanitized summary with public routes, boundary classes, stale-runtime policy, and withheld-surface labels. If an upstream MCP endpoint reports `MCP_RUNTIME_STALE`, Mousecat returns `connector-runtime-stale` with `restartRequired: true` instead of treating it as an opaque JSON-RPC failure. `node scripts/neo-live-smoke.mjs --config mousecat.config.json` is the local live-connector smoke for an ignored private Neo config; it reports connector readiness, required public names, permit-gated forwarding, and sanitized runtime identity/doctor fields. Do not commit generated discovery output, local paths, credentials, raw runtime payloads, or private tool schemas.

## Browser verification

```powershell
npx playwright install chromium
npm run test:browser
```

Windows checks use installed Microsoft Edge. Linux and macOS checks use
Playwright Chromium. The check starts isolated synthetic servers, exercises
project/evidence/history navigation, keyboard focus, draft preservation and exact
returns at four screen sizes, checks all three themes, and closes every fixture.
It never connects to your installed service. GitHub CI runs the same browser
contracts and retains synthetic screenshots as test artifacts.

## Source Policy

Mousecat core source is licensed under PolyForm Perimeter 1.0.0. The perimeter posture permits use, modification, and distribution under the published terms while reserving competing-product use outside the grant. Runtime transcripts, private host state, credential values, Z-Library session state, upstream caches, and generated local artifacts stay out of Git.

See [third-party notices](THIRD_PARTY_NOTICES.md) for the icon and desktop dependency
terms, and [release readiness](PUBLIC_RELEASE.md) for verification and the historical
privacy boundary. PolyForm Perimeter is source available; its noncompete restriction
means it is not an OSI-approved open-source license.

## Read First

Read `CORE.md`, `ARCHITECTURE.md`, `GOVERNANCE.md`, `ROADMAP.md`, `SESSION_STATE.md`, and `AGENTS.md` before changing public tool names, connector semantics, permit semantics, credential policy, or skill-framework records.

## Contextual reviews

Projects opens a navigable group and subproject hierarchy. Enter a project to see
its pending work, then open a work item to review its questions. Questions remains
available as a direct view, including unassigned work. Sources sharing a project
reference are collected under that project. History opens separately and returns
to the same work; prepared drafts can be revised from any project view.

ML review items display the situation, candidate content and response controls
first. Supporting input, rationale and evidence expand on demand. Plan documents
retain their reading layout. The host supplies meaning and typed choices; Mousecat
owns their shared presentation and preserves the source content.

Small question sets show named destinations and the currently viewed question;
larger collections retain compact navigation. Framework and session details open
through Work context. Project documents group by their human-facing labels with
source attribution inside each entry. Work history preserves recorded outcomes;
retained ordinary open/deferred questions remain answerable after a restart,
even while the originating caller is disconnected. Redacted sensitive questions
remain non-answerable; completed work stays in history.

Callers should supply `projectRef` to `mousecat.skill` when the owning project is
known. To contextualize existing work without reissuing questions, an explicitly
registered project surface can list up to 256 unique `interactionIds` (nonempty
strings of at most 512 characters). Associations affect navigation, preserve
original ownership and grant no answer authority. Calling a skill or registering
a project does not authorize editing the Mousecat platform.
