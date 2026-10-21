/// <reference path="./chrome.d.ts" />
import { captureRequest, CaptureHttpError } from './api';

export const TOKEN_KEY = 'nordly.capture.token';
export const NOTE_KEY = 'nordly.capture.noteId';
export const QUEUE_KEY = 'nordly.capture.queue';
export const REJECTED_KEY = 'nordly.capture.tokenRejected';
export const LAST_ERROR_KEY = 'nordly.capture.lastError';
export const MARKER_KEY = 'nordly.capture.marker';
export const HISTORY_KEY = 'nordly.capture.history';
export const HISTORY_LIMIT = 40;

export type CaptureMarker = ':::' | '::';

export interface HistoryEntry {
  front: string;
  back: string;
}

export interface QueuedCapture {
  noteId: string;
  captureId: string;
  line: string;
}

export interface CapturePostResult {
  ok: true;
  wrote: boolean;
  duplicate: boolean;
}

let flushing: Promise<void> | null = null;

export async function readStorage(keys: string[]): Promise<Record<string, unknown>> {
  return chrome.storage.local.get(keys);
}

export async function writeStorage(items: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set(items);
}

export async function loadToken(): Promise<string> {
  const stored = await readStorage([TOKEN_KEY]);
  return typeof stored[TOKEN_KEY] === 'string' ? stored[TOKEN_KEY] : '';
}

export async function loadQueue(): Promise<QueuedCapture[]> {
  const stored = await readStorage([QUEUE_KEY]);
  const value = stored[QUEUE_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(isQueued);
}

export async function upsertQueue(item: QueuedCapture): Promise<void> {
  const queue = await loadQueue();
  const index = queue.findIndex((row) => row.captureId === item.captureId);
  if (index >= 0) queue[index] = item;
  else queue.push(item);
  await writeStorage({ [QUEUE_KEY]: queue });
}

export async function flushQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = drain().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function drain(): Promise<void> {
  const stored = await readStorage([TOKEN_KEY, REJECTED_KEY]);
  if (stored[REJECTED_KEY] === true) return;
  const token = typeof stored[TOKEN_KEY] === 'string' ? stored[TOKEN_KEY] : '';
  if (!token) return;
  const queue = await loadQueue();
  const remain: QueuedCapture[] = [];
  for (const item of queue) {
    try {
      await postCapture(token, item);
    } catch (error) {
      if (!(error instanceof CaptureHttpError)) {
        remain.push(item);
        break;
      }
      if (error.status === 401 || error.status === 403) {
        await writeStorage({ [REJECTED_KEY]: true, [LAST_ERROR_KEY]: 'bad-code' });
        remain.push(item, ...queue.slice(queue.indexOf(item) + 1));
        break;
      }
      if (error.status === 409 && error.code === 'no_capture_note') {
        remain.push(item, ...queue.slice(queue.indexOf(item) + 1));
        await writeStorage({ [QUEUE_KEY]: remain, [LAST_ERROR_KEY]: 'need-note' });
        return;
      }
      if (error.status === 404) {
        await writeStorage({ [LAST_ERROR_KEY]: 'note_not_found' });
        continue;
      }
      if (error.status === 400) continue;
      remain.push(item, ...queue.slice(queue.indexOf(item) + 1));
      await writeStorage({ [QUEUE_KEY]: remain, [LAST_ERROR_KEY]: error.code });
      return;
    }
  }
  await writeStorage({ [QUEUE_KEY]: remain });
}

export async function postCapture(token: string, item: QueuedCapture): Promise<CapturePostResult> {
  const payload = await captureRequest(
    token,
    '/v1/capture',
    JSON.stringify({ noteId: item.noteId, captureId: item.captureId, line: item.line }),
  );
  if (!payload || typeof payload !== 'object') {
    throw new CaptureHttpError(500, 'failed');
  }
  const row = payload as { wrote?: boolean; duplicate?: boolean };
  return { ok: true, wrote: row.wrote === true, duplicate: row.duplicate === true };
}

function isQueued(value: unknown): value is QueuedCapture {
  if (!value || typeof value !== 'object') return false;
  const row = value as { noteId?: unknown; captureId?: unknown; line?: unknown };
  return typeof row.noteId === 'string' && typeof row.captureId === 'string' && typeof row.line === 'string';
}

export async function loadMarker(): Promise<CaptureMarker> {
  const stored = await readStorage([MARKER_KEY]);
  return stored[MARKER_KEY] === '::' ? '::' : ':::';
}

export async function saveMarker(marker: CaptureMarker): Promise<void> {
  await writeStorage({ [MARKER_KEY]: marker });
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const stored = await readStorage([HISTORY_KEY]);
  const value = stored[HISTORY_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(isHistoryEntry).slice(0, HISTORY_LIMIT);
}

export async function pushHistory(front: string, back: string): Promise<HistoryEntry[]> {
  const next: HistoryEntry = { front, back };
  const history = [next, ...(await loadHistory()).filter((row) => row.front !== front || row.back !== back)].slice(
    0,
    HISTORY_LIMIT,
  );
  await writeStorage({ [HISTORY_KEY]: history });
  return history;
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as { front?: unknown; back?: unknown };
  return typeof row.front === 'string' && typeof row.back === 'string' && row.front.trim() !== '' && row.back.trim() !== '';
}
