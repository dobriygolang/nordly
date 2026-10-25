import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '@nordly-i18n';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { readSettings } from '@shared/model/settings';

vi.mock('@shared/lib/updater', async (original) => ({
  ...await original<typeof import('@shared/lib/updater')>(),
  isTauriRuntime: () => true,
  readAppVersion: vi.fn(async () => '0.0.62'),
  fetchPublishedVersion: vi.fn(async () => '0.0.63'),
}));
import { SoftwareSection } from '../SoftwareSection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('persists the actual switch value and restores it when settings reopen', async () => {
  await act(async () => root.render(createElement(SoftwareSection)));
  const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  await act(async () => toggle().click());
  expect(readSettings().autoUpdate).toBe(true);
  expect(toggle().getAttribute('aria-checked')).toBe('true');
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(createElement(SoftwareSection)));
  expect(toggle().getAttribute('aria-checked')).toBe('true');
  await act(async () => toggle().click());
  expect(readSettings().autoUpdate).toBe(false);
});

it('shows automatic download progress and a background error in the same settings UI', async () => {
  await act(async () => root.render(createElement(SoftwareSection)));
  await act(async () => window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.updateAvailable, { detail: { phase: 'downloading', published: '0.0.63' } })));
  const button = container.querySelector<HTMLButtonElement>('.nordly-settings-update__btn')!;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe(translate('nordly.settings.update.downloading'));
  await act(async () => {
    window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.updateAvailable, { detail: { error: { kind: 'error', code: 'network', message: 'Network connection failed' } } }));
    window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.updateAvailable, { detail: { phase: 'idle' } }));
  });
  expect(button.disabled).toBe(false);
  expect(container.textContent).toContain(translate('nordly.settings.update.network_error'));
});
