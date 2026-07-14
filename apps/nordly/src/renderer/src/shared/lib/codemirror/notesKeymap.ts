import { syntaxTree } from '@codemirror/language';
import { indentLess, indentMore } from '@codemirror/commands';
import type { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { NOTES_CODE_LANGS } from './notesCodeLanguages';

function wrapSelection(state: EditorState, before: string, after: string, placeholder = ''): Transaction | null {
  const range = state.selection.main;
  const sel = state.sliceDoc(range.from, range.to) || placeholder;
  return state.update({
    changes: {
      from: range.from,
      to: range.to,
      insert: before + sel + after,
    },
    selection: { anchor: range.from + before.length, head: range.from + before.length + sel.length },
  });
}

function prependLines(state: EditorState, prefix: string | ((i: number) => string)): Transaction | null {
  const range = state.selection.main;
  const lineStart = state.doc.lineAt(range.from).from;
  const lineEnd = state.doc.lineAt(range.to).to;
  const block = state.sliceDoc(lineStart, lineEnd);
  const lines = block.split('\n');
  const transformed = lines
    .map((l, i) => {
      const px = typeof prefix === 'function' ? prefix(i) : prefix;
      const stripped = l.replace(/^(#{1,6}\s|>\s|-\s|\d+\.\s)/, '');
      return px + stripped;
    })
    .join('\n');
  return state.update({
    changes: { from: lineStart, to: lineEnd, insert: transformed },
    selection: { anchor: lineStart, head: lineStart + transformed.length },
  });
}

function parseOpeningFence(lineText: string): { fence: string; lang: string } | null {
  const match = /^(`{3,})([\w-]*)\s*$/.exec(lineText);
  if (!match) return null;
  return { fence: match[1], lang: match[2] ?? '' };
}

function isExactKnownLang(lang: string): boolean {
  const raw = lang.toLowerCase();
  return NOTES_CODE_LANGS.some((l) => l.id === raw || l.aliases.some((a) => a === raw));
}

/** True when this line already opens a fully closed FencedCode (syntax tree). */
function openingFenceIsComplete(state: EditorState, openLineNumber: number): boolean {
  const openLine = state.doc.line(openLineNumber);
  if (!parseOpeningFence(openLine.text)) return false;

  let complete = false;
  syntaxTree(state).iterate({
    from: openLine.from,
    to: openLine.to + 1,
    enter: (node) => {
      if (node.name !== 'FencedCode') return;
      if (state.doc.lineAt(node.from).number !== openLineNumber) return;

      const closeLine = state.doc.lineAt(node.to);
      if (/^`{3,}\s*$/.test(closeLine.text.trim()) && node.to > openLine.to) {
        complete = true;
      }
    },
  });
  return complete;
}

function focusFenceContentLine(view: EditorView, openLineNumber: number): boolean {
  const openLine = view.state.doc.line(openLineNumber);
  let focused = false;

  syntaxTree(view.state).iterate({
    from: openLine.from,
    to: openLine.to + 1,
    enter: (node) => {
      if (node.name !== 'FencedCode' || focused) return;
      if (view.state.doc.lineAt(node.from).number !== openLineNumber) return;

      const openNum = view.state.doc.lineAt(node.from).number;
      const closeNum = view.state.doc.lineAt(node.to).number;
      const contentLine = openNum + 1;
      if (contentLine >= closeNum) {
        view.dispatch({ selection: { anchor: openLine.to + 1 } });
      } else {
        view.dispatch({ selection: { anchor: view.state.doc.line(contentLine).from } });
      }
      focused = true;
    },
  });

  return focused;
}

