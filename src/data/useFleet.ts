/* ============================================================================
   useFleet — the renderer's single subscription to the live fleet snapshot.

   One FleetConnection singleton owns the transport + SAMPLE/LIVE state machine;
   React components read it through useSyncExternalStore (tear-free under React 19
   concurrent rendering). The embedded sample is the genuine-offline fallback only.
   ============================================================================ */
import { useMemo, useSyncExternalStore } from "react";
import { activeWorkspace } from "../../engine/workspace.mjs";
import { bootWorkspace, refreshWorkspace, useWorkspace } from "./workspace";
import type { FleetSnapshot, StatusDoc } from "../types/status";
import { FleetConnection } from "./connection";
import sampleJson from "./sample-status.json";

const LS_SOURCE = "mc-data-source";

const sample = sampleJson as unknown as StatusDoc;

export const fleet = new FleetConnection(sample);

let booted = false;
export function bootFleet() {
  if (booted) return;
  booted = true;
  bootWorkspace();
  const forced = localStorage.getItem(LS_SOURCE) === "sample";
  void fleet.start(forced);
}

export function useFleet(): FleetSnapshot {
  const base = useSyncExternalStore(fleet.subscribe, fleet.getSnapshot, fleet.getSnapshot);
  const work = useWorkspace();
  const forced = localStorage.getItem(LS_SOURCE) === "sample";
  const status = forced ? "offline" : work.status;
  return useMemo(() => {
    const doc = activeWorkspace(base.doc, forced ? null : work.data, status) as StatusDoc & { workspace?: { effectiveStatus?: FleetSnapshot["workspaceStatus"] } };
    return { ...base, workspaceStatus: doc.workspace?.effectiveStatus || status, doc };
  }, [base, work.data, status, forced]);
}

/** Operator toggle: force the embedded sample, or return to live. Persisted. */
export async function setDataSourcePreference(forced: boolean) {
  if (forced) localStorage.setItem(LS_SOURCE, "sample");
  else localStorage.removeItem(LS_SOURCE);
  void refreshWorkspace();
  await fleet.setForcedSample(forced);
}
