/* ============================================================================
   Marshmallow Commons — typed model of the pb-core /v1/status document.

   This is the SINGLE typed surface for the pb-core contract (schemaVersion 1).
   Nothing in the app reads loose fields off the raw document; everything goes
   through these types. Source-verified against pb-core/lib/schema.cjs +
   pb-core/manifest/pb-manifest.schema.json (the FROZEN contract).

   Fields the UI wants but pb-core does not yet emit (name, group, kind, owner,
   governanceParent, notes, service owner/startGated, layout hotStore/inverted)
   are typed here as OPTIONAL so the renderer can consume them the moment the
   collectors un-drop them in Phase 2 (additive, no schema break). They are never
   fabricated: absent means absent.
   ============================================================================ */

export type Severity = "ok" | "warn" | "error" | "unknown";

export type LossRisk =
  | "none"
  | "no-remote"
  | "dirty-heavy"
  | "zero-commit"
  | "unknown"
  | "not-git";

export type LayoutState =
  | "ok"
  | "missing"
  | "mismatch"
  | "dangling"
  | "not-a-link"
  | "auto-discovered"
  | "unknown";

export type LinkType = "Junction" | "SymbolicLink" | "none" | null;

export type FamilyName = "junctions" | "services" | "git" | "drift-governance";

/** A junction / symlink / env-indirection row. */
export interface LayoutEntry {
  id: string;
  vendor: string | null;
  linkSource: string;
  expectedTarget: string | null;
  actualTarget: string | null;
  linkType: LinkType;
  state: LayoutState;
  /** Phase 2 (manifest, additive): operator-curated meta. */
  hotStore?: boolean;
  inverted?: boolean;
}

export interface EnvOverride {
  var: string;
  user: string | null;
  machine: string | null;
  ok: boolean;
}

export interface ServiceEntry {
  id: string;
  port: number;
  reachable: boolean;
  pid: number | null;
  pidAlive: boolean | null;
  lockfileStale: boolean | null;
  version: string | null;
  /** Phase 2 (manifest, additive). */
  owner?: string | null;
  startGated?: boolean;
  /** pb-core manifest field is `currentlyDown`; the directive calls it `expectedDown`. */
  currentlyDown?: boolean;
  expectedDown?: boolean;
}

export interface ToolchainEntry {
  id: string;
  version: string | null;
  onPath: boolean;
  source: string | null;
}

export interface ProjectDrift {
  versionFile: string | null;
  packageJson: string | null;
  readme: string | null;
  inSync: boolean;
}

export interface ProjectEntry {
  id: string;
  path: string;
  isRepo: boolean;
  branch: string | null;
  dirty: number | null;
  ahead: number | null;
  behind: number | null;
  lastCommit: string | null;
  remotes: string[] | null;
  remoteStanding?: "configured-unverified" | "no-remote-observed" | "unknown";
  remoteObservation?: "observed" | "unavailable" | "unreported";
  remoteEvaluation?: "available" | "unavailable" | "unreported";
  upstream?: string | null;
  zeroCommit?: boolean | null;
  lossRisk: LossRisk;
  drift: ProjectDrift | null;
  /** Phase 2 (manifest, additive): operator-curated meta. */
  name?: string | null;
  group?: string | null;
  kind?: string | null;
  governanceParent?: string | null;
  notes?: string | null;
}

export interface Worktree {
  path?: string;
  branch?: string;
  [k: string]: unknown;
}

export interface Governance {
  latestBatch: string | null;
  latestDR: string | null;
  worktrees: Worktree[];
}

export interface SecretEntry {
  pattern: string;
  path: string | null;
  /** presence + location ONLY — pb-core never reads the value. */
  present: boolean;
  severity: "info" | "low" | "medium" | "warn" | "high" | "critical" | string;
}

/** Per-section freshness envelope. The ONLY place observedAt/ttlSeconds live. */
export interface Family<T = unknown> {
  family: FamilyName;
  ok: boolean;
  severity: Severity;
  observedAt: string; // ISO-8601
  ttlSeconds: number;
  data: T;
  notes: string[];
}

/** The full pb-core /v1/status document (schemaVersion 1). */
export interface StatusDoc {
  schemaVersion: number;
  generatedAt: string; // ISO-8601
  producer: string; // "pb-core"
  mountRoot: string;
  homeRoot: string;
  manifestVersion: number | null;
  overall: Severity;
  layout: LayoutEntry[];
  envOverrides: EnvOverride[];
  services: ServiceEntry[];
  toolchains: ToolchainEntry[];
  projects: ProjectEntry[];
  governance: Governance;
  secrets: SecretEntry[];
  warnings: string[];
  families: Family[];
}

/** Connection state the renderer surfaces honestly (SAMPLE/LIVE invariant). */
export type DataSource = "live" | "sample";
export type ConnState = "live" | "connecting" | "reconnecting" | "offline";

export interface FleetSnapshot {
  workspaceStatus?: "loading" | "live" | "unavailable" | "offline";
  doc: StatusDoc;
  source: DataSource;
  conn: ConnState;
  /** epoch ms the doc was received by the renderer (for "as of" display). */
  receivedAt: number;
  /** last connection error message, if any (honest, surfaced not hidden). */
  error: string | null;
}
