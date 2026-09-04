import { describe, expect, it } from 'vitest';

import { GoogleCalendarConnectionStatus } from '../googleCalendarConnectionStore';
import { canReadGoogleCalendarCache } from '../useGoogleCalendarConnection';

describe('canReadGoogleCalendarCache', () => {
  it('allows cold-start and degraded states to hydrate persisted events', () => {
    expect(
      canReadGoogleCalendarCache(GoogleCalendarConnectionStatus.Unknown),
    ).toBe(true);
    expect(
      canReadGoogleCalendarCache(GoogleCalendarConnectionStatus.OfflineCached),
    ).toBe(true);
    expect(
      canReadGoogleCalendarCache(GoogleCalendarConnectionStatus.Reauth),
    ).toBe(true);
  });

  it('blocks cached events after an authoritative disconnect', () => {
    expect(
      canReadGoogleCalendarCache(GoogleCalendarConnectionStatus.Disconnected),
    ).toBe(false);
  });
});
