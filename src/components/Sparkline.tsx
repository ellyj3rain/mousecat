/* ============================================================================
   Sparkline — a small deterministic-per-id inline sparkline (buildSparkline). It
   is a visual rhythm cue, not a data series: purely decorative, seeded off the
   project id so the same project always draws the same shape. No animation, no
   reconciliation, no honesty caveat (it asserts nothing about recorded history).
   ============================================================================ */
import { useMemo } from "react";
import { MCModel } from "../model/engine";

export function Sparkline({ id, w = 150, h = 30 }: { id: string; w?: number; h?: number }) {
  const { area, line } = useMemo(() => {
    const rng = MCModel.mulberry32(MCModel.hashSeed("spark:" + id));
    const n = 22;
    const pts: number[] = [];
    let y = 0.5;
    for (let i = 0; i < n; i++) {
      y = MCModel.clamp(y + (rng() - 0.5) * 0.45, 0.08, 0.92);
      pts.push(y);
    }
    const stepX = w / (n - 1);
    const path = pts
      .map((p, i) => `${i ? "L" : "M"} ${(i * stepX).toFixed(1)} ${((1 - p) * h).toFixed(1)}`)
      .join(" ");
    return { line: path, area: path + ` L ${w} ${h} L 0 ${h} Z` };
  }, [id, w, h]);

  return (
    <span style={{ display: "inline-block", lineHeight: 0 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path d={area} fill="color-mix(in srgb,var(--accent2) 16%,transparent)" />
        <path
          d={line}
          fill="none"
          stroke="var(--accent2)"
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
