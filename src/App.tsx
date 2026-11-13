/* ============================================================================
   App — composes the persistent chrome, the attention strip, the active view, the
   panels, and the global overlay hosts (drill-to-raw drawer, the loss-risk safety
   gate, toasts). Each independently-failable region is wrapped in a PanelBoundary
   so one panel's render error degrades to an honest fallback instead of blanking
   the board (resilience invariant). The fireflies canvas + #scan-overlay are the
   background FX layer.
   ============================================================================ */
import { useFleet } from "./data/useFleet";
import { useUi } from "./state/ui";
import { Chrome } from "./components/Chrome";
import { Board } from "./views/Board";
import { Project } from "./views/Project";
import { Machine } from "./views/Machine";
import { Settings } from "./views/Settings";
import { NotifCenter } from "./components/NotifCenter";
import { Drawer } from "./components/Drawer";
import { SafetyGate } from "./components/SafetyGate";
import { ToastHost } from "./components/ToastHost";
import { Fireflies } from "./fx/Fireflies";
import { PanelBoundary } from "./components/PanelBoundary";

export function App() {
  const snap = useFleet();
  const { doc } = snap;
  const ui = useUi();

  return (
    <>
      <Fireflies />
      <div id="scan-overlay" aria-hidden="true" />
      <div id="app">
        <PanelBoundary label="header">
          <Chrome snap={snap} />
        </PanelBoundary>
        <main id="main">
          {ui.view === "board" && (
            <PanelBoundary label="fleet board">
              <Board doc={doc} />
            </PanelBoundary>
          )}
          {ui.view === "project" && (
            <PanelBoundary label="project portrait">
              <Project />
            </PanelBoundary>
          )}
          {ui.view === "machine" && (
            <PanelBoundary label="machine">
              <Machine />
            </PanelBoundary>
          )}
        </main>

        {ui.panel === "notifs" && (
          <PanelBoundary label="notifications">
            <NotifCenter />
          </PanelBoundary>
        )}
        {ui.panel === "settings" && (
          <PanelBoundary label="settings">
            <Settings />
          </PanelBoundary>
        )}
      </div>

      <PanelBoundary label="drawer">
        <Drawer />
      </PanelBoundary>
      <PanelBoundary label="safety gate">
        <SafetyGate />
      </PanelBoundary>
      <ToastHost />
    </>
  );
}
