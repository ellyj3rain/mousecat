/* ============================================================================
   Project portrait — one project's full detail as visual representations. The hero
   carries identity (name, risk tag, path, the one-phrase reason) and actions. Below it,
   a grid of sections where every value drills to raw: Work safety (git), Moving
   parts (related services), Version consistency (drift, only if present), Hygiene
   (watched secret patterns touching this path, presence + location ONLY), and the
   full-width recorded story (the honest timeline). Nothing is a dead end.

   Ports renderProject. Reuses <PanelHead>/<SectionRow>/<SecretRow> from Section,
   <Timeline> for the recorded story.
   ============================================================================ */
import { useEffect, useMemo, useRef, useState } from "react";
import { MCModel } from "../model/engine";
import { useUi } from "../state/ui";
import { useFleet } from "../data/useFleet";
import { useOverlays } from "../state/overlays";
import { useNotifications } from "../state/notifications";
import { HEALTH_COLOR, HEALTH_GLYPH, HEALTH_LABEL, tileGradient, freshFor } from "../lib/visual";
import { PanelHead, SectionRow, SecretRow } from "../components/Section";
import { Timeline } from "../components/Timeline";
import { engine } from "../data/engineApi";

export function Project() {
  const { activeProject, go } = useUi();
  const { doc } = useFleet();
  const { openDrawer, openSafety, toast } = useOverlays();
  const { snooze, snoozeDefault } = useNotifications();
  const [changes, setChanges] = useState<{ path: string; state: "loading" | "ready" | "unavailable"; files?: { status: string; file: string }[] } | null>(null);
  const changeRequest = useRef(0);

  const p = doc.projects.find((x) => x.id === activeProject);
  const grad = useMemo(
    () => (p ? tileGradient(p.id, 0.7) : null),
    [p?.id, doc.generatedAt],
  );
  useEffect(() => () => { changeRequest.current++; }, [p?.path]);

  // project not found: fall back to the fleet board, render nothing this pass.
  if (!p) {
    go("board");
    return null;
  }

  const h = MCModel.rollupHealth(p, doc);
  const riskColor = HEALTH_COLOR[h.health];

  // services that belong to / mention this project
  const relSvc = (doc.services || []).filter(
    (s) => s.id.includes(p.id) || p.id.includes(s.id.replace(/-bridge$/, "")),
  );
  // watched secret patterns touching this project's path
  const relSec = (doc.secrets || []).filter(
    (s) => (s.path && s.path.includes(p.id)) || (s.path && p.path && s.path.startsWith(p.path)),
  );

  const inspectChanges = async () => {
    if (changes?.path === p.path && changes.state !== "unavailable") { changeRequest.current++; setChanges(null); return; }
    const request = ++changeRequest.current;
    setChanges({ path: p.path, state: "loading" });
    try {
      const state = await engine.state(p.path);
      if (request !== changeRequest.current) return;
      if (state.observation?.status === "unavailable" || !Array.isArray(state.dirtyFiles)) {
        setChanges({ path: p.path, state: "unavailable" }); return;
      }
      setChanges({ path: p.path, state: "ready", files: state.dirtyFiles });
    } catch {
      if (request === changeRequest.current) setChanges({ path: p.path, state: "unavailable" });
    }
  };

  return (
    <div className="view-pad">
      <div className="crumb">
        <button type="button" className="link" onClick={() => go("board")}>
          ← fleet
        </button>
        <span>/</span>
        <span style={{ color: "var(--text-secondary)" }}>{MCModel.projectShortName(p)}</span>
      </div>

      {/* ---- HERO: the project's full detail as visual representations ---- */}
      <div className="portrait-hero">
        {grad ? <div className="grad" aria-hidden="true" style={{ background: grad.css }} /> : null}
        {grad ? (
          <div
            className="grad-glow breathe"
            aria-hidden="true"
            style={{ background: grad.glowColor, animation: "mc-breathe 5.5s ease-in-out infinite" }}
          />
        ) : null}

        <div className="hero-inner">
          {/* identity column */}
          <div className="hero-id">
            <div className="hero-name">
              {MCModel.projectShortName(p)}
              <span
                className="risk-tag"
                style={{
                  color: `var(${riskColor})`,
                  background: `color-mix(in srgb, var(${riskColor}) 16%, transparent)`,
                }}
              >
                <span aria-hidden="true">{HEALTH_GLYPH[h.health]}</span> {HEALTH_LABEL[h.health]}
              </span>
            </div>
            <div className="hero-path">{p.path}</div>
            <div className="hero-reason" style={{ color: `var(${riskColor})` }}>
              <span aria-hidden="true">›</span> {h.reason}
            </div>

            {/* actions */}
            <div className="hero-acts">
              <button className="btn primary" onClick={() => openSafety(p.id)}>
                Fix safety…
              </button>
              <button
                className="btn"
                onClick={() => {
                  const dur = Number(snoozeDefault) || 24;
                  snooze(p.id, dur);
                  toast(MCModel.projectShortName(p), `Snoozed for ${dur}h. It will resurface.`, false);
                }}
              >
                Snooze
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* panels grid */}
      <div className="grid-sections" style={{ marginTop: "14px" }}>
        {/* 3a work safety (every value drills to raw) */}
        <div className="section">
          <PanelHead title="Work safety" health={h.health} fresh={freshFor(doc, "git")} />
          <SectionRow
            label="Branch"
            sub="current line of work"
            value={p.branch || "—"}
            valColor="--text-primary"
            openable
            onClick={() =>
              openDrawer({
                title: "Branch",
                tag: MCModel.projectShortName(p),
                tagColor: riskColor,
                rows: [
                  { k: "branch", v: p.branch || "—" },
                  { k: "is repo", v: String(p.isRepo) },
                ],
                raw: p,
              })
            }
          />
          <SectionRow
            label="Changed files"
            sub={changes?.path !== p.path ? "Select to inspect the working tree" : changes.state === "unavailable" ? "Select to try again" : "Select to close this reading"}
            value={p.dirty == null ? "—" : String(p.dirty)}
            valColor={p.dirty == null ? "--text-tertiary" : p.dirty > 15 ? "--state-failed" : p.dirty > 0 ? "--state-warning" : "--state-passed"}
            openable
            expanded={changes?.path === p.path}
            onClick={() => void inspectChanges()}
          />
          {changes?.path === p.path && <div className="changed-files" role="status">
            {changes.state === "loading" ? "Reading the working tree…" : changes.state === "unavailable" ?
              "Could not read the working tree. Select Changed files to try again." :
              changes.files?.length ? <><div>Working-tree reading · {changes.files.length} {changes.files.length === 1 ? "entry" : "entries"}{p.dirty != null && p.dirty !== changes.files.length ? ` · earlier board count ${p.dirty}` : ""}</div><ul>{changes.files.map((file, index) => <li key={index}><span>{file.status || "?"}</span><code>{file.file}</code></li>)}</ul></> :
                `No uncommitted changes in this reading.${p.dirty ? ` Earlier board count ${p.dirty}.` : ""}`}
          </div>}
          <SectionRow
            label="Ahead / Behind"
            sub="compared with the local tracking reference"
            value={`${p.ahead == null ? "—" : p.ahead} / ${p.behind == null ? "—" : p.behind}`}
            openable
            onClick={() =>
              openDrawer({
                title: "Ahead / behind",
                tag: MCModel.projectShortName(p),
                tagColor: riskColor,
                rows: [
                  { k: "ahead", v: p.ahead == null ? "unknown" : String(p.ahead) },
                  { k: "behind", v: p.behind == null ? "unknown" : String(p.behind) },
                  { k: "reference", v: p.upstream || "Not supplied" },
                  { k: "meaning", v: "Counts compare local Git references; remote contents were not checked" },
                ],
                raw: p,
              })
            }
          />
          <SectionRow
            label="Git remotes"
            sub="configured destinations; remote contents are not checked"
            value={p.remotes == null ? "not observed" : p.remotes.length ? p.remotes.join(", ") : "no remote"}
            valColor={p.remotes == null ? "--text-tertiary" : p.remotes.length ? "--state-passed" : "--state-warning"}
            openable
            onClick={() =>
              openDrawer({
                title: "Git remotes",
                tag: MCModel.projectShortName(p),
                tagColor: riskColor,
                rows:
                  p.remotes == null ? [{ k: "Observation", v: "Remote configuration not observed" }]
                    : p.remotes.length ? [...p.remotes.map((r) => ({ k: r, v: "configured Git remote" })), { k: "Coverage", v: "Remote contents and other backups were not checked" }]
                    : [{ k: "Git remotes", v: "None configured; other backups were not assessed" }],
                raw: p,
              })
            }
          />
          <SectionRow
            label="Last save (commit)"
            sub={p.lastCommit ? p.lastCommit.slice(0, 46) + (p.lastCommit.length > 46 ? "…" : "") : p.zeroCommit ? "no commits yet" : "last commit not observed"}
            value={p.lastCommit ? p.lastCommit.split(" ")[0] : "—"}
            openable
            onClick={() =>
              openDrawer({
                title: "Last commit",
                tag: MCModel.projectShortName(p),
                tagColor: riskColor,
                rows: p.lastCommit
                  ? [
                      { k: "hash", v: p.lastCommit.split(" ")[0] },
                      { k: "message", v: p.lastCommit.split(" ").slice(1).join(" ") },
                      { k: "branch", v: p.branch || "—" },
                    ]
                  : [{ k: "Observation", v: p.zeroCommit ? "No commits yet" : "Last commit not observed" }],
                raw: p,
              })
            }
          />
        </div>

        {/* 3b services that belong to / mention this project */}
        {relSvc.length ? (
          <div className="section">
            <PanelHead
              title="Moving parts"
              health={relSvc.some((s) => !s.reachable) ? "attention" : "ok"}
              fresh={freshFor(doc, "services")}
            />
            {relSvc.map((s) => {
              const state = s.reachable ? "up" : s.lockfileStale && s.pidAlive === false ? "stale" : "down";
              const col = state === "up" ? "--state-passed" : state === "stale" ? "--state-warning" : "--state-skipped";
              const fam = (doc.families || []).find((f) => f.family === "services");
              const notes = ((fam && fam.notes) || []).filter((n) =>
                n.toLowerCase().includes(s.id.toLowerCase()),
              );
              return (
                <SectionRow
                  key={s.id}
                  label={s.id}
                  sub={"port " + s.port}
                  color={col}
                  value={state}
                  valColor={col}
                  openable
                  onClick={() =>
                    openDrawer({
                      title: s.id,
                      tag: "service",
                      tagColor: col,
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
                    })
                  }
                />
              );
            })}
          </div>
        ) : null}

        {/* 3f drift / version consistency (drills to raw, shows the disagreeing pair) */}
        {p.drift ? (
          <div className="section">
            <PanelHead
              title="Version consistency"
              health={p.drift.inSync ? "ok" : "attention"}
              fresh={freshFor(doc, "drift-governance")}
            />
            {(
              [
                ["VERSION file", p.drift.versionFile],
                ["package.json", p.drift.packageJson],
                ["README", p.drift.readme],
              ] as [string, string | null][]
            ).map(([k, v]) => (
              <SectionRow
                key={k}
                label={k}
                sub={v == null ? "No version observation" : "Observed version marker"}
                value={v == null ? "not observed" : v}
                valColor={p.drift!.inSync ? "--text-primary" : v == null ? "--text-faint" : "--state-warning"}
                openable
                onClick={() =>
                  openDrawer({
                    title: k,
                    tag: v == null ? "not observed" : p.drift!.inSync ? "in sync" : "drift",
                    tagColor: v == null ? "--text-secondary" : p.drift!.inSync ? "--state-passed" : "--state-warning",
                    rows: [
                      { k: "marker", v: k },
                      { k: "value", v: v == null ? "not observed" : v },
                      { k: "observed markers agree?", v: p.drift!.inSync ? "yes" : "no" },
                    ],
                    raw: p.drift,
                  })
                }
              />
            ))}
            {!p.drift.inSync
              ? (() => {
                  const present = (
                    [
                      ["VERSION", p.drift!.versionFile],
                      ["package.json", p.drift!.packageJson],
                      ["README", p.drift!.readme],
                    ] as [string, string | null][]
                  ).filter((x) => x[1] != null);
                  return (
                    <SectionRow
                      label="Disagreement"
                      sub={present.map((x) => x[0] + "=" + x[1]).join("  vs  ")}
                      value="out of sync"
                      valColor="--state-warning"
                      openable
                      onClick={() =>
                        openDrawer({
                          title: "Version drift",
                          tag: "attention",
                          tagColor: "--state-warning",
                          rows: present
                            .map((x) => ({ k: x[0], v: x[1] as string }))
                            .concat([
                              { k: "why it matters", v: "markers should match so the project's reported version is trustworthy" },
                            ]),
                          raw: p.drift,
                        })
                      }
                    />
                  );
                })()
              : null}
          </div>
        ) : null}

        {/* 3e secrets touching this project's path (presence + location ONLY) */}
        {relSec.length ? (
          <div className="section">
            <PanelHead
              title="Hygiene / secrets"
              health={relSec.some((s) => s.present && s.severity === "warn") ? "attention" : "ok"}
              fresh={freshFor(doc, "drift-governance")}
            />
            {relSec.map((s, i) => (
              <SecretRow key={s.pattern + i} secret={s} />
            ))}
          </div>
        ) : null}

        {/* 3g recorded story — the rich timeline (full width) */}
        <div className="section" style={{ gridColumn: "1 / -1" }}>
          <PanelHead title="The recorded story" health="neutral" fresh={freshFor(doc, "drift-governance")} />
          <Timeline project={p} />
        </div>
      </div>
    </div>
  );
}
