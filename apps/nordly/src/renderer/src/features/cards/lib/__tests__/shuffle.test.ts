import { describe, expect, it } from 'vitest';

import { shuffleInPlace } from '../shuffle';

describe('shuffleInPlace', () => {
  it('permutes with a fixed random stream', () => {
    const sequence = [0.9, 0.1, 0.5];
    let cursor = 0;
    const random = (): number => {
      const next = sequence[cursor] ?? 0;
      cursor += 1;
      return next;
    };
    expect(shuffleInPlace(['a', 'b', 'c', 'd'], random)).toEqual(['c', 'b', 'a', 'd']);
  });
});
