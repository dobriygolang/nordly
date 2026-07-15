import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/dates', () => ({
  toDayKey: (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
}));

import { useTodayKey } from '../useTodayKey';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function Harness({ capture }: { capture: (value: string) => void }): ReactElement {
  const value = useTodayKey();
  capture(value);
  return createElement('span', null, value);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 23, 59, 59, 900));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useTodayKey', () => {
  it('updates after local midnight', async () => {
    let latest = '';
    await act(async () => {
      root.render(createElement(Harness, { capture: (value: string) => (latest = value) }));
    });
    expect(latest).toBe('2026-07-15');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(201);
    });
    expect(latest).toBe('2026-07-16');
  });

  it('refreshes when the window regains focus', async () => {
    let latest = '';
    await act(async () => {
      root.render(createElement(Harness, { capture: (value: string) => (latest = value) }));
    });

    vi.setSystemTime(new Date(2026, 6, 17, 9));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(latest).toBe('2026-07-17');
  });
});
