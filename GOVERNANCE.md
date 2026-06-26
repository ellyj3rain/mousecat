| Document | Mousecat Governance |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 01:17 UTC / 18:17 PST |
| Status | ACTIVE - operating discipline. |

# Mousecat Governance

Mousecat governs access to upstream tools by making permission facts visible before execution. Its purpose is to preserve capability while preventing ambient tool access, hidden credential use, and untracked operator decisions.

## Source of Truth

| Class | Files | Rule |
|---|---|---|
| Project identity | `CORE.md`, `README.md`, `ARCHITECTURE.md` | Update when the public shape changes. |
| Operating rules | `GOVERNANCE.md`, `AGENTS.md` | Update when repository discipline changes. |
| Runtime contract | `src/core/catalog.mjs`, `src/core/runtime.mjs`, `src/mcp/server.mjs` | Source-owned tool names, skills, permits, and boundaries. |
| Append-only history | `BATCH_LOG.md`, `DECISION_REGISTRY.md`, `FINDINGS.md` | Append entries only. Corrections supersede by new entry. |
| Version | `VERSION`, `package.json` | Keep package and root version aligned until publication policy changes. |

## Tool Boundary Discipline

`mousecat.route` may plan access. `mousecat.invoke` may not execute upstream work unless a matching permit, an enabled upstream, and an implemented adapter all agree. Missing adapters are structured boundary facts, not silent fallbacks.

## Credential Discipline

Mousecat stores credential references such as environment-variable names, OS keychain aliases, or host-managed identities. It does not store raw secrets, tokens, passwords, cookies, private keys, session databases, or Z-Library account state in source or runtime responses.

## Operator Interaction

Crucible-shaped decisions, Mass-Assault queues, and Total Recall dockets are first-class skill atoms. Hosts should render them as buttons and structured widgets instead of flattening them into ad hoc chat text.

## Open-Source Posture

The repository is prepared for open-source publication. License, package namespace, and remote publication remain operator-ratified decisions.
