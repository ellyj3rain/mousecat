| Document | Mousecat Architecture |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 01:17 UTC / 18:17 PST |
| Status | ACTIVE - system architecture. |

# Mousecat Architecture

Mousecat is a single Node.js package with a stdio MCP boundary, CLI surface, source-owned catalogs, and an in-memory runtime suitable for local host integration.

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
IDE widgets and CLI views
```

## Public Tool Namespace

| Tool | Contract |
|---|---|
| `mousecat.ask` | Returns a structured question and button set for host rendering. |
| `mousecat.session` | Starts, snapshots, and reconstructs working-session state. |
| `mousecat.queue` | Enqueues, lists, answers, and ratifies decision chains. |
| `mousecat.visualize` | Returns buttons, queue, permit, route, boundary, and event snapshots. |
| `mousecat.route` | Resolves an upstream route plan without executing it. |
| `mousecat.invoke` | Guards upstream invocation behind permit and route checks. |
| `mousecat.status` | Reports runtime health and configured upstream posture. |
| `mousecat.credentials` | Stores credential references only, never secret values. |

## Source Layout

| Path | Responsibility |
|---|---|
| `src/core/catalog.mjs` | Atomic skills, skill frameworks, work permits, upstreams, tool boundaries, tool descriptors. |
| `src/core/config.mjs` | Default config and optional local config loading. |
| `src/core/runtime.mjs` | In-memory tool handlers, events, queues, credential references, and permit checks. |
| `src/mcp/server.mjs` | JSON-RPC stdio MCP server and testable request handler. |
| `src/cli.mjs` | CLI commands and MCP server entry point. |
| `test/` | Node test coverage for catalogs, runtime behavior, and MCP request handling. |

## Compatibility Model

Mousecat does not import upstream private runtimes. It records upstream descriptors and resolves route plans. Live invocation remains blocked unless a work permit and adapter implementation both allow the action.

Neo compatibility enters as data: skill frameworks, work permits, tool boundaries, provenance, audit events, and capability descriptors. Mousecat can consume Neo as an upstream and can expose Mousecat skill-framework data to Neo-shaped hosts.

## Runtime State

The first runtime is intentionally local and in-memory. Host-specific widgets can call `mousecat.visualize` repeatedly for a live snapshot. Future persistence belongs under a local generated state directory such as `.mousecat/`, which remains untracked.
