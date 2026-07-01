import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, StateField, type EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view';

import { notesCodeLangLabel } from './notesCodeLanguages';

function rangeTouches(from: number, to: number, start: number, end: number): boolean {
  return from < end && to > start;
}

/** Raw markdown syntax is visible only while the caret touches that token range. */
function showRangeSyntax(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.head >= from && range.head <= to) return true;
    if (range.from !== range.to && rangeTouches(range.from, range.to, from, to)) {
      return true;
    }
  }
  return false;
}

/** Block widgets (HR) — reveal source for the whole line while the caret is on it. */
function showLineSyntax(state: EditorState, line: { from: number; to: number }): boolean {
  return showRangeSyntax(state, line.from, line.to);
}

const SYNTAX_HIDDEN = 'nordly-md-syntax-hidden';

class HiddenWidget extends WidgetType {
  toDOM(): HTMLElement {
    return document.createElement('span');
  }
}

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'nordly-md-bullet';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = '•';
    return el;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.checked;
    input.className = 'nordly-md-checkbox';
    input.addEventListener('mousedown', (e) => e.preventDefault());
    input.addEventListener('change', () => {
      const ch = this.checked ? ' ' : 'x';
      view.dispatch({
        changes: { from: this.pos + 1, to: this.pos + 2, insert: ch },
      });
    });
    return input;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('hr');
    hr.className = 'nordly-md-hr';
    return hr;
  }

  ignoreEvent(): boolean {
    return true;
  }
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

const hidden = new HiddenWidget();

function addMark(
  builder: RangeSetBuilder<Decoration>,
  from: number,
  to: number,
  spec: Parameters<typeof Decoration.mark>[0],
): void {
  if (from < to) builder.add(from, to, Decoration.mark(spec));
}

function pushMark(
  decorations: Range<Decoration>[],
  from: number,
  to: number,
  spec: Parameters<typeof Decoration.mark>[0],
): void {
  if (from < to) decorations.push(Decoration.mark(spec).range(from, to));
}

function overlapsRange(ranges: [number, number][], start: number, end: number): boolean {
  return ranges.some(([a, b]) => start < b && end > a);
}

function applyDelimitedInline(
  builder: RangeSetBuilder<Decoration>,
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
      const showSyntax = showRangeSyntax(state, start, end);
      if (showSyntax) {
        addMark(builder, contentStart, contentEnd, { class: className });
      } else {
        if (open > 0) addMark(builder, start, start + open, { class: SYNTAX_HIDDEN });
        addMark(builder, contentStart, contentEnd, { class: className });
        if (close > 0) addMark(builder, end - close, end, { class: SYNTAX_HIDDEN });
      }
      occupied.push([relStart, relEnd]);
    }
    match = re.exec(text);
  }
}

function applyLinkInline(
  builder: RangeSetBuilder<Decoration>,
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
    if (!overlapsRange(occupied, relStart, relEnd)) {
      const labelLen = match[1].length;
      const start = lineFrom + relStart;
      const end = lineFrom + relEnd;
      const contentStart = start + 1;
      const contentEnd = contentStart + labelLen;
      const showSyntax = showRangeSyntax(state, start, end);
      if (showSyntax) {
        addMark(builder, contentStart, contentEnd, { class: 'nordly-md-link' });
      } else {
        addMark(builder, start, start + 1, { class: SYNTAX_HIDDEN });
        addMark(builder, contentStart, contentEnd, { class: 'nordly-md-link' });
        addMark(builder, contentEnd, end, { class: SYNTAX_HIDDEN });
      }
      occupied.push([relStart, relEnd]);
    }
    match = re.exec(text);
  }
}

