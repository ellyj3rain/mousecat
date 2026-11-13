/* ============================================================================
   engineApi - the renderer's typed client for the local gated engine (the acting
   half + per-project deep reads). Same swappable-transport idea as pb-core: in the
   packaged Electron app it goes through window.mmc.engine (main-process IPC); in the
   dev browser it fetches /api/* (Vite-proxied to the local engine dev server).

   plan() is a true dry run. apply() carries the operator's explicit approval. The
   engine, not the UI, is the gate of record (apply refuses without approve:true).
   ============================================================================ */

export interface ProjectState {
  path: string;
  isRepo: boolean;
  branch?: string | null;
  dirtyFiles?: { status: string; file: string }[];
  dirty?: number;
  remotes?: string[];
  headSha?: string | null;
  zeroCommit?: boolean;
  observation?: { status: "observed" | "unavailable"; failed?: string[] };
  ahead?: number | null;
  behind?: number | null;
  upstream?: string | null;
  lastCommit?: string | null;
}

export interface EngineEvent {
  kind: "commit" | "release" | "decision";
  at: number | null;
  synthetic: false;
  title: string;
  tag: string;
  summary: string;
  raw: Record<string, unknown>;
}
export interface HistoryResult {
  status?: "unavailable";
  events: EngineEvent[];
  empty: boolean;
  emptyKind?: "zero-commit" | "not-git";
  sources?: string[];
  span?: { from?: number; to?: number };
}

export interface DiffResult {
  isRepo: boolean;
  files: { file: string; additions: number | null; deletions: number | null }[];
  patch?: string | null;
}

export type ActionKind = "commit" | "backup" | "connect";

export interface GitHubAccount {
  host: string;
  login: string;
  active?: boolean;
  protocol?: string | null;
  scopes?: string[];
}

export interface GhActionResult {
  ok?: boolean;
  launched?: boolean;
  note?: string;
  output?: string;
  error?: string;
}

/** Per-model static identity (MC owns this contract; sources adapt into it). */
export interface ModelIdentity {
  id: string;
  family: string;
  vendor: string;
  label: string;
  tier: string | null;
  source: string;
  aliases: string[];
  raw?: unknown;
}
export interface ModelsResult {
  sources: string[];
  models: ModelIdentity[];
}
export interface AttributionRecord {
  at: string;
  kind: string;
  modelId: string | null;
  resolved: boolean;
  requested: string | null;
  [k: string]: unknown;
}

export interface GitHubStatus {
  available: boolean;
  authenticated: boolean;
  accounts: GitHubAccount[];
  protocol?: string | null;
  note?: string;
}

export interface BackupChoice {
  id: string;
  kind: "remote" | "bundle";
  name: string;
  url?: string;
  fetchUrl?: string | null;
  pushUrl?: string | null;
  fetchUrls?: string[];
  pushUrls?: string[];
  isGitHub: boolean;
}

export interface PlanStep {
  n: number;
  label: string;
  before: string;
  after: string;
}
export interface BuiltPlan {
  id: string;
  createdAt: string;
  expiresAt: string;
  standing: "issued";
  binding: { schema: "mc.action-state-fingerprint/2"; sha256: string };
  feasible: true;
  action: ActionKind;
  title: string;
  explain: string;
  target: string;
  message?: string;
  recovery: string;
  steps: PlanStep[];
  // backup target control
  targetKind?: "remote" | "bundle";
  remote?: { name: string; url?: string; fetchUrl?: string | null; pushUrl?: string | null; isGitHub: boolean };
  choices?: BackupChoice[];
  noGitHub?: boolean;
  // connect / github
  github?: GitHubStatus;
}
export interface InfeasiblePlan {
  feasible: false;
  reason: string;
  choices?: BackupChoice[];
  needsAuth?: boolean;
  github?: GitHubStatus;
}
export type PlanResult = BuiltPlan | InfeasiblePlan;

export interface Applied {
  id: string;
  action: ActionKind;
  target: string;
  ok: boolean;
  standing: "applied" | "failed" | "refused" | "stale" | "expired" | "unknown";
  outcome?: "completed" | "failed-effects-possible" | "outcome-unconfirmed";
  effectsPossible?: boolean;
  outcomeUnconfirmed?: boolean;
  results: { command?: string; step?: string; ok: boolean; output?: string }[];
  at: string;
  error?: string;
}

export interface EngineBridge {
  state(path: string): Promise<ProjectState>;
  history(path: string): Promise<HistoryResult>;
  diff(path: string, file?: string): Promise<DiffResult>;
  plan(action: ActionKind, path: string, opts?: Record<string, unknown>): Promise<PlanResult>;
  apply(planId: string, approve: boolean): Promise<Applied>;
  audit(): Promise<{ entries: unknown[] }>;
  githubStatus(): Promise<GitHubStatus>;
  githubLogin(): Promise<GhActionResult>;
  githubSwitch(opts: { host?: string; user: string }): Promise<GhActionResult>;
  githubLogout(opts: { host?: string; user?: string }): Promise<GhActionResult>;
  models(): Promise<ModelsResult>;
  attribution(): Promise<{ entries: AttributionRecord[] }>;
}

export interface EngineApi extends EngineBridge {
  readonly kind: "electron" | "web";
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`engine ${url}: ${r.status}`);
  return (await r.json()) as T;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`engine ${url}: ${r.status}`);
  return (await r.json()) as T;
}

const webEngine: EngineApi = {
  kind: "web",
  state: (path) => getJson(`/api/state?path=${encodeURIComponent(path)}`),
  history: (path) => getJson(`/api/history?path=${encodeURIComponent(path)}`),
  diff: (path, file) =>
    getJson(`/api/diff?path=${encodeURIComponent(path)}${file ? `&file=${encodeURIComponent(file)}` : ""}`),
  plan: (action, path, opts) => postJson("/api/plan", { action, path, opts }),
  apply: (planId, approve) => postJson("/api/apply", { planId, approve }),
  audit: () => getJson("/api/audit"),
  githubStatus: () => getJson("/api/github"),
  githubLogin: () => postJson("/api/github/login", {}),
  githubSwitch: (opts) => postJson("/api/github/switch", opts),
  githubLogout: (opts) => postJson("/api/github/logout", opts),
  models: () => getJson("/api/models"),
  attribution: () => getJson("/api/attribution"),
};

export function pickEngine(): EngineApi {
  if (typeof window !== "undefined" && window.mmc?.engine) {
    const b = window.mmc.engine;
    return { kind: "electron", ...b };
  }
  return webEngine;
}

export const engine: EngineApi = pickEngine();
