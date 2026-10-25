import { isTauriRuntime } from '@platform/runtime';

/** Desktop uses the OS clipboard; browser calls must start in the click gesture. */
export async function copyText(text: string | Promise<string>): Promise<void> {
  if (isTauriRuntime()) {
    const value = await text;
    const clipboard = window.nordly?.clipboard;
    if (!clipboard) throw new Error('Native clipboard is unavailable');
    await clipboard.writeText(value);
    return;
  }
  if (typeof text === 'string') return navigator.clipboard.writeText(text);
  // WebKit requires clipboard.write during the gesture, but accepts promised
  // item data. Waiting for publication before writeText would lose the gesture.
  const data = text.then((value) => new Blob([value], { type: 'text/plain' }));
  let copying: Promise<void>;
  try {
    copying = navigator.clipboard.write([new ClipboardItem({ 'text/plain': data })]);
  } catch (error) {
    copying = Promise.reject(error);
  }
  // Observe both promises even if the clipboard API rejects synchronously.
  await Promise.all([copying, data]);
}
