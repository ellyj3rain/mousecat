/* ============================================================================
   Overlays — single-owner state for the cross-cutting surfaces that many views
   open: the drill-to-raw DRAWER (nothing is a dead end), the loss-risk SAFETY GATE
   (the one real plan-then-apply surface), and ephemeral TOASTS. Views call
   openDrawer / openSafety / toast; App renders the hosts + the SafetyGate.

   (There used to be a second, SIMULATED plan-then-apply modal here. It was retired:
   a gate that mimicked the real one's UI but mutated nothing, with copy claiming it
   "wires to pb-core", violated the no-silent-fake invariant. Real actuation is the
   SafetyGate, backed by the gated engine outside pb-core.)
   ============================================================================ */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface DrawerRow {
  k: string;
  v: string | number;
  prose?: boolean;
}
export interface DrawerPayload {
  title: string;
  tag?: string;
  tagColor?: string; // a --state-*/--accent* css var name
  rows: DrawerRow[];
  note?: string | null;
  notes?: string[];
  raw?: unknown;
  action?: () => void;
  actionLabel?: string;
}

export interface ToastItem {
  id: string;
  title: string;
  body: string;
  danger?: boolean;
}

interface OverlaysValue {
  drawer: DrawerPayload | null;
  openDrawer: (p: DrawerPayload) => void;
  closeDrawer: () => void;

  /** The loss-risk safety gate, keyed by project id (the SAFETY NET). */
  safety: string | null;
  openSafety: (projectId: string) => void;
  closeSafety: () => void;

  toasts: ToastItem[];
  toast: (title: string, body: string, danger?: boolean) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<OverlaysValue | null>(null);

let toastSeq = 0;

export function OverlaysProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<DrawerPayload | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const openDrawer = useCallback((p: DrawerPayload) => setDrawer(p), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  const openSafety = useCallback((projectId: string) => setSafety(projectId), []);
  const closeSafety = useCallback(() => setSafety(null), []);

  const dismissToast = useCallback(
    (id: string) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  );
  const toast = useCallback(
    (title: string, body: string, danger = false) => {
      const id = "t" + toastSeq++;
      setToasts((t) => [...t, { id, title, body, danger }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
    },
    [],
  );

  const value = useMemo<OverlaysValue>(
    () => ({
      drawer,
      openDrawer,
      closeDrawer,
      safety,
      openSafety,
      closeSafety,
      toasts,
      toast,
      dismissToast,
    }),
    [drawer, safety, toasts, openDrawer, closeDrawer, openSafety, closeSafety, toast, dismissToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOverlays(): OverlaysValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOverlays must be used within OverlaysProvider");
  return c;
}
