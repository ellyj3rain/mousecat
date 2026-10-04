| Document | Mousecat Governance |
|---|---|
| Version | 2.2.0.0-alpha |
| Timestamp | 2026-10-04 00:15 UTC / 17:15 PST |
| Status | ACTIVE - operating discipline. |

# Mousecat Governance

## Platform use and change authority

Calling Mousecat, registering a project and presenting a question use the shared
platform contract. Platform source and shared presentation change under an
explicit human request to modify Mousecat. A consumer's ordinary invocation is
not a platform development instruction. Hosts supply project context and review
material; Mousecat owns common navigation, rendering and response mechanisms.

Visual development follows the product goal in CORE.md. Choose representations
that make the subject's structure and relationships intelligible and support
direct exploration. Adapter-thin ownership governs domain facts and writes;
Mousecat owns sophisticated graphics, camera interaction and visual composition.
Review rendered desktop and mobile surfaces against the user's reference and
task: legibility, continuity, spatial orientation and usable interaction matter
alongside overflow and functional checks. Record what was actually observed.

Mousecat is governed by GZDS standards expressed as public, repository-local checks. It governs access to upstream tools by making permission facts visible before execution. Its purpose is to preserve capability while preventing ambient tool access, hidden credential use, and untracked operator decisions.

## Installed delivery

Authorized app implementation closes with delivery to the operator's installed
Mousecat and observed behavior there. The implementer owns checkout activation,
service and desktop alignment, preservation of existing state/configuration,
client reload or relaunch, and installed verification. This responsibility
persists across worktrees and handoffs. Publication and installed delivery each
retain their evidence; a preview receipt establishes preview behavior.

`npm run installed:check` is the local installed-runtime check. It refuses a
different desktop/service checkout, a stopped or stale runtime, a changed state
store and served assets that differ from the intended source. Live
process/listener identity and startup content fingerprints establish freshness
across preserved timestamps, configuration changes and dependency changes.
Native client interaction establishes that the open window loaded the update. Normal
CI runs source checks independently of the operator's installation.

## Source of Truth

| Class | Files | Rule |
|---|---|---|
| Project identity | `CORE.md`, `README.md`, `ARCHITECTURE.md` | Update when the public shape changes. |
| Operating rules | `GOVERNANCE.md`, `AGENTS.md` | Update when repository discipline changes. |
| Runtime contract | `src/core/catalog.mjs`, `src/core/connectors.mjs`, `src/core/delegation.mjs`, `src/core/integration-contracts.mjs`, `src/core/integration-adapters.mjs`, `src/core/integration-runner.mjs`, `src/core/mcp-client.mjs`, `src/core/project-workbench.mjs`, `src/core/skill-invocation.mjs`, `src/core/runtime.mjs`, `src/mcp/server.mjs`, `src/operator/server.mjs`, `src/sdk/` | Source-owned tool names, skills, connector and cancellation semantics, provider manifests and execution boundaries, project-adapter and development-representation contracts, delegation custody, intake normalization, permits, adapter render packets, executable SDK bindings, host command packs, host-state bindings, operator command dispatch, and boundaries. |
| Append-only history | `BATCH_LOG.md`, `DECISION_REGISTRY.md`, `FINDINGS.md` | Append entries only. Corrections supersede by new entry. |
| Version | 2.2.0.0-alpha | Keep the Kohai-aware root odometer and npm package projection aligned. |

## Version Discipline

Mousecat's root `VERSION` uses `major.minor.kohai.patch-maturity`. Package metadata uses the npm projection `major.minor.kohai-maturity` only when the root patch coordinate is zero. Caps are `MINOR=12`, `KOHAI=16`, and `PATCH=24`.

`minor` is reserved for runtime, API, or public operator-contract growth. `Kohai` is the third numeric coordinate and records structural governance, automation, classifier, hygiene, documentation, release-discipline, and OSS-readiness maturation that exceeds in-place repair without adding a new public runtime contract. `patch` records local repair. The floor blocks malformed root versions, cap violations, and package projection drift.

## Tool Boundary Discipline

`mousecat.skill`, `mousecat.widget`, and `mousecat.ask` may request operator input. `mousecat.skill` accepts built-in or registered mapped-seam skills, rejects raw transcript fields, and capability-gates await, replay, and contextual handoff. `mousecat.registry` accepts only permit-gated, namespace-owned, revisioned declarative descriptors; it cannot replace source ids or accept executable presentation code. `mousecat.delegation` and `mousecat.invoke` retain their separate tool-invocation permits and connector checks.

An HTTP cancellation notification is a request to stop, not proof that work stopped. A `202 Accepted`, local fetch abort, disconnected socket, elapsed grace interval, or later response to the original request leaves the upstream outcome unknown. Mousecat may record retry-safe cancellation only through the separately negotiated `mousecat/cancellation-ack` extension when its correlated status response guarantees `sideEffects=none`. All other interrupted work requires duplicate-side-effect acknowledgement before retry.

