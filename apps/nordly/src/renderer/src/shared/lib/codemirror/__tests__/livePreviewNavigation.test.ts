import {
  cursorCharLeft,
  cursorCharRight,
} from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { livePreviewPlugin } from '../livePreview';
import { notesKeymap } from '../notesKeymap';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

function createView(doc: string, anchor = 0): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [livePreviewPlugin],
    }),
  });
  return view;
}

describe('notes live preview navigation', () => {
  it('keeps every source position reachable across markdown markers', () => {
    const editor = createView('- item');

    for (let expected = 1; expected <= editor.state.doc.length; expected += 1) {
      expect(cursorCharRight(editor)).toBe(true);
      expect(editor.state.selection.main.head).toBe(expected);
    }

    for (let expected = editor.state.doc.length - 1; expected >= 0; expected -= 1) {
      expect(cursorCharLeft(editor)).toBe(true);
      expect(editor.state.selection.main.head).toBe(expected);
    }
  });

  it('keeps the typed space in bullet source and decorates its marker', () => {
    const editor = createView('-', 1);

    editor.dispatch({
      changes: { from: 1, insert: ' ' },
      selection: { anchor: 2 },
    });

    expect(editor.state.doc.toString()).toBe('- ');
    expect(editor.dom.querySelector('.nordly-md-bullet-marker')).not.toBeNull();
  });

  it('does not skip delimiters for common markdown syntax', () => {
    const doc = '> quote\n**bold** _italic_ ~~strike~~ `code`\n[label](https://example.com)\n[[target|alias]]';
    const editor = createView(doc);

    for (let expected = 1; expected <= doc.length; expected += 1) {
      expect(cursorCharRight(editor)).toBe(true);
      expect(editor.state.selection.main.head).toBe(expected);
    }
  });

  it('continues and exits todo lists without losing checkbox syntax', () => {
    const enter = notesKeymap.find((binding) => binding.key === 'Enter');
    const editor = createView('- [ ] task', 10);

    expect(enter?.run(editor)).toBe(true);
    expect(editor.state.doc.toString()).toBe('- [ ] task\n- [ ] ');

    expect(enter?.run(editor)).toBe(true);
    expect(editor.state.doc.toString()).toBe('- [ ] task\n');
  });

  it('renders an inactive todo marker without replacing its source positions', () => {
    const editor = createView('- [ ] task\nnext', 15);

    const marker = editor.dom.querySelector<HTMLElement>('.nordly-md-checkbox-marker');
    expect(marker?.dataset.checkboxPos).toBe('2');

    editor.dispatch({ selection: { anchor: 0 } });
    for (let expected = 1; expected <= 10; expected += 1) {
      expect(cursorCharRight(editor)).toBe(true);
      expect(editor.state.selection.main.head).toBe(expected);
    }
  });

  it('moves ArrowUp and ArrowDown exactly one document line', () => {
    const up = notesKeymap.find((binding) => binding.key === 'ArrowUp');
    const down = notesKeymap.find((binding) => binding.key === 'ArrowDown');
    const doc = 'abcdef\n- \n> quote';
    const editor = createView(doc, doc.length - 2);

    expect(up?.run(editor)).toBe(true);
    expect(editor.state.doc.lineAt(editor.state.selection.main.head).number).toBe(2);

    expect(up?.run(editor)).toBe(true);
    expect(editor.state.doc.lineAt(editor.state.selection.main.head).number).toBe(1);
    expect(editor.state.selection.main.head).toBe(5);

    expect(down?.run(editor)).toBe(true);
    expect(editor.state.doc.lineAt(editor.state.selection.main.head).number).toBe(2);
  });
});
