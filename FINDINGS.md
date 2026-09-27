| Document | Mousecat Findings |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 04:48 UTC / 21:48 PDT |
| Status | ACTIVE - append-only findings. |

# Findings

No findings recorded yet.

## F-001 | 2026-06-26 01:33 UTC / 18:33 PST | Open-source boundary must not embed private Neo intelligence

*Severity:* High

*Finding:* A bridge repo can accidentally expose private implementation shape if it commits upstream-specific intelligence, generated tool catalogs, governance internals, local substrate metadata, or private paths.

*Resolution:* A2 implements a generic external MCP connector and records private Neo as a local ignored runtime endpoint. Public source owns the bridge, permits, and discovery protocol. Private Neo owns its tools.

## F-002 | 2026-06-26 04:40 UTC / 21:40 PDT | Host UI gates compress governed decisions

*Severity:* Medium

*Finding:* When an AI host can only ask one or a few questions at a time, skills compress real governed workflows into broader prompts. That loses atomicity, weakens provenance, and makes answer reuse harder.

*Resolution:* A3 adds interaction sessions and multi-item queue lineage so skills can emit structured chains through Mousecat while hosts render the chain however their UI allows.

## F-003 | 2026-06-26 04:48 UTC / 21:48 PDT | Bridge compatibility needs stale-runtime visibility

*Severity:* Medium

*Finding:* A long-lived upstream MCP process can report `MCP_RUNTIME_STALE` after its source changes. Hosts need to see that as compatibility state, not as an opaque invocation failure.

*Resolution:* A4 reads the public bridge contract through a fresh connector process and exposes the upstream stale-runtime code and update policy in `mousecat.bridge.summary/1`.

## F-004 | 2026-07-04 02:17 UTC / 19:17 PDT | Flat package versioning hid Kohai governance drift

*Severity:* Medium

*Finding:* Mousecat still treated root `VERSION` and `package.json` as identical three-coordinate package metadata. That flattened the Kohai tier and let governance automation maturation look like ordinary SemVer movement, leaving Mousecat behind the current Neo/GZDS version standard.

*Resolution:* A10.2 adds a Mousecat-owned Kohai-aware version primitive, moves root `VERSION` to `0.1.1.0-alpha`, projects package metadata to `0.1.1-alpha`, and gates the projection in `npm run pr:ready`.

## F-005 | 2026-07-04 02:26 UTC / 19:26 PDT | License gates still enforced the superseded MPL posture

*Severity:* Medium

*Finding:* Mousecat's governance floor and docs check still hardcoded MPL-2.0 as the required license, so the repository would reject the operator-ratified PolyForm posture even after the policy changed.

*Resolution:* A10.3 replaces the license text, updates package metadata, and changes the floor/docs gates to enforce PolyForm Perimeter 1.0.0 plus the in-repo required notice.

## F-006 | 2026-07-04 02:28 UTC / 19:28 PDT | Readiness commands were not locally hooked

*Severity:* Medium

*Finding:* Mousecat had a strong `npm run pr:ready` surface, but no source-owned way to install local Git hooks. A contributor or agent could skip the local floor until CI, recreating avoidable split-brain between workstation state and remote readiness.

*Resolution:* A10.4 adds a tested hook installer and installs local `commit-msg`, `pre-commit`, and `pre-push` hooks for batch prefix, governance, documentation, hygiene, PR readiness, and audit checks.

## F-007 | 2026-07-04 03:02 UTC / 20:02 PDT | Stale upstream MCP failures were too generic for host recovery

*Severity:* Medium

*Finding:* Mousecat could summarize a stale-runtime policy from a bridge contract, but a live upstream MCP `MCP_RUNTIME_STALE` response still arrived as a generic `connector-jsonrpc-error`. A host would know a connector failed, but not that the correct repair was to restart the upstream MCP process.

*Resolution:* A10.5 normalizes `MCP_RUNTIME_STALE` into `connector-runtime-stale` with `restartRequired: true` at the MCP client boundary and propagates the stale code through `mousecat.invoke`.

## F-008 | 2026-07-04 05:30 UTC / 22:30 PDT | Marketplace-action licensing broke private downstream secret scanning

*Severity:* Medium

*Finding:* The private `GroundZeroSolutions/mousecat` baseline run failed at `secret-scan` because `gitleaks/gitleaks-action@v3` requires a Gitleaks license for organization/private repositories.

*Resolution:* A10.6 installs and runs the pinned open-source Gitleaks CLI directly, preserving the named `secret-scan` gate across public upstream and private downstream repositories without adding secrets or paid-action coupling.

## F-009 | 2026-07-04 08:19 UTC / 01:19 PDT | Live Neo readiness was manual and shell-fragile

*Severity:* Medium

*Finding:* Mousecat could connect to the private Neo MCP runtime through ignored config, but the live verification path was a sequence of ad hoc CLI calls. On PowerShell, JSON argument quoting made permitted invocation easy to misread as connector failure.

