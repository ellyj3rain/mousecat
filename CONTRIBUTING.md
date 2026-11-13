# Contributing to Mousecat

Start from the current source, [architecture](ARCHITECTURE.md) and behavior being changed. Keep a change coherent enough to review with its consumer, source ownership and detecting evidence. Preserve other contributors' work and the user's private state.

Run `npm run build` for renderer or build-contract changes, and `npm test` for affected behavior. The tests use temporary sources and synthetic observations. Never point tests at a real project or account to obtain a passing result. An installed desktop, rendered result and source check have different evidence; state which was observed.

A source or dependency change should include the relevant currentness, refusal, uncertainty and recovery cases. Avoid equivalent reruns when exact input evidence remains applicable. Real regression findings justify their focused checks. Do not restore automatic rollback or weaken the approved-snapshot boundary to make a test pass.

Keep the public tree and its proposed history free of credentials, personal information, private operational details, unsuitable content and undisclosed designs. Do not append conversation dumps or machine snapshots to project documentation. Use neutral synthetic examples and preserve required third-party notices. Provider names belong only where technical compatibility or required attribution calls for them; commits and project-facing authorship identify the human and developed system.

Contributions must be offered under the project's [PolyForm Perimeter license](LICENSE) with appropriate source rights. The package's `private` flag prevents accidental registry publication; repository publication and an installed application release retain separate decisions.
