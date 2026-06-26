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
