import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LiveMarkdownEditor } from './LiveMarkdownEditor';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  // happy-dom fires synchronous selectionchange during focus, unlike WebKit.
  vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => undefined);
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

it('restores the cursor after switching notes without autofocus moving it to EOF', async () => {
  const render = async (id: string) => {
    await act(async () => {
      root.render(createElement(LiveMarkdownEditor, {
        key: id, selectionKey: id, value: 'first line\nsecond line', onChange: vi.fn(), autoFocus: true,
      }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor')!);
    if (!view) throw new Error('Editor view missing');
    return view;
  };
  const first = await render('note-a');
  await act(async () => first.dispatch({ selection: { anchor: 3, head: 8 } }));
  const second = await render('note-b');
  expect(second.state.selection.main.head).toBe(0);
  const restored = await render('note-a');
  expect(restored.state.selection.main.anchor).toBe(3);
  expect(restored.state.selection.main.head).toBe(8);
});
