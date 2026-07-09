/** Split quick-capture textarea into note title + Markdown body. */

export const QUICK_CAPTURE_TITLE_MAX = 200;

export function splitQuickCaptureText(raw: string): { title: string; bodyMd: string } | null {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.trim()) return null;

  const newline = normalized.indexOf('\n');
  if (newline === -1) {
    const title = normalized.trim();
    return {
      title: title.slice(0, QUICK_CAPTURE_TITLE_MAX),
      bodyMd: '',
    };
  }

  const firstLine = normalized.slice(0, newline).trim();
  const bodyMd = normalized.slice(newline + 1);
  return {
    title: (firstLine || 'Untitled').slice(0, QUICK_CAPTURE_TITLE_MAX),
    bodyMd,
  };
}

export function formatQuickCaptureShortcutLabel(shortcut: string): string[] {
  return shortcut
    .split('+')
    .map((part) => {
      switch (part) {
        case 'Command':
        case 'CommandOrControl':
          return '\u2318';
        case 'Control':
          return 'Ctrl';
        case 'Shift':
          return '\u21E7';
        case 'Alt':
        case 'Option':
          return '\u2325';
        case 'Space':
          return 'Space';
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    });
}
