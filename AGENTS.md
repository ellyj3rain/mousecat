# Mousecat

Mousecat is an open-source-ready MCP control plane. It gives AI coding hosts one server and one namespace for operator interaction, governed decision queues, live visualization, routed upstream access, credential references, skill frameworks, work permits, and tool-boundary control.

## Operating Conventions

- Keep public MCP tool names stable unless the operator ratifies a breaking change.
- Treat skills as source-owned atomic records with button metadata, not prose-only instructions.
- Treat work permits as graphable policy facts. Do not flatten them into one Boolean allowed flag.
- `mousecat.invoke` must fail closed when an upstream adapter, permit, credential reference, or route is missing.
- Never store raw secrets, cookies, private keys, Z-Library account state, IDE private state, runtime transcripts, or generated local databases in source.
- Keep runtime exhaust under ignored local paths such as `.mousecat/`, `runtime/`, `traces/`, or `artifacts/local/`.
- Append to `BATCH_LOG.md`, `DECISION_REGISTRY.md`, and `FINDINGS.md`; do not rewrite historical entries.

## Verification

Before claiming the repo is ready, run:

```powershell
npm test
npm run smoke:status
npm run smoke:buttons
npm run smoke:mcp
```

## Current First-Class Skills

Mousecat must expose Crucible, Mass-Assault, and Total Recall as button-producing atomic skills today.
