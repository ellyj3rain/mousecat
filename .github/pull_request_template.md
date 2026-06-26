## Batch

| Field | Value |
|---|---|
| Batch | `[A#]` |
| Version | `x.y.z` |
| PR shape classifier | `pr-shape-clear / pr-shape-signals` |
| Merge strategy | `squash / rebase / merge-commit / revert-pr / stacked-pr` |
| Merge classifier | `default-squash / split-required / ratified-rebase / protected-rollback / ...` |

## Verification

- [ ] `npm run pr:ready`
- [ ] `npm audit --audit-level=high`
- [ ] PR chronology gate is clear: no lower-number, open, non-draft PR targets this base branch
- [ ] PR shape gate is clear or operator-ratified: apply `mousecat:ratify-large-diff`, `mousecat:ratify-surface-span`, `mousecat:ratify-missing-companions`, or `mousecat:ratify-test-gap` only after operator review
- [ ] Merge strategy was classified; if GitHub rejects the expected method, stop for operator ratification instead of choosing another strategy
- [ ] No secrets, env files, local DBs, dependency folders, build outputs, local configs, or run traces are tracked
- [ ] `BATCH_LOG.md`, `DECISION_REGISTRY.md`, and `FINDINGS.md` were appended only

## Notes

Summarize the operator-facing behavior change, boundary impact, and any environment-gated checks.