*Resolution:* A11.0 adds `node scripts/neo-live-smoke.mjs --config mousecat.config.json`, a source-owned local smoke that checks discovery, bridge, route, permit-gated invocation, and sanitized runtime identity/doctor readiness without committing private config, paths, raw payloads, credentials, or generated catalogs.

## F-010 | 2026-07-04 08:32 UTC / 01:32 PDT | Adapter work needed a shared render contract before host plugins

*Severity:* Medium

*Finding:* Building Codex, Claude Code, JetBrains, Cursor, and CLI adapters directly would risk duplicating widget semantics in each host and recreating split-brain behavior across renderers.

*Resolution:* A11.1 adds source-owned adapter profiles and render packets that every host can consume while `mousecat.widget`, `mousecat.visualize`, and the permit/route surfaces remain the semantic source of truth.

## F-011 | 2026-07-09 03:21 UTC / 20:21 PDT | Recursive dockets were process-local

*Severity:* Medium

*Finding:* `mousecat.session`, `mousecat.queue`, and visualizer events only lived inside one runtime process. Recursive Neo-assisted work could verify the live connector, create a queue, then lose that docket when the next CLI or host process started.

*Resolution:* A11.3 adds optional ignored local state for sessions, interactions, queues, public events, and credential references. The persisted record redacts secret-shaped fields and sensitive interaction details before disk writes.

## F-012 | 2026-07-09 03:27 UTC / 20:27 PDT | Route context was not recoverable

*Severity:* Medium

*Finding:* Recursive work could persist open decisions after A11.3, but route plans still disappeared with the runtime process. A later `total-recall` could show the open queue without the routing context that made the next tool boundary clear.

*Resolution:* A11.4 persists bounded route-plan history in ignored local state, reports route-plan counts in status and session recall, and keeps invocation authorization unchanged behind `mousecat.invoke`.

## F-013 | 2026-07-09 03:34 UTC / 20:34 PDT | Hosts had render packets but no state binding contract

*Severity:* Medium

*Finding:* A11.1 render packets told hosts what to render, and A11.3-A11.4 made local state durable, but hosts still lacked a source-owned packet that mapped each profile to state scope, readable records, writable tools, and sync triggers.

*Resolution:* A11.5 adds `mousecat.host-state-adapter/1` records to the catalog and render-packet surface so hosts can bind state without inventing parallel state semantics.

## F-014 | 2026-07-09 03:41 UTC / 20:41 PDT | State adapters still needed an executable host binding

*Severity:* Medium

*Finding:* Host-state adapter records named readable records, writable tools, sync triggers, and storage scopes, but a host still needed to compose those records with live Mousecat state on its own. That left the first real integration step under-specified and risked each host inventing a slightly different binding packet.

*Resolution:* A11.6 adds `mousecat.host-state` and `node src/cli.mjs host-state <profile>` so hosts consume one source-owned `mousecat.host-state.binding/1` packet with adapter metadata, redacted public records, sync triggers, tool bindings, counts, limits, and boundaries.

## F-015 | 2026-07-09 03:47 UTC / 20:47 PDT | Host labels and adapter contract selection were conflated

*Severity:* Medium

*Finding:* `hostProfile` was a useful local runtime label, but it was not guaranteed to match Mousecat's source-owned adapter profile ids. Using it as the implicit host-state selector would make valid local labels such as `local-dev`, `ci`, or `windows-local` collide with adapter contract selection.

*Resolution:* A11.7 adds `adapterProfile` as the config-owned selector for Mousecat adapter contracts. `hostProfile` remains a freeform label, while `mousecat.host-state` binds through `adapterProfile` by default and fails closed on unknown configured adapter profiles.

## F-016 | 2026-07-09 03:56 UTC / 20:56 PDT | Adapter-profile behavior needed visible safe defaults

*Severity:* Medium

*Finding:* The runtime selector can be correct but still be misused by hosts if checked-in configs and entry-point docs do not show the host-neutral `generic-mcp` default or explain the boundary between `hostProfile` and `adapterProfile`.

*Resolution:* A11.8 updates the CI/example configs and human entry-point docs with the safe adapter default and keeps the docs/config changes split from the A11.7 runtime PR.

## F-017 | 2026-07-09 04:02 UTC / 21:02 PDT | Host packets lacked executable next-call templates

*Severity:* Medium

*Finding:* Render packets and host-state bindings described readable records, writable tools, and sync triggers, but hosts still had to infer the exact MCP or CLI calls needed to poll state, recall a session, respond to a widget item, enqueue work, or register credential references.

*Resolution:* A11.9 adds `mousecat.host-command-pack/1` templates to the existing adapter and host-state binding packets while preserving host-owned rendering, Mousecat-owned semantics, permit gates, and credential-value withholding.

## F-018 | 2026-07-09 04:10 UTC / 21:10 PDT | Docs lagged the command-pack contract

*Severity:* Medium

*Finding:* A host-facing packet can be implemented correctly but still be misread if README, architecture, core, governance, and roadmap docs only mention render packets and host-state bindings.

