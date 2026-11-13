/* ============================================================================
   AttentionStrip — "Needs you now". The breathing LED + the un-snoozed attention
   chips (projects at risk/attention, services down/stale). Each chip opens its
   project (nothing is a dead end). Hidden entirely when nothing needs attention.
   ============================================================================ */
import type { CSSProperties } from "react";
import type { StatusDoc } from "../types/status";
import { useUi } from "../state/ui";
import { useAttention } from "../state/notifications";
import { HEALTH_COLOR } from "../lib/visual";

export function AttentionStrip({ doc }: { doc: StatusDoc }) {
  const ui = useUi();
  const { active: items } = useAttention(doc);
  if (items.length === 0) return null;
  const onlyAmber = !items.some((i) => i.health === "risk");

  return (
    <div className={"attn-strip" + (onlyAmber ? " amber-only" : "")}>
      <span
        className="led breathe"
        aria-hidden="true"
        style={{ animation: "mc-breathe 2.6s ease-in-out infinite", "--glow-lo": ".5", "--glow-hi": "1" } as CSSProperties}
      />
      <span className="attn-label">Needs you now</span>
      <div className="attn-items">
        {items.slice(0, 8).map((it) => (
          <button
            key={it.id}
            className="attn-chip"
            onClick={() => {
              if (it.project) ui.openProject(it.project.id);
            }}
          >
            <span aria-hidden="true" style={{ color: `var(${HEALTH_COLOR[it.health]})` }}>
              {it.health === "risk" ? "✕" : "!"}
            </span>
            <strong>{it.name}</strong>
            <span className="sub">{it.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
