import { useEffect, useRef } from 'react';

import { BACKGROUND_FRAME_INTERVAL_MS, BG_CONTAINER, MAX_PARTICLES, type CanvasMode } from './types';
import { mulberry32, readInkRgb } from './themeUtils';

// ─── Particles (canvas2D) ───────────────────────────────────────────────
// NOTE: canvas2D stroke/fill styles cannot resolve CSS custom properties, so
// `rgb(var(--ink-rgb) / X)` silently falls back to black and renders invisible
// on a dark background. We resolve --ink-rgb to a concrete rgb triplet via
// getComputedStyle on every frame (cheap, and reacts to theme switches).
export function ParticlesBg({ mode, animated }: { mode: CanvasMode; animated: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dim = mode === 'full' ? 1 : 0.4;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let W = cv.clientWidth;
    let H = cv.clientHeight;
    const resize = () => {
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const N = Math.min(MAX_PARTICLES, Math.max(24, Math.round((W * H) / 24_000)));
    const rng = mulberry32(4242);
    const pts = Array.from({ length: N }, () => ({
      x: rng() * W,
      y: rng() * H,
      vx: (rng() - 0.5) * 0.25,
      vy: (rng() - 0.5) * 0.25,
      r: 1 + rng() * 1.4,
    }));
    const mouse = { x: W / 2, y: H / 2 };
    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    if (animated) window.addEventListener('mousemove', onMove);

    let raf = 0;
    let lastFrame = 0;
    const t0 = performance.now();
    const DIST = 110;
    const DIST_SQ = DIST * DIST;
    const [ir, ig, ib] = readInkRgb();

    const loop = (now: number) => {
      raf = 0;
      if (animated && now - lastFrame < BACKGROUND_FRAME_INTERVAL_MS) {
        raf = requestAnimationFrame(loop);
        return;
      }
      lastFrame = now;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      // Parallax shift based on mouse.
      const px = (mouse.x / W - 0.5) * 18;
      const py = (mouse.y / H - 0.5) * 18;

      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      // Lines first (under), then dots.
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.8);
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = pts[i]!;
          const b = pts[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq < DIST_SQ) {
            const d = Math.sqrt(distanceSq);
            const op = (1 - d / DIST) * 0.35 * (0.5 + 0.5 * pulse) * dim;
            ctx.strokeStyle = `rgba(${ir}, ${ig}, ${ib}, ${op})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x + px, a.y + py);
            ctx.lineTo(b.x + px, b.y + py);
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = `rgba(${ir}, ${ig}, ${ib}, ${0.65 * dim})`;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x + px, p.y + py, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (animated && !document.hidden) raf = requestAnimationFrame(loop);
    };
    if (!document.hidden) raf = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (animated) window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [animated, dim]);

  return (
    <div style={BG_CONTAINER}>
      {/* Slow radial backdrop pulse */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 50%, var(--ink-tint-04), transparent 70%)',
          animation: animated ? 'particles-breathe 8s ease-in-out infinite' : 'none',
          opacity: dim,
        }}
      />
      <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
