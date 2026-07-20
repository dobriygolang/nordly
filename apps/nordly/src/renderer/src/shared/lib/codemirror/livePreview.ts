import { syntaxTree } from '@codemirror/language';
import { Facet, StateField, type EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view';

import { notesCodeLangLabel } from './notesCodeLanguages';
import { NORDLY_ASSET_SCHEME } from '@shared/lib/nordlyAsset';

interface DecorationSink {
  add(from: number, to: number, decoration: Decoration): void;
}

class DecorationCollector implements DecorationSink {
  private readonly ranges: Range<Decoration>[] = [];

  add(from: number, to: number, decoration: Decoration): void {
    this.ranges.push(decoration.range(from, to));
  }

  finish(): DecorationSet {
    return Decoration.set(this.ranges, true);
  }
}

/** Normalized note titles that resolve [[wiki-links]] in live preview. */
export const wikiLinkTitlesFacet = Facet.define<ReadonlySet<string>, ReadonlySet<string>>({
  combine(values) {
    if (values.length === 0) return new Set();
    return values[values.length - 1] ?? new Set();
  },
});

/** Resolve markdown image href → displayable URL (blob or https). */
export type ImageHrefResolver = (href: string) => Promise<string | null>;

export const imageHrefResolverFacet = Facet.define<
  ImageHrefResolver | null,
  ImageHrefResolver | null
>({
  combine(values) {
    if (values.length === 0) return null;
    return values[values.length - 1] ?? null;
  },
});

function rangeTouches(from: number, to: number, start: number, end: number): boolean {
  return from < end && to > start;
}

/** Block widgets (HR) and list/quote markers — reveal source while the caret is on the line
 *  (inclusive end: caret after the last char still counts as “on this line”). */
function showLineSyntax(state: EditorState, line: { from: number; to: number }): boolean {
  for (const range of state.selection.ranges) {
    if (range.head >= line.from && range.head <= line.to) return true;
    if (range.from !== range.to && rangeTouches(range.from, range.to, line.from, line.to + 1)) {
      return true;
    }
  }
  return false;
}

class CodeLangBadgeWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }

  eq(other: CodeLangBadgeWidget): boolean {
    return other.label === this.label;
  }

  toDOM(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'nordly-md-code-block__lang-bar';
    const badge = document.createElement('span');
    badge.className = 'nordly-md-code-block__lang';
    badge.textContent = this.label;
    badge.setAttribute('aria-hidden', 'true');
    bar.appendChild(badge);
    return bar;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class MarkdownImageWidget extends WidgetType {
  constructor(
    readonly href: string,
    readonly alt: string,
    readonly resolver: ImageHrefResolver | null,
  ) {
    super();
  }

  eq(other: MarkdownImageWidget): boolean {
    return other.href === this.href && other.alt === this.alt && other.resolver === this.resolver;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'nordly-md-image';
    wrap.setAttribute('contenteditable', 'false');

    const img = document.createElement('img');
    img.alt = this.alt || 'image';
    img.className = 'nordly-md-image__img';
    img.draggable = false;

    const placeholder = document.createElement('span');
    placeholder.className = 'nordly-md-image__placeholder';
    placeholder.textContent = this.alt || 'image';

    let cancelled = false;
    (wrap as HTMLElement & { __nordlyCancel?: () => void }).__nordlyCancel = () => {
      cancelled = true;
    };

    const showPlaceholder = () => {
      if (cancelled) return;
      img.remove();
      if (!placeholder.isConnected) wrap.appendChild(placeholder);
      wrap.classList.add('nordly-md-image--unresolved');
    };

    const showImg = (src: string) => {
      if (cancelled) return;
      placeholder.remove();
      wrap.classList.remove('nordly-md-image--unresolved');
      img.src = src;
      if (!img.isConnected) wrap.appendChild(img);
    };

    if (/^https:\/\//i.test(this.href)) {
      img.onerror = () => showPlaceholder();
      showImg(this.href);
    } else if (this.href.startsWith(NORDLY_ASSET_SCHEME) && this.resolver) {
      wrap.appendChild(placeholder);
      wrap.classList.add('nordly-md-image--loading');
      void this.resolver(this.href)
        .then((src) => {
          if (cancelled) return;
          wrap.classList.remove('nordly-md-image--loading');
          if (src) {
            img.onerror = () => showPlaceholder();
            showImg(src);
          } else {
            showPlaceholder();
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          wrap.classList.remove('nordly-md-image--loading');
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            (err as { code: unknown }).code === 'vault_locked'
          ) {
            placeholder.textContent = 'Vault locked';
            wrap.classList.add('nordly-md-image--vault-locked');
          }
          showPlaceholder();
        });
    } else {
      showPlaceholder();
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

function addMark(
  builder: DecorationSink,
  from: number,
  to: number,
  spec: Parameters<typeof Decoration.mark>[0],
): void {
  if (from < to) builder.add(from, to, Decoration.mark(spec));
}

/** Hide source glyphs without changing document geometry or cursor navigation. */
function hideRange(builder: DecorationSink, from: number, to: number): void {
  if (from < to) builder.add(from, to, Decoration.mark({ class: 'nordly-md-syntax-hidden' }));
}

function muteMarker(builder: DecorationSink, from: number, to: number): void {
  hideRange(builder, from, to);
}

function pushMark(
  decorations: Range<Decoration>[],
  from: number,
  to: number,
  spec: Parameters<typeof Decoration.mark>[0],
): void {
  if (from < to) decorations.push(Decoration.mark(spec).range(from, to));
}

function pushHide(decorations: Range<Decoration>[], from: number, to: number): void {
  if (from < to) {
    decorations.push(Decoration.mark({ class: 'nordly-md-syntax-hidden' }).range(from, to));
  }
}

function overlapsRange(ranges: [number, number][], start: number, end: number): boolean {
  return ranges.some(([a, b]) => start < b && end > a);
}

function applyDelimitedInline(
  builder: DecorationSink,
  state: EditorState,
  lineFrom: number,
  text: string,
  re: RegExp,
  className: string,
  open: number,
  close: number,
  occupied: [number, number][],
): void {
  re.lastIndex = 0;
  let match = re.exec(text);
  while (match != null) {
    const relStart = match.index;
    const relEnd = relStart + match[0].length;
    if (!overlapsRange(occupied, relStart, relEnd)) {
      const start = lineFrom + relStart;
      const end = lineFrom + relEnd;
      const contentStart = start + open;
      const contentEnd = end - close;
      const showSyntax = showLineSyntax(state, state.doc.lineAt(start));
      if (showSyntax) {
        addMark(builder, contentStart, contentEnd, { class: className });
      } else {
        if (open > 0) hideRange(builder, start, start + open);
        addMark(builder, contentStart, contentEnd, { class: className });
        if (close > 0) hideRange(builder, end - close, end);
      }
      occupied.push([relStart, relEnd]);
    }
    match = re.exec(text);
  }
}

function applyWikiLinkInline(
  builder: DecorationSink,
  state: EditorState,
  lineFrom: number,
  text: string,
  occupied: [number, number][],
  resolvedTitles: ReadonlySet<string>,
): void {
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match = re.exec(text);
  while (match != null) {
    const relStart = match.index;
    const relEnd = relStart + match[0].length;
    if (!overlapsRange(occupied, relStart, relEnd)) {
      const targetTitle = match[1].trim();
      const alias = match[2]?.trim();
      const displayOffset = alias ? 2 + match[1].length + 1 : 2;
      const start = lineFrom + relStart;
      const end = lineFrom + relEnd;
      const contentStart = start + displayOffset;
      const contentEnd = end - 2;
      const resolved = resolvedTitles.has(targetTitle.toLowerCase());
      const className = resolved ? 'nordly-md-wiki-link' : 'nordly-md-wiki-link nordly-md-wiki-link--unresolved';
      const showSyntax = showLineSyntax(state, state.doc.lineAt(start));
      if (showSyntax) {
        addMark(builder, contentStart, contentEnd, { class: className });
      } else {
        hideRange(builder, start, start + 2);
        if (alias) {
          hideRange(builder, start + 2, contentStart);
        }
        addMark(builder, contentStart, contentEnd, { class: className });
        hideRange(builder, end - 2, end);
      }
      occupied.push([relStart, relEnd]);
    }
    match = re.exec(text);
  }
}

function applyImageInline(
  builder: DecorationSink,
  state: EditorState,
  lineFrom: number,
  text: string,
  occupied: [number, number][],
): void {
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  const resolver = state.facet(imageHrefResolverFacet);
  let match = re.exec(text);
  while (match != null) {
    const relStart = match.index;
    const relEnd = relStart + match[0].length;
    if (!overlapsRange(occupied, relStart, relEnd)) {
      const alt = match[1] ?? '';
      const href = match[2] ?? '';
      const start = lineFrom + relStart;
      const end = lineFrom + relEnd;
      const showSyntax = showLineSyntax(state, state.doc.lineAt(start));
      if (showSyntax) {
        addMark(builder, start, end, { class: 'nordly-md-image-syntax' });
      } else {
        builder.add(
          start,
          end,
          Decoration.replace({
            widget: new MarkdownImageWidget(href, alt, resolver),
            inclusive: false,
          }),
        );
      }
      occupied.push([relStart, relEnd]);
    }
    match = re.exec(text);
  }
}

function applyLinkInline(
  builder: DecorationSink,
  state: EditorState,
  lineFrom: number,
  text: string,
  occupied: [number, number][],
): void {
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let match = re.exec(text);
  while (match != null) {
    const relStart = match.index;
    const relEnd = relStart + match[0].length;
    // Skip markdown images already handled (![...](...)).
    if (relStart > 0 && text[relStart - 1] === '!') {
      match = re.exec(text);
      continue;
    }
    if (!overlapsRange(occupied, relStart, relEnd)) {
      const labelLen = match[1].length;
      const start = lineFrom + relStart;
      const end = lineFrom + relEnd;
      const contentStart = start + 1;
      const contentEnd = contentStart + labelLen;
      const showSyntax = showLineSyntax(state, state.doc.lineAt(start));
      if (showSyntax) {
        addMark(builder, contentStart, contentEnd, { class: 'nordly-md-link' });
      } else {
        hideRange(builder, start, start + 1);
        addMark(builder, contentStart, contentEnd, { class: 'nordly-md-link' });
        hideRange(builder, contentEnd, end);
      }
      occupied.push([relStart, relEnd]);
    }
    match = re.exec(text);
  }
}

function decorateInlines(
  builder: DecorationSink,
  state: EditorState,
  lineFrom: number,
  text: string,
): void {
  const occupied: [number, number][] = [];
  const resolvedTitles = state.facet(wikiLinkTitlesFacet);
  applyDelimitedInline(builder, state, lineFrom, text, /`([^`\n]+)`/g, 'nordly-md-inline-code', 1, 1, occupied);
  applyImageInline(builder, state, lineFrom, text, occupied);
  applyLinkInline(builder, state, lineFrom, text, occupied);
  applyWikiLinkInline(builder, state, lineFrom, text, occupied, resolvedTitles);
  applyDelimitedInline(builder, state, lineFrom, text, /\*\*([^*\n]+)\*\*/g, 'nordly-md-bold', 2, 2, occupied);
  applyDelimitedInline(builder, state, lineFrom, text, /__([^_\n]+)__/g, 'nordly-md-bold', 2, 2, occupied);
  applyDelimitedInline(builder, state, lineFrom, text, /~~([^~\n]+)~~/g, 'nordly-md-strike', 2, 2, occupied);
  applyDelimitedInline(builder, state, lineFrom, text, /==([^=\n]+)==/g, 'nordly-md-highlight', 2, 2, occupied);
  applyDelimitedInline(builder, state, lineFrom, text, /\*([^*\n]+)\*/g, 'nordly-md-italic', 1, 1, occupied);
  applyDelimitedInline(builder, state, lineFrom, text, /_([^_\n]+)_/g, 'nordly-md-italic', 1, 1, occupied);
}

function lineInFencedCode(state: EditorState, line: { from: number; to: number }): boolean {
  const pos = line.from === line.to ? line.from : line.from + 1;
  let node: import('@lezer/common').SyntaxNode | null = syntaxTree(state).resolve(pos, 1);
  while (node) {
    if (node.name === 'FencedCode') return true;
    node = node.parent;
  }
  return false;
}

function buildCodeBlockDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'FencedCode') return;

      const openLine = state.doc.lineAt(node.from);
      const closeLine = state.doc.lineAt(node.to);
      const codeInfo = node.node.getChild('CodeInfo');
      const langInfo = codeInfo ? state.doc.sliceString(codeInfo.from, codeInfo.to).trim() : '';
      const langLabel = notesCodeLangLabel(langInfo);

      for (let lineNum = openLine.number; lineNum <= closeLine.number; lineNum++) {
        const line = state.doc.line(lineNum);
        const showFence = showLineSyntax(state, line);
        const isOpenFence = lineNum === openLine.number;
        const isCloseFence = lineNum === closeLine.number;

        const lineClass =
          isOpenFence && !showFence && langLabel
            ? 'nordly-md-code-block nordly-md-code-block--lang'
            : 'nordly-md-code-block';
        decorations.push(Decoration.line({ class: lineClass }).range(line.from));

        if (isOpenFence || isCloseFence) {
          if (showFence) {
            pushMark(decorations, line.from, line.to, { class: 'nordly-md-code-block__fence' });
          } else if (isOpenFence && langLabel) {
            pushHide(decorations, line.from, line.to);
            decorations.push(
              Decoration.widget({ widget: new CodeLangBadgeWidget(langLabel), side: 1 }).range(line.to),
            );
          } else if (line.from < line.to) {
            pushHide(decorations, line.from, line.to);
          }
        }
      }
    },
  });

  return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
}

export const codeBlockField = StateField.define<DecorationSet>({
  create(state) {
    return buildCodeBlockDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection || tr.reconfigured) {
      return buildCodeBlockDecorations(tr.state);
    }
    return deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildLivePreview(state: EditorState): DecorationSet {
  const builder = new DecorationCollector();
  const doc = state.doc;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    if (lineInFencedCode(state, line)) continue;

    // Heading — style the whole line (including `#`); hide markers only off-line.
    const heading = /^(#{1,6})(\s*)(.*)$/.exec(text);
    if (heading) {
      const level = heading[1].length;
      const prefixEnd = line.from + heading[1].length + heading[2].length;
      const showPrefix = showLineSyntax(state, line);
      if (showPrefix) {
        addMark(builder, line.from, line.to, { class: `nordly-md-h${level}` });
      } else {
        if (prefixEnd > line.from) {
          muteMarker(builder, line.from, prefixEnd);
        }
        addMark(builder, prefixEnd, line.to, { class: `nordly-md-h${level}` });
      }
      decorateInlines(builder, state, line.from, text);
      continue;
    }

    // Horizontal rule — rendered preview unless line is active.
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(text)) {
      if (!showLineSyntax(state, line)) {
        builder.add(line.from, line.from, Decoration.line({ class: 'nordly-md-hr-line' }));
        hideRange(builder, line.from, line.to);
      }
      continue;
    }

    // List / quote: mute markers with CSS (not replace) when caret leaves the line.
    const lineActive = showLineSyntax(state, line);

    // Todo checkbox
    const todo = /^(\s*)([-*+]\s+)\[([ xX])\](\s*)(.*)$/.exec(text);
    if (todo) {
      const indentLen = todo[1].length;
      const listMarkerLen = todo[2].length;
      const checkboxFrom = line.from + indentLen + listMarkerLen;
      const markerFrom = line.from + indentLen;

      builder.add(line.from, line.from, Decoration.line({ class: 'nordly-md-list-item' }));
      if (!lineActive) {
        muteMarker(builder, markerFrom, checkboxFrom);
        addMark(builder, checkboxFrom, checkboxFrom + 3, {
          class:
            todo[3] === ' '
              ? 'nordly-md-checkbox-marker'
              : 'nordly-md-checkbox-marker nordly-md-checkbox-marker--checked',
          attributes: { 'data-checkbox-pos': String(checkboxFrom) },
        });
      }
      decorateInlines(builder, state, line.from, text);
      continue;
    }

    // Bullet — `- ` remains in the document but is visually represented by •.
    // A mark preserves every cursor position, unlike Decoration.replace.
    const bullet = /^(\s*)([-*+])(\s+)(.*)$/.exec(text);
    if (bullet) {
      const markerFrom = line.from + bullet[1].length;
      const markerTo = markerFrom + bullet[2].length + bullet[3].length;
      builder.add(
        line.from,
        line.from,
        Decoration.line({ class: 'nordly-md-list-item' }),
      );
      addMark(builder, markerFrom, markerTo, { class: 'nordly-md-bullet-marker' });
      decorateInlines(builder, state, line.from, text);
      continue;
    }

    // Numbered list — keep digits visible (styled); no replace/hide.
    const ordered = /^(\s*)(\d+\.)(\s+)(.*)$/.exec(text);
    if (ordered) {
      const numFrom = line.from + ordered[1].length;
      const numTo = numFrom + ordered[2].length;
      builder.add(line.from, line.from, Decoration.line({ class: 'nordly-md-list-item' }));
      addMark(builder, numFrom, numTo, { class: 'nordly-md-list-num' });
      decorateInlines(builder, state, line.from, text);
      continue;
    }

    // Blockquote
    const quote = /^(\s*)(>\s+)(.*)$/.exec(text);
    if (quote) {
      const markerFrom = line.from + quote[1].length;
      const markerTo = markerFrom + quote[2].length;
      builder.add(line.from, line.from, Decoration.line({ class: 'nordly-md-quote' }));
      if (!lineActive) {
        muteMarker(builder, markerFrom, markerTo);
      }
      decorateInlines(builder, state, line.from, text);
      continue;
    }

    decorateInlines(builder, state, line.from, text);
  }

  return builder.finish();
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreview(view.state);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreview(update.state);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export const notesEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    /* 1em → inherits Notes shell zoom (⌘+/⌘−); rem would ignore zoom. */
    fontSize: '1em',
    lineHeight: '1.7',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
  },
  '.cm-content': {
    padding: 0,
    caretColor: 'var(--ink)',
  },
  '.cm-line': {
    padding: '1px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--ink)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgb(var(--ink-rgb) / 0.14) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgb(var(--ink-rgb) / 0.18) !important',
  },
  /* Live preview wins over CM markdown token colors — not inside code blocks */
  '.cm-line:not(.nordly-md-code-block) .cm-header, .cm-line:not(.nordly-md-code-block) .tok-heading, .cm-line:not(.nordly-md-code-block) .tok-heading1, .cm-line:not(.nordly-md-code-block) .tok-heading2, .cm-line:not(.nordly-md-code-block) .tok-heading3, .cm-line:not(.nordly-md-code-block) .tok-strong, .cm-line:not(.nordly-md-code-block) .tok-emphasis, .cm-line:not(.nordly-md-code-block) .tok-monospace, .cm-line:not(.nordly-md-code-block) .tok-strikethrough, .cm-line:not(.nordly-md-code-block) .tok-link, .cm-line:not(.nordly-md-code-block) .tok-url': {
    color: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
    fontStyle: 'inherit',
    fontFamily: 'inherit',
    background: 'inherit',
    textDecoration: 'inherit',
  },
});
