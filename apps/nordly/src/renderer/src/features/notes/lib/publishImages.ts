import { markdownLines } from '@nordly-markdown/proseLines';
import { findWikiMatches } from '@nordly-markdown/wikiTarget';
import { findMarkdownImages } from '@shared/lib/codemirror/imageSyntax';
import { nordlyAssetHref, parseNordlyAssetId } from '@shared/lib/nordlyAsset';

export interface PublishImageSpan {
  from: number;
  to: number;
  alt: string;
  href: string;
  width: number | null;
}

/** Relative vault images outside fenced code. https and nordly-asset refs stay put. */
export function findLocalPublishImages(bodyMd: string): PublishImageSpan[] {
  const spans: PublishImageSpan[] = [];
  for (const row of markdownLines(bodyMd)) {
    if (row.inFence) continue;
    for (const image of findMarkdownImages(row.text)) {
      if (!isLocalImageHref(image.href) || !outsideInlineCode(row.text, image.from)) continue;
      spans.push({
        from: row.offset + image.from,
        to: row.offset + image.to,
        alt: image.alt,
        href: image.href,
        width: image.width,
      });
    }
    for (const match of findWikiMatches(row.text)) {
      if (!match.embed || match.target.kind !== 'note') continue;
      if (!isLocalImageHref(match.raw) || !outsideInlineCode(row.text, match.from)) continue;
      spans.push({
        from: row.offset + match.from,
        to: row.offset + match.to,
        alt: match.raw,
        href: match.raw,
        width: match.width,
      });
    }
  }
  return spans;
}

export function applyPublishImageRewrites(
  bodyMd: string,
  spans: readonly PublishImageSpan[],
  assetIds: ReadonlyMap<string, string>,
): string {
  const ordered = [...spans].sort((a, b) => b.from - a.from);
  let next = bodyMd;
  for (const span of ordered) {
    const id = assetIds.get(span.href);
    if (!id) throw new Error(`publish image rewrite missing id for ${span.href}`);
    const label = span.width ? `${span.alt}|${span.width}` : span.alt;
    const replacement = `![${label}](${nordlyAssetHref(id)})`;
    next = next.slice(0, span.from) + replacement + next.slice(span.to);
  }
  return next;
}

function outsideInlineCode(line: string, index: number): boolean {
  let ticks = 0;
  for (let i = 0; i < index; i += 1) {
    if (line[i] === '`') ticks += 1;
  }
  return ticks % 2 === 0;
}

function isLocalImageHref(href: string): boolean {
  if (/^https:\/\//i.test(href)) return false;
  if (parseNordlyAssetId(href)) return false;
  return true;
}
