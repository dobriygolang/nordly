// CanvasBg — meditative Nordly background.
//
// Themes (7):
//   - drift (light): line-art astronaut drifting near a capsule on white
//   - visor (light): line-art astronaut portrait with Earth reflected in visor
//   - winter: grid + stars float/twinkle + waves drift + 2 rotating squares
//   - birthday-light: line-art birthday scene — cake, gift, balloons on white
//   - particles: dense floating particles with proximity lines (canvas2D),
//     line opacity pulses with sine wave, mouse parallax
//   - debris (dark): manga ink scene — astronaut drifting through a debris field
//   - launch (dark): manga ink portrait — visor reflecting a rocket launch
//
// Mode-axis (full / quiet / void) сохранён. full — полная сцена, quiet — приглушённая,
// void — пусто. У image-тем quiet просто снижает opacity.
import { useEffect, useMemo, useRef, useState } from 'react';

const GRID_STEP_PX = 64;

const BG_CONTAINER: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
};

const WAVES = [
  { d: 'M-200,260 C 260,180 480,360 760,290 S 1240,220 1900,250', dur: '17s', delay: '0s', anim: 'wave-drift', op: 0.22, sw: 1 },
  { d: 'M-200,400 C 240,360 520,460 880,400 S 1320,320 1900,400', dur: '23s', delay: '-3s', anim: 'wave-tilt', op: 0.18, sw: 1 },
  { d: 'M-200,520 C 280,500 580,600 900,540 S 1380,440 1900,500', dur: '29s', delay: '-7s', anim: 'wave-drift', op: 0.20, sw: 1 },
  { d: 'M-200,640 C 320,610 660,720 980,660 S 1420,580 1900,620', dur: '31s', delay: '-11s', anim: 'wave-tilt', op: 0.16, sw: 1 },
  { d: 'M-200,760 C 360,740 700,800 1020,760 S 1460,720 1900,750', dur: '37s', delay: '-19s', anim: 'wave-drift', op: 0.14, sw: 1 },
];

import { DEFAULT_THEME_ID, type ThemeId } from '@shared/model/theme';
import { isTauriRuntime } from '@platform/runtime';

export type CanvasMode = 'full' | 'quiet' | 'void';

type ImageExtractMode = 'bright' | 'dark';

interface CanvasBgProps {
  mode?: CanvasMode;
  theme?: ThemeId;
  /** Stronger pleated-curtain motion while modals/overlays are open (Winter-like). */
  boost?: boolean;
  /** Disable WebGL image animation for small previews so the main poster keeps its context. */
  animated?: boolean;
}

export function CanvasBg({
  mode = 'full',
  theme = DEFAULT_THEME_ID,
  boost = false,
  animated = true,
}: CanvasBgProps) {
  const effectiveAnimated = animated && !isTauriRuntime();
  if (mode === 'void') return null;
  switch (theme) {
    case 'drift':
      return (
        <ImageBg
          mode={mode}
          src="/backgrounds/drift.png"
          boost={boost}
          animated={effectiveAnimated}
          extract="dark"
        />
      );
    case 'visor':
      return (
        <ImageBg
          mode={mode}
          src="/backgrounds/visor.png"
          boost={boost}
          animated={effectiveAnimated}
          extract="dark"
        />
      );
    case 'debris':
      return <ImageBg mode={mode} src="/backgrounds/debris.png" boost={boost} animated={effectiveAnimated} />;
    case 'launch':
      return <ImageBg mode={mode} src="/backgrounds/launch.png" boost={boost} animated={effectiveAnimated} />;
    case 'birthday-light':
      return (
        <ImageBg
          mode={mode}
          src="/backgrounds/birthday-light.png"
          boost={boost}
          animated={effectiveAnimated}
          extract="dark"
        />
      );
    case 'particles':
      return <ParticlesBg mode={mode} />;
    case 'winter':
    default:
      return <WinterBg mode={mode} />;
  }
}

// ─── Image posters — Winter-style WebGL (trywinter.app) ───────────────────
// Wave in screen space (~2px), scanline reveal, shimmer. Inset via CSS host.

const POSTER_MODE_SCANLINE = 0;

