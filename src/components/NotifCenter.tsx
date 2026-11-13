/* ============================================================================
   NotifCenter — the notifications drawer (scrim + aside). Two tabs: what needs
   you right now (live attention signals, un-snoozed) and the kept history (past
   alerts + completed actions). Honest by construction: the room speaks up only
   when a real signal fires; snoozed items are hidden from the active view but
   never thrown away, and history holds everything so nothing is lost.

   Static surface (no animation island here): the drawer is plain DOM, so the
   committed markup is the whole reading. Tab selection is local state.
   ============================================================================ */
import { useState, type CSSProperties } from "react";
import type { AttentionSignal } from "../model/engine";
import { useFleet } from "../data/useFleet";
import { useUi } from "../state/ui";
import { useNotifications, useAttention, type NotifRecord } from "../state/notifications";
import { HEALTH_COLOR, HEALTH_LABEL, timeAgo } from "../lib/visual";
import type { Health } from "../model/engine";

type Tab = "attention" | "history";

const QUICK_SNOOZE: [string, number][] = [
  ["1h", 1],
  ["8h", 8],
  ["24h", 24],
  ["1w", 168],
];

function AttentionCard({
  it,
  snoozeDefault,
  onOpen,
  onSnooze,
}: {
  it: AttentionSignal;
  snoozeDefault: string;
  onOpen: () => void;
  onSnooze: (hours: number) => void;
}) {
  const color = `var(${HEALTH_COLOR[it.health]})`;
  return (
    <div className="notif-card">
      <div className="top">
        <span aria-hidden="true" style={{ color }}>
          {it.health === "risk" ? "✕" : "!"}
        </span>
        <strong>{it.name}</strong>
        <span
          className="risk-tag"
          style={{
            marginLeft: "auto",
            color,
            background: `color-mix(in srgb,var(${HEALTH_COLOR[it.health]}) 16%,transparent)`,
          }}
        >
          {HEALTH_LABEL[it.health]}
        </span>
      </div>
      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{it.text}</span>
      <div className="acts">
        {it.project && (
          <button className="mini-btn" onClick={onOpen}>
            Open
          </button>
        )}
        <button className="mini-btn" onClick={() => onSnooze(Number(snoozeDefault) || 24)}>
          Snooze {snoozeDefault}h
        </button>
        <span className="snooze-pop">
          {QUICK_SNOOZE.map(([lbl, hrs]) => (
            <button key={lbl} className="mini-btn" onClick={() => onSnooze(hrs)}>
              {lbl}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

function SnoozedCard({
  it,
  until,
  onWake,
}: {
  it: AttentionSignal;
  until: number | undefined;
  onWake: () => void;
}) {
  return (
    <div className="notif-card" style={{ opacity: ".7" }}>
      <div className="top">
        <span aria-hidden="true">⏾</span>
        <strong>{it.name}</strong>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "10.5px",
            color: "var(--text-faint)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {until != null ? "until " + new Date(until).toLocaleString() : ""}
        </span>
      </div>
      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{it.text}</span>
      <div className="acts">
        <button className="mini-btn" onClick={onWake}>
          Wake now
        </button>
      </div>
    </div>
  );
}

function ActivitySourceDetails({ activity }: { activity: NonNullable<NotifRecord["projectActivity"]> }) {
  let event: { type?: unknown; data?: Record<string, unknown> } | null = null;
  try {
    const parsed: unknown = JSON.parse(activity.eventEvidence);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const item = parsed as { type?: unknown; data?: unknown };
      if (item.data && typeof item.data === "object" && !Array.isArray(item.data)) {
        event = { type: item.type, data: item.data as Record<string, unknown> };
      }
    }
  } catch { /* An unparseable retained record is shown as unavailable. */ }
  const fact = (key: string) => {
    if (!event) return "Unavailable";
    const value = event.data?.[key];
    return typeof value === "string" && value ? value : "Not reported";
  };
  const details: [string, string][] = [
    ["Project", activity.projectRef],
    ["Selected source", activity.sourceId],
    ["Selected source revision", activity.sourceRevision],
    ["Event", activity.eventId],
    ["Event type", typeof event?.type === "string" ? event.type : "Unavailable"],
    ["Source record", fact("ref")],
    ["Record revision", fact("revision")],
    ["Reported actor reference", fact("actorRef")],
    ["Reported action", fact("action")],
    ["Reported status", fact("status")],
  ];
  for (const [label, key] of [["Interaction", "interactionId"], ["Item", "itemId"], ["Workbench", "workbenchId"], ["Operation", "operationId"], ["Receipt", "receiptId"]]) {
    const value = event?.data?.[key];
    if (typeof value === "string" && value) details.push([label, value]);
  }
  return (
    <details style={{ fontSize: "11px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
      <summary>Source and scope</summary>
      <dl>
        {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <span>Reported actor references do not establish ownership or execution.</span>
    </details>
  );
}

export function HistoryCard({ n }: { n: NotifRecord }) {
  const colorVar = HEALTH_COLOR[n.health as Health] || "--state-info";
  const glyph = n.kind === "action" ? "✓" : n.health === "risk" ? "✕" : "!";
  return (
    <div className="notif-card">
      <div className="top">
        <span aria-hidden="true" style={{ color: `var(${colorVar})` }}>
          {glyph}
        </span>
        <strong style={{ fontWeight: n.read ? "400" : "600" }}>{n.name}</strong>
        {n.snoozed && (
          <span
            style={{ fontSize: "9px", color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}
          >
            snoozed
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontSize: "10.5px",
            color: "var(--text-faint)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {timeAgo(n.at)}
        </span>
      </div>
      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{n.text}</span>
      {n.projectActivity && (
        <>
          <span style={{ fontSize: "10.5px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            {n.projectActivity.projectRef}
          </span>
          <ActivitySourceDetails activity={n.projectActivity} />
        </>
      )}
    </div>
  );
}

export function NotifCenter() {
  const { doc } = useFleet();
  const { active, snoozed } = useAttention(doc);
  const {
    snoozed: snoozedUntil,
    snooze,
    unsnooze,
    history,
    markAllRead,
    clearHistory,
    snoozeDefault,
  } = useNotifications();
  const { openProject, closePanel } = useUi();

  const unread = history.filter((n) => !n.read).length;
  const unreadUpdates = history.filter((n) => n.projectActivity && !n.read).length;
  const [tab, setTab] = useState<Tab>(() => active.length === 0 && unreadUpdates > 0 ? "history" : "attention");

  const mkTab = (key: Tab, label: string, count: number | null) => (
    <button
      className="notif-tab"
      aria-current={tab === key ? "true" : "false"}
      onClick={() => setTab(key)}
    >
      {label}
      {count != null && <span className="ct">{String(count)}</span>}
    </button>
  );

  return (
    <div className="scrim" onClick={() => closePanel()}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="t">Notifications</div>
          <button className="icon-btn" aria-label="Close" onClick={() => closePanel()}>
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <div className="notif-tabs">
            {mkTab("attention", "Needs you now", active.length)}
            {mkTab("history", "History", unread || null)}
          </div>

          {tab === "attention" ? (
            active.length === 0 && snoozed.length === 0 ? (
              <div className="empty-note">
                <div className="big">A quiet room</div>
                <div>Nothing needs you right now. The room speaks up only when it should.</div>
              </div>
            ) : (
              <>
                {active.map((it) => (
                  <AttentionCard
                    key={it.id}
                    it={it}
                    snoozeDefault={snoozeDefault}
                    onOpen={() => {
                      closePanel();
                      if (it.project) openProject(it.project.id);
                    }}
                    onSnooze={(hours) => snooze(it.id, hours)}
                  />
                ))}
                {snoozed.length > 0 && (
                  <>
                    <div
                      style={
                        {
                          fontSize: "10px",
                          letterSpacing: ".5px",
                          textTransform: "uppercase",
                          color: "var(--text-faint)",
                          padding: "16px 0 4px",
                        } as CSSProperties
                      }
                    >
                      Snoozed ({snoozed.length})
                    </div>
                    {snoozed.map((it) => (
                      <SnoozedCard
                        key={it.id}
                        it={it}
                        until={snoozedUntil[it.id]}
                        onWake={() => unsnooze(it.id)}
                      />
                    ))}
                  </>
                )}
              </>
            )
          ) : (
            <>
              <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                <button className="mini-btn" onClick={() => markAllRead()}>
                  Mark all read
                </button>
                <button className="mini-btn" onClick={() => clearHistory()}>
                  Clear
                </button>
              </div>
              {history.length === 0 ? (
                <div className="empty-note">
                  <div className="big">Nothing kept yet</div>
                  <div>Past alerts and completed actions collect here so nothing is lost.</div>
                </div>
              ) : (
                history.map((n) => <HistoryCard key={n.id + n.at} n={n} />)
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
