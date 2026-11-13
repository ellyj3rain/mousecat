/* ============================================================================
   Drawer — the universal drill-to-raw surface. Every summary in the app opens here
   to its rows, the collector "why" notes, an optional gated action (which opens the
   plan modal, never acts directly), and the actual underlying object as raw JSON.
   Nothing is a dead end.
   ============================================================================ */
import { useState } from "react";
import { useOverlays } from "../state/overlays";

export function Drawer() {
  const { drawer, closeDrawer } = useOverlays();
  const [rawOpen, setRawOpen] = useState(false);
  if (!drawer) return null;
  const d = drawer;

  return (
    <div className="scrim" onClick={closeDrawer}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          {d.tag && (
            <span
              className="risk-tag"
              style={{
                color: `var(${d.tagColor || "--accent2"})`,
                background: `color-mix(in srgb, var(${d.tagColor || "--accent2"}) 16%, transparent)`,
              }}
            >
              {d.tag}
            </span>
          )}
          <div className="t">{d.title}</div>
          <button className="icon-btn" aria-label="Close" onClick={closeDrawer}>
            ✕
          </button>
        </div>
        <div className="drawer-body">
          {d.note && (
            <div style={{ fontSize: "11.5px", color: "var(--text-muted)", padding: "6px 0 10px" }}>{d.note}</div>
          )}
          {d.rows.map((r, i) => (
            <div className={r.prose ? "kv kv-prose" : "kv"} key={i}>
              <span className="k">{r.k}</span>
              <span className="v">{r.v}</span>
            </div>
          ))}
          {d.notes && d.notes.length > 0 && (
            <>
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: ".5px",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                  padding: "14px 0 4px",
                }}
              >
                Observed notes
              </div>
              {d.notes.map((n, i) => (
                <div className="note-line" key={i}>
                  <span className="gly" aria-hidden="true">
                    ›
                  </span>
                  {n}
                </div>
              ))}
            </>
          )}
          {d.action && (
            <button
              className="btn"
              style={{ marginTop: "14px", width: "100%" }}
              onClick={() => {
                closeDrawer();
                d.action?.();
              }}
            >
              {d.actionLabel || "Act…"}
            </button>
          )}
          {d.raw != null && (
            <>
              <button
                className="raw-toggle"
                aria-expanded={rawOpen}
                onClick={() => setRawOpen((o) => !o)}
              >
                {rawOpen ? "‹ ›  Hide raw fields" : "‹ ›  Show raw fields"}
              </button>
              {rawOpen && (
                <pre
                  style={{
                    margin: "8px 0 0",
                    padding: "12px",
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(d.raw, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
