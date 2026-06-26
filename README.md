| Document | Mousecat README |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 01:17 UTC / 18:17 PST |
| Status | ACTIVE - participant entry point. |

# Mousecat

Mousecat is one MCP server for AI coding hosts that need structured operator interaction, governed workflow chains, live multi-agent visualization, and routed access to an AI tool ecosystem. Hosts see one tool namespace. Mousecat owns routing, skill-framework buttons, work permits, policy, credential references, and live status.

## Quick Start

```powershell
npm test
node src/cli.mjs status
node src/cli.mjs buttons
node src/cli.mjs mcp
```

For MCP hosts, start:

```powershell
node src/cli.mjs mcp
```

The server exposes:

| Tool | Purpose |
|---|---|
| `mousecat.ask` | Create operator questions with button payloads. |
| `mousecat.session` | Start, snapshot, and reconstruct session dockets. |
| `mousecat.queue` | Manage Mass-Assault style decision queues. |
| `mousecat.visualize` | Return a live visualizer snapshot for IDE/app widgets. |
| `mousecat.route` | Resolve upstream route plans and availability. |
| `mousecat.invoke` | Permit-gated upstream invocation boundary. |
| `mousecat.status` | Report configured upstreams, permits, and runtime state. |
| `mousecat.credentials` | Register and inspect credential references without storing secret values. |

## First Surfaces

Mousecat ships with source-owned skill atoms for Crucible, Mass-Assault, and Total Recall. These atoms render as buttons that hosts can place in JetBrains widgets, Claude Code or Codex panels, Cursor surfaces, and CLI views. The same registry also defines skill frameworks, work-permit profiles, upstream descriptors, and tool boundaries.

## Source Policy

Mousecat is prepared for open-source publication, but license ratification is still an operator decision. Until then, package metadata remains `UNLICENSED`. Runtime transcripts, private host state, credential values, Z-Library session state, upstream caches, and generated local artifacts stay out of Git.

## Read First

Read `CORE.md`, `ARCHITECTURE.md`, `GOVERNANCE.md`, `ROADMAP.md`, `SESSION_STATE.md`, and `AGENTS.md` before changing public tool names, permit semantics, credential policy, or skill-framework records.