*Resolution:* A11.10 updates the entry-point docs to present command packs as template instructions that complement render/state packets without becoming host-specific plugins.

## F-019 | 2026-07-09 19:23 UTC / 12:23 PST | Post-merge state still pointed at the drained FIFO

*Severity:* Medium

*Finding:* After A11.10 merged and the stacked remote branches were deleted, `ROADMAP.md` still named A11.9 as current and `SESSION_STATE.md` still named the deleted A11.10 branch, described A11.10 as active, and called GitHub branch protection pending. That stale state could misroute the next recursive run back into completed work.

*Resolution:* A11.11 reconciles the canonical documents to `main`, records the verified branch-protection posture, closes A11 at the host-adapter contract boundary, and identifies A12 as the graphical operator-surface batch.

## F-020 | 2026-07-09 19:52 UTC / 12:52 PST | Remote CI cloned the repository but job scripts lacked git

*Severity:* High

*Finding:* Open Ground pipelines 104 and 105 reached the dedicated public runner, but `ci-verify` and `merge-request-shape` failed with `spawnSync git ENOENT` and `git: command not found`. GitLab Runner's helper cloned the repository successfully; the separate `node:22-bookworm-slim` job container still lacked the `git` executable required by Mousecat's hygiene and shape checks.

*Resolution:* A12.0 installs `git` and CA certificates explicitly in the two repository-state jobs, removes the empty `ci-verify` artifact declaration, and requires the dedicated Open Ground runner tag in addition to `zero-local`.

## F-021 | 2026-07-09 21:05 UTC / 14:05 PDT | An operator host needed a safe executable packet boundary

*Severity:* High

*Finding:* An operator client could not safely consume the raw session or visualizer snapshots or carry arbitrary Mousecat tool names. Those paths could expose fields outside the public host-state contract and would make a client hard-coded action map a second interpretation of the source-owned command pack.

*Resolution:* A12.1 public-redacts visualizer records, composes the operator snapshot from host-state, status, and visualizer packets, and accepts only operator-safe command ids materialized from `mousecat.host-command-pack/1`. Raw delegated results, invocation, credential registration, queue clearing, and private discovery stay outside the client response and action surfaces.

## F-022 | 2026-07-09 21:05 UTC / 14:05 PDT | Sensitive item redaction still preserved nested content

*Severity:* High

*Finding:* The original public-item redactor spread the full sensitive record before replacing prompts and options. Titles, metadata, recommended defaults, and nested selected, checklist, ranking, and response values could therefore survive into host-state or operator snapshots. Queue action responses could also return the unredacted runtime item beside a redacted refresh packet.

*Resolution:* A12.1 reconstructs sensitive public items from an explicit safe-field allowlist, replaces every response-bearing field, applies the same boundary to visualizer records and events, and omits raw delegated runtime results from operator action envelopes.

## F-023 | 2026-07-09 21:18 UTC / 14:18 PDT | The assembled graphical unit exceeded the operator review boundary

*Severity:* High

*Finding:* The first assembled graphical operator change spanned 23 files and roughly 3,470 changed lines, exceeding Mousecat's 1,800-line operator boundary. Ratifying that aggregate would have made the host, read model, and command controls one oversized review unit.

*Resolution:* The graphical construction is running FIFO as three owned units: A12.1 operator host, A12.2 live graphical read surface, and A12.3 typed command controls. A12.2 contains no runtime write path and remains independently browser-verifiable.

## F-024 | 2026-07-09 21:24 UTC / 14:24 PDT | Snapshot refresh polluted the bounded activity stream

*Severity:* High

*Finding:* The A12.1 operator snapshot composed public packets through the ordinary `mousecat.host-state` and `mousecat.visualize` tool handlers. Each graphical refresh therefore appended two observation events, making a read path mutate and eventually displace substantive events from the bounded stream.

*Resolution:* A12.2 adds an internal side-effect-free operator-state reader while preserving observation events for ordinary tool calls. The graphical activity view shows the newest twenty canonical records first.

## F-025 | 2026-07-09 21:37 UTC / 14:37 PDT | Generic text submission would flatten typed operator work

*Severity:* High

*Finding:* Decision values can be non-string primitives, required checklists need at least one selected value, and rankings need one unique rank per option. Treating every graphical response as text would violate the canonical widget and FIFO shapes and make a superficially successful browser action semantically wrong.

*Resolution:* A12.3 renders controls from each item's canonical shape, preserves option values by stable index, blocks incomplete checklists and rankings, rejects duplicate ranks, and submits structured response or answer objects through the command pack.

## F-026 | 2026-07-09 21:45 UTC / 14:45 PDT | Parent interaction status did not guarantee atomic item state

*Severity:* High

*Finding:* The runtime accepts partial response arrays, so a parent interaction can be answered while untouched items remain open. Parent-status-driven controls could strand those items or gather null replacements for already answered items.

