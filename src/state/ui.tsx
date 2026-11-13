/* ============================================================================
   UI state — view / panel / board controls / per-tile layout, with the localStorage
   persistence the prototype used (mc-* keys). Shared via context so the chrome and
   the board agree on one state, the way the prototype's single App object did.
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

export type View = "board" | "project" | "machine";
export type Panel = "notifs" | "settings" | null;
export type SortKey = "health" | "name" | "loss" | "manual";
export type FilterKey =
  | "all"
  | "risk"
  | "attention"
  | "has-remote"
  | "no-remote"
  | "repo"
  | "not-git";
export type TileSize = "normal" | "wide" | "tall" | "large";

export interface TileLayout {
  order?: number;
  size?: TileSize;
  pinned?: boolean;
}
export type BoardLayout = Record<string, TileLayout>;

const LS = {
  layout: "mc-board-layout",
  sort: "mc-sort",
  filter: "mc-filter",
} as const;

function loadLayout(): BoardLayout {
  try {
    return JSON.parse(localStorage.getItem(LS.layout) || "{}");
  } catch {
    return {};
  }
}

interface UiContextValue {
  view: View;
  activeProject: string | null;
  panel: Panel;
  query: string;
  sort: SortKey;
  filter: FilterKey;
  layout: BoardLayout;

  go: (view: View) => void;
  openProject: (id: string) => void;
  setQuery: (q: string) => void;
  setSort: (s: SortKey) => void;
  setFilter: (f: FilterKey) => void;
  togglePanel: (p: Exclude<Panel, null>) => void;
  closePanel: () => void;

  togglePin: (id: string) => void;
  cycleSize: (id: string) => void;
  reorder: (fromId: string, toId: string, ordered: string[]) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("board");
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQueryState] = useState("");
  const [sort, setSortState] = useState<SortKey>(
    () => {
      const saved = localStorage.getItem(LS.sort);
      return saved === "name" || saved === "loss" || saved === "manual" ? saved : "health";
    },
  );
  const [filter, setFilterState] = useState<FilterKey>(
    () => (localStorage.getItem(LS.filter) as FilterKey) || "all",
  );
  const [layout, setLayout] = useState<BoardLayout>(() => loadLayout());
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const persistLayout = useCallback((next: BoardLayout) => {
    localStorage.setItem(LS.layout, JSON.stringify(next));
    setLayout(next);
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    if (v === "board" || v === "machine") setActiveProject(null);
  }, []);
  const openProject = useCallback((id: string) => {
    setActiveProject(id);
    setView("project");
  }, []);
  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setView((v) => (v !== "board" ? "board" : v));
  }, []);
  const setSort = useCallback((s: SortKey) => {
    localStorage.setItem(LS.sort, s);
    setSortState(s);
  }, []);
  const setFilter = useCallback((f: FilterKey) => {
    localStorage.setItem(LS.filter, f);
    setFilterState(f);
  }, []);
  const togglePanel = useCallback((p: Exclude<Panel, null>) => {
    setPanel((cur) => (cur === p ? null : p));
  }, []);
  const closePanel = useCallback(() => setPanel(null), []);

  const togglePin = useCallback(
    (id: string) => {
      const next = { ...layoutRef.current };
      const ly = { ...(next[id] || {}) };
      ly.pinned = !ly.pinned;
      next[id] = ly;
      persistLayout(next);
    },
    [persistLayout],
  );
  const cycleSize = useCallback(
    (id: string) => {
      const order: TileSize[] = ["normal", "wide", "tall", "large"];
      const next = { ...layoutRef.current };
      const ly = { ...(next[id] || {}) };
      ly.size = order[(order.indexOf(ly.size || "normal") + 1) % order.length];
      next[id] = ly;
      persistLayout(next);
    },
    [persistLayout],
  );
  const reorder = useCallback(
    (fromId: string, toId: string, ordered: string[]) => {
      if (!fromId || fromId === toId) return;
      const list = ordered.slice();
      const fi = list.indexOf(fromId);
      const ti = list.indexOf(toId);
      if (fi < 0 || ti < 0) return;
      list.splice(ti, 0, list.splice(fi, 1)[0]);
      localStorage.setItem(LS.sort, "manual");
      setSortState("manual");
      const next = { ...layoutRef.current };
      list.forEach((id, i) => {
        next[id] = { ...(next[id] || {}), order: i };
      });
      persistLayout(next);
    },
    [persistLayout],
  );

  const value = useMemo<UiContextValue>(
    () => ({
      view,
      activeProject,
      panel,
      query,
      sort,
      filter,
      layout,
      go,
      openProject,
      setQuery,
      setSort,
      setFilter,
      togglePanel,
      closePanel,
      togglePin,
      cycleSize,
      reorder,
    }),
    [
      view,
      activeProject,
      panel,
      query,
      sort,
      filter,
      layout,
      go,
      openProject,
      setQuery,
      setSort,
      setFilter,
      togglePanel,
      closePanel,
      togglePin,
      cycleSize,
      reorder,
    ],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}
