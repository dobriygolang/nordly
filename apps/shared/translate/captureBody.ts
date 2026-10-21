import { translationPair } from './mymemory';

const MARKER = ' ::: ';
const LETTER = /\p{L}/u;

export type PhraseProblem = 'no-letters' | 'unsupported-script' | 'bad-phrase';

export interface CaptureSession {
  noteId: string;
  index: number;
}

export function phraseProblem(text: string): PhraseProblem | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes('\n') || trimmed.includes('::')) return 'bad-phrase';
  if (translationPair(trimmed)) return null;
  if (LETTER.test(trimmed)) return 'unsupported-script';
  return 'no-letters';
}

export function collapseTranslation(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function formatCaptureLine(front: string, translation: string): string {
  const phrase = front.trim();
  const back = collapseTranslation(translation);
  if (phraseProblem(phrase) || !back || back.includes('::')) {
    throw new Error('capture line: phrase or translation is not a card');
  }
  return `${phrase}${MARKER}${back}`;
}

export function splitCaptureLine(line: string): { front: string; back: string } | null {
  const at = line.indexOf(MARKER);
  if (at <= 0) return null;
  const front = line.slice(0, at).trim();
  const back = line.slice(at + MARKER.length).trim();
  if (!front || !back || phraseProblem(front) || back.includes('\n') || back.includes('::')) return null;
  return { front, back };
}

function cardFront(line: string): string | null {
  const split = splitCaptureLine(line);
  if (!split) return null;
  return split.front.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function contentLines(body: string): string[] {
  if (body.length === 0) return [];
  const lines = body.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function applyCaptureBody(
  body: string,
  noteId: string,
  captureId: string,
  line: string,
  sessions: Map<string, CaptureSession>,
): { body: string; wrote: boolean; duplicate: boolean } {
  const front = cardFront(line);
  if (!front || !captureId.trim() || !noteId.trim()) {
    throw new Error('capture line: phrase or translation is not a card');
  }
  const lines = contentLines(body);
  const tracked = sessions.get(captureId);
  if (tracked && tracked.noteId === noteId && tracked.index >= 0 && tracked.index < lines.length) {
    if (lines[tracked.index] === line) return { body, wrote: false, duplicate: false };
    lines[tracked.index] = line;
    return { body: lines.join('\n'), wrote: true, duplicate: false };
  }
  if (lines.some((row) => cardFront(row) === front)) {
    return { body, wrote: false, duplicate: true };
  }
  lines.push(line);
  sessions.set(captureId, { noteId, index: lines.length - 1 });
  return { body: lines.join('\n'), wrote: true, duplicate: false };
}
