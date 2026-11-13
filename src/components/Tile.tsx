/* ============================================================================
   Tile — one project on the fleet board. Loss-risk-first health drives the color,
   the glyph, the one-phrase reason, and the risk tag. The headline is always
   WHICH signal set the state, in plain language (never just a colored dot). Opens
   to the project portrait (nothing is a dead end).
   ============================================================================ */
import { useMemo, type CSSProperties } from "react";
import { MCModel } from "../model/engine";
import type { ProjectEntry, StatusDoc } from "../types/status";
import type { TileLayout } from "../state/ui";
import { HEALTH_COLOR, HEALTH_GLYPH, HEALTH_LABEL, tileGradient } from "../lib/visual";
import { SafetyMeter } from "./SafetyMeter";
import { useTheme } from "../theme/ThemeProvider";
import { FxSkin } from "../fx/EffectSkins";
import { Icon } from "./Icon";

/** the three tile effects that need the .fx-skin overlay island (glow/matte are
    pure CSS via data-effect-tiles; these three render through FxSkin). */
const FX_SKINS = new Set(["pearlescent", "glitter", "sparkles"]);

function collapsePath(value: string, mountRoot: string): string {
  const normalized = value.replace(/\\/g, "/");
  const base = (mountRoot || "").replace(/\\/g, "/").replace(/\/+$/, "");
  return base && normalized.startsWith(base + "/") ? "." + normalized.slice(base.length) : normalized;
}

interface TileProps {
  project: ProjectEntry;
  doc: StatusDoc;
  layout: TileLayout;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onCycleSize: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}

export function Tile({
  project: p,
  doc,
  layout: ly,
  onOpen,
  onTogglePin,
  onCycleSize,
  onReorder,
}: TileProps) {
  const { theme } = useTheme();
  const h = MCModel.rollupHealth(p, doc);
  const size = ly.size || "normal";
  const grad = useMemo(() => tileGradient(p.id, 0.7), [p.id, doc.generatedAt]);
  const showFoot = size === "wide" || size === "large" || size === "tall";
  const tileSkin = FX_SKINS.has(theme.effectTiles) ? (theme.effectTiles as "pearlescent" | "glitter" | "sparkles") : null;

  const stats: { l: string; v: string; c: string }[] = [
    {
      l: "Changed",
      v: p.dirty == null ? "—" : String(p.dirty),
      c: p.dirty == null ? "--text-tertiary" : p.dirty > 15 ? "--state-failed" : p.dirty > 0 ? "--state-warning" : "--state-passed",
    },
    { l: "Ahead", v: p.ahead == null ? "—" : String(p.ahead), c: "--text-primary" },
    { l: "Behind", v: p.behind == null ? "—" : String(p.behind), c: (p.behind ?? 0) > 0 ? "--state-warning" : "--text-primary" },
    {
      l: "Remotes",
      v: p.remotes ? String(p.remotes.length) : "—",
      c: p.remotes == null ? "--text-tertiary" : p.remotes.length ? "--state-passed" : "--state-warning",
    },
  ];

  const cls =
    "tile size-" + size + (ly.pinned ? " pinned" : "") + (h.health === "risk" ? " risk pulse" : "");

  return (
    <div
      className={cls}
      tabIndex={0}
      role="button"
      aria-label={`${MCModel.projectShortName(p)}, ${HEALTH_LABEL[h.health]}: ${h.reason}`}
      draggable
      onClick={() => onOpen(p.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p.id); }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", p.id);
        (e.currentTarget as HTMLElement).classList.add("dragging");
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).classList.remove("dragging");
        document
          .getElementById("board")
          ?.querySelectorAll(".drop-target")
          .forEach((t) => t.classList.remove("drop-target"));
      }}
      onDragOver={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.add("drop-target");
      }}
      onDragLeave={(e) => (e.currentTarget as HTMLElement).classList.remove("drop-target")}
      onDrop={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove("drop-target");
        const from = e.dataTransfer.getData("text/plain");
        onReorder(from, p.id);
      }}
    >
      {tileSkin && <FxSkin variant={tileSkin} />}
      <div
        className="grad"
        aria-hidden="true"
        style={{ background: grad.css, "--tile-glow": grad.glowColor } as CSSProperties}
      />
      <div
        className="grad-glow breathe"
        aria-hidden="true"
        style={{ background: grad.glowColor, animation: "mc-breathe 4.5s ease-in-out infinite" }}
      />

      <div className="tile-controls">
        <button
          className={"tctl" + (ly.pinned ? " on" : "")}
          title={ly.pinned ? "Unpin" : "Pin"}
          aria-label="Pin tile"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(p.id);
          }}
        >
          <Icon name="pin" size={14} />
        </button>
        <button
          className="tctl"
          title="Resize"
          aria-label="Resize tile"
          onClick={(e) => {
            e.stopPropagation();
            onCycleSize(p.id);
          }}
        >
          <Icon name="expand" size={14} />
        </button>
      </div>

      <div className="tile-inner">
        <div className="tile-head">
          <div className="tile-title">
            <div className="tile-name">{MCModel.projectShortName(p)}</div>
            <div className="tile-kind">{MCModel.projectKind(p)}</div>
          </div>
          <span
            className="risk-tag"
            style={{
              color: `var(${HEALTH_COLOR[h.health]})`,
              background: `color-mix(in srgb, var(${HEALTH_COLOR[h.health]}) 16%, transparent)`,
            }}
          >
            <span aria-hidden="true">{HEALTH_GLYPH[h.health]}</span> {HEALTH_LABEL[h.health]}
          </span>
        </div>

        <div className="reason" style={{ color: `var(${HEALTH_COLOR[h.health]})` }}>
          <span className="gly" aria-hidden="true">
            ›
          </span>{" "}
          {h.reason}
        </div>

        <div className="health-row">
          <SafetyMeter project={p} />
        </div>

        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.l}>
              <div className="v" style={{ color: `var(${s.c})` }}>
                {s.v}
              </div>
              <div className="l">{s.l}</div>
            </div>
          ))}
        </div>

        {showFoot && (
          <div className="tile-foot">
            <div className="foot-row">
              <span className="k">last save</span>
              <span className="v">{p.lastCommit || (p.zeroCommit ? "no commits yet" : "not observed")}</span>
            </div>
            <div className="foot-row">
              <span className="k">path</span>
              <span className="v">{collapsePath(p.path || "", doc.mountRoot)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
