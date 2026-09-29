# Mousecat World - native Unreal runtime

`MousecatWorld` is the standalone UE 5.8 runtime for World One. It is not a WebView and does not import the browser renderer. The checked-in project validates receipt-bound world data, decodes source maps and traversal, builds streamed voxel terrain and mapped places, realizes paired interior portals, and supplies a human-scale operator with a third-person keyboard/controller camera entirely from C++.

## Open and run

Open `MousecatWorld.uproject` with Unreal Engine 5.8 and choose **Play Standalone**. No editor-authored map, Blueprint, material, mesh, animation, or input asset is required.

The current Windows Development package launches from the local Windows executable in the ignored Artifacts build directory.

The public default is `Content/MousecatWorld/Generated/synthetic-smoke.world-manifest.json`,
an explicit receipt-free procedural smoke fixture. Project-derived exports and
their receipts are local inputs. Sampled-source manifests are promoted only when
a sibling `<base>.receipt.json` binds the selected filename, exact byte count,
SHA-256, world ID, first region ID and export semantic hash. A packaged build stages the generated directory as NonUFS data. Select another generated manifest at launch with a filename only:

```powershell
MousecatWorld.exe -MousecatWorldManifest=another-world.json
```

Directory traversal and non-JSON names are rejected. The loader also rejects missing files, files over 4 MiB, sampled-source receipts over 64 KiB, invalid JSON, the wrong schema, receipt mismatches, non-finite coordinates, unsafe counts, and out-of-bounds content before any world geometry is promoted. Unknown top-level and nested extension fields are tolerated in the source JSON but ignored and discarded by this runtime slice.

This is a native runtime foundation: authoritative terrain, hydrology, bounded collision streaming, movement, camera, receipt-verified ingestion, source-map semantics and traversal, mapped surfaces, component-built structures and vegetation, and paired interior portals are live. A prior local source-derived acceptance run decoded eight maps and paired interior portals. That private export is not bundled in public source; the synthetic fixture is a smoke check rather than proof of a project world.

Map, town, city, route, forest, gatehouse, and interior records remain semantic authorities rather than fake pins or colliding envelopes. Their decoded grids now drive two-meter terrain-aligned floors, paths, water, walls, structures, vegetation, ledges, and portal anchors. Higher-priority interiors and gatehouses suppress only overlapping lower-priority subcells, so partially overlapped exterior shells and doors remain intact. Walk boundaries stay spatially continuous; only paired included-map warp endpoints become runtime portals. A developer can still opt into small, non-colliding diagnostic locators with `-MousecatWorldShowSemanticMarkers`.

The shipped surface path uses readable vertex colors for terrain, mapped places, structures, and the operator, while mapped and terrain water use `M_VoxelWater`. `-MousecatWorldUseExperimentalLitMaterials` opts into the generated experimental surface material without changing the default water material. The current renderer is a structurally mapped voxel prototype, not the final high-realism art or mutable-world simulation target. Hierarchical near-field component detail, richer asset and material families, camera-driven interior cutaways, component mutation, agents, and persistence remain active development scope.

Exported World One manifests use `terrain.authority: "sampled-source"` and must provide exactly `columns * rows` finite row-major `heightSamplesMeters`; those samples exclusively determine solid ground height and are bilinearly interpolated for characters and objects. An optional same-size `waterDepthSamplesMeters` grid uses `0` for dry ground and positive depth for wet ground; the renderer creates non-colliding water surfaces only over wet cells at `ground + depth`. `synthetic-fallback` is explicit and exists only for this checked-in smoke manifest or a deliberate generated test world.

Coordinate conversion is fixed at the ingestion boundary: source vectors use `x,z` as the horizontal plane and `y` as up, in metres. Absolute source 3-vectors are serialized in `[x, y, z]` order and become UE `(x, z, y) * 100` centimetres. Terrain, region, landmark, and grove 2-vectors are source `[x, z]`.

## Controls

| Action | Keyboard and mouse | Controller |
|---|---|---|
| Move | WASD | Left stick |
| Look | Mouse | Right stick |
| Jump | Space | Face button bottom / A |
| Sprint | Left Shift | Left shoulder |

## Command-line build

From a Developer PowerShell for Visual Studio:

```powershell
& "C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat" MousecatWorldEditor Win64 Development -Project="$PWD\MousecatWorld.uproject" -Compiler=VisualStudio2022 -NoUBA -NoXGE -MaxParallelActions=1 -WaitMutex -NoHotReload
& "C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat" MousecatWorld Win64 Development -Project="$PWD\MousecatWorld.uproject" -Compiler=VisualStudio2022 -NoUBA -NoXGE -MaxParallelActions=1 -WaitMutex
```

Generated Unreal directories remain local through this app's `.gitignore`.
