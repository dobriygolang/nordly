import { useMemo } from 'react';

import {
  buildMonthGrid,
  entriesForDay,
  type CalendarEntry,
} from '@features/calendar/api/calendar';
import { useTaskEpics } from '@features/tasks/lib/useTaskEpics';
import type { Locale } from '@nordly-i18n';

import { calendarEpicSurface } from './calendarEntrySurface';

interface CalendarMonthViewProps {
  monthDate: Date;
  entries: CalendarEntry[];
  todayKey: string;
  locale: Locale;
  onPickDay: (day: Date) => void;
  onCreateDay?: (day: Date) => void;
  onEntryClick: (entry: CalendarEntry) => void;
}

export function CalendarMonthView({
  monthDate,
  entries,
  todayKey,
  locale,
  onPickDay,
  onCreateDay,
  onEntryClick,
}: CalendarMonthViewProps): JSX.Element {
  const { epics } = useTaskEpics();
  const cells = useMemo(() => buildMonthGrid(monthDate, locale), [monthDate, locale]);
  const month = monthDate.getMonth();
  return (
    <div className="nordly-calendar-month">
      {cells.map((cell) => {
        const dayEntries = entriesForDay(entries, cell.dayKey).slice(0, 4);
        return (
          <div
            key={cell.dayKey}
            className="nordly-calendar-month__cell"
            data-outside={cell.date.getMonth() === month ? undefined : 'true'}
            data-today={cell.dayKey === todayKey ? 'true' : undefined}
            onClick={() => onPickDay(cell.date)}
            onDoubleClick={onCreateDay ? () => onCreateDay(cell.date) : undefined}
          >
            <span className="nordly-calendar-month__date">{cell.date.getDate()}</span>
            <div className="nordly-calendar-month__events">
              {dayEntries.map((entry) => {
                const epicSurface = calendarEpicSurface(entry, epics);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="nordly-calendar-month__chip"
                    data-source={entry.source}
                    data-epic={epicSurface ? 'true' : undefined}
                    style={epicSurface ?? undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEntryClick(entry);
                    }}
                    title={entry.title}
                  >
                    {entry.title}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
