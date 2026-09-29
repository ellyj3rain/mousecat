# Third-party notices

Mousecat's own source is licensed under [PolyForm Perimeter 1.0.0](LICENSE).
That source-available license includes a noncompete restriction. Dependency
licenses retain their own terms.

| Component | Use | Included notice |
|---|---|---|
| Lucide 1.24.0 | Browser icons | [ISC and Feather-derived MIT text](licenses/lucide.txt) |
| Microsoft.Web.WebView2 1.0.4191.47 | Windows desktop browser host | [License](licenses/webview2-license.txt) and [notice](licenses/webview2-notice.txt) |
| Unreal Engine 5.8 | Optional native world client | Engine supplied separately under Epic's Unreal Engine license. Engine files are not part of the npm package. Native binary distributors must comply with that license. |

The two voxel material assets are authored by the repository's
`apps/mousecat-world/Tools/build_voxel_materials.py`. The public native-world
fixture is synthetic. Source-derived project exports remain local inputs and
carry their producer receipts; they are not bundled as redistributable examples.

The npm package includes this document and the complete dependency notice files.
Desktop builds copy them beside the executable. Updating a dependency requires
refreshing its notice from the pinned package.
