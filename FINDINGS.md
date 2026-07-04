| Document | Mousecat Findings |
|---|---|
| Version | 0.1.0 |
| Timestamp | 2026-06-26 04:48 UTC / 21:48 PDT |
| Status | ACTIVE - append-only findings. |

# Findings

No findings recorded yet.

## F-001 | 2026-06-26 01:33 UTC / 18:33 PST | Open-source boundary must not embed private Neo intelligence

*Severity:* High

*Finding:* A bridge repo can accidentally expose private implementation shape if it commits upstream-specific intelligence, generated tool catalogs, governance internals, local substrate metadata, or private paths.

*Resolution:* A2 implements a generic external MCP connector and records private Neo as a local ignored runtime endpoint. Public source owns the bridge, permits, and discovery protocol. Private Neo owns its tools.

## F-002 | 2026-06-26 04:40 UTC / 21:40 PDT | Host UI gates compress governed decisions

*Severity:* Medium

*Finding:* When an AI host can only ask one or a few questions at a time, skills compress real governed workflows into broader prompts. That loses atomicity, weakens provenance, and makes answer reuse harder.

*Resolution:* A3 adds interaction sessions and multi-item queue lineage so skills can emit structured chains through Mousecat while hosts render the chain however their UI allows.

## F-003 | 2026-06-26 04:48 UTC / 21:48 PDT | Bridge compatibility needs stale-runtime visibility

*Severity:* Medium

*Finding:* A long-lived upstream MCP process can report `MCP_RUNTIME_STALE` after its source changes. Hosts need to see that as compatibility state, not as an opaque invocation failure.

*Resolution:* A4 reads the public bridge contract through a fresh connector process and exposes the upstream stale-runtime code and update policy in `mousecat.bridge.summary/1`.

## F-004 | 2026-07-04 02:17 UTC / 19:17 PDT | Flat package versioning hid Kohai governance drift

*Severity:* Medium

*Finding:* Mousecat still treated root `VERSION` and `package.json` as identical three-coordinate package metadata. That flattened the Kohai tier and let governance automation maturation look like ordinary SemVer movement, leaving Mousecat behind the current Neo/GZDS version standard.

*Resolution:* A10.2 adds a Mousecat-owned Kohai-aware version primitive, moves root `VERSION` to `0.1.1.0-alpha`, projects package metadata to `0.1.1-alpha`, and gates the projection in `npm run pr:ready`.

## F-005 | 2026-07-04 02:26 UTC / 19:26 PDT | License gates still enforced the superseded MPL posture

*Severity:* Medium

*Finding:* Mousecat's governance floor and docs check still hardcoded MPL-2.0 as the required license, so the repository would reject the operator-ratified PolyForm posture even after the policy changed.

*Resolution:* A10.3 replaces the license text, updates package metadata, and changes the floor/docs gates to enforce PolyForm Perimeter 1.0.0 plus the in-repo required notice.

## F-006 | 2026-07-04 02:28 UTC / 19:28 PDT | Readiness commands were not locally hooked

*Severity:* Medium

*Finding:* Mousecat had a strong `npm run pr:ready` surface, but no source-owned way to install local Git hooks. A contributor or agent could skip the local floor until CI, recreating avoidable split-brain between workstation state and remote readiness.

*Resolution:* A10.4 adds a tested hook installer and installs local `commit-msg`, `pre-commit`, and `pre-push` hooks for batch prefix, governance, documentation, hygiene, PR readiness, and audit checks.

## F-007 | 2026-07-04 03:02 UTC / 20:02 PDT | Stale upstream MCP failures were too generic for host recovery

*Severity:* Medium

*Finding:* Mousecat could summarize a stale-runtime policy from a bridge contract, but a live upstream MCP `MCP_RUNTIME_STALE` response still arrived as a generic `connector-jsonrpc-error`. A host would know a connector failed, but not that the correct repair was to restart the upstream MCP process.

*Resolution:* A10.5 normalizes `MCP_RUNTIME_STALE` into `connector-runtime-stale` with `restartRequired: true` at the MCP client boundary and propagates the stale code through `mousecat.invoke`.

## F-008 | 2026-07-04 05:30 UTC / 22:30 PDT | Marketplace-action licensing broke private downstream secret scanning

*Severity:* Medium

*Finding:* The private `GroundZeroSolutions/mousecat` baseline run failed at `secret-scan` because `gitleaks/gitleaks-action@v3` requires a Gitleaks license for organization/private repositories.

*Resolution:* A10.6 installs and runs the pinned open-source Gitleaks CLI directly, preserving the named `secret-scan` gate across public upstream and private downstream repositories without adding secrets or paid-action coupling.