## Open-Source Connector Boundary

Mousecat ships bridge code, not private upstream implementation. Public source may describe connector protocols, config shape, permit checks, and runtime forwarding behavior. HTTP connector credentials are environment references such as `tokenEnv`, never literal token values. Public source must not commit private Neo tool catalogs, private schemas, proprietary prompts, internal governance records, local paths, credential material, or generated discovery output from a private endpoint.

Connector failures are boundary facts. An upstream MCP `MCP_RUNTIME_STALE` response is exposed as `connector-runtime-stale` with restart guidance, not as a generic invocation failure and not as a reason to embed or regenerate private upstream internals.

Integration providers remain source-owned declarative authority. Connector config binds an upstream to an active registry adapter and an absolute SHA-256-pinned executable; host-managed authentication enters only through allowlisted environment keys. `mousecat.invoke` requires the tool-invocation permit, the runner validates capability schemas and confirmation, and provider output is redacted before return. Delegation cannot execute integration capabilities.

`node scripts/neo-live-smoke.mjs --config mousecat.config.json` is the local live-connector smoke. It may read ignored private config, but its report is limited to readiness, counts, public names, permit forwarding status, and sanitized runtime identity/doctor fields. Private paths, raw payloads, credentials, generated discovery catalogs, and private Neo implementation details stay out of source.

## Credential Discipline

Mousecat stores credential references such as environment-variable names, OS keychain aliases, or host-managed identities. It does not store raw secrets, tokens, passwords, cookies, private keys, session databases, or Z-Library account state in source or runtime responses.

## Operator Interaction

Operator decisions, queues, review items, recalls, and handoff dockets are first-class interaction packets. Hosts summon Mousecat through MCP, supply semantically mapped seams with stable origin identity, await structured results, and continue inference from those results instead of flattening a mapped decision sequence into chat text.

Local state is generated runtime state, not source. If ignored config enables `state.enabled`, Mousecat may write session dockets, interaction packets, queues, bounded route-plan history, public events, and credential references under `.mousecat/`. That state must remain untracked, must not include credential values, must redact secret-shaped fields, must redact sensitive interaction prompts, options, and answers before disk writes, and must bound route-plan history with source-owned config.

Host adapters consume `mousecat.adapter.render-packet/1`, `mousecat.host-state-adapter/1`, `mousecat.host-command-pack/1`, and `mousecat.host-state.binding/1` records through the catalog, visualizer, MCP tool calls, or CLI. Mousecat owns mapped-intake normalization, interaction presentation and navigation, accessibility, response capture, local state, permits, and private-upstream withholding. Hosts own recall, seam mapping, option compilation, summons, result consumption, and subsequent model behavior.

The public SDK is a transport and contract adapter, not an inference engine. It may establish an MCP session, heartbeat fixed host identity, register declarative frameworks, invoke or await skills, and carry Mousecat-issued capabilities into contextual handoffs. It must not replay dispatched calls automatically, replace adapter-bound identity from per-call payloads, answer widget decisions, infer a fixed next skill, or persist plaintext namespace and continuation capabilities on Mousecat's behalf.

Loopback reachability establishes the current shared-user trust boundary. Work-permit profile ids express policy classes and do not authenticate a process; logical session ids express provenance and do not confer transport ownership. Mousecat must not be exposed to mutually untrusted clients without a separately ratified authenticated boundary.

The operator HTTP server is Mousecat's shared local control plane. It binds to loopback, requires a loopback Host authority, enforces same-origin writes, bounds exact JSON bodies, and exposes capacity-limited, idle-expiring Streamable HTTP MCP sessions over the same runtime as the browser. MCP callers may ask and await. Only the graphical command boundary may respond, hold, or defer; any open or deferred item may be targeted independently. Shutdown, disconnect, deletion, and cancellation release active waiters.

The graphical client is one responsive decision wall over the shared runtime. It presents every open or deferred item simultaneously and derives its decision atlas and card groups only from explicit source lineage and ordinals. Source-owned recommendation metadata and literal provenance may shape presentation; Mousecat does not infer importance, pins, relationships, health, or topology. Operator edits remain local drafts until an individual return or reviewed prepared return crosses the existing command boundary. Prepared sets validate continuously, lock while returning, and split into bounded per-interaction requests whose partial-commit semantics remain visible. Deferral preserves the caller wait and original chronology; held work is terminal when no actionable items remain. Typed values stay structured, redacted work is non-answerable, and quiet polling preserves drafts and focus. Invocation, credential mutation, arbitrary tool names, inferred topology, and raw delegated results remain outside the browser command boundary.

