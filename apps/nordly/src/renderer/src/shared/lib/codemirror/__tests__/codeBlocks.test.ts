import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { codeBlockField, livePreviewPlugin } from '../livePreview';
import { notesMarkdownSupport } from '../notesCodeLanguages';

let view: EditorView | undefined;
afterEach(() => {
  view?.destroy();
  document.body.replaceChildren();
});

function editor(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.append(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [notesMarkdownSupport, codeBlockField, livePreviewPlugin],
    }),
  });
  return view;
}

describe('code block live preview', () => {
  it('reveals the opening fence and its language when clicking the badge', () => {
    const doc = '```golang\npackage main\n```\nafter';
    const view = editor(doc);
    const badge = view.dom.querySelector<HTMLElement>('.nordly-md-code-block__lang-bar');
    expect(badge).not.toBeNull();
    badge!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(view.state.selection.main.head).toBe('```golang'.length);
    expect(view.dom.querySelector('.nordly-md-code-block__fence')?.textContent).toBe('```golang');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('keeps unfinished fences and the following markdown out of code preview', () => {
    const view = editor('```golang\n# Heading\n**bold**\nlast line');
    expect(view.dom.querySelector('.nordly-md-code-block')).toBeNull();
    expect(view.dom.querySelector('.nordly-md-h1')?.textContent).toContain('Heading');
    expect(view.dom.querySelector('.nordly-md-bold')?.textContent).toContain('bold');
    expect(view.dom.textContent).toContain('last line');
  });

  it('styles a completed block and restores plain text when the closer is deleted', () => {
    const view = editor('```go\nvar x = 1\n```\nafter');
    expect(view.dom.querySelectorAll('.nordly-md-code-block')).toHaveLength(3);
    const closing = view.state.doc.line(3);
    view.dispatch({ changes: { from: closing.from, to: closing.to, insert: '' } });
    expect(view.dom.querySelector('.nordly-md-code-block')).toBeNull();
    expect(view.dom.textContent).toContain('after');
    view.dispatch({ changes: { from: closing.from, insert: '```' } });
    expect(view.dom.querySelectorAll('.nordly-md-code-block')).toHaveLength(3);
  });
});
