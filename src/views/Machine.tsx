/* ============================================================================
   Machine portrait — "This machine": the local-host view of the things that make
   the fleet wiring hold. Five sections drill to raw: the junctions/symlinks that
   stitch vendor folders into place, the toolchains and whether each is on PATH,
   the running services and their up/stale/down state, the watched environment
   variables (clean means unset at both scopes), and the secret watchlist
   (presence + location ONLY, the value is never read). Plain language on top,
   real git/infra terms one level down. Ported faithfully from renderMachine +
   openServiceDrawer in the prototype.
   ============================================================================ */
import type { CSSProperties } from "react";
import type { Health } from "../model/engine";
import type { ServiceEntry } from "../types/status";
import { useFleet } from "../data/useFleet";
import { useOverlays } from "../state/overlays";
import { freshFor } from "../lib/visual";
import { PanelHead, SectionRow, SecretRow } from "../components/Section";

export function Machine() {
  const { doc: d } = useFleet();
  const { openDrawer } = useOverlays();

  const monoFaint: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    color: "var(--text-faint)",
  };

  // service state -> up / stale / down, and the dot/tag color that goes with it
  const serviceState = (s: ServiceEntry): "up" | "stale" | "down" =>
    s.reachable ? "up" : s.lockfileStale && s.pidAlive === false ? "stale" : "down";
  const serviceColor = (state: "up" | "stale" | "down"): string =>
    state === "up" ? "--state-passed" : state === "stale" ? "--state-warning" : "--state-skipped";

  // a service drawer with its raw fields AND the collector notes that mention it
  const openServiceDrawer = (s: ServiceEntry) => {
    const fam = (d.families || []).find((f) => f.family === "services");
    const notes = ((fam && fam.notes) || []).filter((n) =>
      n.toLowerCase().includes(s.id.toLowerCase()),
    );
    const tagColor = serviceColor(serviceState(s));
    openDrawer({
      title: s.id,
      tag: "service",
      tagColor,
      rows: [
        { k: "port", v: s.port },
        { k: "reachable", v: s.reachable ? "yes" : "no" },
        { k: "pid", v: s.pid == null ? "—" : s.pid },
        { k: "pid alive", v: String(s.pidAlive) },
        { k: "lockfile stale", v: String(s.lockfileStale) },
        { k: "version", v: s.version || "—" },
      ],
      notes,
      raw: s,
    });
  };

  // --- per-section panel-head health (exact predicates from the prototype) ---
  const linksHealth: Health =
    (d.layout || []).some((l) => l.state !== "ok" && l.state !== "auto-discovered")
      ? "attention"
      : "ok";
  const toolchainsHealth: Health = (d.toolchains || []).some((t) => !t.onPath)
    ? "attention"
    : "ok";
  const servicesHealth: Health = (d.services || []).some((s) => s.id !== "pb-core" && !s.reachable)
    ? "attention"
    : "ok";
  const envHealth: Health = (d.envOverrides || []).some((e) => !e.ok) ? "attention" : "ok";
  const secretsHealth: Health | "neutral" = (d.secrets || []).some(
    (s) => s.present && s.severity === "warn",
  )
    ? "attention"
    : (d.secrets || []).some((s) => s.present)
      ? "neutral"
      : "ok";

  return (
    <div className="view-pad">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "14px",
        }}
      >
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: "22px" }}>
          This machine
        </span>
        <span style={monoFaint}>mount {d.mountRoot || "—"}</span>
        <span style={monoFaint}>home {d.homeRoot || "—"}</span>
      </div>

      <div className="grid-sections">
        {/* junctions / links */}
        <div className="section">
          <PanelHead title="Links & junctions" health={linksHealth} fresh={freshFor(d, "junctions")} />
          {(d.layout || []).map((l) => {
            const ok = l.state === "ok";
            return (
              <SectionRow
                key={l.id}
                label={l.id}
                sub={(l.vendor || "—") + " · " + (l.linkType || "none")}
                color={ok ? "--state-passed" : l.state === "auto-discovered" ? "--state-skipped" : "--state-warning"}
                value={l.state}
                valColor={ok ? "--state-passed" : l.state === "auto-discovered" ? "--text-muted" : "--state-warning"}
                openable
                onClick={() =>
                  openDrawer({
                    title: l.id,
                    tag: l.vendor || undefined,
                    tagColor: "--accent2",
                    rows: [
                      { k: "link source", v: l.linkSource },
                      { k: "expected", v: l.expectedTarget || "—" },
                      { k: "actual", v: l.actualTarget || "—" },
                      { k: "type", v: l.linkType || "none" },
                      { k: "state", v: l.state },
                    ],
                  })
                }
              />
            );
          })}
        </div>

        {/* toolchains */}
        <div className="section">
          <PanelHead title="Toolchains" health={toolchainsHealth} fresh={freshFor(d, "junctions")} />
          {(d.toolchains || []).map((t) => (
            <SectionRow
              key={t.id}
              label={t.id}
              sub={t.version || "—"}
              color={t.onPath ? "--state-passed" : "--state-warning"}
              value={t.onPath ? "on PATH" : "off PATH"}
              valColor={t.onPath ? "--state-passed" : "--state-warning"}
              openable
              onClick={() =>
                openDrawer({
                  title: t.id,
                  tag: "toolchain",
                  tagColor: "--accent2",
                  rows: [
                    { k: "version", v: t.version || "—" },
                    { k: "on PATH", v: String(t.onPath) },
                    { k: "source", v: t.source || "—" },
                  ],
                })
              }
            />
          ))}
        </div>

        {/* services */}
        <div className="section">
          <PanelHead title="Running services" health={servicesHealth} fresh={freshFor(d, "services")} />
          {(d.services || []).map((s) => {
            const state = serviceState(s);
            const col = serviceColor(state);
            return (
              <SectionRow
                key={s.id}
                label={s.id}
                sub={"port " + s.port}
                color={col}
                value={state}
                valColor={col}
                openable
                onClick={() => openServiceDrawer(s)}
              />
            );
          })}
        </div>

        {/* env overrides — watched variables, each drillable to user/machine scope */}
        <div className="section">
          <PanelHead title="Watched variables" health={envHealth} fresh={freshFor(d, "junctions")} />
          {(d.envOverrides || []).map((e) => (
            <SectionRow
              key={e.var}
              label={e.var}
              sub={
                e.user || e.machine
                  ? "user=" + (e.user || "∅") + " · machine=" + (e.machine || "∅")
                  : "unset at both scopes (the clean state)"
              }
              color={e.ok ? "--state-passed" : "--state-warning"}
              value={e.ok ? "clean" : "set"}
              valColor={e.ok ? "--state-passed" : "--state-warning"}
              openable
              onClick={() =>
                openDrawer({
                  title: e.var,
                  tag: e.ok ? "clean" : "override set",
                  tagColor: e.ok ? "--state-passed" : "--state-warning",
                  rows: [
                    { k: "variable", v: e.var },
                    { k: "user scope", v: e.user || "∅ (unset)" },
                    { k: "machine scope", v: e.machine || "∅ (unset)" },
                    { k: "clean?", v: e.ok ? "yes, unset as expected" : "no, an override is set" },
                    { k: "why watched", v: "a stray value here can fight the junction wiring" },
                  ],
                  raw: e,
                })
              }
            />
          ))}
        </div>

        {/* secret watchlist — presence + location only, never the value */}
        <div className="section" style={{ gridColumn: "1 / -1" }}>
          <PanelHead title="Secret watchlist" health={secretsHealth} fresh={freshFor(d, "drift-governance")} />
          {(d.secrets || []).map((s) => (
            <SecretRow key={s.pattern} secret={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
