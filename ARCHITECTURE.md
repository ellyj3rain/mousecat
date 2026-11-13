# Mousecat source responsibilities

| Source | Responsibility |
|---|---|
| `src/` | React views, presentation state, source freshness and evidence inspection. |
| `electron/` | Desktop window, trusted main-frame IPC, application lifecycle and explicitly selected external actions. |
| `engine/model.js` / `engine/model.mjs` | Shared interpretation of fleet readings. Human and machine consumers use the same meanings. |
| `engine/workspace.mjs` | Project-scoped health and active-source projection, preserving unknown observations. |
| `engine/work-observatory.mjs` | Presentation of attributed source work; no runtime transition or authority. |
| `service/engine.cjs` | Reviewed snapshot creation, destination/currentness checks, branch compare-and-swap and retained outcomes. |
| `service/plan-standing.cjs` | The finite approval lifecycle used by the real plan/apply consumer. |
| `service/remote-standing.cjs` | Bounded interpretation of configured remote names; it does not fetch or establish backup completion. |
| `service/operations/` and `service/mcp-server.cjs` | Bounded read-only source, catalog, service and fleet observations. |
| `service/continuity.cjs` | Explicitly configured source-declaration and Bulletin observations with bounded content, source and uncertainty. |
| `service/identity/` | Portable model identities and an optional compatible-engine adapter. |
| `service/engine.cjs` and `service/identity/model-identity.cjs` | Private audit/snapshot/attribution storage selected by `MC_DATA_DIR`. |

The renderer does not become an independent authority for a plan. The actual main frame and backend receive the selected action; the engine owns its reviewed content, destination and currentness. Command lists are not returned to a caller as executable authority. Later worktree changes remain separate from an already approved snapshot.

The public application does not ship a private language implementation, private controller, observation catalog or machine snapshot. The retired repository-law evaluator is not selected or reimplemented here. Requests to inject that unsupported evaluator are refused. Source declarations remain declarations; neither a record nor a configured remote proves runtime adoption or a successful backup.

The original application and its compatibility data remain separate from Marshmallow. Public repository and current product labels describe those roles; stored package/profile/IPC identifiers retain their upgrade meaning.