*Resolution:* A12.3 derives display status and editability from item state, submits or holds only editable items, and preserves prior responses during mixed-status continuation.

## F-027 | 2026-07-09 23:17 UTC / 16:17 PDT | Diagnostic visibility had become product composition

*Severity:* High

*Finding:* The graphical surface rendered runtime facts, topology, route controls, connector and credential posture, and the event stream beside operator decisions. Those machine diagnostics occupied most of the viewport and made Mousecat behave like a full-screen runtime workstation.

*Resolution:* A12.4 removes the diagnostic DOM, controller functions, listeners, responsive rules, and styling while preserving the source-owned MCP, CLI, host-state, status, route, connector, and visualizer contracts. Typed interaction and FIFO decision work continue unchanged.

## F-028 | 2026-07-09 23:32 UTC / 16:32 PDT | Interaction picking and queue control still formed a workbench

*Severity:* High

*Finding:* After diagnostic lanes were removed, the browser still exposed an interaction selector beside a separate filterable FIFO queue with dialogs and ratification controls. Those parallel navigation and command paths preserved application-style operation instead of one summoned chronological decision flow.

*Resolution:* A12.5 selects the oldest open or held interaction automatically and removes the picker, queue DOM, dialogs, listeners, renderers, styles, and browser queue commands. Source-owned queue tools remain available to MCP and CLI consumers.

## F-029 | 2026-07-10 00:12 UTC / 17:12 PST | Separate browser and MCP runtimes could not close the originating call

*Severity:* Critical

*Finding:* The loopback browser and ordinary MCP clients previously owned separate Mousecat runtime instances. A host could request an interaction and the browser could render Mousecat records, but the browser response could not resolve the originating host call.

*Resolution:* A12.6 exposes versioned Streamable HTTP MCP at `/mcp` from the operator process and delegates both transports to one runtime. Stable ask and await calls now receive the structured result produced by the graphical command boundary.

## F-030 | 2026-07-10 00:12 UTC / 17:12 PST | Response paths could bypass chronological sequencing

*Severity:* High

*Finding:* `respond` accepted any open item or later interaction, trusted a caller-supplied status, and returned duplicate interaction collisions as ordinary successful MCP tool results. A model or crafted graphical request could therefore bypass Mousecat-owned sequence and misread a failed ask as success.

*Resolution:* A12.6 reserves response and hold writes for the graphical boundary, requires the oldest interaction and exact open-item prefix, derives status from the action, validates option identities, and marks runtime failures with MCP `isError`.

## F-031 | 2026-07-10 00:12 UTC / 17:12 PST | Bounded event history could recycle generated interaction ids

*Severity:* High

*Finding:* Generated ids were derived from retained event counts. With a small `maxEvents`, process reloads could reproduce an existing interaction id and reject a valid new request as a collision.

*Resolution:* A12.6 uses UUID-backed generated identities independent of bounded event retention and proves uniqueness across repeated persisted-state reloads.

## F-032 | 2026-07-10 00:12 UTC / 17:12 PST | New typed fields escaped sensitive persistence redaction

*Severity:* High

*Finding:* Local-state redaction nulled `value` but preserved selected options, checklist values, rankings, and other response fields. Sensitive interaction source also survived in public event data.

*Resolution:* A12.6 reconstructs sensitive persisted responses from a safe allowlist, nulls every answer-bearing field, redacts interaction source, title, and skill identity whenever any child is sensitive, and tests the serialized record for classified-value absence.

## F-033 | 2026-07-10 00:12 UTC / 17:12 PST | Waiter cancellation needed a complete transport lifecycle

*Severity:* Medium

*Finding:* Active HTTP waiters responded to an explicit cancellation notification but not reliably to early cancellation, client disconnect, session deletion, or server shutdown. The serial stdio reader also cannot consume cancellation while blocked in the preceding call.

*Resolution:* A12.6 adds bounded HTTP and stdio cancellation tombstones, concurrent stdio request dispatch, disconnect aborts, session cleanup, session capacity and idle expiry, and graceful server-shutdown aborts.

## F-034 | 2026-07-10 03:01 UTC / 20:01 PDT | Quiet polls could repaint completed work

*Severity:* High

*Finding:* A snapshot request started before a graphical command could resolve afterward and repaint the previous item; redundant pending copy also made the compact surface read like a queue dashboard.

*Resolution:* A12.7 aborts superseded reads, rejects stale generations, preserves drafts when the active key is unchanged, and presents only item progress.

## F-035 | 2026-07-10 03:24 UTC / 20:24 PDT | Compact controls diverged from typed runtime semantics

*Severity:* High

*Finding:* Live Crucible review exposed checklist cardinality, ranking key, multi-selection value, numeric parameter, and partial Hold mismatches between the compact client and runtime contract.

*Resolution:* A12.7 aligns every typed value, treats checklist and ranking as plural shapes, converts ranged parameters to numbers, and makes Hold terminal for every remaining item.

## F-036 | 2026-07-10 03:49 UTC / 20:49 PDT | Fresh hosts had only low-level widget grammar for named skills

