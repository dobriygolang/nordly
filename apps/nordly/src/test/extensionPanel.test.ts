import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  const html = readFileSync('../extension/sidepanel.html', 'utf8');
  document.body.innerHTML = html.split('<body>')[1]!.split('</body>')[0]!
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const stored: Record<string, unknown> = { 'nordly.capture.token': 'paired-token' };
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: vi.fn(async () => stored),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(stored, items); }),
    } },
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => new Response(JSON.stringify(
    url.startsWith('https://api.mymemory.translated.net/')
      ? { responseStatus: 200, responseData: { translatedText: 'привет' } }
      : options?.method === 'POST'
      ? { ok: true, wrote: true, duplicate: false }
      : { flashcardsEnabled: true, captureNoteId: 'note' },
  ), { status: 200 })));
  // Exercise the committed bundle shipped inside the desktop installer.
  const panelModule = '../../src-tauri/resources/extension/sidepanel.js';
  await import(panelModule);
  await vi.waitFor(() => expect(document.querySelector<HTMLElement>('#capture')!.hidden).toBe(false));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('translates and saves from the visible action button', async () => {
  const word = document.querySelector<HTMLInputElement>('#word')!;
  word.value = 'hello';
  const button = document.querySelector<HTMLButtonElement>('#translate')!;
  expect(button.textContent).toBeTruthy();
  button.click();
  await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>('#translation')!.value).toBe('привет'));
  await vi.waitFor(() => expect(document.querySelector('#status')!.textContent).toMatch(/Saved|Сохранено/));
  expect(document.querySelector('#history')!.textContent).toBe('hello - привет');
  expect(button.disabled).toBe(false);
});

it('retains Enter as a shortcut and prevents duplicate submissions while busy', async () => {
  const word = document.querySelector<HTMLInputElement>('#word')!;
  word.value = 'hello';
  word.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  word.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector('#status')!.textContent).toMatch(/Saved|Сохранено/));
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('https://api.mymemory.translated.net/'));
  expect(calls).toHaveLength(1);
});
