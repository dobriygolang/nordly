/// <reference path="./chrome.d.ts" />
import { formatCaptureLine, phraseProblem } from '@nordly-translate/captureBody';
import { translatePhrase } from '@nordly-translate/mymemory';

import { captureRequest, CaptureHttpError } from './api';
import { text } from './copy';
import {
  LAST_ERROR_KEY,
  NOTE_KEY,
  QUEUE_KEY,
  REJECTED_KEY,
  TOKEN_KEY,
  flushQueue,
  loadQueue,
  loadToken,
  postCapture,
  upsertQueue,
  writeStorage,
  type QueuedCapture,
} from './queue';

function required<T extends Element>(element: T | null, id: string): T {
  if (!element) throw new Error(`Nordly panel is missing #${id}`);
  return element;
}

const pair = required(document.querySelector<HTMLElement>('#pair'), 'pair');
const capture = required(document.querySelector<HTMLElement>('#capture'), 'capture');
const pairCopy = required(document.querySelector<HTMLElement>('#pair-copy'), 'pair-copy');
const codeInput = required(document.querySelector<HTMLInputElement>('#code'), 'code');
const saveCode = required(document.querySelector<HTMLButtonElement>('#save-code'), 'save-code');
const noteSelect = required(document.querySelector<HTMLSelectElement>('#note'), 'note');
const wordInput = required(document.querySelector<HTMLInputElement>('#word'), 'word');
const translationInput = required(document.querySelector<HTMLInputElement>('#translation'), 'translation');
const hint = required(document.querySelector<HTMLElement>('#hint'), 'hint');
const status = required(document.querySelector<HTMLElement>('#status'), 'status');

pairCopy.textContent = text('pair');
saveCode.textContent = text('connect');
wordInput.placeholder = text('word');
translationInput.placeholder = text('translation');
noteSelect.setAttribute('aria-label', text('note'));
hint.textContent = text('cards-off');

let busy = false;
let lastCaptureId = '';
let lastFront = '';
let editTimer = 0;

saveCode.addEventListener('click', () => {
  void savePairing();
});

codeInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  void savePairing();
});

noteSelect.addEventListener('change', () => {
  void writeStorage({ [NOTE_KEY]: noteSelect.value });
});

wordInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  void commitWord();
});

wordInput.addEventListener('input', () => {
  if (lastCaptureId && wordInput.value.trim() !== lastFront) translationInput.value = '';
});

translationInput.addEventListener('input', () => {
  window.clearTimeout(editTimer);
  editTimer = window.setTimeout(() => {
    void pushTranslationEdit();
  }, 400);
});

void boot();

async function boot(): Promise<void> {
  const token = await loadToken();
  if (!token) {
    showPair();
    return;
  }
  showCapture();
  await refreshNotes(token);
  await flushQueue();
  const stored = await chrome.storage.local.get([LAST_ERROR_KEY]);
  if (typeof stored[LAST_ERROR_KEY] === 'string' && stored[LAST_ERROR_KEY]) setStatus(stored[LAST_ERROR_KEY]);
}

async function savePairing(): Promise<void> {
  const code = codeInput.value.trim();
  if (!code) {
    setStatus('need-code');
    return;
  }
  await writeStorage({ [TOKEN_KEY]: code, [REJECTED_KEY]: false, [LAST_ERROR_KEY]: '' });
  showCapture();
  await refreshNotes(code);
  await flushQueue();
}

function showPair(): void {
  pair.hidden = false;
  capture.hidden = true;
}

function showCapture(): void {
  pair.hidden = true;
  capture.hidden = false;
  wordInput.focus();
}

