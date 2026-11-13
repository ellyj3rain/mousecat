/* ============================================================================
   ModelIdentities — a legible surface for the per-model identity foundation. Shows
   the models MC can identify (the stable identity behind every input and audit
   record) and which source each came from. MC owns the contract; sources (neo, a
   config manifest, any stack) adapt into it. Honest empty state when no source is
   configured, never a fabricated list.
   ============================================================================ */
import { useEffect, useState } from "react";
import { engine, type ModelsResult } from "../data/engineApi";

export function ModelIdentities() {
  const [data, setData] = useState<ModelsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await engine.models();
        if (live) setData(r);
      } catch {
        if (live) setData({ sources: [], models: [] });
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="set-group">
      <h4>Models</h4>
      <p>
        The models Mousecat can identify: the stable identity behind every input and audit record. Sources adapt
        their own model lists into this one contract.
      </p>

      {loading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Reading model sources…</div>}

      {!loading && data && data.models.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          No model sources configured yet. Point MC at your stack with MC_NEO_PATH, or add a models manifest with
          MC_MODELS_MANIFEST.
        </div>
      )}

      {!loading && data && data.models.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
            {data.models.length} models · sources: {data.sources.join(", ") || "none"}
          </div>
          {data.models.map((m) => (
            <div key={m.id} className="row" style={{ cursor: "default" }}>
              <div className="main">
                <div className="lbl">
                  {m.label}
                  {m.tier && <span style={{ fontSize: 9, color: "var(--text-faint)", marginLeft: 6 }}>{m.tier}</span>}
                </div>
                <div className="sub">
                  {m.family} · {m.vendor} · {m.id}
                </div>
              </div>
              <span className="val" style={{ fontSize: 10, color: "var(--text-faint)" }}>
                {m.source}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
