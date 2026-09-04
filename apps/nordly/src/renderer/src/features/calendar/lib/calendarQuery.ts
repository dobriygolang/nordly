import { addDays, startOfLocalDay } from '@shared/lib/dates';

export const CalendarViewMode = {
  Week: 'week',
  Month: 'month',
  Year: 'year',
} as const;
export type CalendarViewMode = (typeof CalendarViewMode)[keyof typeof CalendarViewMode];

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
    selection.viewMode === CalendarViewMode.Week
      ? (() => {
          const start = startOfLocalDay(selection.weekStart);
          return { start, end: addDays(start, 7) };
        })()
      : selection.viewMode === CalendarViewMode.Month
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
  const start = addDays(visible.start, -paddingDays);
  const end = addDays(visible.end, paddingDays);
  return { start, end };
}
