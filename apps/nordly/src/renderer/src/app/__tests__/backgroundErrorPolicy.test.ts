import { describe, expect, it } from 'vitest';

import {
  BackgroundOperationError,
  classifyBackgroundError,
  shouldSurfaceBackgroundError,
} from '../backgroundErrorPolicy';
import { SyncError } from '@shared/sync/errors';

describe('background error policy', () => {
  it('keeps typed network and auth failures in the background', () => {
    const network = new SyncError('server_unreachable', 'offline');
    const auth = new SyncError('session_expired', 'expired');

    expect(classifyBackgroundError(network)).toBe('network');
    expect(classifyBackgroundError(auth)).toBe('auth');
    expect(shouldSurfaceBackgroundError(network)).toBe(false);
    expect(shouldSurfaceBackgroundError(auth)).toBe(false);
  });

  it('surfaces vault and IndexedDB failures', () => {
    const vault = new BackgroundOperationError('vault', 'vault prefs failed');
    const indexedDb = new BackgroundOperationError('indexeddb', 'IDB open failed');

    expect(shouldSurfaceBackgroundError(vault)).toBe(true);
    expect(shouldSurfaceBackgroundError(indexedDb)).toBe(true);
  });

  it('surfaces uncategorized failures instead of guessing from text', () => {
    expect(shouldSurfaceBackgroundError(new Error('Failed to fetch'))).toBe(true);
    expect(classifyBackgroundError(new Error('vault-shaped wording'))).toBe(
      'unexpected',
    );
  });
});
