| Document | Mousecat Governance |
|---|---|
| Version | 0.1.5.0-alpha |
| Timestamp | 2026-07-04 05:30 UTC / 22:30 PDT |
| Status | ACTIVE - operating discipline. |

# Mousecat Governance

Mousecat is governed by GZDS standards expressed as public, repository-local checks. It governs access to upstream tools by making permission facts visible before execution. Its purpose is to preserve capability while preventing ambient tool access, hidden credential use, and untracked operator decisions.

## Source of Truth

| Class | Files | Rule |
|---|---|---|
| Project identity | `CORE.md`, `README.md`, `ARCHITECTURE.md` | Update when the public shape changes. |
| Operating rules | `GOVERNANCE.md`, `AGENTS.md` | Update when repository discipline changes. |
| Runtime contract | `src/core/catalog.mjs`, `src/core/runtime.mjs`, `src/mcp/server.mjs` | Source-owned tool names, skills, permits, and boundaries. |
| Append-only history | `BATCH_LOG.md`, `DECISION_REGISTRY.md`, `FINDINGS.md` | Append entries only. Corrections supersede by new entry. |
| Version | `VERSION`, `package.json`, `package-lock.json`, `src/core/governance/version.mjs` | Keep the Kohai-aware root odometer and npm package projection aligned. |

## Version Discipline

Mousecat's root `VERSION` uses `major.minor.kohai.patch-maturity`. Package metadata uses the npm projection `major.minor.kohai-maturity` only when the root patch coordinate is zero. Caps are `MINOR=12`, `KOHAI=16`, and `PATCH=24`.

`minor` is reserved for runtime, API, or public operator-contract growth. `Kohai` is the third numeric coordinate and records structural governance, automation, classifier, hygiene, documentation, release-discipline, and OSS-readiness maturation that exceeds in-place repair without adding a new public runtime contract. `patch` records local repair. The floor blocks malformed root versions, cap violations, and package projection drift.

## Tool Boundary Discipline

`mousecat.widget` and `mousecat.ask` may request operator input. `mousecat.route` may plan access. `mousecat.invoke` may not execute upstream work unless a matching permit, an enabled upstream, and a configured external connector all agree. Missing connectors are structured boundary facts, not silent fallbacks.

## Open-Source Connector Boundary

Mousecat ships bridge code, not private upstream implementation. Public source may describe connector protocols, config shape, permit checks, and runtime forwarding behavior. Public source must not commit private Neo tool catalogs, private schemas, proprietary prompts, internal governance records, local paths, credential material, or generated discovery output from a private endpoint.

Connector failures are boundary facts. An upstream MCP `MCP_RUNTIME_STALE` response is exposed as `connector-runtime-stale` with restart guidance, not as a generic invocation failure and not as a reason to embed or regenerate private upstream internals.

## Credential Discipline

Mousecat stores credential references such as environment-variable names, OS keychain aliases, or host-managed identities. It does not store raw secrets, tokens, passwords, cookies, private keys, session databases, or Z-Library account state in source or runtime responses.

## Operator Interaction

Operator decisions, queues, review items, recalls, and handoff dockets are first-class interaction packets. Hosts should render them as structured widgets instead of flattening them into ad hoc chat text.

## PR Readiness

Mousecat is AI-native, not artisanal. Branches must satisfy `npm run pr:ready` before review. PR readiness is the public contribution gate for tests, smokes, GZDS-style floor checks, ceiling coherence checks, doc currency, the PR documentation runner, and strict source hygiene. GitHub Actions reruns the same surface.

AI-assisted changes must leave the repository auditable: source truth, docs, ledgers, package metadata, and runtime catalogs must agree before a pull request is considered ready.

Pull requests are classified before review. Chronology blocks ready PRs behind older non-draft PRs on the same base. Shape classification blocks generated or local output, routes oversized or wide-surface changes to operator ratification, and requires governance-shaped changes to carry append-only ledger companions.

The PR documentation runner is a clean-room, repository-local check. It verifies the canonical doc-pack is present, substantive source changes carry `BATCH_LOG.md`, append-only ledgers were appended rather than rewritten, documented repository paths resolve, and PR or commit titles carry a batch prefix. It evaluates paths and diffs, not contributor identity.

## Local Hook Discipline

`npm run hooks:install` installs Mousecat-owned `commit-msg`, `pre-commit`, and `pre-push` hooks into the local checkout. `commit-msg` requires a governed batch prefix unless Git is generating a merge, revert, fixup, or squash message. `pre-commit` runs governance floor, governance ceiling, docs currency, PR documentation, and strict hygiene checks. `pre-push` runs `npm run pr:ready` and `npm audit --audit-level=high`.

Hooks are local checkout enforcement, not a substitute for GitHub protected checks. CI remains authoritative for remote review; hooks reduce split-brain drift before changes leave the workstation.

## GitOps Observation

Mousecat CI emits structured governance observations as artifacts. PR-shape records use `mousecat.gitops.pr-classification/1`; PR and workflow outcomes use `mousecat.gitops.pr-outcome-observation/1`. These records are audit evidence for maintainers and future automation. They do not grant merge authority, execute private connectors, publish packages, or write back to `main`.

`ci-verify`, `codeql`, `dependency-scan`, `secret-scan`, and `node-20-compat` are the protected check names for public and private downstream repositories. The `secret-scan` check runs the pinned open-source Gitleaks CLI directly. Publication, auto-merge, and durable outcome-corpus promotion require explicit operator ratification before secrets or write tokens are introduced.

## License Posture

The repository is licensed under PolyForm Perimeter 1.0.0. The `LICENSE` file is the source of truth for the full terms and required notice. Package metadata uses `SEE LICENSE IN LICENSE` because PolyForm Perimeter is carried as the in-repo license text rather than an SPDX expression.

Package namespace, remote publication, and any later license-policy supersession remain operator-ratified decisions.
