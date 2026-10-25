import { syntaxTree } from '@codemirror/language';
import { Facet, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view';

import { translate } from '@nordly-i18n';
import {
  findWikiMatches,
  httpsUrlHost,
  type WikiMatch,
} from '@nordly-markdown/wikiTarget';
import { findCardSeparator } from '@nordly-markdown/cardLine';
import { normalizeWikiTitle } from '@shared/lib/wikiLinkText';

import { imageEmbedField, imageHrefResolverFacet } from './imageEmbedField';
import { findMarkdownImages } from './imageSyntax';
import { notesCodeLangLabel } from './notesCodeLanguages';

export { imageEmbedField, imageHrefResolverFacet };
export type { ImageHrefResolver } from './imageEmbedField';

/** When true, `front :: back` lines are styled. Off by default. */
export const cardSyntaxFacet = Facet.define<boolean, boolean>({
  combine(values) {
    if (values.length === 0) return false;
    return values[values.length - 1] ?? false;
  },
});

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
  constructor(readonly label: string, readonly sourcePos: number) {
    super();
  }

  eq(other: CodeLangBadgeWidget): boolean {
    return other.label === this.label && other.sourcePos === this.sourcePos;
  }

  toDOM(view: EditorView): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'nordly-md-code-block__lang-bar';
    const badge = document.createElement('span');
    badge.className = 'nordly-md-code-block__lang';
    badge.textContent = this.label;
    badge.setAttribute('aria-hidden', 'true');
    bar.appendChild(badge);
    bar.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.sourcePos } });
      view.focus();
    });
    return bar;
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

function wikiVisibleRange(token: string, match: WikiMatch): { from: number; to: number } {
  const inner = (token.startsWith('!') ? 1 : 0) + 2;
  const endInner = token.length - 2;
  if (match.alias) {
    const pipe = token.lastIndexOf('|');
    return { from: pipe + 1, to: endInner };
  }
  if (match.target.kind === 'board') {
    const head = token.slice(inner, endInner);
    const prefixLen = /^board:/i.exec(head)?.[0].length ?? 0;
    const rest = head.slice(prefixLen);
    const lead = rest.length - rest.trimStart().length;
    const start = inner + prefixLen + lead;
    return { from: start, to: start + match.target.title.length };
  }
  if (match.target.kind === 'link') {
    const at = token.indexOf(match.target.url, inner);
    const schemeLen = /^https:\/\//i.exec(match.target.url)?.[0].length ?? 0;
    return { from: at + schemeLen, to: at + match.target.url.length };
  }
  return { from: inner, to: endInner };
}

function wikiMark(
  match: WikiMatch,
  resolvedTitles: ReadonlySet<string>,
): { class: string; attributes?: Record<string, string> } {
  if (match.target.kind === 'invalid') {
    return {
      class: 'nordly-md-wiki-link nordly-md-wiki-link--invalid',
      attributes: { title: translate(`nordly.notes.wiki.${match.target.reason}`) },
    };
  }
  if (match.target.kind === 'link') {
    return {
      class: 'nordly-md-wiki-link nordly-md-wiki-link--external',
      attributes: { title: httpsUrlHost(match.target.url) },
    };
  }
  if (match.target.kind === 'board') return { class: 'nordly-md-wiki-link' };
  const known = resolvedTitles.has(normalizeWikiTitle(match.target.title));
  return {
    class: known
      ? 'nordly-md-wiki-link'
      : 'nordly-md-wiki-link nordly-md-wiki-link--unresolved',
  };
}

function applyWikiLinkInline(
  builder: DecorationSink,
  state: EditorState,
  lineFrom: number,
  text: string,
  occupied: [number, number][],
  resolvedTitles: ReadonlySet<string>,
): void {
  for (const match of findWikiMatches(text)) {
    if (overlapsRange(occupied, match.from, match.to)) continue;
    const start = lineFrom + match.from;
    const end = lineFrom + match.to;
    const showSyntax = showLineSyntax(state, state.doc.lineAt(start));
    if (match.embed) {
      if (showSyntax) addMark(builder, start, end, { class: 'nordly-md-image-syntax' });
      else hideRange(builder, start, end);
      occupied.push([match.from, match.to]);
      continue;
    }
    const token = text.slice(match.from, match.to);
    const visible = wikiVisibleRange(token, match);
    const contentStart = start + visible.from;
    const contentEnd = start + visible.to;
    const spec = wikiMark(match, resolvedTitles);
    const bracket = token.startsWith('!') ? 1 : 0;
    if (showSyntax) {
      if (visible.from > bracket + 2) hideRange(builder, start + bracket + 2, contentStart);
      addMark(builder, contentStart, contentEnd, spec);
      if (visible.to < token.length - 2) hideRange(builder, contentEnd, end - 2);
    } else {
      hideRange(builder, start, contentStart);
      addMark(builder, contentStart, contentEnd, spec);
      hideRange(builder, contentEnd, end);
    }
    occupied.push([match.from, match.to]);
  }
}

