/* ============================================================================
   SafetyMeter - tracked, committed, remote and version observation states.

   Like Gauge: the initial DOM encodes the TRUE level (a frozen tab shows the real
   bar height, not an empty 0%), and a useEffect runs the optional entry sweep only
   when motion is allowed, restoring to the true width. Color is never the only
   signal — each segment carries a glyph (✓ / ! / ✕) and a labelled plain-language
   tooltip.
   ============================================================================ */
import { useEffect, useRef } from "react";
import { MCModel, type SafetyDim } from "../model/engine";
import type { ProjectEntry } from "../types/status";
import { prefersReducedMotion } from "../lib/visual";

function segColor(seg: SafetyDim): string {
  if (seg.unknown) return "--text-tertiary";
  if (seg.ok) return "--state-passed";
  if (seg.level <= 0.2) return "--state-failed";
  return "--state-warning";
}
function segGlyph(seg: SafetyDim): string {
  if (seg.unknown) return "?";
  if (seg.ok) return "✓";
  if (seg.level <= 0.2) return "✕";
  return "!";
}

export function SafetyMeter({ project }: { project: ProjectEntry }) {
  const segs = MCModel.safetyMeter(project);
  const fillRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const rafs: number[] = [];
    segs.forEach((seg, i) => {
      const fill = fillRefs.current[i];
      if (!fill) return;
      const pct = Math.round(seg.level * 100) + "%";
      const r1 = requestAnimationFrame(() => {
        fill.style.transition = "none";
        fill.style.width = "0%";
        fill.getBoundingClientRect();
        const r2 = requestAnimationFrame(() => {
          fill.style.transition = "width 700ms var(--ease),background-color 400ms var(--ease)";
          fill.style.width = pct;
        });
        rafs.push(r2);
      });
      rafs.push(r1);
    });
    return () => rafs.forEach((r) => cancelAnimationFrame(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.dirty, project.lossRisk, project.drift, project.remotes]);

  return (
    <div className="safety">
      <div className="safety-title">Work safety</div>
      <div className="safety-meter">
        {segs.map((seg, i) => {
          const col = segColor(seg);
          const pct = Math.round(seg.level * 100) + "%";
          return (
            <div className="safety-seg" key={seg.key} title={seg.plain}>
              <span className="gly" aria-hidden="true" style={{ color: `var(${col})` }}>
                {segGlyph(seg)}
              </span>
              <span className="lbl" role="img" aria-label={`${seg.label}: ${seg.plain}`}>
                {seg.label}
              </span>
              <div className="safety-bar">
                <div
                  className="safety-fill"
                  ref={(n) => {
                    fillRefs.current[i] = n;
                  }}
                  style={{ width: pct, background: `var(${col})` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
