const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;
const MAX_TRANSLATIONS = 5;

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
  return readMyMemoryText(await response.json(), front);
}

interface MyMemoryMatch {
  translation?: unknown;
  match?: unknown;
}

export function readMyMemoryText(body: unknown, query = ''): string {
  if (!body || typeof body !== 'object') {
    throw new Error('MyMemory returned no translation');
  }
  const record = body as {
    responseStatus?: number;
    quotaFinished?: boolean;
    responseData?: { translatedText?: string };
    matches?: unknown;
  };
  const primary = record.responseData?.translatedText?.trim() ?? '';
  if (record.quotaFinished || primary.startsWith('MYMEMORY WARNING')) {
    throw new Error('MyMemory translation limit reached');
  }
  if (record.responseStatus !== 200) {
    throw new Error('MyMemory returned no translation');
  }

  const raw: string[] = [];
  if (primary) raw.push(primary);
  const matches = Array.isArray(record.matches) ? (record.matches as MyMemoryMatch[]) : [];
  const ranked = matches
    .map((row) => ({
      text: typeof row.translation === 'string' ? row.translation.trim() : '',
      score: typeof row.match === 'number' ? row.match : 0,
    }))
    .filter((row) => row.text.length > 0)
    .sort((a, b) => b.score - a.score);
  for (const row of ranked) raw.push(row.text);

  const queryNorm = normalizeFront(query);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const text of raw) {
    const next = normalizeFront(text);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    unique.push(next);
  }
  const filtered =
    unique.length > 1 && queryNorm ? unique.filter((text) => text !== queryNorm) : unique;
  const picked = (filtered.length > 0 ? filtered : unique).slice(0, MAX_TRANSLATIONS);
  if (picked.length === 0) {
    throw new Error('MyMemory returned no translation');
  }
  return picked.join(', ');
}
