| Document | Mousecat Core |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 01:17 UTC / 18:17 PST |
| Status | ACTIVE - project identity. |

# Mousecat Core

Mousecat is a host-facing MCP control plane. It normalizes upstream MCP servers, AI tools, operator-question workflows, live visualization streams, credentials posture, and tool-boundary policy behind one stable server.

## Identity

Mousecat is the organ between AI or agent hosts and the operator's tool ecosystem. A host sees one MCP server, one namespace, one widget stream, and one configuration surface. Mousecat owns upstream routing, profile selection, permission facts, availability, question queues, ratification flows, visualization events, redaction, provenance, and audit.

## Audience

Mousecat is for operators and builders using AI coding hosts such as JetBrains, Claude Code, Codex, Cursor, and command-line workflows. Its first value is making powerful workflows visible and governable while the user is actively working.

## First Components

| Component | Responsibility |
|---|---|
| MCP server | Exposes `mousecat.*` tools over JSON-RPC stdio. |
| CLI | Runs the server and provides local status, buttons, queue, and catalog checks. |
| Skill catalog | Records atomic skill buttons for Crucible, Mass-Assault, and Total Recall. |
| Skill frameworks | Groups atoms into reusable operator-decision, session-recall, and tool-boundary frameworks. |
| Work permits | Defines observer, operator-interaction, tool-invocation, and credential-steward permit profiles. |
| Router | Resolves upstream plans for Neo, GitHub, Codex, Claude, browser, Z-Library, JetBrains, Cursor, and custom tools. |
| Policy layer | Keeps invocation, credentials, redaction, provenance, and audit facts explicit. |

## Version

The repository starts at `VERSION` `0.1.0`.
