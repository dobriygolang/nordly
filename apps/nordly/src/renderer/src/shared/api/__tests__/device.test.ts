import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function stubStorage(impl: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): void {
  vi.stubGlobal('localStorage', {
    ...impl,
    clear: () => undefined,
    key: () => null,
    get length() {
      return 0;
    },
  });
}

describe('device id persist', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws when localStorage persist fails', async () => {
    stubStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    });
    const { setDeviceId } = await import('../device');
    expect(() => setDeviceId('dev-1')).toThrow('quota');
  });

  it('throws when localStorage read fails', async () => {
    stubStorage({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    const { getDeviceId } = await import('../device');
    expect(() => getDeviceId()).toThrow('blocked');
  });
});