*Severity:* High

*Finding:* Codex and Claude could reach the shared Mousecat MCP endpoint, but launching Crucible or Mass Assault still required each model to reconstruct raw `mousecat.widget` payloads, session lineage, chronology, retry behavior, and recursive return expectations.

*Resolution:* A13 adds one discoverable `mousecat.skill` adapter for both named skills. It accepts a canonical mapped-seam intake, compiles one widget interaction, and returns typed lineage plus the explicit caller recursion obligation.

## F-037 | 2026-07-10 03:49 UTC / 20:49 PDT | Partial chronology could silently become source order

*Severity:* High

*Finding:* An early A13 normalizer sorted only fully timestamped or fully ordinal input, then silently labeled mixed or incomplete multi-session input as source order. That could present a Mass Assault sequence as chronological when its order was not proven.

*Resolution:* Multi-seam skill intake now fails closed unless every seam resolves to a timestamp or every seam supplies an ordinal. Single-seam Crucible remains chronology-neutral.

## F-038 | 2026-07-10 03:49 UTC / 20:49 PDT | Interaction identity was insufficient continuation authority

*Severity:* High

*Finding:* A shared loopback client that learned a skill interaction id could await its lineage-rich result. Invocation ids also remained optional, so retries could create duplicate operator work.

*Resolution:* Every named-skill invocation now requires stable origin and invocation identity. Mousecat fingerprints retries and returns an opaque continuation capability; only its hash persists, and `await` fails closed when the capability is missing or invalid.

## F-039 | 2026-07-10 04:04 UTC / 21:04 PDT | Conditional MCP input schema blocked Claude tool loading

*Severity:* Critical

*Finding:* The first fresh Claude Code Mass Assault reached Mousecat discovery, then Anthropic rejected `mousecat.skill` because its top-level input schema used `allOf` for action-specific required fields. The tool was valid JSON Schema but not valid for the host's accepted MCP tool subset.

*Resolution:* The public descriptor now uses one flat object schema with nested source, seam, option, and session requirements. Action-specific requirements remain fail-closed runtime validation, preserving one cross-harness tool without weakening behavior.

## F-040 | 2026-07-10 04:27 UTC / 21:27 PDT | Idempotent replay could reissue continuation authority

*Severity:* High

*Finding:* A matching retry recovered its continuation capability from in-memory runtime state. Any loopback MCP client able to reproduce public intake could therefore turn interaction identity into caller authority.

*Resolution:* Replay now requires the original caller-held capability and validates it against the persisted hash. Mousecat no longer retains or recovers plaintext capabilities after the initial return.

## F-041 | 2026-07-10 04:27 UTC / 21:27 PDT | Ambiguous chronology still passed strict intake

*Severity:* High

*Finding:* Session timestamps could fill missing seam timestamps, and duplicate timestamps or ordinals fell back to input order for ties. Reordered equivalent input could therefore invert a sequence labeled chronological.

*Resolution:* Multi-seam intake uses only explicit seam timestamps or integer ordinals, requires every value in the chosen basis to be unique, and directs tied timestamps to explicit ordinal ordering.

## F-042 | 2026-07-10 04:27 UTC / 21:27 PDT | Seam-level transcript fields bypassed intake rejection

*Severity:* High

*Finding:* The raw-transcript guard inspected intake and session containers but not nested seam records. A transcript or messages field on a seam could open an interaction despite the fail-closed public boundary.

*Resolution:* Intake inspection now recursively rejects transcript and messages keys before seam normalization, with direct, session, and nested regression coverage.

## F-043 | 2026-07-10 04:27 UTC / 21:27 PDT | Replay identity and hashing were not fully canonical

*Severity:* Medium

*Finding:* Interaction ids omitted the source session and request fingerprints depended on object key insertion order. Session-local invocation ids could collide, while semantically identical structured option values could conflict.

*Resolution:* Deterministic interaction ids include source session identity, and stable hashes recursively sort object keys while preserving array order.

## F-044 | 2026-07-10 05:31 UTC / 22:31 PDT | Asynchronous delegation needed a separate custody boundary

*Severity:* High

*Finding:* A long-running upstream call cannot safely place its payload, raw result, capability, and resumable provenance in the same durable or public record. Restart also makes an in-flight call's external outcome unknowable.

*Resolution:* A14.0 separates safe delegation provenance from memory-only payload and result custody, stores only capability hashes, withholds sensitive identity, and restores interrupted work with explicit outcome uncertainty. No public tool is exposed until the runtime lifecycle lands.

## F-045 | 2026-07-10 05:56 UTC / 22:56 PDT | Rejoin recovery and sensitivity could diverge from delegation custody

*Severity:* High

*Finding:* Recording rejoin lineage only after child creation can strand a deterministic child after a lost response or crash. A sensitive origin must also prevent its rejoined seam from entering public or durable state.