const POSTER_VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const POSTER_FRAG = `
precision mediump float;

uniform sampler2D uImage;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uImageResolution;
uniform float uMode;
uniform vec4 uPadding;
uniform float uOpacity;
uniform vec3 uTint;
uniform float uExtractDark;

varying vec2 vUv;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec2 pixelPos = vUv * uResolution;

  float areaTop = uPadding.x;
  float areaRight = uResolution.x - uPadding.y;
  float areaBottom = uResolution.y - uPadding.z;
  float areaLeft = uPadding.w;

  if (pixelPos.x < areaLeft || pixelPos.x > areaRight || pixelPos.y < areaTop || pixelPos.y > areaBottom) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  float areaWidth = areaRight - areaLeft;
  float areaHeight = areaBottom - areaTop;
  vec2 localUv = (pixelPos - vec2(areaLeft, areaTop)) / vec2(areaWidth, areaHeight);

  float areaAspect = areaWidth / areaHeight;
  float imageAspect = uImageResolution.x / uImageResolution.y;

  vec2 scale = vec2(1.0);
  if (areaAspect > imageAspect) {
    scale.y = imageAspect / areaAspect;
  } else {
    scale.x = areaAspect / imageAspect;
  }

  float time = uTime;
  float waveFreqX = 0.02;
  float waveFreqY = 0.03;
  float waveAmp = 2.0;

  float offsetX = sin(gl_FragCoord.y * waveFreqY + time * 0.5) * waveAmp;
  float offsetY = cos(gl_FragCoord.x * waveFreqX + time * 0.5) * waveAmp;

  vec2 distortedLocalUv = localUv - vec2(offsetX / areaWidth, offsetY / areaHeight);
  vec2 centeredUv = (distortedLocalUv - 0.5) * scale + 0.5;

  if (centeredUv.x < 0.0 || centeredUv.x > 1.0 || centeredUv.y < 0.0 || centeredUv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec4 color = texture2D(uImage, centeredUv);
  float brightness = max(color.r, max(color.g, color.b));
  float signal = uExtractDark > 0.5 ? 1.0 - brightness : brightness;

  if (signal < 30.0 / 255.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  float delay = 0.0;
  if (uMode < 0.5) {
    delay = (1.0 - localUv.y) * areaHeight * 0.5 + random(centeredUv) * 500.0;
  } else if (uMode < 1.5) {
    float dist = distance(localUv, vec2(0.5));
    float distPx = dist * max(areaWidth, areaHeight);
    delay = distPx * 0.5 + random(centeredUv) * 300.0;
  } else {
    delay = random(centeredUv) * 1500.0;
  }

  float timeMs = uTime * 1000.0;
  if (timeMs < delay) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  float elapsed = timeMs - delay;
  float fadeProgress = min(1.0, elapsed * 0.002);

  float phase = random(centeredUv + 1.0) * 6.28;
  float shimmer = sin(gl_FragCoord.x * 0.01 + time * 2.0 + phase * 0.1) * 0.15 * signal;

  float finalAlpha = clamp(fadeProgress * signal + shimmer, 0.0, 1.0);
  gl_FragColor = vec4(uTint * finalAlpha, finalAlpha) * uOpacity;
}`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function StaticImageBg({ mode, src }: { mode: CanvasMode; src: string }) {
  const dim = mode === 'full' ? 1 : 0.55;

  return (
    <div style={{ ...BG_CONTAINER, background: 'var(--bg)', opacity: dim }}>
      <div className="nordly-bg-poster-host">
        <div className="nordly-bg-poster-wrap">
          <img
            src={src}
            alt=""
            aria-hidden="true"
            className="nordly-bg-poster-canvas"
          />
        </div>
      </div>
    </div>
  );
}

