import { CalendarEntrySource } from './entry';

export const CalendarProvider = {
  Google: CalendarEntrySource.Google,
  Apple: CalendarEntrySource.Apple,
} as const;
export type CalendarProvider = (typeof CalendarProvider)[keyof typeof CalendarProvider];

export const CalendarProviderErrorKind = {
  Fetch: 'fetch',
  Permission: 'permission',
  Reauth: 'reauth',
  NotConnected: 'not-connected',
} as const;
export type CalendarProviderErrorKind =
  (typeof CalendarProviderErrorKind)[keyof typeof CalendarProviderErrorKind];

export interface CalendarProviderError {
  provider: CalendarProvider;
  kind: CalendarProviderErrorKind;
  message: string;
}

export function calendarProviderError(
  provider: CalendarProvider,
  kind: CalendarProviderErrorKind,
  error: unknown,
): CalendarProviderError {
  return {
    provider,
    kind,
    message: error instanceof Error ? error.message : String(error),
  };
}
