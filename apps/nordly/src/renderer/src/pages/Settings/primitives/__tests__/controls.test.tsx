import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Slider } from '../Slider';
import { Toggle } from '../Toggle';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('settings controls', () => {
  it('exposes Toggle as one switch semantic', async () => {
    await act(async () => {
      root.render(
        createElement(Toggle, {
          value: true,
          onChange: vi.fn(),
          label: 'Notifications on',
        }),
      );
    });

    const button = container.querySelector('button')!;
    expect(button.getAttribute('role')).toBe('switch');
    expect(button.getAttribute('aria-checked')).toBe('true');
    expect(button.hasAttribute('aria-pressed')).toBe(false);
  });

  it('gives range inputs an accessible name and value text', async () => {
    await act(async () => {
      root.render(
        createElement(Slider, {
          min: 0,
          max: 100,
          step: 5,
          value: 50,
          onChange: vi.fn(),
          unit: '%',
          label: 'Volume',
        }),
      );
    });

    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-label')).toBe('Volume');
    expect(input.getAttribute('aria-valuetext')).toBe('50 %');
  });
});
