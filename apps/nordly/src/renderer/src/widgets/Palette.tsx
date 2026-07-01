import { useEffect, useMemo, useRef, useState } from 'react';

import { useT, useLocale, translate } from '@nordly-i18n';

import { Icon, type IconName } from '@shared/ui/primitives/Icon';
import {
  buildDefaultScheduleDate,
  buildCreateScheduleDate,
  formatWhenChipWithTime,
  startOfLocalDay,
} from '@pages/TaskBoard/lib/dates';
import { TimePicker } from '@pages/TaskBoard/TimePicker';

export type PageId =
  | 'home'
  | 'today'
  | 'notes'
  | 'whiteboard'
  | 'stats'
  | 'calendar'
  | 'settings';

export type PaletteAction = PageId | 'stats' | 'calendar' | 'planning';

interface PaletteProps {
  onClose: () => void;
  onOpen: (id: PaletteAction) => void;
  taskDate?: Date | null;
  onCreateTask?: (title: string, date: Date) => void;
  closing?: boolean;
}

interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  shortcut?: string[];
  run: () => void;
}

type Row =
  | { kind: 'nav'; item: NavItem; index: number }
  | { kind: 'task'; title: string; index: number };

const NAV_ITEMS: Array<{
  id: string;
  labelKey: string;
  icon: IconName;
  shortcut?: string[];
}> = [
  { id: 'today', labelKey: 'nordly.palette.nav_today', icon: 'sun', shortcut: ['T'] },
  { id: 'planning', labelKey: 'nordly.palette.nav_planning', icon: 'pomodoro', shortcut: ['P'] },
  { id: 'notes', labelKey: 'nordly.palette.nav_notes', icon: 'note', shortcut: ['N'] },
  { id: 'whiteboard', labelKey: 'nordly.palette.nav_whiteboard', icon: 'grid', shortcut: ['B'] },
  { id: 'calendar', labelKey: 'nordly.palette.nav_calendar', icon: 'calendar', shortcut: ['C'] },
  { id: 'stats', labelKey: 'nordly.palette.nav_stats', icon: 'bars', shortcut: ['S'] },
  { id: 'settings', labelKey: 'nordly.palette.nav_settings', icon: 'settings', shortcut: [','] },
];

const PALETTE_PAGE_PRELOAD: Partial<Record<string, () => void>> = {
  today: () => void import('@pages/TaskBoard'),
  planning: () => void import('@pages/DailyPlanning/DailyPlanningModal'),
  notes: () => void import('@pages/Notes'),
  whiteboard: () => void import('@pages/Whiteboard'),
  settings: () => void import('@pages/Settings'),
};