function applyImageInline(
  builder: DecorationSink,
  state: EditorState,
  lineFrom: number,
  text: string,
  occupied: [number, number][],
): void {
  for (const image of findMarkdownImages(text)) {
    if (overlapsRange(occupied, image.from, image.to)) continue;
    const start = lineFrom + image.from;
    const end = lineFrom + image.to;
    if (showLineSyntax(state, state.doc.lineAt(start))) {
      addMark(builder, start, end, { class: 'nordly-md-image-syntax' });
    } else {
      hideRange(builder, start, end);
    }
    occupied.push([image.from, image.to]);
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

function applyCardLine(
  builder: DecorationSink,
  state: EditorState,
  lineFrom: number,
  text: string,
): void {
  if (!state.facet(cardSyntaxFacet)) return;
  const list = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/.exec(text);
  const contentFrom = list?.[0].length ?? 0;
  const separator = findCardSeparator(text.slice(contentFrom));
  if (!separator) return;
  const sepFrom = lineFrom + contentFrom + separator.index;
  const sepTo = sepFrom + separator.marker.length;
  if (sepFrom > lineFrom + contentFrom) {
    addMark(builder, lineFrom + contentFrom, sepFrom, { class: 'nordly-md-card-front' });
  }
  if (!showLineSyntax(state, state.doc.lineAt(lineFrom))) {
    addMark(builder, sepFrom, sepTo, { class: 'nordly-md-card-sep' });
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
  applyCardLine(builder, state, lineFrom, text);
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
    if (node.name === 'FencedCode') return node.getChildren('CodeMark').length === 2;
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
      // CommonMark parses an unfinished fence to EOF. Keep it as editable
      // markdown until a closing fence exists instead of styling the rest as code.
      if (node.node.getChildren('CodeMark').length !== 2) {
        for (let n = openLine.number; n <= closeLine.number; n++) {
          decorations.push(Decoration.line({ class: 'nordly-md-code-pending' }).range(state.doc.line(n).from));
        }
        return;
      }
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
              Decoration.widget({ widget: new CodeLangBadgeWidget(langLabel, line.to), side: 1 }).range(line.to),
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

const livePreviewView = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreview(view.state);
    }

    update(update: ViewUpdate): void {
      // Decorations depend on doc + selection (marker mute) and image resolver
      // (vault note path after title rename). Not viewport — that caused scroll jank.
      const resolverChanged =
        update.startState.facet(imageHrefResolverFacet) !==
        update.state.facet(imageHrefResolverFacet);
      const cardsChanged =
        update.startState.facet(cardSyntaxFacet) !== update.state.facet(cardSyntaxFacet);
      if (update.docChanged || update.selectionSet || resolverChanged || cardsChanged) {
        this.decorations = buildLivePreview(update.state);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/** Inline marks plus a block image under each image line (stays while the caret is on that line). */
export const livePreviewPlugin: Extension = [imageEmbedField, livePreviewView];

export const notesEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    /* 1em → inherits Notes shell zoom (⌘+/⌘−); rem would ignore zoom. */
    fontSize: '1em',
    /* 1.75 keeps the line box on whole pixels at the default 16px root (28px, or
       30px with .cm-line padding). 1.7 gave 27.2px, so every line started on a
       fractional device-pixel offset and the glyphs shimmered while scrolling. */
    lineHeight: '1.75',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    overflow: 'auto',
    overscrollBehavior: 'contain',
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
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgb(var(--ink-rgb) / 0.22) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgb(var(--ink-rgb) / 0.28) !important',
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
