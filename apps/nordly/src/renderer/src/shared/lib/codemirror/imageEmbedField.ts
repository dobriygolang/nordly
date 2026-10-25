import { syntaxTree } from '@codemirror/language';
import { Facet, StateField, type EditorState, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

import { translate } from '@nordly-i18n';
import { findWikiMatches } from '@nordly-markdown/wikiTarget';
import { NORDLY_ASSET_SCHEME } from '@shared/lib/nordlyAsset';

import { findMarkdownImages } from './imageSyntax';

export type ImageHrefResolver = (href: string) => Promise<string | null>;

export const imageHrefResolverFacet = Facet.define<ImageHrefResolver | null, ImageHrefResolver | null>({
  combine(values) {
    if (values.length === 0) return null;
    return values[values.length - 1] ?? null;
  },
});

const FALLBACK_HEIGHT = 160;
const renderedHeights = new Map<string, number>();

function isRelativeImageHref(href: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

function failureLabel(href: string, code: string): string {
  const key = `nordly.notes.attachment.${code}`;
  const reason = translate(key);
  const text = reason === key ? code : reason;
  return `${href} — ${text}`;
}

function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code;
  }
  return 'missing';
}

class MarkdownImageWidget extends WidgetType {
  constructor(
    readonly href: string,
    readonly alt: string,
    readonly resolver: ImageHrefResolver | null,
    readonly width: number | null,
  ) {
    super();
  }

  eq(other: MarkdownImageWidget): boolean {
    return (
      other.href === this.href &&
      other.alt === this.alt &&
      other.resolver === this.resolver &&
      other.width === this.width
    );
  }

  get estimatedHeight(): number {
    return renderedHeights.get(this.href) ?? FALLBACK_HEIGHT;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'nordly-md-image';
    wrap.setAttribute('contenteditable', 'false');

    const img = document.createElement('img');
    img.alt = this.alt || this.href;
    img.className = 'nordly-md-image__img';
    img.draggable = false;
    if (this.width) {
      img.style.width = `${this.width}px`;
      img.style.maxWidth = '100%';
    }

    const placeholder = document.createElement('span');
    placeholder.className = 'nordly-md-image__placeholder';
    placeholder.textContent = this.alt || this.href;

    let cancelled = false;
    (wrap as HTMLElement & { __nordlyCancel?: () => void }).__nordlyCancel = () => {
      cancelled = true;
    };

    const measure = () => {
      if (cancelled) return;
      const height = wrap.getBoundingClientRect().height;
      if (height > 0) renderedHeights.set(this.href, height);
      view.requestMeasure();
    };

    const showPlaceholder = (code?: string) => {
      if (cancelled) return;
      img.remove();
      if (code) placeholder.textContent = failureLabel(this.href, code);
      if (!placeholder.isConnected) wrap.appendChild(placeholder);
      wrap.classList.add('nordly-md-image--unresolved');
      if (code === 'vault_locked') wrap.classList.add('nordly-md-image--vault-locked');
      measure();
    };

    const showImg = (src: string) => {
      if (cancelled) return;
      placeholder.remove();
      wrap.classList.remove('nordly-md-image--unresolved', 'nordly-md-image--loading');
      img.onload = () => measure();
      img.onerror = () => showPlaceholder('missing');
      img.src = src;
      if (!img.isConnected) wrap.appendChild(img);
    };

    if (/^https:\/\//i.test(this.href)) {
      showImg(this.href);
    } else if (
      this.resolver &&
      (this.href.startsWith(NORDLY_ASSET_SCHEME) || isRelativeImageHref(this.href))
    ) {
      wrap.appendChild(placeholder);
      wrap.classList.add('nordly-md-image--loading');
      void this.resolver(this.href)
        .then((src) => {
          if (cancelled) return;
          if (src) showImg(src);
          else showPlaceholder('missing');
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          wrap.classList.remove('nordly-md-image--loading');
          showPlaceholder(errorCode(err));
        });
    } else {
      showPlaceholder('missing');
    }

    return wrap;
  }

  destroy(dom: HTMLElement): void {
    (dom as HTMLElement & { __nordlyCancel?: () => void }).__nordlyCancel?.();
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function lineInFencedCode(state: EditorState, lineFrom: number, lineTo: number): boolean {
  const pos = lineFrom === lineTo ? lineFrom : lineFrom + 1;
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (true) {
    if (node.name === 'FencedCode') return node.getChildren('CodeMark').length === 2;
    const parent = node.parent;
    if (!parent) return false;
    node = parent;
  }
}

function buildImageEmbeds(state: EditorState): DecorationSet {
  const resolver = state.facet(imageHrefResolverFacet);
  const ranges: Range<Decoration>[] = [];
  for (let n = 1; n <= state.doc.lines; n += 1) {
    const line = state.doc.line(n);
    if (lineInFencedCode(state, line.from, line.to)) continue;
    const embeds = [
      ...findMarkdownImages(line.text).map((image) => ({
        from: image.from,
        href: image.href,
        alt: image.alt,
        width: image.width,
      })),
      ...findWikiMatches(line.text)
        .filter((match) => match.embed && match.target.kind === 'note')
        .map((match) => ({
          from: match.from,
          href: match.raw,
          alt: match.alias ?? match.raw,
          width: match.width,
        })),
    ].sort((a, b) => a.from - b.from);
    embeds.forEach((image, index) => {
      ranges.push(
        Decoration.widget({
          widget: new MarkdownImageWidget(image.href, image.alt, resolver, image.width),
          block: true,
          side: index + 1,
        }).range(line.to),
      );
    });
  }
  return Decoration.set(ranges, true);
}

/** Block image under every image line, including the line the cursor is on. */
export const imageEmbedField = StateField.define<DecorationSet>({
  create(state) {
    return buildImageEmbeds(state);
  },
  update(value, tr) {
    const resolverChanged =
      tr.startState.facet(imageHrefResolverFacet) !== tr.state.facet(imageHrefResolverFacet);
    if (!tr.docChanged && !resolverChanged) return value;
    return buildImageEmbeds(tr.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});