/** Reuse ``` / empty / ``` shell left after the opening fence was edited. */
function tryReuseDanglingFence(
  view: EditorView,
  line: { from: number; to: number; number: number },
  firstChar = '',
): boolean {
  const contentNum = line.number + 1;
  const closeNum = line.number + 2;
  if (closeNum > view.state.doc.lines) return false;

  const contentLine = view.state.doc.line(contentNum);
  const closeLine = view.state.doc.line(closeNum);
  if (contentLine.text.trim().length > 0) return false;
  if (!/^`{3,}\s*$/.test(closeLine.text.trim())) return false;
  if (openingFenceIsComplete(view.state, line.number)) return false;

  if (firstChar) {
    view.dispatch({
      changes: { from: contentLine.from, to: contentLine.to, insert: firstChar },
      selection: { anchor: contentLine.from + firstChar.length },
    });
  } else {
    view.dispatch({ selection: { anchor: contentLine.from } });
  }
  return true;
}

/** ```lang → ```lang\n[cursor]\n``` — closing fence inserted by the editor. */
function openFenceBlock(
  view: EditorView,
  line: { from: number; to: number; number: number },
  fence: string,
  firstChar = '',
): boolean {
  if (openingFenceIsComplete(view.state, line.number)) return false;
  if (tryReuseDanglingFence(view, line, firstChar)) return true;

  const insert = `\n${firstChar}\n${fence}\n`;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + 1 + firstChar.length },
  });
  return true;
}

/** Enter on ``` / ```lang — land on the content line inside the block. */
function completeFenceOnEnter(view: EditorView): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) return false;

  const line = state.doc.lineAt(from);
  const parsed = parseOpeningFence(state.sliceDoc(line.from, line.to));
  if (!parsed) return false;

  if (openingFenceIsComplete(state, line.number)) {
    if (from === line.to) return focusFenceContentLine(view, line.number);
    return false;
  }

  if (from !== line.to) return false;

  return openFenceBlock(view, line, parsed.fence);
}

/**
 * Auto-close fenced blocks while typing:
 * - third ` on a bare ``` line
 * - last letter of a known lang (```go) → cursor inside the block
 * - any further character on ```lang → starts code on the content line
 */
export const fenceAutoCloseInput = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to) return false;

  const line = view.state.doc.lineAt(from);
  const lineText = view.state.sliceDoc(line.from, line.to);
  const atLineEnd = from === line.to;

  // Bare ``` — third backtick completes the opening fence line.
  if (text === '`') {
    const before = view.state.sliceDoc(line.from, from);
    if (!before.endsWith('``') || view.state.sliceDoc(from, line.to).length > 0) return false;

    const fenceMatch = /^(`{3,})\s*$/.exec(`${before}\``);
    if (!fenceMatch) return false;
    if (openingFenceIsComplete(view.state, line.number)) return false;

    const fence = fenceMatch[1];
    if (tryReuseDanglingFence(view, line)) return true;

    view.dispatch({
      changes: { from: line.from, to: line.to, insert: `${fence}\n\n${fence}\n` },
      selection: { anchor: line.from + fence.length + 1 },
    });
    return true;
  }

  if (!atLineEnd) return false;

  const parsed = parseOpeningFence(lineText);
  if (!parsed || openingFenceIsComplete(view.state, line.number)) return false;

  const nextLineText = lineText + text;

  // Finishing a known lang token (```go) — open block immediately, cursor inside.
  if (/[\w-]/.test(text)) {
    const nextParsed = parseOpeningFence(nextLineText);
    if (
      nextParsed?.lang &&
      isExactKnownLang(nextParsed.lang) &&
      !isExactKnownLang(parsed.lang)
    ) {
      view.dispatch({
        changes: { from, to, insert: `${text}\n\n${nextParsed.fence}\n` },
        selection: { anchor: from + text.length + 1 },
      });
      return true;
    }
  }

  // ```lang already complete — first keystroke of code goes on the content line.
  if (parsed.lang) {
    if (text === ' ') {
      return openFenceBlock(view, line, parsed.fence);
    }
    if (text.length === 1) {
      return openFenceBlock(view, line, parsed.fence, text);
    }
  }

  return false;
});

