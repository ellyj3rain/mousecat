/* ============================================================================
   Shared interpretation engine — typed adapter.

   engine/model.js (DR-002) is the ONE interpretation of the fleet, shared by the
   UI and the agent bridge. It is a classic UMD-style IIFE that assigns
   `globalThis.MCModel`. We import it for its
   side effect and re-export a typed handle. Forking the logic would violate DR-002,
   so this file adds types only — never behavior.
   ============================================================================ */
import "../../engine/model.js";
import { scopedInterpretation } from "../../engine/workspace.mjs";
import type {
  StatusDoc,
  ProjectEntry,
  Family,
} from "../types/status";

export type Health = "ok" | "attention" | "risk" | "neutral";

export interface HealthRollup {
  health: Health;
  reason: string;
  driver: string;
  baseWord: string;
}

export interface SafetyDim {
  key: "tracked" | "saved" | "backed" | "clean";
  label: string;
  level: number; // 0..1
  ok: boolean;
  plain: string;
  unknown?: boolean;
}

export interface PortraitDim {
  key: string;
  label: string;
  value: number; // 0..1
  color: string; // a --state-* css var name
  num: string;
}

export interface TimelineEvent {
  kind: "commit" | "release" | "decision";
  at: number; // epoch ms
  synthetic: boolean;
  title: string;
  tag: string;
  summary: string;
  raw: Record<string, unknown>;
}

export interface TimelineModel {
  events: TimelineEvent[];
  gaps?: { afterIdx: number; beforeIdx: number; days: number }[];
  empty: boolean;
  emptyKind?: "zero-commit" | "not-git";
  span?: { from?: number; to?: number };
}

export interface AttentionSignal {
  id: string;
  project?: ProjectEntry;
  name: string;
  health: Health;
  text: string;
  kind: "project" | "service";
}

export interface FreshnessResult {
  ageSeconds: number | null;
  ttlSeconds: number | null;
  stale: boolean | null;
}

export interface MCModelApi {
  clamp(n: number, a: number, b: number): number;
  mulberry32(seed: number): () => number;
  hashSeed(str: string): number;
  LOSS: Record<string, { health: Health; word: string }>;
  HEALTH_RANK: Record<Health, number>;
  rollupHealth(p: ProjectEntry, doc: StatusDoc): HealthRollup;
  fleetSummary(doc: StatusDoc): { risk: number; attention: number; neutral: number; ok: number; total: number };
  safetyMeter(p: ProjectEntry): SafetyDim[];
  projectShortName(p: ProjectEntry): string;
  projectKind(p: ProjectEntry): string;
  buildTimelineEvents(p: ProjectEntry, doc: StatusDoc): TimelineModel;
  portraitDimensions(p: ProjectEntry): PortraitDim[];
  gaugeValue(health: Health): number;
  attentionSignals(doc: StatusDoc): AttentionSignal[];
  freshness(family: Family | undefined, now?: number): FreshnessResult;
}

const M = (globalThis as unknown as { MCModel?: MCModelApi }).MCModel;
if (!M) {
  throw new Error(
    "engine/model.js did not register globalThis.MCModel — shared interpretation engine failed to load (DR-002).",
  );
}

export const MCModel: MCModelApi = scopedInterpretation(M);
export default MCModel;