function ImageBg({
  mode,
  src,
  boost = false,
  animated = true,
  extract = 'bright',
}: {
  mode: CanvasMode;
  src: string;
  boost?: boolean;
  animated?: boolean;
  extract?: ImageExtractMode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<Error | null>(null);
  const dim = mode === 'full' ? 1 : 0.55;
  const posterOpacity = boost ? 1.04 : 1;
  const posterOpacityRef = useRef(posterOpacity);

  useEffect(() => {
    setRenderError(null);
  }, [src]);

  useEffect(() => {
    posterOpacityRef.current = posterOpacity;
  }, [posterOpacity]);

  useEffect(() => {
    if (!animated || renderError) return;
    const host = hostRef.current;
    const cv = canvasRef.current;
    if (!host || !cv) return;

    const gl = cv.getContext('webgl', {
      antialias: false,
      premultipliedAlpha: true,
      alpha: true,
    }) as WebGLRenderingContext | null;
    if (!gl) {
      setRenderError(new Error('WebGL unavailable for animated background'));
      return;
    }

    const vert = compileShader(gl, gl.VERTEX_SHADER, POSTER_VERT);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, POSTER_FRAG);
    if (!vert || !frag) {
      setRenderError(new Error('Animated background shader compilation failed'));
      return;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setRenderError(new Error('Animated background program link failed'));
      return;
    }
    gl.useProgram(prog);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uImage = gl.getUniformLocation(prog, 'uImage');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uResolution = gl.getUniformLocation(prog, 'uResolution');
    const uImageResolution = gl.getUniformLocation(prog, 'uImageResolution');
    const uMode = gl.getUniformLocation(prog, 'uMode');
    const uPadding = gl.getUniformLocation(prog, 'uPadding');
    const uOpacity = gl.getUniformLocation(prog, 'uOpacity');
    const uTint = gl.getUniformLocation(prog, 'uTint');
    const uExtractDark = gl.getUniformLocation(prog, 'uExtractDark');

    gl.uniform1i(uImage, 0);
    gl.uniform1f(uMode, POSTER_MODE_SCANLINE);
    gl.uniform4f(uPadding, 0, 0, 0, 0);
    gl.uniform1f(uOpacity, posterOpacityRef.current);
    gl.uniform1f(uExtractDark, extract === 'dark' ? 1 : 0);
    const inkRgb = readInkRgb();
    gl.uniform3f(uTint, inkRgb[0] / 255, inkRgb[1] / 255, inkRgb[2] / 255);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const img = new Image();
    img.decoding = 'async';
    let ready = false;
    let imgW = 1;
    let imgH = 1;
    let lastCssW = 0;
    let lastCssH = 0;
    let lastBw = 0;
    let lastBh = 0;
    let textureUploaded = false;

    const syncLayout = () => {
      const hostW = host.clientWidth;
      const hostH = host.clientHeight;
      if (hostW === 0 || hostH === 0) return;
      const w = Math.max(1, Math.round(hostW));
      const h = Math.max(1, Math.round(hostH));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const bw = Math.max(1, Math.round(w * dpr));
      const bh = Math.max(1, Math.round(h * dpr));

      if (w === lastCssW && h === lastCssH && bw === lastBw && bh === lastBh) {
        if (!textureUploaded) uploadTexture();
        return;
      }
      lastCssW = w;
      lastCssH = h;
      lastBw = bw;
      lastBh = bh;
      textureUploaded = false;

      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.width = bw;
      cv.height = bh;
      gl.viewport(0, 0, bw, bh);
      gl.uniform2f(uResolution, bw, bh);
      uploadTexture();
    };

    const uploadTexture = () => {
      if (!ready || !img.complete || img.naturalWidth === 0) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.uniform2f(uImageResolution, imgW, imgH);
      textureUploaded = true;
    };

    const ro = new ResizeObserver(() => syncLayout());
    ro.observe(host);
    window.addEventListener('resize', syncLayout);

    img.onload = () => {
      if (img.naturalWidth > 0) {
        imgW = img.naturalWidth;
        imgH = img.naturalHeight;
      }
      ready = true;
      syncLayout();
    };
    img.src = src;

    let raf = 0;
    const t0 = performance.now();
    const render = () => {
      raf = requestAnimationFrame(render);
      if (!ready) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, (performance.now() - t0) / 1000);
      gl.uniform1f(uOpacity, posterOpacityRef.current);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(render);

    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        raf = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', syncLayout);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteProgram(prog);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteBuffer(buf);
      gl.deleteTexture(tex);
    };
  }, [src, renderError, animated, extract]);

  if (!animated) return <StaticImageBg mode={mode} src={src} />;

  if (renderError) throw renderError;

  return (
    <div style={{ ...BG_CONTAINER, background: 'var(--bg)', opacity: dim }}>
      <div className="nordly-bg-poster-host">
        <div className="nordly-bg-poster-wrap" ref={hostRef}>
          <canvas ref={canvasRef} aria-hidden="true" className="nordly-bg-poster-canvas" />
        </div>
      </div>
    </div>
  );
}

