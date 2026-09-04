import { describe, expect, it, vi } from 'vitest';

import { runFinalizePlan } from '../finalizePlan';

describe('runFinalizePlan', () => {
  it('surfaces a finalize failure without running success navigation', async () => {
    const failure = new Error('idb unavailable');
    const onError = vi.fn();
    const onSuccess = vi.fn();

    const finalized = await runFinalizePlan({
      finalize: async () => {
        throw failure;
      },
      onError,
      onSuccess,
    });

    expect(finalized).toBe(false);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
