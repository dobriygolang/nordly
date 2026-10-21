const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;

export type LangPair = 'ru|en' | 'en|ru';

const cache = new Map<string, Promise<string>>();

/** Cyrillic goes to English. Latin goes to Russian. Digits and symbols do not. */
export function translationPair(text: string): LangPair | null {
  if (CYRILLIC.test(text)) return 'ru|en';
  if (LATIN.test(text)) return 'en|ru';
  return null;
}

function normalizeFront(front: string): string {
  return front.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function translationCacheKey(front: string): string | null {
  const pair = translationPair(front);
  if (!pair) return null;
  return `${pair}\0${normalizeFront(front)}`;
}

export function resetTranslationCache(): void {
  cache.clear();
}

export function translatePhrase(
  front: string,
  fetchImpl: (url: string) => Promise<Response> = fetch,
): Promise<string> {
  const pair = translationPair(front);
  const key = translationCacheKey(front);
  if (!pair || !key) return Promise.reject(new Error('card translation: text has no ru/en letters'));
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = requestMyMemory(front.trim(), pair, fetchImpl).catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, pending);
  return pending;
}

async function requestMyMemory(
  front: string,
  pair: LangPair,
  fetchImpl: (url: string) => Promise<Response>,
): Promise<string> {
  const url = new URL(MYMEMORY_URL);
  url.searchParams.set('q', front);
  url.searchParams.set('langpair', pair);
  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`MyMemory failed (${response.status})`);
  }
  const text = readMyMemoryText(await response.json());
  return text;
}

export function readMyMemoryText(body: unknown): string {
  if (!body || typeof body !== 'object') {
    throw new Error('MyMemory returned no translation');
  }
  const record = body as {
    responseStatus?: number;
    quotaFinished?: boolean;
    responseData?: { translatedText?: string };
  };
  const text = record.responseData?.translatedText?.trim() ?? '';
  if (record.quotaFinished || text.startsWith('MYMEMORY WARNING')) {
    throw new Error('MyMemory translation limit reached');
  }
  if (record.responseStatus !== 200 || !text) {
    throw new Error('MyMemory returned no translation');
  }
  return text;
}
