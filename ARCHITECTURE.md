| Document | Mousecat Architecture |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 04:48 UTC / 21:48 PDT |
| Status | ACTIVE - system architecture. |

# Mousecat Architecture

Mousecat is a single Node.js package with a stdio MCP boundary, CLI surface, source-owned catalogs, an external MCP connector layer, and an in-memory runtime suitable for local host integration.

## Flow

```text
AI or agent host
        |
        | MCP
        v
    Mousecat
   /   |    \
Neo  GitHub  Z-Library
Codex Claude browser custom tools
private/local MCP servers via connectors
IDE widgets and CLI views
```

## Public Tool Namespace

| Tool | Contract |
|---|---|
| `mousecat.ask` | Returns a structured interaction session with atomic items, lineage, and button sets for host rendering. |
| `mousecat.session` | Starts, snapshots, and reconstructs working-session state. |
| `mousecat.queue` | Enqueues, lists, answers, holds, and ratifies decision chains. |
| `mousecat.visualize` | Returns buttons, interactions, queue, permit, route, boundary, public events, and live graph snapshots. |
| `mousecat.route` | Resolves an upstream route plan without executing it. |
| `mousecat.bridge` | Reads a public upstream bridge contract and returns a sanitized compatibility summary. |
| `mousecat.invoke` | Guards upstream invocation behind permit, route, connector, and adapter checks. |
| `mousecat.status` | Reports runtime health and configured upstream posture. |
| `mousecat.credentials` | Stores credential references only, never secret values. |

## Source Layout

| Path | Responsibility |
|---|---|
| `src/core/catalog.mjs` | Atomic skills, skill frameworks, work permits, upstreams, tool boundaries, tool descriptors. |
| `src/core/bridge-contracts.mjs` | Public bridge-contract ingestion and OSS-safe summaries. |
| `src/core/connectors.mjs` | External MCP connector summaries, route plans, tool/resource discovery, resource reads, and permitted forwarding. |
| `src/core/mcp-client.mjs` | Minimal JSON-RPC stdio MCP client used by external connectors. |
| `src/core/config.mjs` | Default config and optional local config loading. |
| `src/core/runtime.mjs` | In-memory tool handlers, events, queues, credential references, and permit checks. |
| `src/mcp/server.mjs` | JSON-RPC stdio MCP server and testable request handler. |
| `src/cli.mjs` | CLI commands and MCP server entry point. |
| `test/` | Node test coverage for catalogs, runtime behavior, and MCP request handling. |

## Compatibility Model

Mousecat does not import upstream private runtimes. It records upstream descriptors and resolves route plans. Live invocation remains blocked unless a work permit, enabled upstream, and configured external connector all allow the action.

Neo compatibility enters as an MCP bridge, not as embedded private source. The open repository ships a generic external-MCP connector. A local ignored `mousecat.config.json` can point `connectors.neo` at a private Neo MCP server. Mousecat then calls `tools/list` and `resources/list` for dynamic discovery, reads public bridge contracts through `resources/read`, and forwards permitted `tools/call` requests without committing Neo's tool catalog, schemas, prompts, governance internals, local paths, runtime traces, or model/provider maps.

The public Neo bridge resource is `mousecat_bridge_contract_v1`. Mousecat summarizes it as `mousecat.bridge.summary/1`: schema and version names, server method names, stale-runtime code, counts, public tool/resource/prompt names, skill buttons/routes, exported labels, withheld labels, and policy strings. Raw private handlers, local source paths, credentials, operator memory, runtime payloads, traces, and unregistered skills are outside the summary contract.

## Interaction And Visualization Contract

Operator interaction sessions use public Mousecat shapes: `decision`, `parameter`, `ratification`, `queue`, `review`, `freeform`, `ranking`, and `checklist`. Legacy button shapes such as `point`, `architecture`, `tree`, and `batch` normalize into those public shapes. The visualizer consumes public event categories and graph nodes for interactions, queue items, and upstream descriptors; private upstream payloads and secret values are not part of the graph contract.

## Runtime State

The first runtime is intentionally local and in-memory. Host-specific widgets can call `mousecat.visualize` repeatedly for a live snapshot. Future persistence belongs under a local generated state directory such as `.mousecat/`, which remains untracked.
