import { useEffect, useMemo, useRef, useState } from 'react';

import { useLocale, useT } from '@nordly-i18n';

import {
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  dateFromGridMinutes,
  gridMinutesFromDate,
} from '@features/calendar/api/calendar';
import { formatLocaleTime } from '@shared/lib/localeFormat';
import { zIndex } from '@shared/lib/z-index';
import { formatTimeShort, toDayKey } from '@shared/lib/dates';
import { useEscapeLayer } from '@shared/hooks/useEscapeLayer';

const DEFAULT_STEP_MIN = 30;
/** Match the day/week calendar grid (06:00 → 02:00 next morning). */
const DEFAULT_START_H = CALENDAR_GRID_START_HOUR;
const DEFAULT_END_H = CALENDAR_GRID_END_HOUR;

function buildTimeOptions(
  locale: 'en' | 'ru',
  stepMin: number,
  startHour: number,
  endHour: number,
): Array<{ gridMin: number; label: string }> {
  const out: Array<{ gridMin: number; label: string }> = [];
  const maxMin = endHour * 60;
  for (let totalMin = startHour * 60; totalMin <= maxMin; totalMin += stepMin) {
    const d = new Date(2000, 0, 1, 0, 0, 0, 0);
    d.setMinutes(totalMin);
    out.push({
      gridMin: totalMin,
      label: formatLocaleTime(d, locale),
    });
  }
  return out;
}

function withSelectedTime(
  options: Array<{ gridMin: number; label: string }>,
  value: Date | null,
  day: Date,
  locale: 'en' | 'ru',
): Array<{ gridMin: number; label: string }> {
  if (!value) return options;
  const gridMin = gridMinutesFromDate(toDayKey(day), value);
  if (gridMin == null) return options;
  const snapped = Math.round(gridMin);
  if (options.some((o) => o.gridMin === snapped)) return options;
  const d = new Date(2000, 0, 1, 0, 0, 0, 0);
  d.setMinutes(snapped);
  const extra = {
    gridMin: snapped,
    label: formatLocaleTime(d, locale),
  };
  return [...options, extra].sort((a, b) => a.gridMin - b.gridMin);
}

interface TimePickerProps {
  value: Date | null;
  day: Date;
  disabled?: boolean;
  inline?: boolean;
  stepMin?: number;
  /** Inclusive grid start hour (default: calendar grid start). */
  startHour?: number;
  /** Inclusive grid end hour; values ≥ 24 are next-morning overnight (default: calendar grid end). */
  endHour?: number;
  onChange: (next: Date) => void;
}

export function TimePicker({
  value,
  day,
  disabled,
  inline,
  stepMin = DEFAULT_STEP_MIN,
  startHour = DEFAULT_START_H,
  endHour = DEFAULT_END_H,
  onChange,
}: TimePickerProps): JSX.Element {
  const t = useT();
  const [locale] = useLocale();
  const timeOptions = useMemo(
    () => withSelectedTime(buildTimeOptions(locale, stepMin, startHour, endHour), value, day, locale),
    [locale, stepMin, startHour, endHour, value, day],
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const display = value ? formatTimeShort(value, locale) : '—';

  const activeKey = useMemo(() => {
    if (!value) return null;
    const gridMin = gridMinutesFromDate(toDayKey(day), value);
    return gridMin == null ? null : String(Math.round(gridMin));
  }, [value, day]);

  useEscapeLayer(() => setOpen(false), open);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  useEffect(() => {
    if (!open || inline || !listRef.current || !activeKey) return;
    const el = listRef.current.querySelector(`[data-time="${activeKey}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, inline, activeKey]);

  const timeAria = t('nordly.taskboard.time_aria');

  const renderOptions = () =>
    timeOptions.map(({ gridMin, label }) => {
      const key = String(gridMin);
      const active = activeKey === key;
      return (
        <button
          key={key}
          type="button"
          data-time={key}
          role="option"
          aria-selected={active}
          onClick={(e) => {
            e.stopPropagation();
            onChange(dateFromGridMinutes(toDayKey(day), gridMin));
            if (!inline) setOpen(false);
          }}
          className="mono"
          style={{
            display: 'block',
            width: '100%',
            border: 'none',
            background: active ? 'rgb(var(--ink-rgb) / 0.1)' : 'transparent',
            color: active ? 'var(--ink)' : 'var(--ink-60)',
            fontSize: 11,
            textAlign: inline ? 'center' : 'left',
            padding: inline ? '5px 4px' : '6px 12px',
            borderRadius: inline ? 4 : 0,
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      );
    });

  const menuStyle: React.CSSProperties = inline
    ? {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 2,
        width: 136,
        maxHeight: 168,
        overflowY: 'auto',
        padding: 4,
      }
    : {
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 4,
        width: 88,
        maxHeight: 176,
        overflowY: 'auto',
        padding: '4px 0',
        background: 'rgb(22 22 22 / 0.98)',
        border: '1px solid rgb(var(--ink-rgb) / 0.1)',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgb(0 0 0 / 0.45)',
        zIndex: zIndex.dropdown,
      };

  if (inline) {
    return (
      <div ref={listRef} role="listbox" aria-label={timeAria} style={menuStyle}>
        {renderOptions()}
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        className="mono"
        style={{
          border: 'none',
          background: open ? 'rgb(var(--ink-rgb) / 0.08)' : 'transparent',
          color: 'var(--ink-40)',
          opacity: value ? 1 : 0.45,
          fontSize: 10,
          padding: '2px 4px',
          borderRadius: 4,
          cursor: disabled ? 'default' : 'pointer',
          minWidth: 44,
          textAlign: 'center',
        }}
      >
        {display}
      </button>

      {open && (
        <div ref={listRef} role="listbox" aria-label={timeAria} style={menuStyle}>
          {renderOptions()}
        </div>
      )}
    </div>
  );
}
