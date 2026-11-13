/* ============================================================================
   Chrome — the persistent header. Wordmark, an overall-status pill (glyph + text,
   color never the only signal), Fleet / This machine nav, search, and the right
   cluster: the HONEST source badge (LIVE vs SAMPLE) + connection state, plus the
   notifications / act / settings entry points.
   ============================================================================ */
import { MCModel, type Health } from "../model/engine";
import { Icon } from "./Icon";
import type { FleetSnapshot, ConnState } from "../types/status";
import { useUi } from "../state/ui";
import { useAttention, useNotifications } from "../state/notifications";
import { HEALTH_COLOR, HEALTH_GLYPH } from "../lib/visual";
import mousecatLogo from "../assets/mousecat-primary.png";

const CONN_TEXT: Record<ConnState, string> = {
  live: "live",
  connecting: "connecting",
  reconnecting: "reconnecting",
  offline: "offline",
};
const CONN_TITLE: Record<ConnState, string> = {
  live: "Connected to pb-core stream",
  connecting: "Reaching pb-core",
  reconnecting: "Lost the stream, retrying",
  offline: "Service not reachable, showing sample",
};

export function Chrome({ snap }: { snap: FleetSnapshot }) {
  const ui = useUi();
  const { doc, source, conn } = snap;
  const workspaceObserved = snap.workspaceStatus === "live";
  const workspaceLabel = workspaceObserved ? "WORKSPACE OBSERVED"
    : snap.workspaceStatus === "loading" ? "WORKSPACE LOADING"
    : snap.workspaceStatus === "offline" ? "WORKSPACE OFFLINE"
    : "WORKSPACE UNAVAILABLE";
  const workspaceTitle = workspaceObserved
    ? "A current workspace snapshot is available; source declarations retain their own standing."
    : snap.workspaceStatus === "loading" ? "Waiting for a workspace snapshot."
    : snap.workspaceStatus === "offline" ? "Workspace observations are not being read in defaults mode."
    : "The workspace snapshot is unavailable or out of date.";

  const { active: items } = useAttention(doc);
  const { history } = useNotifications();
  const unreadUpdates = history.filter((item) => item.projectActivity && !item.read).length;
  const summary = MCModel.fleetSummary(doc);
  const overall: { health: Health; text: string } = summary.risk
    ? { health: "risk", text: summary.risk + (summary.risk === 1 ? " needs care" : " need care") }
    : summary.attention ? { health: "attention", text: summary.attention + (summary.attention === 1 ? " wants a look" : " want a look") }
    : { health: "neutral", text: summary.total ? summary.total + " sources observed" : "Source pending" };

  return (
    <header className="chrome">
      <div
        className="wordmark"
        role="button"
        tabIndex={0}
        onClick={() => ui.go("board")}
        onKeyDown={(e) => {
          if (e.key === "Enter") ui.go("board");
        }}
      >
        <img className="logo" src={mousecatLogo} alt="" aria-hidden="true" />
        <span className="mark">Mouse<span className="dot">cat</span></span>
      </div>

      <div
        className="pill"
        title="overall fleet status"
        role="button"
        tabIndex={0}
        style={{
          color: `var(${HEALTH_COLOR[overall.health]})`,
          borderColor: `color-mix(in srgb, var(${HEALTH_COLOR[overall.health]}) 40%, var(--border-default))`,
        }}
        onClick={() => {
          ui.setFilter(overall.health === "risk" ? "risk" : overall.health === "attention" ? "attention" : "all");
          ui.go("board");
        }}
      >
        <span className="glyph" aria-hidden="true">
          {HEALTH_GLYPH[overall.health]}
        </span>
        <span>{overall.text}</span>
      </div>

      <div className="nav-seg">
        <button aria-current={ui.view === "board" || ui.view === "project"} onClick={() => ui.go("board")}>
          Work
        </button>
        <button aria-current={ui.view === "machine"} onClick={() => ui.go("machine")}>
          This machine
        </button>
      </div>

      <div className="searchbox" style={{ flex: "1 1 auto" }}>
        <span className="ic" aria-hidden="true">
          <Icon name="search" size={16} />
        </span>
        <input
          type="text"
          value={ui.query}
          placeholder="Search projects, paths, branches…"
          aria-label="Search projects"
          onChange={(e) => ui.setQuery(e.target.value)}
        />
      </div>

      <div className="right-cluster">
        <span
          className={"source-badge " + (workspaceObserved ? "live" : "sample")}
          title={workspaceTitle}
        >
          <span aria-hidden="true">{workspaceObserved ? "•" : "○"}</span>
          {workspaceLabel}
        </span>
        <div className={"conn " + conn} title={CONN_TITLE[conn]}>
          <span className="led" aria-hidden="true" />
          Machine {source === "sample" ? "offline" : CONN_TEXT[conn]}
        </div>
        <button
          className="icon-btn"
          aria-label={`Notifications (${items.length} need attention, ${unreadUpdates} unread project updates)`}
          onClick={() => ui.togglePanel("notifs")}
        >
          <Icon name="bell" />{items.length > 0 && <span className="badge">{items.length}</span>}
          {unreadUpdates > 0 && <span aria-hidden="true" style={{ position: "absolute", right: -2, bottom: -2, width: 7, height: 7, borderRadius: "50%", background: "var(--state-info)", boxShadow: "0 0 0 2px var(--bg-tertiary)" }} />}
        </button>
        <button className="icon-btn" aria-label="Settings" onClick={() => ui.togglePanel("settings")}>
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}
