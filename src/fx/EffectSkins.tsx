/* ============================================================================
   FxSkin — the per-surface effect overlay (pearlescent / glitter / sparkles).

   A presentational overlay node a surface (tile, section, portrait hero) includes
   as its FIRST child so it sits beneath the content (content is z-index:1). The
   gradient and twinkle work is pure CSS, keyed off [data-effect-tiles] on <html>;
   the only JS here is, for "sparkles", scattering a handful of deterministic <i>
   twinkles at seeded positions (left/top/animation-delay/duration). Sparkle <i>
   nodes are skipped when the OS prefers reduced motion (the CSS falls back to a
   static finish). Glow / matte / scanlines are pure CSS via data-effect-* and need
   no JS, so they never mount this component.

   Port of the prototype's applyEffectSkins (app/index.html). The prototype keyed
   the seed off the surface class-length plus the surface title; here each surface
   passes its own variant and the seed is derived per render from the same engine
   PRNG so the twinkle layout is stable for a given mount.
   ============================================================================ */
import { useMemo } from "react";
import type { CSSProperties } from "react";
import { MCModel } from "../model/engine";
import { prefersReducedMotion } from "../lib/visual";

interface Twinkle {
  left: string;
  top: string;
  animationDelay: string;
  animationDuration: string;
}

let sparkleSeq = 0;

export function FxSkin({ variant }: { variant: "pearlescent" | "glitter" | "sparkles" }) {
  const className = "fx-skin " + (variant === "pearlescent" ? "pearl" : variant);

  // deterministic-ish twinkle scatter; only for sparkles, only when motion is allowed
  const twinkles = useMemo<Twinkle[]>(() => {
    if (variant !== "sparkles" || prefersReducedMotion()) return [];
    const rng = MCModel.mulberry32(MCModel.hashSeed("fx-sparkle:" + sparkleSeq++));
    const count = 4 + Math.floor(rng() * 3); // 4-6 twinkles
    return Array.from({ length: count }, () => ({
      left: (8 + rng() * 84).toFixed(2) + "%",
      top: (10 + rng() * 78).toFixed(2) + "%",
      animationDelay: (rng() * 3).toFixed(2) + "s",
      animationDuration: (2.4 + rng() * 1.8).toFixed(2) + "s",
    }));
  }, [variant]);

  return (
    <div className={className} aria-hidden="true">
      {twinkles.map((t, i) => (
        <i
          key={i}
          style={
            {
              left: t.left,
              top: t.top,
              animationDelay: t.animationDelay,
              animationDuration: t.animationDuration,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