function decorateInlines(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  lineFrom: number,
  text: string,
): void {
  const occupied: [number, number][] = [];
  applyDelimitedInline(builder, state, lineFrom, text, /`([^`\n]+)`/g, 'nordly-md-inline-code', 1, 1, occupied);
  applyLinkInline(builder, state, lineFrom, text, occupied);
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
            pushMark(decorations, line.from, line.to, { class: SYNTAX_HIDDEN });
            decorations.push(
              Decoration.widget({ widget: new CodeLangBadgeWidget(langLabel), side: 1 }).range(line.to),
            );
          } else if (line.from < line.to) {
            pushMark(decorations, line.from, line.to, { class: SYNTAX_HIDDEN });
          }
        }
      }
    },
  });

  return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
}

function isAtomicDecoration(deco: Decoration): boolean {
  if (deco.spec.class === SYNTAX_HIDDEN) return true;
  if (!deco.spec.replace) return false;
  const widget = deco.spec.widget;
  return widget instanceof HiddenWidget || widget instanceof BulletWidget || widget instanceof CheckboxWidget;
}

function atomicRangesFromSet(deco: DecorationSet, docLength: number): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  deco.between(0, docLength, (from, to, d) => {
    if (isAtomicDecoration(d)) ranges.push(Decoration.mark({}).range(from, to));
  });
  return Decoration.set(ranges, true);
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
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => atomicRangesFromSet(view.state.field(field), view.state.doc.length)),
  ],
});

function buildLivePreview(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
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
      const showPrefix = showRangeSyntax(state, line.from, prefixEnd);
      if (showPrefix) {
        addMark(builder, line.from, line.to, { class: `nordly-md-h${level}` });
      } else {
        if (prefixEnd > line.from) {
          addMark(builder, line.from, prefixEnd, { class: SYNTAX_HIDDEN });
        }
        addMark(builder, prefixEnd, line.to, { class: `nordly-md-h${level}` });
      }
      decorateInlines(builder, state, line.from, text);
      continue;
    }

    // Horizontal rule — rendered preview unless line is active.
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(text)) {
      if (!showLineSyntax(state, line)) {
        builder.add(line.from, line.to, Decoration.replace({ widget: new HrWidget(), block: true }));
      }
      continue;
    }

    // Todo checkbox
    const todo = /^(\s*)([-*+]\s+)\[([ xX])\](\s*)(.*)$/.exec(text);
    if (todo) {
      const indentLen = todo[1].length;
      const listMarkerLen = todo[2].length;
      const checkboxFrom = line.from + indentLen + listMarkerLen;
      const markerFrom = line.from + indentLen;
      const markerTo = checkboxFrom + 3;
      const showMarker = showRangeSyntax(state, markerFrom, markerTo);

      builder.add(line.from, line.to, Decoration.line({ class: 'nordly-md-list-item' }));
      if (!showMarker) {
        builder.add(markerFrom, checkboxFrom, Decoration.replace({ widget: hidden }));
        builder.add(
          checkboxFrom,
          checkboxFrom + 3,
          Decoration.replace({
            widget: new CheckboxWidget(todo[3] !== ' ', checkboxFrom),
            inclusive: true,
          }),
        );
      }
      decorateInlines(builder, state, line.from, text);
      continue;
    }

    // Bullet list (not todo)
    const bullet = /^(\s*)([-*+])(\s+)(.*)$/.exec(text);
    if (bullet) {
      const markerFrom = line.from + bullet[1].length;
      const markerTo = markerFrom + bullet[2].length + bullet[3].length;
      const showMarker = showRangeSyntax(state, markerFrom, markerTo);
      builder.add(line.from, line.to, Decoration.line({ class: 'nordly-md-list-item' }));
      if (!showMarker) {
        builder.add(markerFrom, markerTo, Decoration.replace({ widget: new BulletWidget(), side: 1 }));
      }
      decorateInlines(builder, state, line.from, text);
      continue;
    }

    // Numbered list
    const ordered = /^(\s*)(\d+\.)(\s+)(.*)$/.exec(text);
    if (ordered) {
      const numFrom = line.from + ordered[1].length;
      const numTo = numFrom + ordered[2].length;
      const showMarker = showRangeSyntax(state, numFrom, numTo);
      builder.add(line.from, line.to, Decoration.line({ class: 'nordly-md-list-item' }));
      if (showMarker) {
        addMark(builder, numFrom, numTo, { class: 'nordly-md-list-num' });
      } else {
        addMark(builder, numFrom, numTo, { class: SYNTAX_HIDDEN });
      }
      decorateInlines(builder, state, line.from, text);
      continue;
    }

    // Blockquote — hide `> ` when marker inactive; always style line.
    const quote = /^(\s*)(>\s+)(.*)$/.exec(text);
    if (quote) {
      const markerFrom = line.from + quote[1].length;
      const markerTo = markerFrom + quote[2].length;
      const showMarker = showRangeSyntax(state, markerFrom, markerTo);
      builder.add(line.from, line.to, Decoration.line({ class: 'nordly-md-quote' }));
      if (!showMarker) {
        addMark(builder, markerFrom, markerTo, { class: SYNTAX_HIDDEN });
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
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        const set = view.plugin(plugin)?.decorations ?? Decoration.none;
        return atomicRangesFromSet(set, view.state.doc.length);
      }),
  },
);

export const notesEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '1rem',
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