export function Palette({ onClose, onOpen, taskDate, onCreateTask, closing = false }: PaletteProps) {
  const t = useT();
  const [locale] = useLocale();
  const [idx, setIdx] = useState(0);
  const [q, setQ] = useState('');
  const [timeOpen, setTimeOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeCustomizedRef = useRef(false);
  const trimmed = q.trim();
  const day = taskDate ?? new Date();
  const [scheduleAt, setScheduleAt] = useState(() => buildDefaultScheduleDate(day));
  const when = formatWhenChipWithTime(scheduleAt, locale);

  useEffect(() => {
    setScheduleAt(buildDefaultScheduleDate(taskDate ?? new Date()));
    setTimeOpen(false);
    timeCustomizedRef.current = false;
  }, [taskDate]);

  const navItems: NavItem[] = useMemo(
    () =>
      NAV_ITEMS.map((it) => ({
        id: it.id,
        label: t(it.labelKey),
        icon: it.icon,
        shortcut: it.shortcut,
        run: () => onOpen(it.id as PaletteAction),
      })),
    [onOpen, t],
  );

  const filteredNav = useMemo(() => {
    const s = trimmed.toLowerCase();
    if (!s) return navItems;
    return navItems.filter((i) => i.label.toLowerCase().includes(s));
  }, [trimmed, navItems]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    let i = 0;
    for (const item of filteredNav) {
      out.push({ kind: 'nav', item, index: i++ });
    }
    if (trimmed && onCreateTask) {
      out.push({ kind: 'task', title: trimmed, index: i++ });
    }
    return out;
  }, [filteredNav, trimmed, onCreateTask]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setIdx(0);
  }, [q]);

  const runRow = (row: Row) => {
    if (row.kind === 'nav') {
      row.item.run();
      return;
    }
    const whenDate = buildCreateScheduleDate(
      startOfLocalDay(scheduleAt),
      scheduleAt,
      timeCustomizedRef.current,
    );
    onCreateTask?.(row.title, whenDate);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[idx];
      if (row) runRow(row);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const showWhenChip = Boolean(trimmed || taskDate);

  return (
    <div
      className="nordly-palette-scrim"
      data-closing={closing ? 'true' : undefined}
      data-elevated={taskDate ? 'true' : undefined}
      onClick={onClose}
    >
      <div
        className="nordly-palette-panel"
        data-closing={closing ? 'true' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nordly-palette-search">
          <span className="nordly-palette-search__icon" aria-hidden>
            <Icon name="search" size={13} />
          </span>
          {showWhenChip && (
            <div className="nordly-palette-when-wrap">
              <button
                type="button"
                className="nordly-palette-when mono"
                data-open={timeOpen ? 'true' : 'false'}
                onClick={(e) => {
                  e.stopPropagation();
                  setTimeOpen((v) => !v);
                }}
              >
                {t('nordly.palette.when', { when })}
              </button>
              {timeOpen && (
                <div className="nordly-palette-when-popover" onClick={(e) => e.stopPropagation()}>
                  <TimePicker
                    inline
                    stepMin={30}
                    startHour={8}
                    endHour={20}
                    value={scheduleAt}
                    day={startOfLocalDay(scheduleAt)}
                    onChange={(next) => {
                      timeCustomizedRef.current = true;
                      setScheduleAt(next);
                    }}
                  />
                </div>
              )}
            </div>
          )}
          <input
            ref={inputRef}
            className="nordly-palette-search__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={
              onCreateTask ? t('nordly.palette.create_placeholder') : translate('nordly.palette.placeholder')
            }
            aria-label={t('nordly.palette.aria_search')}
          />
          <Chip>esc</Chip>
        </div>

        <div className="nordly-palette-list" role="listbox" aria-label={t('nordly.palette.aria_commands')}>
          {rows.map((row, i) => {
            const active = i === idx;
            if (row.kind === 'task') {
              return (
                <button
                  key="add-task"
                  type="button"
                  className="nordly-palette-row nordly-palette-option"
                  data-active={active ? 'true' : 'false'}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => runRow(row)}
                  role="option"
                  aria-selected={active}
                >
                  <span className="nordly-palette-row__icon">
                    <Icon name="plus" size={12} />
                  </span>
                  <span className="nordly-palette-row__label">
                    <span className="nordly-palette-row__title">{t('nordly.palette.add_task')}</span>
                    <span className="nordly-palette-row__sub mono">{t('nordly.palette.when', { when })}</span>
                  </span>
                  <Chip>↵</Chip>
                </button>
              );
            }

            const it = row.item;
            return (
              <button
                key={it.id}
                type="button"
                className="nordly-palette-row nordly-palette-option"
                data-active={active ? 'true' : 'false'}
                onMouseEnter={() => {
                  PALETTE_PAGE_PRELOAD[it.id]?.();
                  setIdx(i);
                }}
                onClick={() => runRow(row)}
                role="option"
                aria-selected={active}
              >
                <span className="nordly-palette-row__icon">
                  <Icon name={it.icon} size={12} />
                </span>
                <span className="nordly-palette-row__title">{it.label}</span>
                <span className="nordly-palette-row__shortcuts">
                  {(it.shortcut ?? []).map((k, ki) => (
                    <span key={ki} className="nordly-palette-row__shortcut-group">
                      {ki > 0 && <span className="nordly-palette-row__dot">·</span>}
                      <Chip>{k}</Chip>
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
          {rows.length === 0 && (
            <div className="nordly-palette-empty">{t('nordly.palette.no_matches')}</div>
          )}
        </div>

        <div className="nordly-palette-footer mono">
          <span className="nordly-palette-footer__hint">
            {t('nordly.palette.hint_select')} <Chip>↑</Chip>
            <Chip>↓</Chip>
          </span>
          <span className="nordly-palette-footer__hint">
            {t('nordly.palette.hint_open')} <Chip>↵</Chip>
          </span>
          <span className="nordly-palette-footer__spacer" />
          <span className="nordly-palette-footer__hint">
            <Chip>⌘</Chip>
            <Chip>K</Chip>
          </span>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="nordly-palette-chip mono">{children}</span>;
}
