/* ============================================================================
   Theme constants + resolution — faithful port of the prototype's theme model.

   Axes (set as data-* on <html>):
     mode    = dark | light | oled
     scheme  = "" (neutral) | mercury | terracotta | cerulean | easter | kele
               | nightvision | infrared | smore | noir        (9 schemes, DR-007)
     profile = soft | sharp | bubble | geometric
     effectBg    = none | fireflies | scanlines               (per-region, opt-in)
     effectTiles = none | glow | matte | pearlescent | glitter | sparkles

   Scheme IDs stay lowercase (CSS selectors + localStorage depend on them); only
   the DISPLAY label is Title Case. nightvision/infrared are silently OLED-locked.
   smore is the first-run default (DR-003); mercury is the retired "default" (DR-004).
   ============================================================================ */

export type Mode = "dark" | "light" | "oled";
export type Profile = "soft" | "sharp" | "bubble" | "geometric";
export type EffectBg = "none" | "fireflies" | "scanlines";
export type EffectTiles =
  | "none"
  | "glow"
  | "matte"
  | "pearlescent"
  | "glitter"
  | "sparkles";

export interface ThemeState {
  mode: Mode;
  /** "" === neutral (No scheme). */
  scheme: string;
  profile: Profile;
  effectBg: EffectBg;
  effectTiles: EffectTiles;
  /** mode to restore after leaving an OLED-locked scheme. */
  prevMode: Mode | null;
}

export const LS = {
  mode: "gzs-theme-mode",
  scheme: "gzs-theme-scheme",
  profile: "gzs-theme-profile",
  effectBg: "gzs-effect-bg",
  effectTiles: "gzs-effect-tiles",
  effectLegacy: "gzs-theme-effect",
  prevMode: "mc-prev-mode",
} as const;

export const LABELS = {
  scheme: {
    "": "No scheme",
    mercury: "Mercury",
    terracotta: "Terracotta",
    cerulean: "Cerulean",
    easter: "Easter",
    kele: "Kele",
    nightvision: "Nightvision",
    infrared: "Infrared",
    smore: "S'more",
    noir: "Noir",
  } as Record<string, string>,
  mode: { dark: "Dark", light: "Light", oled: "OLED" } as Record<string, string>,
  profile: {
    soft: "Soft",
    sharp: "Sharp",
    bubble: "Bubble",
    geometric: "Geometric",
  } as Record<string, string>,
  effect: {
    none: "None",
    glow: "Glow",
    matte: "Matte",
    pearlescent: "Pearlescent",
    glitter: "Glitter",
    sparkles: "Sparkles",
    fireflies: "Fireflies",
    scanlines: "Scanlines",
  } as Record<string, string>,
} as const;

export const SCHEMES = [
  "mercury",
  "terracotta",
  "cerulean",
  "easter",
  "kele",
  "nightvision",
  "infrared",
  "smore",
  "noir",
] as const;

export const MODES: Mode[] = ["dark", "light", "oled"];
export const PROFILES: Profile[] = ["soft", "sharp", "bubble", "geometric"];
export const EFFECTS_BG: EffectBg[] = ["none", "fireflies", "scanlines"];
export const EFFECTS_TILES: EffectTiles[] = [
  "none",
  "glow",
  "matte",
  "pearlescent",
  "glitter",
  "sparkles",
];

export const OLED_ONLY_SCHEMES = new Set(["nightvision", "infrared"]);
export const DEFAULT_SCHEME = "smore";
const SCHEME_NONE_SENTINEL = "none";