// ─── Winter (default, original) ─────────────────────────────────────────
function WinterBg({ mode }: { mode: CanvasMode }) {
  const stars = useMemo(() => makeStars(32, 1337), []);

  const starOpMul = mode === 'full' ? 1 : 0.35;
  const showWaves = mode === 'full';
  const showSquares = mode === 'full';

  return (
    <div style={BG_CONTAINER}>
      {showWaves && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              `linear-gradient(rgb(var(--ink-rgb) / 0.035) 1px, transparent 1px),` +
              `linear-gradient(90deg, rgb(var(--ink-rgb) / 0.035) 1px, transparent 1px)`,
            backgroundSize: `${GRID_STEP_PX}px ${GRID_STEP_PX}px`,
          }}
        />
      )}
      {stars.map((s, i) => (
        <span
          key={i}
          className="star"
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              opacity: s.baseOp * starOpMul,
              animation:
                `star-float ${s.floatDur}s ease-in-out ${s.floatDelay}s infinite,` +
                ` star-twinkle ${s.twinkleDur}s ease-in-out ${s.twinkleDelay}s infinite`,
              '--star-dx': `${s.dx}px`,
              '--star-dy': `${s.dy}px`,
              '--star-base': `${s.baseOp * starOpMul}`,
            } as React.CSSProperties
          }
        />
      ))}
      {showWaves &&
        WAVES.map((w, i) => (
          <div
            key={i}
            className="wave-layer"
            style={{ animation: `${w.anim} ${w.dur} ease-in-out ${w.delay} infinite` }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 1700 900"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0 }}
            >
              <path d={w.d} fill="none" stroke={`rgb(var(--ink-rgb) / ${w.op})`} strokeWidth={w.sw} />
            </svg>
          </div>
        ))}
      {showSquares && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 280,
            height: 280,
            transform: 'translate(-50%,-50%)',
            opacity: 0.32,
          }}
        >
          <svg
            className="winter-square"
            width="280"
            height="280"
            viewBox="-140 -140 280 280"
          >
            <rect x={-90} y={-90} width={180} height={180} fill="none" stroke="rgb(var(--ink-rgb) / 0.85)" strokeWidth="1" />
          </svg>
          <svg
            className="winter-square winter-square--offset"
            width="280"
            height="280"
            viewBox="-140 -140 280 280"
            style={{ position: 'absolute', inset: 0 }}
          >
            <rect x={-90} y={-90} width={180} height={180} fill="none" stroke="rgb(var(--ink-rgb) / 0.85)" strokeWidth="1" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Particles (canvas2D) ───────────────────────────────────────────────
// NOTE: canvas2D stroke/fill styles cannot resolve CSS custom properties, so
// `rgb(var(--ink-rgb) / X)` silently falls back to black and renders invisible
// on a dark background. We resolve --ink-rgb to a concrete rgb triplet via
// getComputedStyle on every frame (cheap, and reacts to theme switches).
function ParticlesBg({ mode }: { mode: CanvasMode }) {
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

    const N = 60;
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
    window.addEventListener('mousemove', onMove);

    let raf = 0;
    const t0 = performance.now();
    const DIST = 110;
    const [ir, ig, ib] = readInkRgb();

    const loop = (now: number) => {
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
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < DIST) {
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
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      if (!raf) {
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dim]);

  return (
    <div style={BG_CONTAINER}>
      {/* Slow radial backdrop pulse */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 50%, var(--ink-tint-04), transparent 70%)',
          animation: 'particles-breathe 8s ease-in-out infinite',
          opacity: dim,
        }}
      />
      <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────
interface Star {
  x: number;
  y: number;
  size: number;
  baseOp: number;
  floatDur: number;
  floatDelay: number;
  twinkleDur: number;
  twinkleDelay: number;
  dx: number;
  dy: number;
}

function makeStars(count: number, seed: number): Star[] {
  const rng = mulberry32(seed);
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    const big = rng() < 0.18;
    out.push({
      x: rng() * 100,
      y: rng() * 100,
      size: big ? 1.7 + rng() * 0.7 : 1.0 + rng() * 0.5,
      baseOp: big ? 0.45 + rng() * 0.3 : 0.18 + rng() * 0.2,
      floatDur: 14 + rng() * 18,
      floatDelay: -rng() * 18,
      twinkleDur: 3 + rng() * 4,
      twinkleDelay: -rng() * 5,
      dx: rng() * 12 - 6,
      dy: rng() * 10 - 5,
    });
  }
  return out;
}

/** Resolve the current `--ink-rgb` token (e.g. "255 255 255") to a concrete triplet. */
function readInkRgb(): [number, number, number] {
  if (typeof window === 'undefined') return [255, 255, 255];
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--ink-rgb').trim();
  const parts = raw.split(/[\s,]+/).map((p) => parseInt(p, 10));
  const r = Number.isFinite(parts[0]) ? parts[0]! : 255;
  const g = Number.isFinite(parts[1]) ? parts[1]! : 255;
  const b = Number.isFinite(parts[2]) ? parts[2]! : 255;
  return [r, g, b];
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
