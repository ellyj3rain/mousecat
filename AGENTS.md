# Mousecat

Mousecat is a source-available MCP normalization plane. It gives AI coding hosts one server and one namespace for operator interaction, governed decision queues, live visualization, routed upstream access, credential references, skill frameworks, work permits, and tool-boundary control.

## Operating Conventions

- Keep public MCP tool names stable unless the operator ratifies a breaking change.
- Treat skills as source-owned atomic records with button metadata, not prose-only instructions.
- Treat work permits as graphable policy facts. Do not flatten them into one Boolean allowed flag.
- Treat upstreams such as Neo as external connectors. Do not commit private Neo internals, proprietary schemas, local paths, generated route catalogs, or model/provider maps into this repository.
- Treat `LICENSE` as PolyForm Perimeter 1.0.0 source truth. Do not reintroduce MPL-2.0 without a superseding decision record.
- `mousecat.invoke` must fail closed when an upstream connector, permit, credential reference, or route is missing.
- Keep Streamable HTTP MCP and the graphical operator on one loopback runtime. MCP callers may ask and await; only the graphical operator may answer or hold. Do not expose raw tool names, invocation, credential mutation, queue clearing, or raw delegated results across the browser boundary.
- Keep the graphical surface adapter-thin: render canonical operator snapshots and route every runtime write through an operator-safe source-owned command-pack template without duplicating reducers in browser code.
- Never store raw secrets, cookies, private keys, Z-Library account state, IDE private state, runtime transcripts, or generated local databases in source.
- Keep runtime exhaust under ignored local paths such as `.mousecat/`, `runtime/`, `traces/`, or `artifacts/local/`.
- Append to `BATCH_LOG.md`, `DECISION_REGISTRY.md`, and `FINDINGS.md`; do not rewrite historical entries.
- Treat Kohai as Mousecat's third numeric root version coordinate: `major.minor.kohai.patch-maturity`.

## Verification

Before claiming the repo is ready (or submitting a PR), run:

```powershell
npm run pr:ready
```

This runs the complete AI-native readiness surface: tests, GitHub classifier tests, runtime smokes, adapter render-packet and operator-host smokes, GZDS-style governance floor, governance ceiling, docs currency, the PR documentation runner, and strict hygiene.

Graphical changes also require browser interaction and layout checks at desktop and mobile viewports after the final diff is assembled.

For a local checkout, install and verify hooks once:

```powershell
npm run hooks:install
npm run hooks:check
```

GitHub CI executes the same `npm run pr:ready` (with audit) through the `ci-verify` check on every push/PR. Pull requests also run chronology, PR-shape classifier, and documentation-consistency gates before review, and the outcome observer records read-only GitOps evidence as artifacts. Smoke scripts use `.github/mousecat.ci.config.json` so local ignored connectors do not affect public readiness. See the PR readiness section in README.md.

Open Ground GitLab executes the same readiness surface through the root `.gitlab-ci.yml`. Public jobs require both `zero-local` and `open-ground` runner tags; they must not use a private-group runner. Jobs that execute Mousecat hygiene or PR-shape checks must install `git` inside the Node image because those checks inspect repository state.

Targeted smoke commands remain available for local diagnosis.

Validate the private Neo connector locally with:

```powershell
node scripts/neo-live-smoke.mjs --config mousecat.config.json
```

The config is ignored local state; do not commit private Neo paths, raw discovery payloads, credentials, or private tool schemas.

## Current First-Class Skills

Mousecat must expose Crucible, Mass Assault, and Total Recall as callable atomic skills today.

## Platform change authority

Using Mousecat, invoking its skills, registering a project or presenting questions
uses the existing shared platform contract. It does not authorize modifying Mousecat
source, shared layouts or skill semantics. Platform changes require an explicit
human request to alter Mousecat. Within that scope, improvements belong in the
shared source-owned platform; consumer-specific behavior stays in declared data
and project adapters.