*Resolution:* Mousecat persists safe rejoin intent before child creation, lets the delegation capability recover or await that child, inherits sensitivity unconditionally, clones public envelopes, and keeps recall open until the child is terminal. Crash-window, replay, lineage, operator-redaction, and disk-redaction tests cover the contract.

## F-046 | 2026-07-10 06:01 UTC / 23:01 PDT | MCP initialization could multiply a connector timeout

*Severity:* High

*Finding:* Applying the configured timeout independently to HTTP MCP initialization and the subsequent tool call would let one logical delegation exceed its declared connector window.

*Resolution:* Connector invocation computes one absolute deadline and passes its remaining budget through initialization and tool execution. A delayed HTTP fixture proves the second phase times out within that shared window.

## F-047 | 2026-07-10 16:56 UTC / 09:56 PDT | HTTP cancellation request was not cancellation proof

*Severity:* Critical

*Finding:* Aborting Mousecat's local fetch at deadline did not notify the upstream MCP runtime and could not prove its provider or topology stopped. Even a successful cancellation-notification HTTP response proves only transport acceptance, not terminal execution state.

*Resolution:* Mousecat now sends standard `notifications/cancelled` with the original request id and ignores any later original response. A separately negotiated `mousecat/cancellation-ack` status request may prove an exactly correlated `cancelled` result with `sideEffects=none`; without that proof, the delegation remains interrupted with unknown outcome.

## F-048 | 2026-07-10 20:19 UTC / 13:19 PDT | Expanded layout and recovery could strand the operator surface

*Severity:* High

*Finding:* The first expanded layout required more width than its activation breakpoint, qualified module ids could lose active framework identity, and disabling stale actions on connectivity failure also prevented quiet polling from recovering.

*Resolution:* A16.1 adds an intermediate two-column layout before the wide three-column arrangement, canonicalizes active skills server-side, separates offline action safety from snapshot retry state, and adds accessible current-step reveal for long sequences. The recursive surface review reports no remaining Critical or High findings.

## F-049 | 2026-07-10 20:28 UTC / 13:28 PDT | Service registration initially bypassed native lifecycle ownership

*Severity:* High

*Finding:* The first service draft placed an overlong command in the Windows Run key, manually spawned Linux and macOS runners outside their managers, trusted a stale PID, and treated any HTTP 200 on the configured port as healthy.

*Resolution:* A16.2 writes a short Windows launcher and verifies runner path plus exact port, uses user systemd and launchd lifecycle commands, validates the Mousecat snapshot schema, and checks start or stop postconditions before reporting success. The recursive build review reports no remaining Critical or High findings.

## F-050 | 2026-07-10 20:42 UTC / 13:42 PDT | Declarative adapter packets still required hand-authored MCP clients

*Severity:* High

*Finding:* A third-party harness could inspect Mousecat's render, state, and command packets but still had to implement Streamable HTTP initialization, session custody, JSON-RPC errors, provider heartbeats, registry permits, and capability-preserving handoffs independently. That duplication could let per-call payloads spoof established host identity or reconstruct authority from public interaction ids.

*Resolution:* A17 adds one dependency-free SDK client and immutable host-session adapter. Integration tests prove exact provider identity, namespace token issuance, terminal continuation custody, contextual handoff, typed failures, and rejection of caller attempts to substitute adapter identity or result capabilities.

## F-051 | 2026-07-10 20:59 UTC / 13:59 PDT | The first SDK draft duplicated profiles and underimplemented Streamable HTTP

*Severity:* High

*Finding:* The first executable adapter draft carried a second host-profile list, exposed a mutable nested descriptor, omitted dual-media negotiation and the initialized notification, parsed only JSON, retained expired transport sessions, and required callers to unwrap handoff results before awaiting them. Those gaps could split identity across catalog and SDK surfaces or fail against conforming Streamable HTTP servers even though Mousecat's own JSON endpoint passed.

*Resolution:* A17 now projects every SDK descriptor from the canonical adapter catalog, freezes established identity, negotiates JSON and SSE, sends `notifications/initialized`, correlates response ids, invalidates 404 sessions without replay, preserves full malformed-result diagnostics, and recursively accepts framework-handoff wrappers. Six focused SDK tests and the full gate cover the corrected contract.

## F-052 | 2026-07-10 22:17 UTC / 15:17 PDT | GitOps ordering was incorrectly propagated into decision access

*Severity:* Critical

*Finding:* The runtime rejected later interactions and non-prefix items, while the graphical surface exposed only the oldest item. Expanded mode stretched that same editor and separated sessions into passive context, so twelve actionable decisions remained hidden behind sequential advancement. This contradicted Mousecat's purpose as a cross-harness, high-bandwidth decision surface and conflated immutable chronology with response eligibility.

*Resolution:* A18.3 removes interaction and item-prefix gates, adds a pending `deferred` state, exposes every actionable interaction in the operator snapshot, and renders a directly navigable docket grouped by host and session. Compact mode remains focused; expanded mode shows the full control plane. Review hardening reserves defer for the graphical boundary, rejects caller-authored terminal status, and preserves drafts across deferral. Tests prove cross-interaction responses, non-prefix responses, defer-and-return completion, complete snapshot visibility, operator-only mutation, and draft retention.

