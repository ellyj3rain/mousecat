/* ============================================================================
   UI visual vocabulary + helpers — presentation only (NOT interpretation).

   Interpretation (health rollup, safety, timeline, freshness) lives in the shared
   engine (engine/model.js, DR-002). This module holds the UI's presentation vocab
   (CSS-var names, glyphs, human labels) and small visual helpers (timeAgo, cssVar,
   withAlpha, the deterministic per-tile gradient). The PRNG helpers come from the
   engine so the UI and a future bridge agree on every seeded value.
   ============================================================================ */
import { MCModel, type Health } from "../model/engine";

/** color is NEVER the only signal — every health is also a glyph + a text label. */
export const HEALTH_COLOR: Record<Health, string> = {
  risk: "--state-failed",
  attention: "--state-warning",
  neutral: "--state-skipped",
  ok: "--state-passed",
};
export const HEALTH_GLYPH: Record<Health, string> = {
  risk: "✕",
  attention: "!",
  neutral: "○",
  ok: "✓",
};
export const HEALTH_LABEL: Record<Health, string> = {
  risk: "At risk",
  attention: "Wants a look",
  neutral: "Not assessed",
  ok: "All good",
};

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 48) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}

export function fmtDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A CSS color (hex or rgb) -> rgba() at the given alpha; tolerant fallback. */
export function withAlpha(col: string, a: number): string {
  col = (col || "").trim();
  if (col.startsWith("#")) {
    let h = col.slice(1);
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    const n = parseInt(h, 16);
    if (!isNaN(n) && h.length === 6)
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = col.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
    return `rgba(${r || 136},${g || 170},${b || 170},${a})`;
  }
  return `rgba(136,170,170,${a})`;
}

export interface TileGradient {
  css: string;
  glowColor: string;
}

/** Deterministic per-tile gradient from the active scheme palette + project id. */
export function tileGradient(projectId: string, frequency = 0.7): TileGradient {
  const palette = [
    cssVar("--grad-a") || "#888",
    cssVar("--grad-b") || "#aaa",
    cssVar("--grad-c") || "#666",
  ];
  const rng = MCModel.mulberry32(MCModel.hashSeed(projectId));
  const spread = frequency * 180;
  const angle = Math.round(135 + (rng() - 0.5) * spread);
  const order = palette.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const threeStop = rng() > 0.6 - frequency * 0.4;
  let css: string;
  if (threeStop) {
    const mid = Math.round(30 + rng() * 40);
    css = `linear-gradient(${angle}deg, ${order[0]} 0%, ${order[1]} ${mid}%, ${order[2]} 100%)`;
  } else {
    css = `linear-gradient(${angle}deg, ${order[0]} 0%, ${order[1]} 100%)`;
  }
  return { css, glowColor: order[0] };
}

import type { StatusDoc, FamilyName } from "../types/status";

/** Per-section freshness display, read from the family envelope (the only place
    observedAt/ttlSeconds live). Returns an "as of Xm ago" string + exact tooltip. */
export function freshFor(doc: StatusDoc, family: FamilyName): { txt: string; title: string } {
  const f = (doc.families || []).find((x) => x.family === family);
  return f
    ? { txt: "as of " + timeAgo(f.observedAt), title: `observed ${f.observedAt}, ttl ${f.ttlSeconds}s` }
    : { txt: "", title: "" };
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
