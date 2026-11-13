/* ============================================================================
   Timeline - a real horizontal rail of a project's dated commits / decisions /
   releases, with rhythm, explicit quiet-spell gap bands, and every point openable
   to its real entry.

   HONESTY: this reads the project's RECORDED history through the gated engine
   (engine.history -> real git log + the project's DECISION_REGISTRY / BATCH_LOG
   anchors). Every point is a real, recorded entry (synthetic === false); there is no
   reconstruction here. Earlier this rail inferred points from the version trajectory
   because the lean pb-core contract only carried the last commit + latest batch/DR;
   now the engine reads the whole history off disk, so the inferred/"ghost" path is
   gone and the empty states stay honest (zero-commit vs not-a-repo). Nothing faked.

   Uses the engine-fetch idiom: useEffect fetch, a
   loading, explicit unavailable and retry states, and refetch on path change.
   ============================================================================ */
import { useEffect, useState } from "react";
import type { ProjectEntry } from "../types/status";
import { engine, type EngineEvent, type HistoryResult } from "../data/engineApi";
import { fmtDate } from "../lib/visual";
import { useOverlays } from "../state/overlays";

const DAY = 86400000;
const GAP_DAYS = 21; // a quiet spell worth marking on the rail

interface Gap {
  afterIdx: number;
  beforeIdx: number;
  days: number;
}

type DatedEvent = EngineEvent & { at: number };

function findGaps(events: DatedEvent[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < events.length; i++) {
    const delta = events[i].at - events[i - 1].at;
    if (delta > GAP_DAYS * DAY) {
      gaps.push({ afterIdx: i - 1, beforeIdx: i, days: Math.round(delta / DAY) });
    }
  }
  return gaps;
}

export function Timeline({ project: p }: { project: ProjectEntry }) {
  const { openDrawer } = useOverlays();
  const [hist, setHist] = useState<HistoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setUnavailable(false);
    (async () => {
      try {
        const r = await engine.history(p.path);
        if (live) { setHist(r); setUnavailable(r.status === "unavailable"); }
      } catch {
        if (live) { setHist(null); setUnavailable(true); }
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [p.path, attempt]);

  if (loading) {
    return (
      <div className="tl">
        <div className="empty-note" style={{ padding: "34px 10px" }}>
          <div>Reading the recorded history…</div>
        </div>
      </div>
    );
  }

  if (unavailable) return <div className="tl"><div className="empty-note" style={{ padding: "34px 10px" }}>
    <div className="big">History unavailable</div><div>The source could not be read. Its history may still exist.</div>
    <button type="button" className="btn" onClick={() => setAttempt(value => value + 1)}>Try again</button>
  </div></div>;

  // Distinguish observed empty history from a failed read.
  if (!hist || hist.empty) {
    const kind = hist?.emptyKind;
    return (
      <div className="tl">
        <div className="empty-note" style={{ padding: "34px 10px" }}>
          <div className="big">{kind === "zero-commit" ? "No story yet" : kind === "not-git" ? "Not version-controlled" : "No recorded history"}</div>
          <div>
            {kind === "zero-commit"
              ? "This project has no commits yet. An honest empty story, not an error. Its first save will start the timeline."
              : kind === "not-git"
                ? "This folder isn't a git repository, so there's no recorded history to lay out."
                : "There are no recorded commits, releases, or decisions to lay out for this project yet."}
          </div>
        </div>
      </div>
    );
  }

  const ev = hist.events.filter((event): event is DatedEvent => typeof event.at === "number" && Number.isFinite(event.at));
  const undated = hist.events.filter(event => event.at == null || !Number.isFinite(event.at));
  const undatedView = undated.length > 0 && <div className="empty-note" style={{ padding: "16px 10px", textAlign: "left" }}>
    <div className="big">Recorded entries without a usable date</div>
    <div>These entries cannot be placed on the timeline. Open one to inspect its source.</div>
    {undated.map((entry, index) => <button type="button" className="btn" key={index} onClick={() => openDrawer({
      title: entry.kind === "decision" ? "Decision" : entry.kind === "commit" ? "Commit" : "Release",
      tag: entry.tag,
      tagColor: entry.kind === "decision" ? "--accent2" : entry.kind === "commit" ? "--accent3" : "--accent",
      rows: [
        { k: "type", v: entry.kind },
        { k: "source", v: "project history (recorded)" },
        { k: "title", v: entry.title },
        { k: "when", v: "date unavailable or invalid" },
        { k: "summary", v: entry.summary },
      ],
      raw: entry.raw,
    })}>{entry.tag}: {entry.title}</button>)}
  </div>;
  const n = ev.length;
  if (!n) return <div className="tl">{undatedView}</div>;
  const from = hist.span?.from ?? ev[0].at;
  const to = hist.span?.to ?? ev[n - 1].at;
  const range = Math.max(1, to - from);
  // width scales with event count so a year of history stays legible (horizontal scroll)
  const railW = Math.max(640, n * 120);
  const xOf = (t: number) => 4 + ((t - from) / range) * 92; // percent within the rail
  const gaps = findGaps(ev);

  return (
    <div className="tl">
      <div className="tl-scroll">
        <div className="tl-rail" style={{ width: railW + "px" }}>
          <div className="tl-axis" />

          {/* quiet-spell gap bands (explicit "N quiet days") */}
          {gaps.map((g, gi) => {
            const x1 = xOf(ev[g.afterIdx].at);
            const x2 = xOf(ev[g.beforeIdx].at);
            return (
              <div className="tl-gap" key={"gap" + gi} style={{ left: x1 + "%", width: x2 - x1 + "%" }}>
                <div className="gap-lbl">{g.days} quiet days</div>
              </div>
            );
          })}

          {ev.map((e, i) => {
            const x = xOf(e.at);
            const isDec = e.kind === "decision";
            const isCommit = e.kind === "commit";
            return (
              <div className="tl-pt" key={i} style={{ left: x + "%" }}>
                <div className="tl-date">{fmtDate(e.at)}</div>
                <div className="tl-stem" />
                <button
                  className={"tl-node " + e.kind}
                  title={e.title}
                  aria-label={`${e.kind} ${e.tag}: ${e.title}`}
                  onClick={() =>
                    openDrawer({
                      title: isDec ? "Decision" : isCommit ? "Commit" : "Release",
                      tag: e.tag,
                      tagColor: isDec ? "--accent2" : isCommit ? "--accent3" : "--accent",
                      rows: [
                        { k: "type", v: e.kind },
                        { k: "source", v: "project history (recorded)" },
                        { k: "title", v: e.title },
                        { k: "when", v: new Date(e.at).toLocaleString() },
                        { k: "summary", v: e.summary },
                      ],
                      raw: e.raw,
                    })
                  }
                />
                <div className="tl-label">{e.tag}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* legend - every point is a real recorded entry */}
      <div className="tl-legend">
        <span className="lg">
          <i className="release" />
          Release
        </span>
        <span className="lg">
          <i className="decision" />
          Decision
        </span>
        <span className="lg">
          <i className="commit" />
          Commit
        </span>
        <span style={{ color: "var(--text-faint)", fontSize: "10.5px" }}>
          {`${n} recorded point${n === 1 ? "" : "s"} · long gaps marked as quiet spells`}
        </span>
      </div>
      {undatedView}
    </div>
  );
}