Concrete ML review context is source-owned decision evidence. A caller may supply the versioned bounded record only when it can state the human situation, system role, ordered causal path, player-visible impact, precedent set by the answer, actual input, proposed learning, approval effects, remaining exclusions, and evidence. The precedent must identify a consequential policy or behavior the operator actually owns; a mechanical receipt with no such consequence stays outside the decision queue. Mousecat validates, fingerprints, displays, searches, and redacts the record; it does not infer missing context, turn confidence into fact, or treat approval as authority over an effect the record does not name. Prepared-return review repeats the context so the operator can inspect what the selected response will govern.

## Project Workbench Discipline

Project adapters preserve the target project's schema and authority. A
descriptor may identify connector capabilities and declarative representation
contracts; it may not contain executable rendering code, secret values, private
paths, or an invented generic replacement for the project model. Observe,
draft, staging, and source-write effects remain distinct. Every write declares
both a Mousecat permit and the owning project's authorization boundary.

Development representations classify every layer as source fact,
deterministic projection, derived summary, illustration, or unknown. The
classification, source vector, producer revision, and unresolved state remain
visible to every client. A client may change presentation but cannot upgrade
evidence, make a draft current, or claim source success without a linked source
receipt. Source revision drift invalidates affected representations and drafts
rather than silently refreshing their authority.

## PR Readiness

Mousecat is AI-native, not artisanal. Branches must satisfy `npm run pr:ready` before review. PR readiness is the public contribution gate for tests, smokes, GZDS-style floor checks, ceiling coherence checks, doc currency, the PR documentation runner, and strict source hygiene. GitHub Actions and Open Ground GitLab rerun the same source-owned surface.

AI-assisted changes must leave the repository auditable: source truth, docs, ledgers, package metadata, and runtime catalogs must agree before a pull request is considered ready.

Pull requests are classified before review. Chronology blocks ready PRs behind older non-draft PRs on the same base. Shape classification blocks generated or local output, routes oversized or wide-surface changes to operator ratification, and requires governance-shaped changes to carry append-only ledger companions.

The PR documentation runner is a clean-room, repository-local check. It verifies the canonical doc-pack is present, substantive source changes carry `BATCH_LOG.md`, append-only ledgers were appended rather than rewritten, documented repository paths resolve, and PR or commit titles carry a batch prefix. It evaluates paths and diffs, not contributor identity.

## Public GitLab Runner Discipline

The Open Ground GitLab lane is source-owned in `.gitlab-ci.yml`. It runs `ci-verify`, merge-request shape classification, Node 20 compatibility, dependency scanning, and package dry run on the dedicated `open-ground-local-podman` group runner. Jobs require both `zero-local` and `open-ground` tags. Public Open Ground work must not borrow a runner attached to a private group.

CI images must contain every executable required by the repository checks. The slim Node images omit `git`, so jobs that run strict hygiene or PR-shape classification install `git` and CA certificates explicitly before invoking those checks. A configured lane is not considered operational until a remote pipeline proves the runner executed every required stage successfully.

## Local Hook Discipline

`npm run hooks:install` installs Mousecat-owned `commit-msg`, `pre-commit`, and `pre-push` hooks into the local checkout. `commit-msg` requires a governed batch prefix unless Git is generating a merge, revert, fixup, or squash message. `pre-commit` runs governance floor, governance ceiling, docs currency, PR documentation, and strict hygiene checks. `pre-push` runs `npm run pr:ready` and `npm audit --audit-level=high`.

Hooks are local checkout enforcement, not a substitute for GitHub protected checks or Open Ground merge pipelines. Remote CI remains authoritative for review; hooks reduce split-brain drift before changes leave the workstation.

## GitOps Observation

Mousecat CI emits structured governance observations as artifacts. PR-shape records use `mousecat.gitops.pr-classification/1`; PR and workflow outcomes use `mousecat.gitops.pr-outcome-observation/1`. These records are audit evidence for maintainers and future automation. They do not grant merge authority, execute private connectors, publish packages, or write back to `main`.

`ci-verify`, `codeql`, `dependency-scan`, `secret-scan`, and `node-20-compat` are the protected check names for public and private downstream repositories. The `secret-scan` check runs the pinned open-source Gitleaks CLI directly. Publication, auto-merge, and durable outcome-corpus promotion require explicit operator ratification before secrets or write tokens are introduced.

## License Posture

The repository is licensed under PolyForm Perimeter 1.0.0. The `LICENSE` file is the source of truth for the full terms and required notice. Package metadata uses `SEE LICENSE IN LICENSE` because PolyForm Perimeter is carried as the in-repo license text rather than an SPDX expression.

Package namespace, remote publication, and any later license-policy supersession remain operator-ratified decisions.
