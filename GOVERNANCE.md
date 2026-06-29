| Document | Mousecat Governance |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 09:57 UTC / 02:57 PDT |
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
| Version | `VERSION`, `package.json` | Keep package and root version aligned until publication policy changes. |

## Tool Boundary Discipline

`mousecat.widget` and `mousecat.ask` may request operator input. `mousecat.route` may plan access. `mousecat.invoke` may not execute upstream work unless a matching permit, an enabled upstream, and a configured external connector all agree. Missing connectors are structured boundary facts, not silent fallbacks.

## Open-Source Connector Boundary

Mousecat ships bridge code, not private upstream implementation. Public source may describe connector protocols, config shape, permit checks, and runtime forwarding behavior. Public source must not commit private Neo tool catalogs, private schemas, proprietary prompts, internal governance records, local paths, credential material, or generated discovery output from a private endpoint.

## Credential Discipline

Mousecat stores credential references such as environment-variable names, OS keychain aliases, or host-managed identities. It does not store raw secrets, tokens, passwords, cookies, private keys, session databases, or Z-Library account state in source or runtime responses.

## Operator Interaction

Operator decisions, queues, review items, recalls, and handoff dockets are first-class interaction packets. Hosts should render them as structured widgets instead of flattening them into ad hoc chat text.

## PR Readiness

Mousecat is AI-native, not artisanal. Branches must satisfy `npm run pr:ready` before review. PR readiness is the public contribution gate for tests, smokes, GZDS-style floor checks, ceiling coherence checks, doc currency, and strict source hygiene. GitHub Actions reruns the same surface.

AI-assisted changes must leave the repository auditable: source truth, docs, ledgers, package metadata, and runtime catalogs must agree before a pull request is considered ready.

Pull requests are classified before review. Chronology blocks ready PRs behind older non-draft PRs on the same base. Shape classification blocks generated or local output, routes oversized or wide-surface changes to operator ratification, and requires governance-shaped changes to carry append-only ledger companions.

## GitOps Observation

Mousecat CI emits structured governance observations as artifacts. PR-shape records use `mousecat.gitops.pr-classification/1`; PR and workflow outcomes use `mousecat.gitops.pr-outcome-observation/1`. These records are audit evidence for maintainers and future automation. They do not grant merge authority, execute private connectors, publish packages, or write back to `main`.

`ci-verify`, `codeql`, `dependency-scan`, `secret-scan`, and `node-20-compat` are the protected check names for the public repository. Publication, auto-merge, and durable outcome-corpus promotion require explicit operator ratification before secrets or write tokens are introduced.

## Open-Source Posture

The repository is licensed under MPL-2.0. Package namespace and remote publication remain operator-ratified decisions.
