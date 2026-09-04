export const CalendarEntrySource = {
  Task: 'task',
  Google: 'google',
  Apple: 'apple',
} as const;
export type CalendarEntrySource = (typeof CalendarEntrySource)[keyof typeof CalendarEntrySource];
export type MutableCalendarEntrySource =
  | typeof CalendarEntrySource.Task
  | typeof CalendarEntrySource.Google;
