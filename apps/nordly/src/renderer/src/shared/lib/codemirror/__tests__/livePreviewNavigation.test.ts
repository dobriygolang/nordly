import {
  cursorCharLeft,
  cursorCharRight,
} from '@codemirror/commands';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { imageEmbedField } from '../imageEmbedField';
import { imageHrefResolverFacet, livePreviewPlugin } from '../livePreview';
import { notesMarkdownSupport } from '../notesCodeLanguages';
import { notesKeymap } from '../notesKeymap';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

function createView(doc: string, anchor = 0, extensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [imageHrefResolverFacet.of(null), ...extensions, livePreviewPlugin],
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

  it('uses the resolver for relative and nordly-asset images but not https', async () => {
    const doc =
      '![relative](img/photo.png)\n' +
      '![asset](nordly-asset:asset-1)\n' +
      '![remote](https://example.com/photo.png)\n' +
      'done';
    const resolver = vi.fn(async (href: string) => `blob:${href}`);
    const editor = createView(doc, doc.length, [imageHrefResolverFacet.of(resolver)]);

    expect(resolver).toHaveBeenCalledWith('img/photo.png');
    expect(resolver).toHaveBeenCalledWith('nordly-asset:asset-1');
    expect(resolver).not.toHaveBeenCalledWith('https://example.com/photo.png');

    await Promise.resolve();
    const sources = [...editor.dom.querySelectorAll<HTMLImageElement>('.nordly-md-image__img')]
      .map((image) => image.getAttribute('src'));
    expect(sources).toContain('blob:img/photo.png');
    expect(sources).toContain('blob:nordly-asset:asset-1');
    expect(sources).toContain('https://example.com/photo.png');
  });

  it('keeps the image under the line while the caret is on that line', () => {
    const doc = 'before\n![alt](img/a.png)\nafter';
    const editor = createView(doc, 0);
    const imageLine = editor.state.doc.line(2);
    editor.dispatch({ selection: { anchor: imageLine.from } });

    let widgets = 0;
    editor.state.field(imageEmbedField).between(0, editor.state.doc.length, () => {
      widgets += 1;
    });
    expect(widgets).toBe(1);
    expect(editor.dom.querySelector('.nordly-md-image')).not.toBeNull();
    expect(editor.dom.querySelector('.nordly-md-image-syntax')).not.toBeNull();
    expect(editor.dom.querySelector('.nordly-md-syntax-hidden')).toBeNull();
  });

  it('hides the image source only when the caret is on another line', () => {
    const editor = createView('before\n![alt](img/a.png)\nafter', 0);
    expect(editor.dom.querySelector('.nordly-md-syntax-hidden')).not.toBeNull();
    expect(editor.dom.querySelector('.nordly-md-image')).not.toBeNull();
  });

  it('shows a typed load error on the placeholder', async () => {
    const doc = '![shot](img/missing.png)';
    const editor = createView(doc, 0, [
      imageHrefResolverFacet.of(async () => {
        throw Object.assign(new Error('too big'), { code: 'too_large' });
      }),
    ]);
    await Promise.resolve();
    await Promise.resolve();
    const placeholder = editor.dom.querySelector('.nordly-md-image__placeholder');
    expect(placeholder?.textContent).toContain('img/missing.png');
    expect(placeholder?.textContent).toMatch(/5 MB|5 МБ/);
  });

  it('does not embed an image that sits inside a code fence', () => {
    const doc = '```\n![alt](img/a.png)\n```\n';
    const editor = createView(doc, 0, [notesMarkdownSupport]);
    let widgets = 0;
    editor.state.field(imageEmbedField).between(0, editor.state.doc.length, () => {
      widgets += 1;
    });
    expect(widgets).toBe(0);
  });
});
