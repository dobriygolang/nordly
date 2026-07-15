import { useMemo } from 'react';

import {
  buildMonthGrid,
  entriesForDay,
  type CalendarEntry,
} from '@features/calendar/api/calendar';
import type { Locale } from '@nordly-i18n';
import { formatLocaleDate } from '@shared/lib/localeFormat';

interface CalendarYearViewProps {
  year: number;
  entries: CalendarEntry[];
  todayKey: string;
  locale: Locale;
  onPickMonth: (monthIndex: number) => void;
}

export function CalendarYearView({
  year,
  entries,
  todayKey,
  locale,
  onPickMonth,
}: CalendarYearViewProps): JSX.Element {
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, monthIndex) => {
        const viewMonth = new Date(year, monthIndex, 1);
        const grid = buildMonthGrid(viewMonth, locale);
        return { monthIndex, viewMonth, grid };
      }),
    [year, locale],
  );

  return (
    <div className="nordly-calendar-year">
      {months.map(({ monthIndex, viewMonth, grid }) => {
        const label = formatLocaleDate(viewMonth, locale, { month: 'long' });
        return (
          <button
            key={monthIndex}
            type="button"
            className="nordly-calendar-year__month focus-ring"
            onClick={() => onPickMonth(monthIndex)}
          >
            <span className="nordly-calendar-year__label">{label}</span>
            <div className="nordly-calendar-year__grid">
              {grid.map((cell) => {
                const dayEntries = entriesForDay(entries, cell.dayKey);
                const hasTask = dayEntries.some((entry) => entry.source === 'task');
                const hasGoogle = dayEntries.some((entry) => entry.source === 'google');
                return (
                  <span
                    key={cell.dayKey}
                    className="nordly-calendar-year__cell"
                    data-outside={cell.inMonth ? undefined : 'true'}
                    data-today={cell.dayKey === todayKey ? 'true' : undefined}
                    data-busy={hasTask || hasGoogle ? 'true' : undefined}
                  >
                    {cell.inMonth ? cell.date.getDate() : ''}
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
