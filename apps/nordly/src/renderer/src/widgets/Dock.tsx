// Dock — persistent bottom timer pill on every page.
import { type CSSProperties, type ReactNode } from 'react';

import { useT } from '@nordly-i18n';

import { usePomodoroStore } from '@shared/model/pomodoro';
import { TimerMode } from '@shared/model/settings';
import { OdometerTimer } from '@shared/ui/OdometerTimer';
import { Icon } from '@shared/ui/primitives/Icon';

interface DockProps {
  onMenu: () => void;
}

export function Dock({ onMenu }: DockProps) {
  const t = useT();
  const menuLabel = t('nordly.dock.open_menu');
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        WebkitAppRegion: 'no-drag',
      }}
    >
      <div
        className="no-select nordly-dock"
        style={
          {
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 6,
            borderRadius: 14,
            background: 'transparent',
            border: '1px solid var(--ink-tint-06)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          } as CSSProperties
        }
      >
        <DockBtn
          onClick={onMenu}
          title={`${menuLabel} (⌘K)`}
          ariaLabel={menuLabel}
          variant="menu"
        >
          <span className="nordly-dock-btn__icon">
            <Icon name="menu" size={14} />
          </span>
        </DockBtn>
        <Divider />
        <TimerControls />
      </div>
    </div>
  );
}

function ModeCycleBtn() {
  const t = useT();
  const mode = usePomodoroStore((s) => s.mode);
  const cycleMode = usePomodoroStore((s) => s.cycleMode);
  const nextMode =
    mode === TimerMode.Pomodoro ? TimerMode.Stopwatch : TimerMode.Pomodoro;
  const title =
    nextMode === TimerMode.Stopwatch
      ? t('nordly.dock.mode_stopwatch')
      : t('nordly.dock.mode_pomodoro');

  return (
    <DockBtn onClick={() => cycleMode()} title={title} ariaLabel={title} small variant="action">
      <Icon
        name={mode === TimerMode.Pomodoro ? 'pomodoro' : 'infinity'}
        size={14}
        strokeWidth={2}
      />
    </DockBtn>
  );
}

function TimerControls() {
  const t = useT();
  const mode = usePomodoroStore((s) => s.mode);
  const remain = usePomodoroStore((s) => s.remain);
  const elapsed = usePomodoroStore((s) => s.elapsed);
  const running = usePomodoroStore((s) => s.running);
  const toggle = usePomodoroStore((s) => s.toggle);
  const reset = usePomodoroStore((s) => s.reset);
  const displaySec = mode === TimerMode.Pomodoro ? remain : elapsed;

  return (
    <>
      <TimerArea
        mode={mode}
        totalSec={displaySec}
        running={running}
        onReset={reset}
      />
      <Divider />
      <DockBtn
        onClick={toggle}
        title={
          running ? t('nordly.dock.pause_timer') : t('nordly.dock.play_timer')
        }
        ariaLabel={
          running ? t('nordly.dock.pause_timer') : t('nordly.dock.play_timer')
        }
        ariaPressed={running}
        variant="action"
      >
        <Icon name={running ? 'pause' : 'play'} size={13} />
      </DockBtn>
    </>
  );
}


interface TimerAreaProps {
  mode: TimerMode;
  totalSec: number;
  running: boolean;
  onReset: () => void;
}

function TimerArea({ mode, totalSec, running, onReset }: TimerAreaProps) {
  const t = useT();
  return (
    <div className="nordly-dock-timer">
      <div className="nordly-dock-timer-layer nordly-dock-timer-layer--time">
        <span className="nordly-dock-timer-mode" aria-hidden="true">
          <Icon
            name={mode === TimerMode.Pomodoro ? 'pomodoro' : 'infinity'}
            size={14}
            strokeWidth={2}
          />
        </span>
        <OdometerTimer
          totalSec={totalSec}
          running={running}
          className="nordly-dock-timer-display"
        />
      </div>
      <div className="nordly-dock-timer-layer nordly-dock-timer-layer--reset">
        <ModeCycleBtn />
        <DockBtn
          onClick={onReset}
          title={t('nordly.dock.reset_timer')}
          ariaLabel={t('nordly.dock.reset_timer')}
          small
          variant="action"
        >
          <Icon name="reset" size={14} strokeWidth={1.6} />
        </DockBtn>
      </div>
    </div>
  );
}

interface DockBtnProps {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  small?: boolean;
  ariaLabel?: string;
  ariaPressed?: boolean;
  variant?: 'menu' | 'action';
}

function DockBtn({
  children,
  onClick,
  title,
  small = false,
  ariaLabel,
  ariaPressed,
  variant = 'action',
}: DockBtnProps) {
  const size = small ? 28 : 36;
  const radius = small ? 8 : 10;
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-pressed={ariaPressed}
      data-variant={variant}
      className="focus-ring nordly-dock-btn"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <span
      style={{
        width: 1,
        height: 16,
        background: 'rgb(var(--ink-rgb) / 0.18)',
        margin: '0 4px',
      }}
    />
  );
}

