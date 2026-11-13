/* ============================================================================
   Renderer entry. Bundles the type families locally (no CDN, offline-safe), loads
   the verbatim-ported stylesheet, boots the fleet connection (live -> sample
   fallback), and mounts the app under ThemeProvider + UiProvider.
   ============================================================================ */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Bundled fonts (Playfair Display headlines + JetBrains Mono raw values). Estratto
// (body) is not redistributable; the CSS falls back to the system sans stack.
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";

import "./styles/global.css";
import "./styles/workspace.css";

import { App } from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import { UiProvider } from "./state/ui";
import { NotificationsProvider } from "./state/notifications";
import { OverlaysProvider } from "./state/overlays";
import { PanelBoundary } from "./components/PanelBoundary";
import { bootFleet } from "./data/useFleet";

bootFleet();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <PanelBoundary label="app">
      <ThemeProvider>
        <UiProvider>
          <NotificationsProvider>
            <OverlaysProvider>
              <App />
            </OverlaysProvider>
          </NotificationsProvider>
        </UiProvider>
      </ThemeProvider>
    </PanelBoundary>
  </StrictMode>,
);
