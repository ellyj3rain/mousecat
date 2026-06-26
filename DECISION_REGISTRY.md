| Document | Mousecat Decision Registry |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 10:04 UTC / 03:04 PDT |
| Status | ACTIVE - append-only decisions. |

# Decision Registry

## DR-001 | 2026-06-26 01:17 UTC / 18:17 PST | Mousecat instantiated as a host-facing MCP organ

*Decision:* Mousecat is instantiated as an open-source-ready MCP control plane that exposes one host-facing namespace for operator questions, sessions, decision queues, visualization, routing, invocation boundaries, status, and credential references.

*Rationale:* The host should not need to understand every upstream MCP server, AI tool, IDE state source, or workflow engine. Mousecat centralizes the live operator interaction and policy boundary while preserving upstream specificity behind route plans and work permits.

*Origin:* Operator direction to make Mousecat Neo-compatible and immediately usable with Crucible, Mass-Assault, and Total Recall style skills across IDEs, Claude Code, Codex, and CLI workflows.

## DR-002 | 2026-06-26 01:17 UTC / 18:17 PST | Skills surface as buttons through source-owned atomic records

*Decision:* Mousecat records Crucible, Mass-Assault, and Total Recall as atomic skill records with button metadata, tool targets, permit requirements, and framework membership.

*Rationale:* IDEs and coding apps need fast operator actions, not only prose instructions. Button-shaped skill atoms let a host render real UI while still routing through the MCP and governance boundary.

*Origin:* Operator requirement that atomic skills surface as buttons and compose into skill-framework and work-permit libraries.

## DR-003 | 2026-06-26 01:33 UTC / 18:33 PST | Private Neo remains external to open-source Mousecat

*Decision:* Mousecat ships an external MCP connector contract for private Neo instead of committing Neo internals, GZDS implementation details, private tool schemas, generated discovery output, local paths, or model/provider catalogs.

*Rationale:* The open-source project should let AI hosts reach operator-owned Neo tools inside a development environment without disclosing the operator's private implementation. Dynamic MCP discovery preserves integrated functionality while keeping private implementation details outside the public repository.

*Origin:* Operator correction that Mousecat should be a bridge or MCP connection that can update regularly and let local AI hosts utilize Neo tools, not a public dump of private Neo intelligence.

## DR-004 | 2026-06-26 04:40 UTC / 21:40 PDT | Operator chains are Mousecat interaction sessions

*Decision:* Mousecat represents longer governed operator workflows as interaction sessions with stable `sessionId`, `interactionId`, optional parent lineage, public interaction shapes, constraints, item statuses, and visualizer-safe events.

*Rationale:* AI coding hosts often cannot surface deep chains of atomic questions. Mousecat keeps those chains modular and host-agnostic while preserving enough structure for skills, queues, replay, and live visualization.

*Origin:* Operator direction that Mousecat should be a portable augmentation plane for AI coding apps, not only a single host UI gate.

## DR-005 | 2026-06-26 04:48 UTC / 21:48 PDT | Bridge contracts are public resource reads

*Decision:* Mousecat reads upstream compatibility contracts through MCP resources and summarizes them separately from tool invocation.

*Rationale:* Bridge contracts describe compatibility, policy, route shape, and stale-runtime handling. They should be observable without a tool-invocation permit and without executing private upstream behavior. Runtime tool calls remain behind `mousecat.invoke`.

*Origin:* Neo exposed `mousecat_bridge_contract_v1` as the public bridge contract for Mousecat consumption.

## DR-006 | 2026-06-26 04:57 UTC / 21:57 PDT | Mousecat uses MPL-2.0

*Decision:* Mousecat core source is licensed under MPL-2.0.

*Rationale:* Mousecat should remain usable by proprietary AI IDEs, coding apps, plugins, and local/private upstreams while keeping distributed modifications to Mousecat source files open. MPL-2.0 matches that file-level copyleft boundary better than permissive licensing or network/copyleft-heavy licensing.

*Origin:* Operator ratification of MPL-2.0 for the open-source posture.

## DR-007 | 2026-06-25 05:15 UTC / 22:15 PDT | OSS CI/CD uses GitHub Actions on the public verify surface

*Decision:* Mousecat's initial public CI/CD consists of a verify workflow exercising `npm run verify` (test + status/buttons/connectors/mcp smokes), a CodeQL analysis workflow, Dependabot config, and committed package-lock.json. All operate under default config (no private connector details) on ubuntu-latest.

*Rationale:* Transparent, reproducible gates for contributors using existing scripts. Standard GitHub-native security surfaces (code scanning, dep updates, secret scanning) without introducing private paths, secrets, or publication steps. Matrix on Node 20+ matches engines. Documentation and append-only records accompany the surface.

*Origin:* Operator mandate for Mousecat OSS CI/CD research pass on the mallowfluff-a2-oss-neo-connector branch; see-and-verify of the clean default runtime surface.

## DR-008 | 2026-06-26 09:57 UTC / 02:57 PDT | PR readiness is the public GZDS contribution gate

*Decision:* Mousecat uses `npm run pr:ready` as the public branch and pull-request readiness contract. The gate runs tests, runtime smokes, governance floor checks, governance ceiling checks, doc currency checks, and strict source hygiene before review. GitHub Actions reruns the same surface and adds named dependency and secret scanning.

*Rationale:* Mousecat is AI-native open source. Contributions must be auditable and discernible: source truth, docs, ledgers, package metadata, runtime catalogs, and policy boundaries need to agree before operator review.

*Origin:* Operator direction to adapt working GZDS contribution discipline into Mousecat instead of inventing a separate governance system.

## DR-009 | 2026-06-26 10:04 UTC / 03:04 PDT | Mousecat adopts portable PR classifiers

*Decision:* Mousecat uses source-owned PR chronology and PR-shape classifiers in its GitHub pull-request path. Shape classification blocks generated/local output, routes oversized or wide-surface changes to operator ratification, and requires governance-shaped changes to carry batch and decision companions.

*Rationale:* AI-native open source needs review surfaces that are legible before operator review. Neo's classifier scaffolding is applicable to Mousecat when adapted to Mousecat's public paths and boundaries.

*Origin:* Operator correction that the prior cross-reference did not deeply inspect Neo's newer governance classifiers and that Mousecat needs similar scaffolding for AI-native OSS development.

## DR-010 | 2026-06-26 18:05 UTC / 11:05 PDT | Mousecat CI emits governance observations before privileged automation

*Decision:* Mousecat adopts a stable `ci-verify` check, Node 20 compatibility check, named security checks, classifier trace artifacts, read-only PR outcome observation, and manual package dry runs as the public GitOps governance loop.

*Rationale:* Neo's current CI/CD posture shows that AI-native repositories need source-owned classifiers, durable evidence, protected check names, and policy visibility before automation can be trusted. Mousecat should inherit that discipline while remaining open-source-safe: observations are artifacts, private connector execution stays disabled in CI, and auto-merge or corpus-promotion tokens require later operator ratification.

*Origin:* Operator direction to assess Neo's new CI/CD/governance and integrate the stronger posture into Mousecat rather than merely report on it.
