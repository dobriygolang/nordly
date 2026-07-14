import { describe, expect, it } from 'vitest';

import { mapPool } from '@shared/lib/mapPool';

describe('mapPool', () => {
  it('preserves order with limited concurrency', async () => {
    const started: number[] = [];
    const results = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      await new Promise((r) => setTimeout(r, 5));
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(started).toHaveLength(5);
  });

  it('returns empty for empty input', async () => {
    expect(await mapPool([], 4, async (n: number) => n)).toEqual([]);
  });

  it('stops scheduling after the first rejection', async () => {
    let started = 0;
    await expect(
      mapPool([1, 2, 3, 4, 5], 2, async (n) => {
        started += 1;
        if (n === 1) {
          await new Promise((r) => setTimeout(r, 5));
          throw new Error('boom');
        }
        await new Promise((r) => setTimeout(r, 40));
        return n;
      }),
    ).rejects.toThrow('boom');
    expect(started).toBeLessThan(5);
  });
});
