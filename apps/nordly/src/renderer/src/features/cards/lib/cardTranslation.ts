import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import {
  resetTranslationCache,
  translatePhrase,
  translationCacheKey,
  translationPair,
} from '@nordly-translate/mymemory';
import { isNativeHttpInTauri } from '@platform/runtime';

export { translationPair };
export const cardTranslationCacheKey = translationCacheKey;
export const resetCardTranslationCache = resetTranslationCache;

const LIST_PREFIX = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/;

export type CardColonMarker = ':' | '::' | ':::';

export interface CardColonSplit {
  rawFront: string;
  front: string;
  marker: CardColonMarker;
  back: string;
}

function httpGet(url: string): Promise<Response> {
  return isNativeHttpInTauri() ? tauriFetch(url) : fetch(url);
}

export function translateCardFront(
  front: string,
  fetchImpl: (url: string) => Promise<Response> = httpGet,
): Promise<string> {
  return translatePhrase(front, fetchImpl);
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
