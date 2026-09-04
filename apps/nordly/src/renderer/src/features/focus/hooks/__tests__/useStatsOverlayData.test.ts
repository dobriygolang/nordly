import { describe, expect, it } from 'vitest';

import { ApiHttpError } from '@shared/api/errors';
import {
  FocusStatsFetchStatus,
  focusStatsFetchError,
} from '../useStatsOverlayData';

describe('focusStatsFetchError', () => {
  it('keeps non-auth failures distinct so the hook surfaces them', () => {
    const failure = focusStatsFetchError(new Error('focus service unavailable'));

    expect(failure.status).toBe(FocusStatsFetchStatus.Failed);
    expect(failure.error.message).toBe('focus service unavailable');
  });

  it('recognizes an HTTP auth rejection', () => {
    expect(
      focusStatsFetchError(new ApiHttpError('getStats', 401)).status,
    ).toBe(FocusStatsFetchStatus.Unauthenticated);
  });
});
