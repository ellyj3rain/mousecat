/* ============================================================================
   Settings — the theme studio plus data-source and notification settings. A faithful
   port of the prototype's renderSettings drawer: it renders its own scrim + aside.drawer,
   and both the close button and a scrim click close the panel.

   Theme reads come from useTheme (theme.scheme/profile/effectBg/effectTiles, the
   effectiveMode, and the OLED modeLocked flag). Theme writes go through setTheme; React
   re-renders, so the prototype's "App.panel='settings'; render()" trailers are dropped.
   Notification settings come from useNotifications (osSeverity + default snooze). The data
   source reflects localStorage 'mc-data-source' and toggles via setDataSourcePreference.

   Honesty: no data is fabricated here — these are presentation/preference controls. While
   an OLED-only scheme is active the non-OLED mode buttons are SILENTLY disabled (greyed,
   non-clickable, aria-disabled) with no explanatory caption, exactly as the brief calls for.
   ============================================================================ */
import { useTheme } from "../theme/ThemeProvider";
import {
  EFFECTS_BG,
  EFFECTS_TILES,
  labelFor,
} from "../theme/constants";
import { useNotifications, type OsSeverity } from "../state/notifications";
import { useUi } from "../state/ui";
import { setDataSourcePreference } from "../data/useFleet";
import { prefersReducedMotion } from "../lib/visual";
import { GitHubAccounts } from "../components/GitHubAccounts";
import { ModelIdentities } from "../components/ModelIdentities";

// Scheme swatch list: the "" (No scheme) neutral pick first, then the 9 schemes.
// Each carries its three dot colors, copied verbatim from the prototype (index.html
// lines 3738-3749). The underlying id stays lowercase; only the display label is Title Case.
const SCHEME_SWATCHES: [string, [string, string, string]][] = [
  ["", ["#8A8A8A", "#B5B5B5", "#6E6E6E"]],
  ["mercury", ["#D946A8", "#8B5CF6", "#3B82F6"]],
  ["terracotta", ["#CD7F4E", "#9B6B8A", "#5B8FA8"]],
  ["cerulean", ["#1E8BE8", "#3FB0F4", "#0A6FD6"]],
  ["easter", ["#D2D9F8", "#F8CCE6", "#CDF0F2"]],
  ["kele", ["#D42B28", "#E04038", "#D4943A"]],
  ["nightvision", ["#44DD44", "#33CC33", "#88CC88"]],
  ["infrared", ["#FF0022", "#FF3300", "#FF6A1A"]],
  ["smore", ["#E0A34A", "#C68A4E", "#5A3A22"]],
  ["noir", ["#C7CCD2", "#B0814D", "#2A2D32"]],
];

const OS_SEVERITY_SWATCHES: [OsSeverity, string][] = [
  ["critical-only", "Only critical"],
  ["critical-high", "Critical + high"],
  ["all", "Everything"],
];

const SNOOZE_SWATCHES: [string, string][] = [
  ["1", "1h"],
  ["8", "8h"],
  ["24", "24h"],
  ["168", "1w"],
];

