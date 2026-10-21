import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import { isNativeHttpInTauri } from '@platform/runtime';

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const LIST_PREFIX = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;

export type CardLangPair = 'ru|en' | 'en|ru';
export type CardColonMarker = ':' | '::' | ':::';

export interface CardColonSplit {
  rawFront: string;
  front: string;
  marker: CardColonMarker;
  back: string;
}

const cache = new Map<string, Promise<string>>();

function httpGet(url: string): Promise<Response> {
  return isNativeHttpInTauri() ? tauriFetch(url) : fetch(url);
}

/** Cyrillic goes to English. Latin goes to Russian. Digits and symbols do not. */
export function translationPair(text: string): CardLangPair | null {
  if (CYRILLIC.test(text)) return 'ru|en';
  if (LATIN.test(text)) return 'en|ru';
  return null;
}

export function cardTranslationCacheKey(front: string): string | null {
  const pair = translationPair(front);
  if (!pair) return null;
  return `${pair}\0${normalizeFront(front)}`;
}

function normalizeFront(front: string): string {
  return front.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cardQuery(rawFront: string): string {
  const stripped = rawFront.replace(LIST_PREFIX, '').trim();
  if (/^`[^`]*`$/.test(stripped)) return '';
  const wiki = /^\[\[([^[\]]+)\]\]$/.exec(stripped);
  return (wiki?.[1] ?? stripped).trim();
}

/** First run of 1–3 colons outside inline code. */
export function splitCardColonLine(line: string): CardColonSplit | null {
  let inCode = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '`') {
      inCode = !inCode;
      continue;
    }
    if (inCode || line[i] !== ':') continue;
    let length = 0;
    while (i + length < line.length && line[i + length] === ':') length += 1;
    if (length < 1 || length > 3) return null;
    const rawFront = line.slice(0, i);
    const front = cardQuery(rawFront);
    if (!front) return null;
    const marker = ':'.repeat(length) as CardColonMarker;
    return { rawFront, front, marker, back: line.slice(i + length).trim() };
  }
  return null;
}

/** Fill an empty `::` / `:::` side. A typed translation and a lone `:` stay put. */
export function lineWithTranslation(line: string, translation: string): string | null {
  const split = splitCardColonLine(line);
  const text = translation.trim();
  if (!split || !text || split.marker === ':' || split.back) return null;
  return `${split.rawFront.trimEnd()} ${split.marker} ${text}`;
}

export function resetCardTranslationCache(): void {
  cache.clear();
}

export function translateCardFront(
  front: string,
  fetchImpl: (url: string) => Promise<Response> = httpGet,
): Promise<string> {
  const pair = translationPair(front);
  const key = cardTranslationCacheKey(front);
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
  pair: CardLangPair,
  fetchImpl: (url: string) => Promise<Response>,
): Promise<string> {
  const url = new URL(MYMEMORY_URL);
  url.searchParams.set('q', front);
  url.searchParams.set('langpair', pair);
  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`MyMemory failed (${response.status})`);
  }
  const body = (await response.json()) as {
    responseStatus?: number;
    quotaFinished?: boolean;
    responseData?: { translatedText?: string };
  };
  const text = body.responseData?.translatedText?.trim() ?? '';
  if (body.quotaFinished || text.startsWith('MYMEMORY WARNING')) {
    throw new Error('MyMemory translation limit reached');
  }
  if (body.responseStatus !== 200 || !text) {
    throw new Error('MyMemory returned no translation');
  }
  return text;
}
