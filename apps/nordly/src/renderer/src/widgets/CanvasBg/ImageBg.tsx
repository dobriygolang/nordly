import { useEffect, useRef, useState } from 'react';

import {
  BACKGROUND_FRAME_INTERVAL_MS,
  BG_CONTAINER,
  type CanvasMode,
  type ImageExtractMode,
} from './types';
import { readInkRgb } from './themeUtils';

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

export function ImageBg({
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
      const err = new Error('WebGL unavailable for animated background');
      console.error('[nordly:canvas] webgl background failed', err);
      setRenderError(err);
      return;
    }

    const vert = compileShader(gl, gl.VERTEX_SHADER, POSTER_VERT);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, POSTER_FRAG);
    if (!vert || !frag) {
      const err = new Error('Animated background shader compilation failed');
      console.error('[nordly:canvas] webgl background failed', err);
      setRenderError(err);
      return;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const err = new Error('Animated background program link failed');
      console.error('[nordly:canvas] webgl background failed', err);
      setRenderError(err);
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
    let lastFrame = 0;
    const t0 = performance.now();
    const render = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      if (now - lastFrame < BACKGROUND_FRAME_INTERVAL_MS) {
        raf = requestAnimationFrame(render);
        return;
      }
      lastFrame = now;
      if (ready) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uTime, (now - t0) / 1000);
        gl.uniform1f(uOpacity, posterOpacityRef.current);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      raf = requestAnimationFrame(render);
    };
    if (!document.hidden) raf = requestAnimationFrame(render);

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
      const lose = gl.getExtension('WEBGL_lose_context');
      lose?.loseContext();
    };
  }, [src, renderError, animated, extract]);

  if (!animated) return <StaticImageBg mode={mode} src={src} />;

  if (renderError) return <StaticImageBg mode={mode} src={src} />;

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
