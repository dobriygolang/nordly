import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useDialogFocus } from '@shared/hooks/useDialogFocus';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

function DialogHarness({ initial = false }: { initial?: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const initialRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(ref, true, initial ? initialRef : undefined);
  return (
    <div ref={ref} tabIndex={-1}>
      <button type="button">First</button>
      <button ref={initialRef} type="button">Last</button>
    </div>
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('useDialogFocus', () => {
  it('focuses the first control, traps Tab, and restores prior focus', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    await act(async () => root.render(createElement(DialogHarness)));
    const [first, last] = [...container.querySelectorAll('button')];
    expect(document.activeElement).toBe(first);

    last!.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    last!.dispatchEvent(tab);
    expect(document.activeElement).toBe(first);

    await act(async () => root.render(null));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('honors an explicit initial focus target', async () => {
    await act(async () =>
      root.render(createElement(DialogHarness, { initial: true })),
    );
    const [, last] = [...container.querySelectorAll('button')];
    expect(document.activeElement).toBe(last);
  });
});
