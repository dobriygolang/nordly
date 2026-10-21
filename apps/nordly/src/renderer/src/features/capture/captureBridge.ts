import { invoke } from '@tauri-apps/api/core';

import { applyCaptureBody, splitCaptureLine, type CaptureSession } from '@nordly-translate/captureBody';
import {
  getNote,
  isNoteVaultLocked,
  isNotesVaultBound,
  listNotes,
  updateNote,
  type Note,
} from '@features/notes/api/notesClient';
import { isVaultUnlocked } from '@shared/crypto/vault';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { listenEffect } from '@shared/lib/tauriListen';
import { readSettings } from '@shared/model/settings';

import { currentCaptureDraft } from './draftBridge';

const sessions = new Map<string, CaptureSession>();
const tails = new Map<string, Promise<void>>();

interface CaptureRequest {
  id: string;
  method: string;
  path: string;
  body: string;
}

interface CaptureResult {
  status: number;
  body: string;
}

export function startCaptureBridge(): () => void {
  return listenEffect<CaptureRequest>('capture:request', (event) => {
    void answer(event.payload);
  });
}

async function answer(request: CaptureRequest): Promise<void> {
  let status = 500;
  let body = '{"error":"failed"}';
  try {
    const result = await route(request);
    status = result.status;
    body = result.body;
  } catch (error) {
    console.error('[nordly:capture] request failed', error);
  }
  try {
    await invoke('capture_reply', { id: request.id, status, body });
  } catch (error) {
    console.error('[nordly:capture] reply failed', error);
  }
}

async function route(request: CaptureRequest): Promise<CaptureResult> {
  if (request.method === 'GET' && request.path === '/v1/capture/notes') {
    const { notes } = await listNotes();
    return json(200, {
      notes: notes.map((note) => ({
        id: note.id,
        title: note.title,
        locked: note.vaultLocked === true,
      })),
      flashcardsEnabled: readSettings().flashcards.enabled,
    });
  }
  if (request.method === 'POST' && request.path === '/v1/capture') {
    const parsed = parsePost(request.body);
    if (!parsed) return json(400, { error: 'bad_line' });
    return enqueue(parsed.noteId, () => append(parsed));
  }
  return json(404, { error: 'not_found' });
}

function parsePost(raw: string): { noteId: string; captureId: string; line: string } | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as { noteId?: unknown; captureId?: unknown; line?: unknown };
  if (typeof row.noteId !== 'string' || typeof row.captureId !== 'string' || typeof row.line !== 'string') {
    return null;
  }
  if (!row.noteId.trim() || !row.captureId.trim() || !splitCaptureLine(row.line)) return null;
  return { noteId: row.noteId, captureId: row.captureId, line: row.line };
}

function enqueue<T>(noteId: string, job: () => Promise<T>): Promise<T> {
  const prev = tails.get(noteId) ?? Promise.resolve();
  const run = prev.then(job, job);
  tails.set(
    noteId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function append(input: { noteId: string; captureId: string; line: string }): Promise<CaptureResult> {
  const draft = currentCaptureDraft();
  if (draft && draft.noteId === input.noteId) {
    if (!draft.matches()) return json(503, { error: 'unavailable' });
    if (draft.isLocked()) return json(409, { error: 'vault_locked' });
    let wrote = false;
    let duplicate = false;
    let applied = false;
    const accepted = draft.setBody((current) => {
      const next = applyCaptureBody(current, input.noteId, input.captureId, input.line, sessions);
      wrote = next.wrote;
      duplicate = next.duplicate;
      applied = true;
      return next.body;
    });
    if (!accepted || !applied) return json(503, { error: 'unavailable' });
    return json(200, { ok: true, wrote, duplicate });
  }
  let note: Note;
  try {
    note = await getNote(input.noteId);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Note not found')) {
      return json(404, { error: 'note_not_found' });
    }
    throw error;
  }
  if (await vaultBlocksWrite(note)) return json(409, { error: 'vault_locked' });
  const applied = applyCaptureBody(note.bodyMd, input.noteId, input.captureId, input.line, sessions);
  if (applied.wrote) await updateNote(note.id, note.title, applied.body);
  return json(200, { ok: true, wrote: applied.wrote, duplicate: applied.duplicate });
}

async function vaultBlocksWrite(note: Note): Promise<boolean> {
  if (isNoteVaultLocked(note)) return true;
  if (await isNotesVaultBound()) return false;
  return isVaultEnabledSync() && !isVaultUnlocked();
}

function json(status: number, body: unknown): CaptureResult {
  return { status, body: JSON.stringify(body) };
}
