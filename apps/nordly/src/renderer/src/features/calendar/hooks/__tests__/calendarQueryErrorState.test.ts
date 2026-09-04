import { describe, expect, it } from 'vitest';

import { calendarQueryErrorState } from '../useCalendarQuery';
import {
  CalendarProvider,
  CalendarProviderErrorKind,
  calendarProviderError,
} from '../../model/provider';

describe('calendarQueryErrorState', () => {
  it('returns typed Google and Apple provider failures', () => {
    const google = calendarProviderError(
      CalendarProvider.Google,
      CalendarProviderErrorKind.Fetch,
      new Error('tracker unavailable'),
    );
    const apple = calendarProviderError(
      CalendarProvider.Apple,
      CalendarProviderErrorKind.Permission,
      new Error('access denied'),
    );

    expect(calendarQueryErrorState(google, apple, false)).toEqual({
      providerErrors: [google, apple],
      googleFetchFailed: true,
      googleReauthNeeded: false,
    });
  });

  it('does not report reauth as a generic fetch failure', () => {
    const reauth = calendarProviderError(
      CalendarProvider.Google,
      CalendarProviderErrorKind.Reauth,
      new Error('google_reauth_required'),
    );

    expect(calendarQueryErrorState(reauth, null, false)).toEqual({
      providerErrors: [reauth],
      googleFetchFailed: false,
      googleReauthNeeded: true,
    });
  });
});