## F-053 | 2026-07-10 22:58 UTC / 15:58 PDT | Provider manifests were descriptive rather than authoritative

*Severity:* High

*Finding:* The provider runner delegated schema validation and write confirmation to individual compilers, detected secrets only by field name, returned successful provider JSON unchanged, and allowed argument-builder or runner rejection to escape normalized outcomes. An injected adapter could therefore execute an unconfirmed write or return credential material despite advertising stricter manifest boundaries.

*Resolution:* A18.5 centralizes schema, confirmation, and secret enforcement in the runner, recursively redacts provider output, normalizes execution-stage failures, and adds adversarial tests using an injected provider that deliberately omits compiler-side confirmation.

## F-054 | 2026-07-10 23:06 UTC / 16:06 PDT | Generic delegation would inherit integration execution

*Severity:* High

*Finding:* The first composition draft classified `cli-json` as a ready connector transport globally. Because asynchronous delegation invokes the generic connector boundary directly, configured provider capabilities could execute outside the intended `mousecat.invoke` entrypoint and its event and result contract.

*Resolution:* A18.6 composes manifests, status, discovery, and routes while keeping provider execution explicitly unavailable. Delegation rejects integration-adapter routes before scheduling, including when an embedding injects its own connector invoker. Execution activation remains a separate bounded unit.

## F-055 | 2026-07-14 07:54 UTC / 00:54 PST | The nonlinear operator still worked through a single-card bottleneck

*Severity:* High

*Finding:* Mousecat exposed a complete nonlinear docket but retained one selected card as the working surface, duplicated navigation across a rail and list, and changed information architecture by viewport. That presentation technically allowed direct access while materially contradicting DR-046's high-bandwidth simultaneous-decision intent.

*Resolution:* A18.9 replaces the selected-card composition with one responsive decision wall. Every decision remains visible, explicit lineage supplies semantic sections, search and outline navigation preserve orientation, drafts survive live reconstruction with focus and scroll continuity, and prepared arbitrary subsets use the existing per-interaction response contract. Recursive review closed collision, accessibility, performance, and append-only governance defects without expanding browser authority.

## F-056 | 2026-07-14 09:10 UTC / 02:10 PDT | Simultaneous access remained visually uniform and operationally weak

*Severity:* High

*Finding:* A18.9 exposed all 125 decisions but rendered near-uniform cards, treated any dirty input as prepared, and sent a prepared set directly from the header. A maximal valid set could also exceed the server request ceiling, keyboard users faced 125 atlas stops, and live rebuild or reset could strand focus.

*Resolution:* A18.9.1 adds source-owned visual grammar, a lineage decision atlas with roving focus, recommendation and provenance anatomy, truthful ready and incomplete drafts, a focus-stable review drawer, size-bounded returns with explicit partial semantics, in-flight locking, exact namespaced skill resolution, and post-mutation focus recovery. Two-stage correctness, accessibility, and platform-coherence review found no remaining Critical or High findings.

## F-057 | 2026-07-16 22:13 UTC / 15:13 PST | Semantic world envelopes were initially promoted as physical geometry

*Severity:* Critical

*Finding:* The first native transfer extruded city, town, route, forest, and interior map envelopes into colliding boxes. The Azalea envelope contained the player spawn, so a successful load could still begin inside a massive slab. The same pass allowed asynchronous initial terrain collision, emitted coplanar dry shoreline vertices, and omitted the packaged vertex-color material and export-receipt authority check.

*Resolution:* A19.0 separates semantic envelopes from physical primitives, hides diagnostic markers by default, cooks near-spawn collision synchronously, clips water along wet-depth boundaries with an explicit 1.5 centimetre surface clearance, stages the required vertex-color material, and verifies sampled-source receipts before world promotion. Editor, Game, full-cook, authoritative packaged boot, and fail-closed packaged tests pass. Detailed map and portal realization remains an explicit later native scope rather than fabricated geometry.

## F-058 | 2026-07-16 23:38 UTC / 16:38 PST | Coarse map realization discarded geography and detached surfaces from terrain

*Severity:* High

*Finding:* The first detailed map-realization pass rejected a whole source cell when any of its sampled area overlapped a higher-priority map, which removed partially overlapped exterior doors and opened oversized seams. Mapped floors and water were emitted as four-metre patches over a two-metre terrain lattice, so one flat patch could span multiple rendered heights. Most mapped water also used the opaque surface fallback instead of the cooked water material, and co-located reciprocal portals lacked source-map context.

*Resolution:* A19.1 derives ownership from the exact terrain lattice and emits only priority-owned two-metre subcells at their rendered heights while preserving exterior door and building anchors. Mapped water has its own chunks and loads the cooked `M_VoxelWater` asset by default. Active-map portal qualification, synchronous destination collision preparation, and reciprocal rearm complete traversal correctness. Independent mapping, visual-structure, and runtime reviews report no remaining Critical or High findings.

