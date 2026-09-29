# Mousecat release readiness

Version: 1.7.1.0-alpha. License: PolyForm Perimeter 1.0.0, source available.

The release contains the shared operator, SDK/MCP runtime, native client source,
synthetic project demonstration and complete dependency notices. The normal
workspace remains local; demo answers are explicitly synthetic.

| Verification | Evidence |
|---|---|
| Repository checks | `npm run pr:ready` covers tests, runtime smokes, governance, documentation and strict hygiene. |
| Dependency audit | `npm audit --audit-level=high`. |
| Known privacy boundaries | `npm run release:check` scans all local Git refs for excluded inputs and operator paths; `-- --tree` checks only the current tree and explicitly reports its weaker scope. |
| Browser contracts | `npm run test:browser` exercises four widths and all themes, evidence/history navigation, keyboard focus, preserved drafts and exact returns on isolated servers. |
| CodeQL | Private validation retains the analysis as a SARIF artifact without requiring private Code Scanning entitlement. Public runs upload findings to GitHub Code Scanning. |
| Package boundary | `npm pack --dry-run` includes demo inputs and license notices; private state and source-derived exports are outside the allowlist. |
| Credential scan | Checksum-verified Gitleaks 8.30.1 found no credentials in the audited original main or sanitized base history. Final candidate history is scanned after its tree overlay. |
| Privacy audit | Original-main review covered 13 commits and 336 blobs. Private host metadata, raw operator receipts, private-consumer dossier and source-derived exports were identified. Two authored binary materials were outside text scanning; their generator remains in source. |

## Historical publication boundary

Removing private files from the working tree does not remove their older Git
objects. A separate sanitized history preserves chronological commits while
excluding private inputs and historical operator paths. The final release tree
is overlaid without importing the original ancestry, compared by tree hash and
rescanned. Original provenance remains in the private repository.

The original private repository retains twenty pull-request head refs to excluded
history. Release preparation preserves it as a private archive and installs the
sanitized history in a separate clean repository at the existing Mousecat URL.
The clean repository must pass its history and credential scans before visibility
changes. Copies already indexed outside GitHub are outside this cleanup's control.

## License and redistribution

[LICENSE](LICENSE) matches the official PolyForm Perimeter 1.0.0 text and includes
the required copyright notice. Its noncompete restriction makes the project
source available rather than OSI-approved open source.
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) names the separate dependency terms.
Lucide's complete ISC/Feather MIT notice is checked against the pinned package;
desktop outputs carry WebView2's complete license and notice.

The native world defaults to synthetic data. Real project exports and their
receipts remain local inputs. The authored voxel materials have a source-owned
generator; Unreal Engine is supplied separately under Epic's terms.

Repository visibility and npm publication are separate actions. Release
preparation keeps both repositories private and does not publish a package.
