import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cardTranslationCacheKey,
  lineWithTranslation,
  resetCardTranslationCache,
  splitCardColonLine,
  translateCardFront,
  translationPair,
} from '../cardTranslation';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  resetCardTranslationCache();
});

describe('card translation', () => {
  it('sends Cyrillic to English and Latin to Russian', () => {
    expect(translationPair('привет')).toBe('ru|en');
    expect(translationPair('hello')).toBe('en|ru');
  });

  it('does not call MyMemory for a number', async () => {
    const fetchImpl = vi.fn();
    expect(translationPair('10')).toBeNull();
    expect(splitCardColonLine('10:')?.front).toBe('10');
    await expect(translateCardFront('10', fetchImpl)).rejects.toThrow(/no ru\/en letters/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses one cache key when the second colon is typed', async () => {
    const first = splitCardColonLine('hello:');
    const second = splitCardColonLine('hello:::');
    expect(first?.front).toBe('hello');
    expect(second?.front).toBe('hello');
    expect(cardTranslationCacheKey(first!.front)).toBe(cardTranslationCacheKey(second!.front));

    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('langpair=en%7Cru');
      expect(url).toContain('q=hello');
      return jsonResponse({ responseStatus: 200, responseData: { translatedText: 'привет' } });
    });
    const [a, b] = await Promise.all([
      translateCardFront('hello', fetchImpl),
      translateCardFront('Hello', fetchImpl),
    ]);
    expect(a).toBe('привет');
    expect(b).toBe('привет');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fills an empty side and keeps the typed colon count', () => {
    expect(lineWithTranslation('слово ::', 'word')).toBe('слово :: word');
    expect(lineWithTranslation('слово :::', 'word')).toBe('слово ::: word');
    expect(lineWithTranslation('слово :', 'word')).toBeNull();
  });

  it('does not replace a translation the user already typed', () => {
    expect(lineWithTranslation('слово ::: свой', 'word')).toBeNull();
    expect(lineWithTranslation('hello :: mine', 'привет')).toBeNull();
  });

  it('skips inline code and leaves a failed response uncached', async () => {
    expect(splitCardColonLine('`слово` :')).toBeNull();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        responseStatus: 200,
        responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' },
      }),
    );
    await expect(translateCardFront('hello', fetchImpl)).rejects.toThrow(/translation limit reached/);
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({ responseStatus: 200, responseData: { translatedText: 'привет' } }),
    );
    await expect(translateCardFront('hello', fetchImpl)).resolves.toBe('привет');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
