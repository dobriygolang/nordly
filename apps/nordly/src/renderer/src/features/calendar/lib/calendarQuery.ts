export type CalendarViewMode = 'week' | 'month' | 'year';

export interface CalendarViewSelection {
  viewMode: CalendarViewMode;
  weekStart: Date;
  monthDate: Date;
  viewYear: number;
}

export interface CalendarQueryRange {
  start: Date;
  end: Date;
}

/** Builds the visible range plus cache prefetch padding for the active calendar view. */
export function calendarQueryRange(
  selection: CalendarViewSelection,
  paddingDays = 7,
): CalendarQueryRange {
  const visible =
    selection.viewMode === 'week'
      ? {
          start: new Date(selection.weekStart),
          end: new Date(
            selection.weekStart.getFullYear(),
            selection.weekStart.getMonth(),
            selection.weekStart.getDate() + 7,
          ),
        }
      : selection.viewMode === 'month'
        ? {
            start: new Date(selection.monthDate.getFullYear(), selection.monthDate.getMonth(), 1),
            end: new Date(
              selection.monthDate.getFullYear(),
              selection.monthDate.getMonth() + 1,
              1,
            ),
          }
        : {
            start: new Date(selection.viewYear, 0, 1),
            end: new Date(selection.viewYear + 1, 0, 1),
          };
  const start = new Date(visible.start);
  start.setDate(start.getDate() - paddingDays);
  const end = new Date(visible.end);
  end.setDate(end.getDate() + paddingDays);
  return { start, end };
}
