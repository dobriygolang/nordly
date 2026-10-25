import { describe, expect, it } from 'vitest';

import { en } from '../../../shared/i18n/locales/en';
import { ru } from '../../../shared/i18n/locales/ru';

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!).sort();
}

describe('interface translations', () => {
  it('has the same keys in English and Russian', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps every interpolation parameter in both languages', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
      expect(ru[key].trim().length, key).toBeGreaterThan(0);
      expect(en[key].trim().length, key).toBeGreaterThan(0);
    }
  });
});
