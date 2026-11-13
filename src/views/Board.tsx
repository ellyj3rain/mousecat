/* ============================================================================
   Board — the fleet board. Loss-risk-first sort by default; filter + search that
   stay legible; per-tile pin / resize / drag persisted. The freshness stamp reads
   the git family's observedAt (real per-section freshness), not generatedAt.
   ============================================================================ */
import { useMemo } from "react";
import { MCModel } from "../model/engine";
import type { ProjectEntry, StatusDoc } from "../types/status";
import { useUi, type FilterKey, type SortKey } from "../state/ui";
import { timeAgo } from "../lib/visual";
import { Tile } from "../components/Tile";
import { WorkspaceIntro, WorkspaceSources } from "../components/WorkspaceIntro";
import { WorkObservatory } from "../components/WorkObservatory";
import { useWorkspace } from "../data/workspace";

const SORTS: [SortKey, string][] = [
  ["health", "Worst first"],
  ["name", "Name"],
  ["loss", "Loss risk"],
  ["manual", "Manual"],
];
const FILTERS: [FilterKey, string][] = [
  ["all", "All"],
  ["risk", "At risk"],
  ["attention", "Wants a look"],
  ["has-remote", "Has Git remote"],
  ["no-remote", "No Git remote"],
  ["not-git", "Not git"],
];

const LOSS_ORDER: Record<string, number> = {
  "zero-commit": 0,
  "dirty-heavy": 1,
  "no-remote": 2,
  "not-git": 3,
  none: 4,
};

export function Board({ doc }: { doc: StatusDoc }) {
  const ui = useUi();
  const workspace = useWorkspace();
  const { query, sort, filter, layout } = ui;

  const list = useMemo(() => {
    let l = doc.projects.slice();
    const q = query.trim().toLowerCase();
    if (q) l = l.filter((p) => (p.id + " " + (p.path || "") + " " + (p.branch || "")).toLowerCase().includes(q));
    if (filter !== "all") {
      l = l.filter((p) => {
        const hh = MCModel.rollupHealth(p, doc).health;
        if (filter === "risk") return hh === "risk";
        if (filter === "attention") return hh === "attention" || hh === "risk";
        if (filter === "has-remote") return !!(p.remotes && p.remotes.length);
        if (filter === "no-remote") return Array.isArray(p.remotes) && p.remotes.length === 0;
        if (filter === "repo") return p.isRepo;
        if (filter === "not-git") return !p.isRepo;
        return true;
      });
    }
    l.sort((a, b) => {
      const la = layout[a.id] || {};
      const lb = layout[b.id] || {};
      if ((lb.pinned ? 1 : 0) !== (la.pinned ? 1 : 0)) return (lb.pinned ? 1 : 0) - (la.pinned ? 1 : 0);
      if (sort === "manual") {
        const oa = la.order ?? 999;
        const ob = lb.order ?? 999;
        if (oa !== ob) return oa - ob;
      }
      if (sort === "health") {
        const d = MCModel.HEALTH_RANK[MCModel.rollupHealth(a, doc).health] - MCModel.HEALTH_RANK[MCModel.rollupHealth(b, doc).health];
        if (d) return d;
      }
      if (sort === "name") return MCModel.projectShortName(a).localeCompare(MCModel.projectShortName(b));
      if (sort === "loss") {
        const d = (LOSS_ORDER[a.lossRisk] ?? 9) - (LOSS_ORDER[b.lossRisk] ?? 9);
        if (d) return d;
      }
      return MCModel.projectShortName(a).localeCompare(MCModel.projectShortName(b));
    });
    return l;
  }, [doc, query, sort, filter, layout]);

  const orderedIds = useMemo(() => list.map((p: ProjectEntry) => p.id), [list]);
  const freshStamp = workspace.status === "live" ? "Observed " + timeAgo(workspace.data?.observedAt) : "Current source observation unavailable";

  return (
    <div className="workspace-shell">
      <WorkspaceIntro doc={doc} />
      <WorkObservatory />
      <div className="board-bar">
        <span className="count"><strong>{list.length}</strong> {list.length === 1 ? "source" : "sources"} observed</span>
        <label>Order<select aria-label="Project order" value={sort} onChange={event => ui.setSort(event.target.value as SortKey)}>{SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Show<select aria-label="Project status filter" value={filter} onChange={event => ui.setFilter(event.target.value as FilterKey)}>{FILTERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <span className="fresh">{freshStamp}</span>
      </div>

      <div id="board">
        {list.length === 0 ? (
          <div className="empty-note" style={{ gridColumn: "1 / -1" }}>
            <div className="big">No observed source in this view</div>
            <div>Source bindings and observations update as the workspace changes.</div>
          </div>
        ) : (
          list.map((p) => (
            <Tile
              key={p.id}
              project={p}
              doc={doc}
              layout={layout[p.id] || {}}
              onOpen={ui.openProject}
              onTogglePin={ui.togglePin}
              onCycleSize={ui.cycleSize}
              onReorder={(from, to) => ui.reorder(from, to, orderedIds)}
            />
          ))
        )}
      </div>
      <WorkspaceSources doc={doc} />
    </div>
  );
}
