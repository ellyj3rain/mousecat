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

Select sufficient checks for changed inputs and affected contracts, reusing
applicable evidence. `npm run pr:ready` is the protected pull-request readiness
surface: tests, runtime smokes, governance, documentation and source hygiene.
The PR documentation runner checks current documentation and append-only
companions. Remote required checks remain the publication constraint.

## Delivery means the installed app

Deliver authorized app changes to the operator's existing installation,
preserving configuration, persistent workspace and source registrations. Keep
service registration and desktop checkout binding aligned. `npm run
installed:check` checks that binding, runtime identity and served source when
those contracts change. Assess the aggregate app using actual interaction,
operator feedback and focused checks of the changed behavior.

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
