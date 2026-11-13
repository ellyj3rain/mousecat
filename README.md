# Mousecat

Mousecat is a local desktop control plane for the work across your projects. It brings source state, project health, model identity and reviewed development actions into one place. The useful question is what is actually present, what is at risk, and what can safely happen next. Each reading opens to the evidence behind it.

This is the application formerly called **Marshmallow Commons**. The interaction and observation application previously published as Mousecat is now **[Marshmallow](https://github.com/ellyj3rain/marshmallow)**. Marshmallow owns its operator interactions, workboard and project graph; Mousecat observes selected project sources and carries its own development-control responsibilities. Their sources and releases are separate.

## What you can use

| Surface | Behavior |
|---|---|
| Project workspace | Read selected repositories, branches, working changes, version agreement and source freshness. A non-Git source does not borrow an ancestor repository's identity. |
| Project detail | Inspect the source behind a health reading, compare current observations and see when information is unavailable. |
| Review and apply | Prepare a content- and destination-bound Git action, inspect it, then deliberately approve it. Concurrent changes, stale approval and unconfirmed effects remain explicit. |
| Model identities | Use a portable model manifest or an explicitly configured compatible engine registry. Unknown identities stay unknown. |
| Source continuity | Read selected work declarations and operator direction with their original sources, revisions and remaining obligations. Observation supplies no action authority. |
| MCP | Four read-only tools expose the same selected catalog, source observations, loopback reachability and live fleet interpretation to compatible clients. |

The app uses one React/TypeScript renderer, an Electron shell, a shared interpretation model, and a Node service. Its plan/approval lifecycle and remote-standing reducer are ordinary application code. A configured remote is not a verified backup. The unsupported owner-selected repository evaluator remains unavailable.

## Run from source

Use Node.js 22.12 or later and Git.

```sh
npm ci
npm run build
npm test
npm run dev:app
```

`npm run dev` runs the browser development view and its loopback service. `npm run dev:app` adds the Electron window. `npm run dist` produces the configured desktop package; packaging and installed behavior require their own checks. A source build is not an installed-host acceptance claim.

A private catalog selects which sources are observed. Copy [the portable example](service/operations/catalog.example.json) to `.local/operations.json`, set the Mousecat object's `root` to `".."` for that location, and add only the projects you intend to inspect. Set `MC_OPERATIONS_MANIFEST` to select another catalog. Paths are relative to the catalog file. Missing bindings remain unconfigured.

A separately configured observation service can supply machine readings through the existing pb-core interface. When that source is unavailable, the machine view shows empty portable defaults; the source workspace retains its own observation and freshness rules. Sample data never becomes a live health result.

For a trusted local MCP host:

```sh
npm run mcp:operations
```

The stdio server opens no network listener. Tools are `mc_catalog`, `mc_project`, `mc_services` and `mc_fleet`; `mc://` resources expose corresponding observations. They provide no apply, rollback, login or process-control operation. The desktop's reviewed action path remains separate.

## Changes stay bound to the reviewed work

An approved commit uses the exact private snapshot prepared for review and advances the selected branch only if its reviewed base still matches. Later worktree edits cannot enter that approved commit. A changed branch, destination or source is not silently accepted. Failed and uncertain effects retain their original record across restart; automatic rollback is retired. Repositories requiring signing or hooks are refused until those semantics have a selected snapshot adapter. Source observation also refuses selected paths requiring executable Git clean/process filters and repositories containing submodules; the current adapter disables filesystem monitors, external diffs and text conversion rather than executing repository-supplied integrations during preview.

Remote backup binds one reviewed push URL and the reviewed source commit OID to the selected destination branch. Multi-destination remotes and configured URL rewrites require a separately qualified adapter; a local bundle remains available. GitHub sign-in uses the selected `GH_PATH` or `gh` from PATH. The Windows terminal launcher reports whether the process started; other platforms complete `gh auth login` in their own terminal and refresh account status.

This release retains compatibility identifiers: the `marshmallow-commons` package/profile, `app.marshmallow.commons`, `mc_*` tools, `mc://` resources, `mmc:*` IPC and `MC_*`/`MMC_*` configuration. The application name is Mousecat. These stored identities keep an existing workspace distinguishable from Marshmallow's separate service and profile.

## Develop and contribute

[Architecture](ARCHITECTURE.md) maps the actual source. [Contributing](CONTRIBUTING.md) describes changes and checks. [Origin and release scope](ORIGIN.md) distinguishes this selected public source from preserved private history. [Ground Zero](https://github.com/ellyj3rain/ground-zero) and [Illuci](https://github.com/ellyj3rain/illuci) are independently maintained development-system and engine projects; configuration and source receiving determine any actual connection.

Mousecat is source available under [PolyForm Perimeter 1.0.0](LICENSE). Required dependency notices are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
