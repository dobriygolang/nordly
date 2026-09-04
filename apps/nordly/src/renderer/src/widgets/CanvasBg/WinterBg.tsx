import { useMemo } from 'react';

import { BG_CONTAINER, GRID_STEP_PX, WAVES, type CanvasMode } from './types';
import { makeStars } from './themeUtils';

// ─── Winter (default, original) ─────────────────────────────────────────
export function WinterBg({ mode, animated }: { mode: CanvasMode; animated: boolean }) {
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
              animation: animated
                ? `star-float ${s.floatDur}s ease-in-out ${s.floatDelay}s infinite,` +
                  ` star-twinkle ${s.twinkleDur}s ease-in-out ${s.twinkleDelay}s infinite`
                : 'none',
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
