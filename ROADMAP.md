| Document | Mousecat Roadmap |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 04:57 UTC / 21:57 PDT |
| Status | ACTIVE - project roadmap. |

# Mousecat Roadmap

## Current Milestone

`[A2]` corrects the open-source boundary: Mousecat remains public bridge code and connects to private/local Neo tools through a dynamically configured MCP connector.

## Forward Work

| Track | Purpose |
|---|---|
| Host widgets | Render `mousecat.visualize` snapshots inside JetBrains, Codex, Claude Code, Cursor, and CLI surfaces. |
| Upstream connectors | Expand external MCP connector support beyond stdio and keep tool discovery dynamic. |
| Private Neo bridge | Use ignored local config to connect to a private Neo MCP server without committing Neo internals. |
| Credential providers | Bind credential references to OS keychain, environment, and host-managed identity without returning secret values. |
| Persistent state | Add local untracked `.mousecat/` state for queues, audit events, route cache, and session dockets. |
| OSS release | Ratify package name, release boundary, contribution policy, and publication path. |

## Non-Goals For A1

Mousecat does not execute upstream tools automatically, store secrets, publish packages, expose private Z-Library state, or import Neo source.
