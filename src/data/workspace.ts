import { useSyncExternalStore } from "react";
import { createWorkspaceStore } from "../../engine/workspace-client.mjs";

export interface ContinuityRecord { recordId: string; workId: string; revision: string; acceptedRevision: string | number | null; outcome: string | null; owner: { role?: string; sessionId?: string } | null; units: { id: string; target: string | null; owner: unknown; status: string | null }[]; remaining: string[]; directions: { author: string | null; reason: string | null; sourceRefs: string[] }[]; stale: boolean }
export interface ContinuityDoc { schema: string; status: string; observedAt: string; records: ContinuityRecord[]; directives: { ideaId: string; title: string | null; proposition: string | null; revision: string | number | null; status: string | null; stale?: boolean; attribution?: { author?: string }; history?: unknown[]; links?: unknown[] }[]; heads: { workId: string; recordIds: string[]; ambiguous: boolean }[]; sources: { id: string; status: string; code?: string; coverage?: { complete?: boolean } }[]; issues: unknown[] }
export interface WorkspaceObject {
  continuity?: ContinuityDoc | null;
  id: string; label: string; kind: string; root: string | null; responsibility: string | null; authority: string;
  relationships: { kind: string; target: string; source: string }[];
  observation: { status: "unconfigured" | "observed" | "unavailable"; state?: Record<string, unknown> };
}
export interface WorkspaceDoc { schema: "mc.workspace/1"; observedAt: string; objects: WorkspaceObject[]; runtime?: { node: string; platform: string; arch: string } }
interface Snapshot { data: WorkspaceDoc | null; status: "loading" | "live" | "unavailable" | "offline" }
const store = createWorkspaceStore({
  offline: () => localStorage.getItem("mc-data-source") === "sample",
  read: async () => {
    const bridge = window.mmc?.workspace;
    if (bridge) return bridge();
    const response = await fetch("/api/workspace", { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("unavailable");
    return response.json();
  },
});
let started = false;
export function refreshWorkspace() { return store.refresh(); }
export function bootWorkspace() {
  if (started) return;
  started = true; void refreshWorkspace();
  window.setInterval(() => { if (document.visibilityState === "visible") void refreshWorkspace(); }, 20000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refreshWorkspace(); });
}
export function useWorkspace(): Snapshot {
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot() as Snapshot, () => store.getSnapshot() as Snapshot);
}
