/* ============================================================================
   ThemeProvider — holds the theme axis-state, applies it to <html>, persists it,
   and exposes a setter with the OLED-lock cross-axis rule folded in. The CSS
   (src/styles/global.css, ported verbatim) does all the visual work via the
   data-* attributes this provider writes.
   ============================================================================ */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyThemeToDOM,
  effectiveMode,
  modeLocked,
  readInitialTheme,
  reduceTheme,
  type Mode,
  type ThemeState,
} from "./constants";

type Axis = "scheme" | "mode" | "profile" | "effect-bg" | "effect-tiles";

interface ThemeContextValue {
  theme: ThemeState;
  setTheme: (axis: Axis, val: string) => void;
  modeLocked: boolean;
  effectiveMode: Mode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeState>(() => readInitialTheme());

  // apply before paint so there is never a flash of the wrong coat
  useLayoutEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  const setTheme = useCallback((axis: Axis, val: string) => {
    setThemeState((prev) => reduceTheme(prev, axis, val));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      modeLocked: modeLocked(theme.scheme),
      effectiveMode: effectiveMode(theme),
    }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
