import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { notesMarkdownSupport, normalizeNotesCodeLang } from '../notesCodeLanguages';
import { notesKeymap } from '../notesKeymap';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

function createView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [history(), notesMarkdownSupport],
    }),
  });
  return view;
}

function pressEnter(editor: EditorView): boolean {
  const enter = notesKeymap.find((binding) => binding.key === 'Enter');
  if (!enter) throw new Error('Enter binding missing');
  return enter.run(editor);
}

describe('fence enter', () => {
  it.each([
    ['```', '```\n\n```\n'],
    ['```text', '```text\n\n```\n'],
    ['```python', '```python\n\n```\n'],
    ['```golang', '```golang\n\n```\n'],
    ['```tsx', '```tsx\n\n```\n'],
    ['```go main.go', '```go main.go\n\n```\n'],
  ])('closes %s on Enter and leaves the cursor inside', (opening, expected) => {
    const editor = createView(opening, opening.length);
    expect(pressEnter(editor)).toBe(true);
    expect(editor.state.doc.toString()).toBe(expected);
    expect(editor.state.selection.main.head).toBe(opening.length + 1);
  });

  it('closes a new fence above an existing block instead of stealing its closer', () => {
    const editor = createView('```\n```go\nx\n```\n', 3);
    expect(pressEnter(editor)).toBe(true);
    expect(editor.state.doc.toString()).toBe('```\n\n```\n```go\nx\n```\n');
  });

  it('leaves a one-line ```x``` untouched', () => {
    const doc = '```x```';
    const editor = createView(doc, doc.length);
    expect(pressEnter(editor)).toBe(false);
    expect(editor.state.doc.toString()).toBe(doc);
  });

  it('undoes only the closing fence inserted on Enter', () => {
    const editor = createView('```go', 5);
    expect(pressEnter(editor)).toBe(true);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toString()).toBe('```go');
  });
});

describe('normalizeNotesCodeLang', () => {
  it('matches the first word exactly', () => {
    expect(normalizeNotesCodeLang('go main.go')).toBe('go');
    expect(normalizeNotesCodeLang('golang')).toBe('go');
    expect(normalizeNotesCodeLang('py')).toBe('python');
    expect(normalizeNotesCodeLang('tsx')).toBeNull();
    expect(normalizeNotesCodeLang('gotmpl')).toBeNull();
    expect(normalizeNotesCodeLang('google')).toBeNull();
  });
});