export function Settings() {
  const { theme, setTheme, modeLocked, effectiveMode } = useTheme();
  const { osSeverity, setOsSeverity, snoozeDefault, setSnoozeDefault } = useNotifications();
  const { closePanel } = useUi();

  // a labelled region picker: a sub-heading + a row of swatches bound to one effect axis
  function effectRegion(
    title: string,
    axis: "effect-bg" | "effect-tiles",
    list: readonly string[],
    current: string,
  ) {
    return (
      <>
        <div
          style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "4px 0 6px" }}
        >
          {title}
        </div>
        <div className="swatch-row">
          {list.map((v) => {
            const on = current === v;
            return (
              <button
                key={v}
                className={"swatch" + (v === "none" ? " none-pick" : "")}
                aria-pressed={on ? "true" : "false"}
                title={labelFor("effect", v)}
                onClick={() => setTheme(axis, v)}
              >
                {labelFor("effect", v)}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  const forced = localStorage.getItem("mc-data-source") || "live";

  return (
    <div className="scrim" onClick={closePanel}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="t">Settings</div>
          <button className="icon-btn" aria-label="Close" onClick={closePanel}>
            ✕
          </button>
        </div>
        <div className="drawer-body">
          {/* SCHEME — no default; first run is unstyled-by-scheme */}
          <div className="set-group">
            <h4>Color scheme</h4>
            <p>
              {theme.scheme
                ? "Schemes reach the whole surface: chrome, accents and background, not just the cards."
                : "No scheme is selected yet. The surface is neutral; pick one to give Mousecat its coat."}
            </p>
            <div className="swatch-row">
              {SCHEME_SWATCHES.map(([val, cols]) => (
                <button
                  key={val || "none"}
                  className={"swatch" + (val === "" ? " none-pick" : "")}
                  aria-pressed={theme.scheme === val ? "true" : "false"}
                  title={val === "" ? "Neutral, no scheme" : labelFor("scheme", val)}
                  onClick={() => setTheme("scheme", val)}
                >
                  <span className="dots">
                    {cols.map((c, i) => (
                      <i key={i} style={{ background: c }} />
                    ))}
                  </span>
                  {labelFor("scheme", val)}
                </button>
              ))}
            </div>
          </div>

          {/* MODE — while an OLED-only scheme is active the non-OLED buttons are silently
              disabled (greyed, non-clickable). No label or caption explains why. */}
          <div className="set-group">
            <h4>Mode</h4>
            <p>Luminance: Dark, Light, or true-black OLED.</p>
            <div className="swatch-row">
              {(["dark", "light", "oled"] as const).map((v) => {
                const isOn = effectiveMode === v;
                const dis = modeLocked && v !== "oled";
                return (
                  <button
                    key={v}
                    className="swatch"
                    aria-pressed={isOn ? "true" : "false"}
                    aria-disabled={dis ? "true" : undefined}
                    disabled={dis || undefined}
                    style={dis ? { opacity: ".4", cursor: "not-allowed" } : undefined}
                    onClick={() => {
                      if (dis) return;
                      setTheme("mode", v);
                    }}
                  >
                    {labelFor("mode", v)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PROFILE — shape + motion */}
          <div className="set-group">
            <h4>Profile</h4>
            <p>
              Shape and motion: Soft (calm), Sharp (dense), Bubble (friendly), Geometric (angular).
            </p>
            <div className="swatch-row">
              {(["soft", "sharp", "bubble", "geometric"] as const).map((v) => (
                <button
                  key={v}
                  className="swatch"
                  aria-pressed={theme.profile === v ? "true" : "false"}
                  onClick={() => setTheme("profile", v)}
                >
                  {labelFor("profile", v)}
                </button>
              ))}
            </div>
          </div>

          {/* EFFECTS BY REGION — two independent pickers (Background, Tiles), each a flat,
              user-selected list defaulting to None. No effect is auto-assigned by scheme. */}
          <div className="set-group">
            <h4>Effects</h4>
            <p>
              Optional SFX, chosen per region and off by default. Every effect sits behind your
              content and stays gentle; animated ones pause under reduced-motion.
            </p>
            {effectRegion("Background", "effect-bg", EFFECTS_BG, theme.effectBg)}
            {effectRegion("Tiles", "effect-tiles", EFFECTS_TILES, theme.effectTiles)}
            {prefersReducedMotion() && (
              <div style={{ fontSize: "10.5px", color: "var(--text-faint)", marginTop: "8px" }}>
                Reduced-motion is on in your system, so animated effects are paused; flat finishes
                still apply.
              </div>
            )}
          </div>

          {/* NOTIFICATIONS — which severities reach OS notifications + snooze default */}
          <div className="set-group">
            <h4>Notifications</h4>
            <p>
              Which alerts also fire as system notifications, and how long Snooze lasts by default.
            </p>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "0 0 6px" }}>
              Reach me by system notification
            </div>
            <div className="swatch-row">
              {OS_SEVERITY_SWATCHES.map(([v, l]) => (
                <button
                  key={v}
                  className="swatch"
                  aria-pressed={osSeverity === v ? "true" : "false"}
                  onClick={() => setOsSeverity(v)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "12px 0 6px" }}>
              Default snooze length
            </div>
            <div className="seg-mini">
              {SNOOZE_SWATCHES.map(([v, l]) => (
                <button
                  key={v}
                  aria-pressed={snoozeDefault === v ? "true" : "false"}
                  onClick={() => setSnoozeDefault(v)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* DATA SOURCE */}
          <div className="set-group">
            <h4>Data source</h4>
            <p>Read current workspace observations, or inspect the portable offline defaults.</p>
            <div className="swatch-row">
              <button
                className="swatch"
                aria-pressed={forced !== "sample" ? "true" : "false"}
                onClick={() => void setDataSourcePreference(false)}
              >
                Live (auto)
              </button>
              <button
                className="swatch"
                aria-pressed={forced === "sample" ? "true" : "false"}
                onClick={() => void setDataSourcePreference(true)}
              >
                Offline defaults
              </button>
            </div>
          </div>

          <GitHubAccounts />
          <ModelIdentities />
        </div>
      </aside>
    </div>
  );
}