async function refreshNotes(token: string): Promise<void> {
  try {
    const payload = await captureRequest(token, '/v1/capture/notes');
    if (!payload || typeof payload !== 'object') throw new CaptureHttpError(500, 'failed');
    const row = payload as {
      notes?: Array<{ id?: string; title?: string; locked?: boolean }>;
      flashcardsEnabled?: boolean;
    };
    const notes = Array.isArray(row.notes) ? row.notes : [];
    const stored = await chrome.storage.local.get([NOTE_KEY]);
    const selected = typeof stored[NOTE_KEY] === 'string' ? stored[NOTE_KEY] : '';
    noteSelect.replaceChildren();
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = text('note');
    noteSelect.append(empty);
    let found = false;
    for (const note of notes) {
      if (!note || typeof note.id !== 'string') continue;
      const option = document.createElement('option');
      option.value = note.id;
      option.textContent = note.locked ? text('locked-note') : note.title?.trim() || note.id;
      noteSelect.append(option);
      if (note.id === selected) found = true;
    }
    noteSelect.value = found ? selected : '';
    if (!found && selected) setStatus('note_not_found');
    hint.hidden = row.flashcardsEnabled !== false;
  } catch (error) {
    if (error instanceof CaptureHttpError && (error.status === 401 || error.status === 403)) {
      await writeStorage({ [REJECTED_KEY]: true });
      showPair();
      setStatus('bad-code');
      return;
    }
    setStatus('offline');
  }
}

async function commitWord(): Promise<void> {
  if (busy) return;
  const front = wordInput.value.trim();
  if (!front) return;
  const problem = phraseProblem(front);
  if (problem) {
    setStatus(problem);
    return;
  }
  const noteId = noteSelect.value;
  if (!noteId) {
    setStatus('need-note');
    return;
  }
  busy = true;
  try {
    const translated = await translatePhrase(front);
    if (wordInput.value.trim() !== front) return;
    translationInput.value = translated;
    const captureId = crypto.randomUUID();
    lastCaptureId = captureId;
    lastFront = front;
    const kept = await sendOrQueue({ noteId, captureId, line: formatCaptureLine(front, translated) });
    if (kept && wordInput.value.trim() === front) wordInput.value = '';
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    setStatus(message.includes('limit') ? 'limit' : 'translate-failed');
  } finally {
    busy = false;
  }
}

async function pushTranslationEdit(): Promise<void> {
  if (!lastCaptureId || !lastFront || busy) return;
  if (!translationInput.value.trim()) return;
  const noteId = noteSelect.value;
  if (!noteId) {
    setStatus('need-note');
    return;
  }
  let line: string;
  try {
    line = formatCaptureLine(lastFront, translationInput.value);
  } catch {
    setStatus('bad-phrase');
    return;
  }
  await sendOrQueue({ noteId, captureId: lastCaptureId, line });
}

async function sendOrQueue(item: QueuedCapture): Promise<boolean> {
  const token = await loadToken();
  if (!token) {
    showPair();
    setStatus('need-code');
    return false;
  }
  try {
    const result = await postCapture(token, item);
    const queue = await loadQueue();
    await writeStorage({
      [QUEUE_KEY]: queue.filter((row) => row.captureId !== item.captureId),
      [REJECTED_KEY]: false,
      [LAST_ERROR_KEY]: '',
    });
    setStatus(result.duplicate ? 'duplicate' : 'saved');
    return true;
  } catch (error) {
    if (!(error instanceof CaptureHttpError)) {
      setStatus('offline');
      return false;
    }
    if (error.status === 409 || error.status === 503 || error.status === 0) {
      await upsertQueue(item);
      setStatus(error.status === 409 ? 'vault_locked' : 'offline');
      return true;
    }
    if (error.status === 401 || error.status === 403) {
      await writeStorage({ [REJECTED_KEY]: true });
      showPair();
      setStatus('bad-code');
      return false;
    }
    if (error.status === 404) {
      setStatus('note_not_found');
      return false;
    }
    setStatus('translate-failed');
    return false;
  }
}

function setStatus(key: string): void {
  const known = [
    'need-note',
    'need-code',
    'bad-code',
    'offline',
    'vault_locked',
    'note_not_found',
    'duplicate',
    'saved',
    'limit',
    'translate-failed',
    'no-letters',
    'unsupported-script',
    'bad-phrase',
  ] as const;
  const match = known.find((item) => item === key);
  status.textContent = match ? text(match) : '';
}
