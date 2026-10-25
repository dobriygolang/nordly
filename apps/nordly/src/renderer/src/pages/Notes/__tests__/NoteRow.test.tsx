import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '@nordly-i18n';
import { patchSettings, readSettings } from '@shared/model/settings';
import type { PublishStatus } from '@features/notes/model/publishOptions';

vi.mock('@features/notes/api/notesClient', () => ({ getPublishStatus: vi.fn(), isNoteVaultLocked: () => false }));
vi.mock('@features/notes/hooks/useNotesSyncStatus', () => ({ useNotesSyncStatus: () => ({ kind: 'synced', at: null, encrypted: true }) }));
vi.mock('@shared/model/features', () => ({ isCloudEnabled: () => true }));
vi.mock('@shared/crypto/vaultPublish', () => ({ isVaultReadyForPublish: () => true }));
import { getPublishStatus } from '@features/notes/api/notesClient';
import { NoteRow, type NoteRowProps } from '../NoteRow';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const published: PublishStatus = { published: true, slug: 'test', url: 'https://trynordly.app/n/test', publishedAt: '2026-10-25T10:00:00Z', accessMode: 'public' };
let root: Root;
let container: HTMLDivElement;
let props: NoteRowProps;
const clipboardItem = vi.fn();
const write = vi.fn();
const writeText = vi.fn();
function button(key: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === translate(key))!;
}
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  vi.mocked(getPublishStatus).mockReset().mockResolvedValue({ published: false });
  clipboardItem.mockImplementation(function () {});
  vi.stubGlobal('ClipboardItem', clipboardItem);
  write.mockImplementation(async () => { await clipboardItem.mock.calls.at(-1)![0]['text/plain']; });
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { write, writeText }, language: 'en-US', onLine: true });
  props = {
    note: { id: 'note', title: 'Note', updatedAt: null, sizeBytes: 0 }, active: true, menuOpen: true,
    onMenuOpenChange: vi.fn(), onSelect: vi.fn(), onPublish: vi.fn(async () => published), onUpdatePublishOptions: vi.fn(),
    onUnpublish: vi.fn(), onDelete: vi.fn(), onError: vi.fn(),
  };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(createElement(NoteRow, props))); }

it('starts a promised clipboard write in the click and copies the URL after publication', async () => {
  let release!: (result: PublishStatus) => void;
  vi.mocked(props.onPublish).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  await render();
  await act(async () => button('nordly.notes.menu.publish').click());
  expect(write).toHaveBeenCalledTimes(1);
  expect(clipboardItem).toHaveBeenCalledTimes(1);
  expect(button('nordly.notes.menu.publish_busy').disabled).toBe(true);
  await act(async () => release(published));
  const blob = await clipboardItem.mock.calls[0][0]['text/plain'] as Blob;
  expect(await blob.text()).toBe(published.url);
  expect(button('nordly.notes.menu.link_copied')).toBeTruthy();
  expect(props.onError).not.toHaveBeenCalled();
});

it('copies an existing public link directly from the click', async () => {
  vi.mocked(getPublishStatus).mockResolvedValue(published);
  await render();
  await act(async () => button('nordly.notes.menu.copy_link').click());
  expect(writeText).toHaveBeenCalledWith(published.url);
  expect(button('nordly.notes.menu.link_copied')).toBeTruthy();
});

it('keeps a successful publication visible when clipboard access is denied', async () => {
  write.mockRejectedValueOnce(new Error('Clipboard permission denied'));
  await render();
  await act(async () => button('nordly.notes.menu.publish').click());
  expect(button('nordly.notes.menu.copy_link')).toBeTruthy();
  expect(button('nordly.notes.menu.link_copied')).toBeUndefined();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(translate('nordly.notes.menu.copy_error'));
  await act(async () => button('nordly.notes.menu.copy_link').click());
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(button('nordly.notes.menu.link_copied')).toBeTruthy();
});

it('does not copy or claim publication when sign-in or publication is cancelled', async () => {
  vi.mocked(props.onPublish).mockResolvedValueOnce(undefined);
  await render();
  await act(async () => button('nordly.notes.menu.publish').click());
  expect(button('nordly.notes.menu.link_copied')).toBeUndefined();
  expect(button('nordly.notes.menu.publish').disabled).toBe(false);
  expect(props.onError).not.toHaveBeenCalled();
});

it.each(['missing', 'error'])('does not overwrite a newly published link with a stale %s response', async (kind) => {
  let release!: (status: PublishStatus) => void;
  let fail!: (error: Error) => void;
  vi.mocked(getPublishStatus).mockImplementationOnce(() => new Promise((resolve, reject) => { release = resolve; fail = reject; }));
  await render();
  await act(async () => button('nordly.notes.menu.publish').click());
  await act(async () => { if (kind === 'missing') release({ published: false }); else fail(new Error('Old status failed')); });
  expect(button('nordly.notes.menu.link_copied')).toBeTruthy();
  expect(button('nordly.notes.menu.publish')).toBeUndefined();
});

it('labels Chrome translation capture separately from public read-only sharing', async () => {
  const cards = readSettings().flashcards;
  patchSettings({ flashcards: { ...cards, enabled: true } });
  await render();
  expect(document.body.textContent).toContain(translate('nordly.notes.menu.publish_hint'));
  expect(document.body.textContent).toContain(translate('nordly.notes.menu.capture_words_hint'));
  const toggle = [...document.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find((element) => element.textContent?.includes(translate('nordly.notes.menu.capture_words')))!;
  await act(async () => toggle.click());
  expect(readSettings().flashcards.captureNoteId).toBe('note');
  expect(props.onPublish).not.toHaveBeenCalled();
});
