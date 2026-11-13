/* ============================================================================
   Fireflies — the optional background effect skin: ~25-40 slow-drifting glowing
   particles tinted by the active scheme. A canvas animation island.

   IMPERATIVE ANIMATION ISLAND (same discipline as Gauge): the <canvas> is always
   present in the DOM (so a throttled tab never loses the node). The drifting loop
   runs ONLY inside a useEffect, and only when the background effect is "fireflies"
   AND the OS does not prefer reduced motion. The useEffect RETURNS A CLEANUP that
   cancels the requestAnimationFrame, removes the resize listener, and clears the
   canvas. When the effect is anything other than fireflies the canvas stays mounted
   but idle (no loop, nothing painted). Tint comes from the resolved --accent2 var
   and is re-read whenever the effect re-arms (so a scheme change re-tints).

   Port of the prototype's startFireflies/stopFireflies/firefliesResize/syncFireflies
   (app/index.html). The per-frame steering uses the standard JS random source, the
   faithful organic jitter the prototype relies on; the initial particle layout is
   seeded (mulberry32 0xF13EF1A5) so the opening frame is deterministic.
   ============================================================================ */
import { useEffect, useRef } from "react";
import { MCModel } from "../model/engine";
import { cssVar, prefersReducedMotion, withAlpha } from "../lib/visual";
import { useTheme } from "../theme/ThemeProvider";

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  ph: number; // flicker phase
  sp: number; // flicker speed
}

export function Fireflies() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const effectBg = theme.effectBg;

  useEffect(() => {
    if (effectBg !== "fireflies" || prefersReducedMotion()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // tint from the active scheme accent2 (resolved), with a neutral fallback
    let color = cssVar("--accent2") || "#8aa";
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const N = MCModel.clamp(Math.round(w / 52), 25, 40); // 25-40 particles, scaled to width
    const rng = MCModel.mulberry32(0xf13ef1a5);
    const parts: Particle[] = Array.from({ length: N }, () => ({
      x: rng() * w,
      y: rng() * h,
      r: 1.1 + rng() * 2.2,
      vx: (rng() - 0.5) * 0.18,
      vy: (rng() - 0.5) * 0.18,
      ph: rng() * Math.PI * 2,
      sp: 0.6 + rng() * 0.9,
    }));

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        // wander: tiny random steering so the drift looks organic, not linear
        p.vx += (Math.random() - 0.5) * 0.02;
        p.vy += (Math.random() - 0.5) * 0.02;
        p.vx = MCModel.clamp(p.vx, -0.4, 0.4);
        p.vy = MCModel.clamp(p.vy, -0.4, 0.4);
        p.x += p.vx * dt * 0.6;
        p.y += p.vy * dt * 0.6;
        p.ph += dt * 0.001 * p.sp;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        const a = 0.18 + 0.42 * (0.5 + 0.5 * Math.sin(p.ph)); // flickering opacity
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, withAlpha(color, a));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ctx.clearRect(0, 0, w, h);
    };
    // theme.scheme is a dependency so a scheme change re-arms the loop and re-tints
    // from the new --accent2; color is captured at arm time above.
  }, [effectBg, theme.scheme]);

  return <canvas ref={canvasRef} id="fx-fireflies" aria-hidden="true" data-loop="" />;
}