function capitalize(s: string): string {
  s = String(s ?? "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function labelFor(axis: keyof typeof LABELS, id: string): string {
  const m = LABELS[axis] as Record<string, string>;
  if (m && Object.prototype.hasOwnProperty.call(m, id)) return m[id];
  return capitalize(id);
}

/** Resolve the stored scheme into the in-memory scheme value. */
export function readScheme(): string {
  const stored = localStorage.getItem(LS.scheme);
  if (stored === null) return DEFAULT_SCHEME; // first run
  if (stored === SCHEME_NONE_SENTINEL) return ""; // explicit No scheme
  if (stored === "default") return DEFAULT_SCHEME; // legacy
  return stored;
}

/** Fold the pre-region single global effect into the two-region model (once). */
export function migrateEffectRegions(): { bg: EffectBg; tiles: EffectTiles } {
  let bg = localStorage.getItem(LS.effectBg) as EffectBg | null;
  let tiles = localStorage.getItem(LS.effectTiles) as EffectTiles | null;
  const legacy = localStorage.getItem(LS.effectLegacy);
  if (legacy != null) {
    if (EFFECTS_BG.includes(legacy as EffectBg) && legacy !== "none" && bg == null)
      bg = legacy as EffectBg;
    else if (
      EFFECTS_TILES.includes(legacy as EffectTiles) &&
      legacy !== "none" &&
      tiles == null
    )
      tiles = legacy as EffectTiles;
    localStorage.removeItem(LS.effectLegacy);
  }
  if (!bg || !EFFECTS_BG.includes(bg)) bg = "none";
  if (!tiles || !EFFECTS_TILES.includes(tiles)) tiles = "none";
  return { bg, tiles };
}

export function readInitialTheme(): ThemeState {
  const fx = migrateEffectRegions();
  return {
    mode: (localStorage.getItem(LS.mode) as Mode) || "dark",
    scheme: readScheme(),
    profile: (localStorage.getItem(LS.profile) as Profile) || "soft",
    effectBg: fx.bg,
    effectTiles: fx.tiles,
    prevMode: (localStorage.getItem(LS.prevMode) as Mode) || null,
  };
}

export function modeLocked(scheme: string): boolean {
  return OLED_ONLY_SCHEMES.has(scheme);
}

export function effectiveMode(theme: ThemeState): Mode {
  return modeLocked(theme.scheme) ? "oled" : theme.mode || "dark";
}

/** Apply the theme axes to <html> and persist. Pure side effect on the DOM. */
export function applyThemeToDOM(theme: ThemeState): void {
  const r = document.documentElement;
  r.setAttribute("data-theme-mode", effectiveMode(theme));
  if (theme.scheme) r.setAttribute("data-theme-scheme", theme.scheme);
  else r.removeAttribute("data-theme-scheme");
  r.setAttribute("data-theme-profile", theme.profile);
  r.setAttribute("data-effect-bg", theme.effectBg || "none");
  r.setAttribute("data-effect-tiles", theme.effectTiles || "none");

  localStorage.setItem(LS.mode, theme.mode || "dark");
  localStorage.setItem(LS.scheme, theme.scheme || SCHEME_NONE_SENTINEL);
  localStorage.setItem(LS.profile, theme.profile);
  localStorage.setItem(LS.effectBg, theme.effectBg || "none");
  localStorage.setItem(LS.effectTiles, theme.effectTiles || "none");
  if (theme.prevMode != null) localStorage.setItem(LS.prevMode, theme.prevMode);
  else localStorage.removeItem(LS.prevMode);
}

/** Apply a single-axis change with the cross-axis (OLED-lock) rules folded in. */
export function reduceTheme(
  theme: ThemeState,
  axis: "scheme" | "mode" | "profile" | "effect-bg" | "effect-tiles",
  val: string,
): ThemeState {
  const next: ThemeState = { ...theme };
  if (axis === "scheme") {
    const wasLocked = modeLocked(theme.scheme);
    const willLock = OLED_ONLY_SCHEMES.has(val);
    if (willLock && !wasLocked) {
      next.prevMode = theme.mode || "dark";
      next.mode = "oled";
    } else if (!willLock && wasLocked) {
      next.mode = theme.prevMode || theme.mode || "dark";
      next.prevMode = null;
    }
    next.scheme = val;
  } else if (axis === "mode") {
    if (modeLocked(theme.scheme)) return theme; // locked — ignore
    next.mode = val as Mode;
  } else if (axis === "effect-bg") {
    next.effectBg = EFFECTS_BG.includes(val as EffectBg) ? (val as EffectBg) : "none";
  } else if (axis === "effect-tiles") {
    next.effectTiles = EFFECTS_TILES.includes(val as EffectTiles)
      ? (val as EffectTiles)
      : "none";
  } else if (axis === "profile") {
    next.profile = val as Profile;
  }
  return next;
}
