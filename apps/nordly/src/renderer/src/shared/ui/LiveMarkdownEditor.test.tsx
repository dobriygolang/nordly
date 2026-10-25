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

it('restores each note scroll independently of its cursor', async () => {
  const render = async (id: string) => {
    await act(async () => root.render(createElement(LiveMarkdownEditor, {
      key: id, selectionKey: id, value: Array.from({ length: 200 }, (_, i) => `Line ${i}`).join('\n'), onChange: vi.fn(), autoFocus: true,
    })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
    return EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
  };
  const first = await render('scroll-a');
  first.scrollDOM.scrollTop = 440;
  first.scrollDOM.scrollLeft = 12;
  first.scrollDOM.dispatchEvent(new Event('scroll'));
  await render('scroll-b');
  const restored = await render('scroll-a');
  expect(restored.scrollDOM.scrollTop).toBe(440);
  expect(restored.scrollDOM.scrollLeft).toBe(12);
  expect(restored.state.selection.main.head).toBe(0);
});

it('draws a range cursor at the active end of keyboard selections', async () => {
  const { getDrawSelectionConfig } = await import('@codemirror/view');
  const { selectCharRight, selectCharLeft } = await import('@codemirror/commands');
  await act(async () => root.render(createElement(LiveMarkdownEditor, { value: 'first line', onChange: vi.fn() })));
  const view = EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
  expect(getDrawSelectionConfig(view.state)?.drawRangeCursor).toBe(true);
  await act(async () => { selectCharRight(view); selectCharRight(view); });
  expect(view.state.selection.main).toMatchObject({ anchor: 0, head: 2 });
  await act(async () => { selectCharLeft(view); });
  expect(view.state.selection.main).toMatchObject({ anchor: 0, head: 1 });
});