## F-059 | 2026-08-16 02:54 UTC / 19:54 PST | Project development was still trapped behind product-specific UI

*Severity:* High

*Finding:* Mousecat could mediate decisions, connectors, permits, and a native
project world, but it lacked a general contract for an agent and operator to
work directly against a target project's current model. The CA creator proved
the missing loop: exact saved-world search and composition were possible
outside RimWorld, while the first label-heavy candidate receipt still required
the operator to mentally translate metadata into geography. A renderer alone
would not solve authoring continuity, source freshness, staging, or write
authority.

*Resolution:* A19.2 defines the Project Workbench as a conversational,
adapter-driven development instrument. The design separates project-owned
schemas from Mousecat continuity, classifies representation evidence per layer,
and distinguishes observe, draft, staging, and source-write effects. The first
source validators and six CA-shaped contract tests are live. Runtime adapter
registration, connector-backed reads, representation delivery, invalidation,
and project staging remain explicit subsequent boundaries.

## F-060 | 2026-09-22 04:38 UTC / 21:38 PDT | ML review hid the decision's causal role

*Severity:* High

*Finding:* The decision wall first hid the literal example, then a concrete field panel exposed the record while still requiring the operator to reconstruct where it sat in the ML pipeline, how it could affect play, and what precedent approval set. In the Speakeasy case there was no operator-owned precedent at all: repository review could settle the mechanical person-to-claim join. Traceable evidence and artifact effects did not make the proposed ruling narratively coherent.

*Resolution:* A19.3 requires the source-owned `mousecat.ml-review/1` record to carry the human situation, system role, ordered causal path, player impact and decision precedent before the input, proposed learning, effects, exclusions and evidence. The wall renders that story first in both the open card and prepared-return review. Governance keeps mechanical evidence without a consequential operator-owned precedent outside the queue. Strict validation, invocation fingerprinting, search coverage and sensitive redaction keep the context bound to a real ruling without giving Mousecat inference authority.

## A19.7 - Action authority and source hygiene closure

The floor treated action-defined labels as permit ids and could not describe the
workbench adapter-owned operation permit. Catalog entries now use action-specific
authority. The checker validates action completeness and scopes the dynamic
permission reference to workbench operation dispatch. Native packaged output was
also being scanned as proposed source; it is now ignored in place. A historical
receipt exposed an absolute workstation path only in unhashed metadata: that
location is repository-relative, with the decision payload hash unchanged.

## A19.8 - Scenario facts needed a spatial review primitive

The existing ML review record could describe a situation but could not render
people, places and changing personal information. The shared optional scene
contract now exposes those caller-supplied facts with provenance and an explicit
decision horizon. It does not infer movement, reception, knowledge or outcomes.

## A19.9 - A single current frame concealed activity and stale-session state

The native route showed one large current image and a small secondary strip.
That made activity changes hard to compare at speed, left no compact way to
inspect perceptual state over the pixels, and could leave a completed session
selected while a successor started. Treating every inspection sample as current
with every retained frame would also have asserted a timing relationship the
producer did not establish.

The native contract now carries up to four bounded retained activity frames and
optional source-timed overlays. The client renders one equal adjustable panel
grid, independent screen visibility and four minimal overlay switches. A stable
view follows its successor only after the successor has a complete frame, and
each overlay reports its lag or remains absent when sampled after the pixels.

## F-061 | 2026-09-27 19:41 UTC / 12:41 PDT | The first observatory displaced the world and expired its own controls

*Severity:* High

*Finding:* The first equal-panel surface placed dense state cards over the native
pixels and made the person inspector a permanent second column. It also equated
three-second frame freshness with command liveness, so ordinary delivery delay
or a deliberate pause disabled control, and it kept visible age timers advancing
after a run ended. The ended-session successor loop continued at ten polls per
second even when no successor existed.

*Resolution:* A19.9.1 moves bounded telemetry beneath each image, makes the
inspector collapsible with persistent client preferences, separates delayed
frames from disconnection, preserves Resume for an explicit pause, freezes final
relative timing and stops its age interval, and backs ended-session successor
discovery down to one poll per second.

## F-062 | 2026-09-27 20:07 UTC / 13:07 PDT | Moving telemetry did not make screen information legible

*Severity:* High

*Finding:* A19.9.1 interpreted non-occlusion as moving telemetry below the image.
It supplied no opacity control and retained a flat diagnostic stream in the
person inspector. The resulting surface consumed separate vertical space while
leaving raw version, belief, role, activity, reason, position, life state,
location and memory lines without useful visual hierarchy.

*Resolution:* A19.9.2 places telemetry within its source image as one persisted
0-100% alpha layer, including a true zero state, while preserving independent
group selection. The inspector projects synopsis lines, section rows, source
metadata, events and cognition into distinct role, fact, provenance, timing,
model and evidence structures, with immediate person state first.
