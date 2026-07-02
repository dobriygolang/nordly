import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Duplicated strip: the second 0-9 lets digits roll cleanly through wrap-around. */
const DIGIT_STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const CELL_EM = 1.05;
const TICK_ROLL_MS = 420;
const OPEN_ROLL_MS = 560;
const OPEN_STAGGER_MS = 55;
const OPEN_SCROLL_STEPS = 3;

function stripOffsetY(steps: number): string {
  return `translate3d(0, ${(steps * CELL_EM).toFixed(3)}em, 0)`;
}

function OdometerColumn({
  digit,
  columnIndex,
  openRollKey,
}: {
  digit: number;
  columnIndex: number;
  openRollKey: number;
}): JSX.Element {
  const rollDown = columnIndex % 2 === 0;
  const stripRef = useRef<HTMLSpanElement>(null);
  const initialDigitRef = useRef(digit);
  const prevDigitRef = useRef(digit);
  const prevOpenRef = useRef(openRollKey);
  const openAnimCleanupRef = useRef<(() => void) | null>(null);

  const moveTo = useCallback((steps: number, animate: boolean, duration = TICK_ROLL_MS, delay = 0) => {
    const el = stripRef.current;
    if (!el) return;
    el.style.transition = animate
      ? `transform ${duration}ms cubic-bezier(0.45, 0, 0.2, 1) ${delay}ms`
      : 'none';
    el.style.transform = stripOffsetY(steps);
  }, []);

  useLayoutEffect(() => {
    moveTo(-initialDigitRef.current, false);
    prevDigitRef.current = initialDigitRef.current;
  }, [moveTo]);

  useEffect(() => {
    if (digit === prevDigitRef.current) return;
    prevDigitRef.current = digit;
    moveTo(-digit, true, TICK_ROLL_MS, 0);
  }, [digit, moveTo]);

  useEffect(() => {
    if (openRollKey === prevOpenRef.current) return;
    prevOpenRef.current = openRollKey;

    openAnimCleanupRef.current?.();

    const delay = columnIndex * OPEN_STAGGER_MS;
    const startDigit = rollDown
      ? (digit - OPEN_SCROLL_STEPS + 10) % 10
      : (digit + OPEN_SCROLL_STEPS) % 10;

    let raf1 = 0;
    let raf2 = 0;
    let raf3 = 0;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        moveTo(-startDigit, false);
        raf3 = requestAnimationFrame(() => {
          moveTo(-digit, true, OPEN_ROLL_MS, delay);
        });
      });
    });

    openAnimCleanupRef.current = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      cancelAnimationFrame(raf3);
    };

    return () => {
      openAnimCleanupRef.current?.();
      openAnimCleanupRef.current = null;
    };
  }, [openRollKey, digit, columnIndex, rollDown, moveTo]);

  useEffect(() => {
    return () => {
      openAnimCleanupRef.current?.();
    };
  }, []);

  return (
    <span className="nordly-odometer-timer__digit-slot" aria-hidden="true">
      <span ref={stripRef} className="nordly-odometer-timer__digit-strip">
        {DIGIT_STRIP.map((d, i) => (
          <span key={i} className="nordly-odometer-timer__digit-cell">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

export function OdometerTimer({
  totalSec,
  running,
  className,
}: {
  totalSec: number;
  running?: boolean;
  className?: string;
}): JSX.Element {
  const [openRollKey, setOpenRollKey] = useState(0);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setOpenRollKey((k) => k + 1);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const parts = useMemo(() => {
    const safe = Math.max(0, totalSec);
    const mm = String(Math.floor(safe / 60)).padStart(2, '0');
    const ss = String(safe % 60).padStart(2, '0');
    return `${mm}:${ss}`.split('').map((ch) => (ch === ':' ? ch : Number(ch)));
  }, [totalSec]);

  const label = useMemo(() => {
    const safe = Math.max(0, totalSec);
    const mm = String(Math.floor(safe / 60)).padStart(2, '0');
    const ss = String(safe % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [totalSec]);

  return (
    <span
      className={`nordly-odometer-timer mono${running ? ' is-running' : ''}${className ? ` ${className}` : ''}`}
      aria-live="polite"
      aria-label={label}
    >
      {parts.map((part, index) =>
        part === ':' ? (
          <span key="sep" className="nordly-odometer-timer__sep" aria-hidden="true">
            :
          </span>
        ) : (
          <OdometerColumn
            key={index}
            digit={part}
            columnIndex={index}
            openRollKey={openRollKey}
          />
        ),
      )}
    </span>
  );
}
