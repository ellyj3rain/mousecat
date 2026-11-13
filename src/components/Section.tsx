/* ============================================================================
   Section primitives shared by the project portrait and the machine portrait:
   a panel head (dot + title + freshness stamp) and a section row (dot + label/sub
   + value + chevron) that is openable to the drill-to-raw drawer. Presentation
   only; the health glyph/color vocabulary comes from lib/visual.
   ============================================================================ */
import type { ReactNode } from "react";
import type { Health } from "../model/engine";
import type { SecretEntry } from "../types/status";
import { HEALTH_COLOR } from "../lib/visual";
import { useOverlays } from "../state/overlays";

export function PanelHead({
  title,
  health,
  fresh,
}: {
  title: string;
  health: Health | "neutral";
  fresh?: { txt: string; title: string };
}) {
  return (
    <div className="section-head">
      <span className="dot" style={{ background: `var(${HEALTH_COLOR[health as Health] || "--state-skipped"})` }} />
      <span className="t">{title}</span>
      {fresh && fresh.txt ? (
        <span className="f" title={fresh.title}>
          {fresh.txt}
        </span>
      ) : null}
    </div>
  );
}

export interface SectionRowProps {
  label: string;
  sub?: ReactNode;
  value?: ReactNode;
  valColor?: string; // a css var name
  color?: string; // dot css var name
  openable?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}

export function SectionRow({ label, sub, value, valColor, color, openable, expanded, onClick }: SectionRowProps) {
  return (
    <div className="row" onClick={onClick} role={onClick ? "button" : undefined} aria-expanded={expanded} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}>
      {color ? <span className="dot" style={{ background: `var(${color})` }} /> : null}
      <div className="main">
        <div className="lbl">{label}</div>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {value != null ? (
        <span className="val" style={{ color: valColor ? `var(${valColor})` : "" }}>
          {value}
        </span>
      ) : null}
      {openable ? (
        <span className="chev" aria-hidden="true">
          ›
        </span>
      ) : null}
    </div>
  );
}

/** A secret-watchlist row: presence + location ONLY, value NEVER shown. Shared by
    the project portrait (Hygiene) and the machine portrait (Secret watchlist). */
export function SecretRow({ secret: s }: { secret: SecretEntry }) {
  const { openDrawer } = useOverlays();
  const col = s.present
    ? s.severity === "warn"
      ? "--state-warning"
      : s.severity === "critical"
        ? "--state-failed"
        : "--state-info"
    : "--state-passed";
  return (
    <SectionRow
      label={s.pattern}
      sub={s.present ? s.path || "present (location withheld)" : "no match, clear"}
      color={col}
      value={s.present ? "present" : "clear"}
      valColor={col}
      openable
      onClick={() =>
        openDrawer({
          title: "Watched pattern",
          tag: String(s.severity),
          tagColor: col,
          rows: [
            { k: "pattern", v: s.pattern },
            { k: "present", v: s.present ? "yes" : "no" },
            { k: "location", v: s.path || "—" },
            { k: "severity", v: String(s.severity) },
            { k: "note", v: "the secret value is never read or displayed, only that a match exists and where" },
          ],
          raw: s,
        })
      }
    />
  );
}
