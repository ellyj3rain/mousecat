# Mousecat

Mousecat is an open-source-ready MCP control plane. It gives AI coding hosts one server and one namespace for operator interaction, governed decision queues, live visualization, routed upstream access, credential references, skill frameworks, work permits, and tool-boundary control.

## Operating Conventions

- Keep public MCP tool names stable unless the operator ratifies a breaking change.
- Treat skills as source-owned atomic records with button metadata, not prose-only instructions.
- Treat work permits as graphable policy facts. Do not flatten them into one Boolean allowed flag.
- Treat upstreams such as Neo as external connectors. Do not commit private Neo internals, proprietary schemas, local paths, generated route catalogs, or model/provider maps into this repository.
- `mousecat.invoke` must fail closed when an upstream connector, permit, credential reference, or route is missing.
- Never store raw secrets, cookies, private keys, Z-Library account state, IDE private state, runtime transcripts, or generated local databases in source.
- Keep runtime exhaust under ignored local paths such as `.mousecat/`, `runtime/`, `traces/`, or `artifacts/local/`.
- Append to `BATCH_LOG.md`, `DECISION_REGISTRY.md`, and `FINDINGS.md`; do not rewrite historical entries.

## Verification

Before claiming the repo is ready (or submitting a PR), run:

```powershell
npm run pr:ready
```

This runs the complete AI-native readiness surface: tests, GitHub classifier tests, runtime smokes, GZDS-style governance floor, governance ceiling, docs currency, and strict hygiene.

GitHub CI executes the same `npm run pr:ready` (with audit) through the `ci-verify` check on every push/PR. Pull requests also run chronology and PR-shape classifier gates before review, and the outcome observer records read-only GitOps evidence as artifacts. Smoke scripts use `.github/mousecat.ci.config.json` so local ignored connectors do not affect public readiness. See the PR readiness section in README.md.

Targeted smoke commands remain available for local diagnosis.

## Current First-Class Skills

Mousecat must expose Crucible, Mass-Assault, and Total Recall as button-producing atomic skills today.
