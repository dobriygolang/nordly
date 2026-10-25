import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@nordly-i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('@features/notes/api/notesSync', () => ({ planNotesSyncEnable: vi.fn(async () => ({ folder: '/test', localNoteCount: 1, remoteNoteCount: 0 })), enableNotesSync: vi.fn() }));
vi.mock('@shared/model/session', () => ({ useSessionStore: (select: (s: { userId: string }) => unknown) => select({ userId: 'test-user' }) }));
vi.mock('@shared/crypto/vault', () => ({ initVault: vi.fn(), unlockVault: vi.fn(), isVaultUnlocked: () => false }));
vi.mock('@shared/crypto/vaultPrefs', () => ({ isVaultEnabledSync: () => false, setVaultEnabled: vi.fn() }));
vi.mock('@shared/crypto/recoveryKey', () => ({ generateRecoveryPhrase: () => 'test recovery phrase', saveRecoveryWrap: vi.fn() }));
import { EnableNotesSyncWizard } from './EnableNotesSyncWizard';
import { initVault } from '@shared/crypto/vault';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(EnableNotesSyncWizard, { onClose: vi.fn(), onEnabled: vi.fn(), onChooseOtherFolder: vi.fn() })));
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'nordly.notes.sync.continue')!.click());
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function enter(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('shows two labelled password fields and requires matching passwords before continuing', async () => {
  const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type="password"]')];
  expect(inputs).toHaveLength(2);
  for (const input of inputs) {
    expect(input.classList.contains('nordly-vault-pass-input')).toBe(true);
    expect(input.closest('label')?.textContent).not.toBe('');
    expect(input.placeholder).not.toBe('');
  }
  const next = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(next.disabled).toBe(true);
  await enter(inputs[0]!, 'TestPassphrase123');
  expect(next.disabled).toBe(true);
  await enter(inputs[1]!, 'DifferentPass123');
  expect(next.disabled).toBe(true);
  expect(inputs[1]!.getAttribute('aria-invalid')).toBe('true');
  expect(initVault).not.toHaveBeenCalled();
  await enter(inputs[1]!, 'TestPassphrase123');
  expect(next.disabled).toBe(false);
  expect(inputs[1]!.getAttribute('aria-invalid')).toBe('false');
  await act(async () => inputs[1]!.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(initVault).toHaveBeenCalledTimes(1);
  expect(container.querySelector('pre')?.textContent).toBe('test recovery phrase');
});
