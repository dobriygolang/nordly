import { describe, expect, it } from 'vitest';

import { sameEpics, type TaskEpic } from '../epics';

function epic(id: string, name = 'Blue'): TaskEpic {
  return { id, name, color: '#5b8def' };
}

describe('sameEpics', () => {
  it('returns true when id/name/color match', () => {
    expect(sameEpics([epic('a')], [{ ...epic('a') }])).toBe(true);
  });

  it('returns false when a field changes', () => {
    expect(sameEpics([epic('a')], [epic('a', 'Green')])).toBe(false);
  });
});