function continueListOnEnter(view: EditorView): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) return false;

  const line = state.doc.lineAt(from);
  const before = state.sliceDoc(line.from, from);

  const emptyTodo = /^(\s*)([-*+])\s+\[[ xX]\]\s*$/.exec(before);
  if (emptyTodo) {
    view.dispatch({
      changes: { from: line.from, to: from, insert: '' },
      selection: { anchor: line.from },
    });
    return true;
  }

  const emptyBullet = /^(\s*)([-*+]|\d+\.)\s+$/.exec(before);
  if (emptyBullet) {
    view.dispatch({
      changes: { from: line.from, to: from, insert: '' },
      selection: { anchor: line.from },
    });
    return true;
  }

  const emptyQuote = /^(\s*)>\s+$/.exec(before);
  if (emptyQuote) {
    view.dispatch({
      changes: { from: line.from, to: from, insert: '' },
      selection: { anchor: line.from },
    });
    return true;
  }

  const todo = /^(\s*)([-*+])\s+\[[ xX]\]\s+/.exec(before);
  if (todo) {
    const insert = `\n${todo[1]}${todo[2]} [ ] `;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
    return true;
  }

  const bullet = /^(\s*)([-*+])\s+/.exec(before);
  if (bullet) {
    const insert = `\n${bullet[1]}${bullet[2]} `;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
    return true;
  }

  const numbered = /^(\s*)(\d+)\.\s+/.exec(before);
  if (numbered) {
    const next = parseInt(numbered[2], 10) + 1;
    const insert = `\n${numbered[1]}${next}. `;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
    return true;
  }

  const quote = /^(\s*)>\s+/.exec(before);
  if (quote) {
    const insert = `\n${quote[1]}> `;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
    return true;
  }

  return false;
}

const verticalColumns = new WeakMap<EditorView, { head: number; column: number }>();

/**
 * Live preview changes inline marker widths when a line becomes active. CodeMirror's
 * pixel-based vertical motion can therefore recalculate against a different layout
 * and skip lines. Move by document line instead; keep the preferred source column
 * across short lines.
 */
function moveOneDocumentLine(view: EditorView, direction: -1 | 1, extend = false): boolean {
  const { state } = view;
  const range = state.selection.main;
  const currentLine = state.doc.lineAt(range.head);
  const targetNumber = currentLine.number + direction;
  if (targetNumber < 1 || targetNumber > state.doc.lines) return false;

  const remembered = verticalColumns.get(view);
  const column =
    remembered?.head === range.head
      ? remembered.column
      : range.head - currentLine.from;
  const targetLine = state.doc.line(targetNumber);
  const targetHead = targetLine.from + Math.min(column, targetLine.length);

  verticalColumns.set(view, { head: targetHead, column });
  view.dispatch({
    selection: extend
      ? { anchor: range.anchor, head: targetHead }
      : { anchor: targetHead },
    scrollIntoView: true,
    userEvent: 'select',
  });
  return true;
}

export const notesKeymap = [
  {
    key: 'ArrowUp',
    run: (view: EditorView) => moveOneDocumentLine(view, -1),
  },
  {
    key: 'ArrowDown',
    run: (view: EditorView) => moveOneDocumentLine(view, 1),
  },
  {
    key: 'Shift-ArrowUp',
    run: (view: EditorView) => moveOneDocumentLine(view, -1, true),
  },
  {
    key: 'Shift-ArrowDown',
    run: (view: EditorView) => moveOneDocumentLine(view, 1, true),
  },
  {
    key: 'Mod-b',
    run(view: EditorView) {
      const tr = wrapSelection(view.state, '**', '**', 'bold');
      if (!tr) return false;
      view.dispatch(tr);
      return true;
    },
  },
  {
    key: 'Mod-i',
    run(view: EditorView) {
      const tr = wrapSelection(view.state, '*', '*', 'italic');
      if (!tr) return false;
      view.dispatch(tr);
      return true;
    },
  },
  {
    key: 'Mod-k',
    run(view: EditorView) {
      const url = window.prompt('URL', 'https://') || '';
      if (!url) return true;
      const range = view.state.selection.main;
      const sel = view.state.sliceDoc(range.from, range.to) || 'link';
      view.dispatch({
        changes: {
          from: range.from,
          to: range.to,
          insert: `[${sel}](${url})`,
        },
        selection: { anchor: range.from + 1, head: range.from + 1 + sel.length },
      });
      return true;
    },
  },
  {
    key: 'Tab',
    run(view: EditorView) {
      indentMore(view);
      return true;
    },
  },
  {
    key: 'Shift-Tab',
    run(view: EditorView) {
      indentLess(view);
      return true;
    },
  },
  {
    key: 'Enter',
    run(view: EditorView) {
      if (completeFenceOnEnter(view)) return true;
      return continueListOnEnter(view);
    },
  },
];

export { wrapSelection, prependLines };
