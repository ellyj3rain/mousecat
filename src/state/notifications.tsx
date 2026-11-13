/* ============================================================================
   Notifications — snooze state, kept history, and the OS-notification settings.
   Snooze is app-state (the shared engine returns the full signal list; filtering
   snoozed items stays here). useAttention() splits the engine's signals into the
   active (un-snoozed) view, the snoozed view, and the full list, so the chrome
   badge, the attention strip, and the notifications center all agree.
   ============================================================================ */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MCModel, type AttentionSignal } from "../model/engine";
import type { StatusDoc } from "../types/status";
import { receiveProjectActivity as receiveActivityPage, visibleProjectHistory, type ActivityAuthority, type ReceiveResult } from "../data/project-activity-receiver.mjs";

export type OsSeverity = "critical-only" | "critical-high" | "all";

export interface NotifRecord {
  id: string;
  name: string;
  text: string;
  health: string;
  kind: "project" | "service" | "action";
  at: string; // ISO
  read: boolean;
  snoozed?: boolean;
  projectActivity?: {
    sourceId: string;
    sourceRevision: string;
    projectRef: string;
    recipientRef: string;
    eventId: string;
    meaning: string;
    eventEvidence: string;
  };
}

const LS = {
  snooze: "mc-snooze",
  notifs: "mc-notif-history",
  osSeverity: "mc-os-severity",
  snoozeDefault: "mc-snooze-default",
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

interface NotifValue {
  snoozed: Record<string, number>;
  isSnoozed: (id: string) => boolean;
  snooze: (id: string, hours: number) => void;
  unsnooze: (id: string) => void;

  history: NotifRecord[];
  pushHistory: (rec: NotifRecord) => void;
  receiveProjectActivity: (page: unknown) => ReceiveResult;
  markAllRead: () => void;
  clearHistory: () => void;

  osSeverity: OsSeverity;
  setOsSeverity: (v: OsSeverity) => void;
  snoozeDefault: string; // hours, as string
  setSnoozeDefault: (v: string) => void;
}

const Ctx = createContext<NotifValue | null>(null);

// The installed root passes no authority. This private candidate stays inert
// until an owning host supplies a reviewed, authenticated selection and port.
export function NotificationsProvider({ children, projectActivityAuthority }: { children: ReactNode; projectActivityAuthority?: ActivityAuthority }) {
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => load(LS.snooze, {}));
  const [history, setHistory] = useState<NotifRecord[]>(() => load(LS.notifs, []));
  const historyRef = useRef(history);
  const [osSeverity, setOsSeverityState] = useState<OsSeverity>(
    () => (localStorage.getItem(LS.osSeverity) as OsSeverity) || "critical-high",
  );
  const [snoozeDefault, setSnoozeDefaultState] = useState<string>(
    () => localStorage.getItem(LS.snoozeDefault) || "24",
  );

  const persistSnooze = useCallback((next: Record<string, number>) => {
    localStorage.setItem(LS.snooze, JSON.stringify(next));
    setSnoozed(next);
  }, []);
  const persistHistory = useCallback((next: NotifRecord[]) => {
    localStorage.setItem(LS.notifs, JSON.stringify(next));
    historyRef.current = next;
    setHistory(next);
  }, []);
  // A production receiving port also needs an owner-supplied revocation signal
  // to force a render on authority change; this candidate has no such port.
  const visibleHistory = visibleProjectHistory(history, projectActivityAuthority);

  const isSnoozed = useCallback(
    (id: string) => {
      const until = snoozed[id];
      return !!until && until > Date.now();
    },
    [snoozed],
  );
  const snooze = useCallback(
    (id: string, hours: number) => persistSnooze({ ...snoozed, [id]: Date.now() + hours * 3600000 }),
    [snoozed, persistSnooze],
  );
  const unsnooze = useCallback(
    (id: string) => {
      const next = { ...snoozed };
      delete next[id];
      persistSnooze(next);
    },
    [snoozed, persistSnooze],
  );

  const pushHistory = useCallback(
    (rec: NotifRecord) => persistHistory([rec, ...historyRef.current]),
    [persistHistory],
  );
  const receiveProjectActivity = useCallback(
    (page: unknown) => receiveActivityPage({ page, authority: projectActivityAuthority, history: historyRef.current,
      commit: (next: NotifRecord[]) => { persistHistory(next); return true; } }),
    [projectActivityAuthority, persistHistory],
  );
  const markAllRead = useCallback(
    () => { const ids = new Set(visibleHistory.map((n) => n.id)); persistHistory(historyRef.current.map((n) => ids.has(n.id) ? { ...n, read: true } : n)); },
    [visibleHistory, persistHistory],
  );
  const clearHistory = useCallback(() => { const ids = new Set(visibleHistory.map((n) => n.id)); persistHistory(historyRef.current.filter((n) => !ids.has(n.id))); }, [visibleHistory, persistHistory]);

  const setOsSeverity = useCallback((v: OsSeverity) => {
    localStorage.setItem(LS.osSeverity, v);
    setOsSeverityState(v);
  }, []);
  const setSnoozeDefault = useCallback((v: string) => {
    localStorage.setItem(LS.snoozeDefault, v);
    setSnoozeDefaultState(v);
  }, []);

  const value = useMemo<NotifValue>(
    () => ({
      snoozed,
      isSnoozed,
      snooze,
      unsnooze,
      history: visibleHistory,
      pushHistory,
      receiveProjectActivity,
      markAllRead,
      clearHistory,
      osSeverity,
      setOsSeverity,
      snoozeDefault,
      setSnoozeDefault,
    }),
    [snoozed, isSnoozed, snooze, unsnooze, visibleHistory, pushHistory, receiveProjectActivity, markAllRead, clearHistory, osSeverity, setOsSeverity, snoozeDefault, setSnoozeDefault],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotifValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotifications must be used within NotificationsProvider");
  return c;
}

export interface AttentionView {
  all: AttentionSignal[];
  active: AttentionSignal[];
  snoozed: AttentionSignal[];
}

/** Split the engine's attention signals by snooze state. */
export function useAttention(doc: StatusDoc): AttentionView {
  const { isSnoozed } = useNotifications();
  return useMemo(() => {
    const all = MCModel.attentionSignals(doc);
    const active: AttentionSignal[] = [];
    const snoozed: AttentionSignal[] = [];
    for (const it of all) (isSnoozed(it.id) ? snoozed : active).push(it);
    return { all, active, snoozed };
  }, [doc, isSnoozed]);
}
