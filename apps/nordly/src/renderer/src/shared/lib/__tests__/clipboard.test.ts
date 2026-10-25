import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NordlyAPI } from '@platform/ipc';
vi.mock('@platform/runtime', () => ({ isTauriRuntime: () => true }));
import { copyText } from '../clipboard';
const writeText = vi.fn();
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('nordly', { clipboard: { writeText } } as unknown as NordlyAPI);
});
afterEach(() => { vi.unstubAllGlobals(); });
it('writes a newly published URL through the native clipboard only after publication succeeds', async () => {
  let publish!: (url: string) => void;
  const url = new Promise<string>((resolve) => { publish = resolve; });
  const copying = copyText(url);
  expect(writeText).not.toHaveBeenCalled();
  publish('https://example.com/note');
  await copying;
  expect(writeText).toHaveBeenCalledWith('https://example.com/note');
});
it('does not write anything when publication fails', async () => {
  await expect(copyText(Promise.reject(new Error('Publish failed')))).rejects.toThrow('Publish failed');
  expect(writeText).not.toHaveBeenCalled();
});
it('surfaces native clipboard failure instead of reporting a successful copy', async () => {
  writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'));
  await expect(copyText('https://example.com/note')).rejects.toThrow('Clipboard unavailable');
});
it('requires the native bridge in desktop builds', async () => {
  vi.stubGlobal('nordly', undefined);
  await expect(copyText('https://example.com/note')).rejects.toThrow('Native clipboard is unavailable');
});
