import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { invoke } from '@tauri-apps/api/core';

import { useT } from '@nordly-i18n';
import {
  initPomodoroFollower,
  sendPomodoroCommand,
} from '@features/focus/lib/pomodoroCrossWindow';
import { applyTheme } from '@shared/lib/applyTheme';
import { listenEffect } from '@shared/lib/tauriListen';
import { readStoredTheme } from '@shared/model/theme';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { Icon } from '@shared/ui/primitives/Icon';
import { themePosterSrc, type ThemeId } from '@shared/model/theme';

function readTheme(): ThemeId {
  const theme = readStoredTheme();
  applyTheme(theme);
  return theme;
}

/** Duplicated strip — second 0–9 allows a seamless full revolution. */
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
    <span className="nordly-tray-popover__digit-slot" aria-hidden="true">
      <span ref={stripRef} className="nordly-tray-popover__digit-strip">
        {DIGIT_STRIP.map((d, i) => (
          <span key={i} className="nordly-tray-popover__digit-cell">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

function TrayTimer({
  totalSec,
  running,
  openRollKey,
}: {
  totalSec: number;
  running: boolean;
  openRollKey: number;
}): JSX.Element {
  const parts = useMemo(() => {
    const safe = Math.max(0, totalSec);
    const mm = String(Math.floor(safe / 60) % 100).padStart(2, '0');
    const ss = String(safe % 60).padStart(2, '0');
    return [mm[0]!, mm[1]!, ss[0]!, ss[1]!].map((ch) => Number(ch)) as [
      number,
      number,
      number,
      number,
    ];
  }, [totalSec]);

  const label = useMemo(() => {
    const safe = Math.max(0, totalSec);
    const mm = String(Math.floor(safe / 60) % 100).padStart(2, '0');
    const ss = String(safe % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [totalSec]);

  return (
    <div
      className={`nordly-tray-popover__timer mono${running ? ' is-running' : ''}`}
      aria-live="polite"
      aria-label={label}
    >
      <OdometerColumn digit={parts[0]} columnIndex={0} openRollKey={openRollKey} />
      <OdometerColumn digit={parts[1]} columnIndex={1} openRollKey={openRollKey} />
      <span className="nordly-tray-popover__timer-sep" aria-hidden="true">
        :
      </span>
      <OdometerColumn digit={parts[2]} columnIndex={2} openRollKey={openRollKey} />
      <OdometerColumn digit={parts[3]} columnIndex={3} openRollKey={openRollKey} />
    </div>
  );
}

export function TrayPopoverApp(): JSX.Element {
  const t = useT();
  const [openRollKey, setOpenRollKey] = useState(0);
  const [theme, setTheme] = useState<ThemeId>(() => readTheme());
  const mode = usePomodoroStore((s) => s.mode);
  const remain = usePomodoroStore((s) => s.remain);
  const elapsed = usePomodoroStore((s) => s.elapsed);
  const running = usePomodoroStore((s) => s.running);
  const pinnedTitle = usePomodoroStore((s) => s.pinnedTitle);
  const displaySec = mode === 'pomodoro' ? remain : elapsed;
  const taskTitle = pinnedTitle?.trim();
  const focusLabel = taskTitle || t(running ? 'nordly.tray.focus_session' : 'nordly.tray.ready');

  useEffect(() => initPomodoroFollower(), []);

  useEffect(() => {
    return listenEffect('tray-popover:show', () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOpenRollKey((k) => k + 1);
        });
      });
    });
  }, []);

  useEffect(() => {
    return listenEffect<ThemeId>('theme:sync', ({ payload }) => {
      applyTheme(payload);
      setTheme(payload);
    });
  }, []);

  const openMain = useCallback(() => {
    void invoke('tray_show_main');
  }, []);

  const toggleTimer = useCallback(() => {
    sendPomodoroCommand('toggle');
  }, []);

  return (
    <div className="nordly-tray-popover-shell">
      <div className="nordly-tray-popover">
        <button
          type="button"
          className="nordly-tray-popover__menu motion-press focus-ring"
          onClick={openMain}
          aria-label="Open Nordly"
          title="Open Nordly"
        >
          <Icon name="menu" size={13} />
        </button>

        <div className="nordly-tray-popover__poster">
          <img key={theme} src={themePosterSrc(theme)} alt="" aria-hidden="true" />
        </div>

        <div className="nordly-tray-popover__controls">
          <TrayTimer totalSec={displaySec} running={running} openRollKey={openRollKey} />

          <div className="nordly-tray-popover__focus-row">
            <button
              type="button"
              className={`nordly-tray-popover__play motion-press focus-ring${running ? ' is-running' : ''}`}
              onClick={toggleTimer}
              aria-label={running ? 'Pause timer' : 'Start timer'}
              aria-pressed={running}
              title={running ? 'Pause' : 'Play'}
            >
              <span className="nordly-tray-popover__play-icon">
                <Icon name={running ? 'pause' : 'play'} size={10} />
              </span>
            </button>
            <span className="nordly-tray-popover__focus-copy" title={focusLabel}>
              <span className="nordly-tray-popover__focus-kicker mono">
                {taskTitle ? t('nordly.tray.current_task') : t('nordly.tray.timer_label')}
              </span>
              <span className="nordly-tray-popover__focus-title">{focusLabel}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
