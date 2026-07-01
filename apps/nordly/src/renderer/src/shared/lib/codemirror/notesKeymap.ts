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

function fenceClosesBelow(state: EditorState, openLineNumber: number): boolean {
  for (let n = openLineNumber + 1; n <= state.doc.lines; n++) {
    const text = state.doc.lineAt(n).text.trim();
    if (/^`{3,}\s*$/.test(text)) return true;
  }
  return false;
}

/** ```lang → ```lang\n[cursor]\n``` — closing fence inserted by the editor. */
function openFenceBlock(
  view: EditorView,
  line: { from: number; to: number; number: number },
  fence: string,
  firstChar = '',
): boolean {
  if (fenceClosesBelow(view.state, line.number)) return false;

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
  if (from !== line.to) return false;

  const parsed = parseOpeningFence(state.sliceDoc(line.from, line.to));
  if (!parsed) return false;

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
    if (!fenceMatch || fenceClosesBelow(view.state, line.number)) return false;

    const fence = fenceMatch[1];
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: `${fence}\n\n${fence}\n` },
      selection: { anchor: line.from + fence.length + 1 },
    });
    return true;
  }

  if (!atLineEnd) return false;

  const parsed = parseOpeningFence(lineText);
  if (!parsed || fenceClosesBelow(view.state, line.number)) return false;

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

  const emptyBullet = /^(\s*)([-*+]|\d+\.)\s+$/.exec(before);
  if (emptyBullet) {
    view.dispatch({
      changes: { from: line.from, to: from, insert: '' },
      selection: { anchor: line.from },
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

export const notesKeymap = [
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
