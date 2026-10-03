| Document | Mousecat Core |
|---|---|
| Version | 1.10.0.0-alpha |
| Timestamp | 2026-09-30 10:10 UTC |
| Status | ACTIVE - project identity. |

# Mousecat Core

Mousecat is a host-facing MCP normalization plane, nonlinear operator surface, native project world, and source-available bridge. It lets models in different harnesses request shared operator interactions, receive structured responses, mediate upstream capabilities, and work against a project's real model through source-bound development representations without bundling private implementations.

## Identity

Mousecat is the organ between AI or agent hosts and the operator's tool ecosystem. A host sees one MCP server, one namespace, one cross-session graphical decision surface, and one configuration surface. Mousecat owns mapped-seam normalization, interaction navigation, response capture, redaction, provenance, routing facts, and connector mediation. The calling model owns recall, semantic seam mapping, option compilation, interpretation, recursion, and the next action.

Mousecat does not ship private Neo tools or Ground Zero internal implementation knowledge. It ships the public connection layer: local configuration can point Mousecat at a private Neo MCP endpoint, Mousecat can discover that endpoint's tools dynamically, and permitted invocations can be forwarded at runtime.

## Audience

Each operator owns a personal workspace shared by their connected agents.
Desktop and browser are access paths to the same questions, plans, decisions and
history. Work remains available independently of the agent that brought it in.
Projects and skill frameworks provide their context through shared contracts;
Mousecat's platform identity and navigation remain its own.

Mousecat is for operators and builders using AI coding hosts such as JetBrains, Claude Code, Codex, Cursor, and command-line workflows. Its first value is making powerful workflows visible and governable while the user is actively working.

## First Components

| Component | Responsibility |
|---|---|
| MCP server | Exposes `mousecat.*` tools over headless stdio and the shared loopback `POST /mcp` endpoint. |
| CLI | Runs the MCP and operator-host servers and provides local status, buttons, adapters, host-state bindings, session dockets, queue, connector, and catalog checks. |
| Operator host | Owns one runtime shared by Streamable HTTP MCP callers and graphical operator commands. |
| User service | Registers and manages that operator host at current-user login through native Windows, Linux, or macOS lifecycle mechanisms. |
| Graphical operator | Renders every open or deferred item in one scrollable decision wall, maps explicit lineage and ordinals through a decision atlas, exposes recommendation and provenance, presents source-owned narrative and concrete ML review context when supplied, validates local drafts, and reviews bounded prepared returns through the existing command boundary. |
| Skill invocation adapter | Routes built-in or registered operator-interaction skills through the canonical widget with deterministic chronology, opaque capabilities, lineage-rich returns, and contextual handoff. |
| Delegation coordinator | Releases long permitted upstream work from the originating response window, distinguishes acknowledged cancellation from unknown timeout, keeps raw custody caller-capability gated, and rejoins interpreted output through the existing widget. |
| Skill registry | Combines source-owned skills with permit-gated, namespace-owned runtime framework and presentation descriptors. |
| Skill frameworks | Provides Recursive Deliberation for Crucible, Total Recall, and Mass Assault plus registered contextual operator-interaction frameworks. |
| Work permits | Defines observer, operator-interaction, tool-invocation, and credential-steward permit profiles. |
| Host adapter harness | Publishes one generic contract with known descriptors for OpenAI, Anthropic, Google, xAI, Ollama, IDE, CLI, and custom consumers without splitting widget semantics. |
| SDK client | Gives harness authors executable heartbeat, framework registration, skill invocation, await, and contextual handoff helpers over the shared MCP endpoint. |
| Connector layer | Discovers and forwards to locally configured external MCP servers such as a private Neo endpoint. |
| Integration layer | Projects provider-neutral API or CLI manifests and executes recognized capabilities through permit-gated `mousecat.invoke`, pinned executables, and host-managed authentication. |
| Project workbench contract | Defines project adapters, bounded workbench sessions, domain-owned operations, layered development representations, exactness classes, drafts, and source receipts. The current runtime validates, registers and operates read/draft representations with source-vector receipts; stage-write and source-write remain closed. |
| Local state | Optionally persists recursive session dockets, queues, bounded route plans, public events, and credential references under ignored `.mousecat/` state. |
| Router | Resolves upstream plans for Neo, GitHub, Codex, Claude, browser, Z-Library, JetBrains, Cursor, and custom tools. |
| Policy layer | Keeps invocation, credentials, redaction, provenance, and audit facts explicit. |

## Version

The current root odometer is tracked in `VERSION`.
