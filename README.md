| Document | Mousecat README |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 09:57 UTC / 02:57 PDT |
| Status | ACTIVE - participant entry point. |

# Mousecat

Mousecat is one MCP server for AI coding hosts that need structured operator interaction, governed workflow chains, live multi-agent visualization, and routed access to an AI tool ecosystem. Hosts see one tool namespace. Mousecat owns routing, skill-framework buttons, work permits, policy, credential references, connector status, and live status.

Mousecat is MPL-2.0, GZDS-governed open-source bridge code. It does not ship private Neo tools. A local ignored config can point Mousecat at a private Neo MCP server, then Mousecat discovers tools dynamically and forwards permitted calls at runtime.

## Quick Start

```powershell
npm test
node src/cli.mjs status
node src/cli.mjs connectors
node src/cli.mjs buttons
node src/cli.mjs mcp
```

For MCP hosts, start:

```powershell
node src/cli.mjs mcp
```

## PR Readiness

Mousecat is AI-native and GZDS-governed. Contributions are expected to satisfy the public readiness surface before review.

```powershell
npm run pr:ready
```

That command runs tests, GitHub classifier tests, runtime smokes against `.github/mousecat.ci.config.json`, governance floor, governance ceiling, doc currency, and strict hygiene. GitHub Actions runs the required `ci-verify` gate on push to `main` and on pull requests, then runs `npm audit --audit-level=high`. Pull requests also run chronology and PR-shape classifier gates, and CI uploads structured PR classification observations for review.

CodeQL, dependency maintenance, secret scanning, Node 20 compatibility, package dry runs, and read-only PR outcome observation are separate public governance/security surfaces. Protected checks are `ci-verify`, `node-20-compat`, `dependency-scan`, `secret-scan`, and `codeql`.

The server exposes:

| Tool | Purpose |
|---|---|
| `mousecat.ask` | Create structured operator interaction sessions with atomic items and button payloads. |
| `mousecat.session` | Start, snapshot, and reconstruct session dockets. |
| `mousecat.queue` | Manage Mass-Assault style decision queues, held items, and long-chain lineage. |
| `mousecat.visualize` | Return a live visualizer snapshot/event graph for IDE/app widgets. |
| `mousecat.route` | Resolve upstream route plans and availability. |
| `mousecat.bridge` | Read and summarize public upstream bridge contracts. |
| `mousecat.invoke` | Permit-gated upstream invocation and external MCP forwarding boundary. |
| `mousecat.status` | Report configured upstreams, permits, and runtime state. |
| `mousecat.credentials` | Register and inspect credential references without storing secret values. |

## First Surfaces

Mousecat ships with source-owned skill atoms for Crucible, Mass-Assault, and Total Recall. These atoms render as buttons that hosts can place in JetBrains widgets, Claude Code or Codex panels, Cursor surfaces, and CLI views. The same registry also defines skill frameworks, work-permit profiles, upstream descriptors, tool boundaries, interaction shapes, and visualizer-safe event streams.

## Private Neo Connector

Copy `mousecat.config.example.json` to ignored `mousecat.config.json`, enable `connectors.neo`, and point it at the local private Neo MCP server command. The checked-in example is disabled and uses placeholder paths. Use `node src/cli.mjs --config <path> <command>` to run a command against a specific public or local config.

```powershell
node src/cli.mjs connectors
node src/cli.mjs tools neo
node src/cli.mjs resources neo
node src/cli.mjs bridge neo
node src/cli.mjs invoke neo <neo-tool-name> profileId=tool-invocation example=payload
```

Dynamic discovery comes from the configured MCP server's `tools/list` and `resources/list` responses. `mousecat.bridge` reads the public `mousecat_bridge_contract_v1` resource and returns a sanitized summary with public routes, boundary classes, stale-runtime policy, and withheld-surface labels. Do not commit generated discovery output, local paths, credentials, or private tool schemas.

## Source Policy

Mousecat core source is licensed under MPL-2.0. The file-level copyleft posture keeps modifications to Mousecat source files open when distributed while allowing proprietary hosts, plugins, adapters, and local/private upstreams to integrate through public contracts. Runtime transcripts, private host state, credential values, Z-Library session state, upstream caches, and generated local artifacts stay out of Git.

## Read First

Read `CORE.md`, `ARCHITECTURE.md`, `GOVERNANCE.md`, `ROADMAP.md`, `SESSION_STATE.md`, and `AGENTS.md` before changing public tool names, connector semantics, permit semantics, credential policy, or skill-framework records.
