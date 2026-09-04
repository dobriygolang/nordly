import { API_BASE_URL } from '@shared/api/config';
import {
  optionalJsonStringOrEmpty,
  parseJsonDate,
  requireJsonBoolean,
  requireJsonNumber,
  requireJsonString,
} from '@shared/api/json';
import { syncAuthHeaders } from '@shared/api/authToken';
import { requireOk } from '@shared/api/errors';
import { apiFetch } from '@shared/api/http';

import type { Note, NoteSummary, WireNote } from '../model/note';
import type { StoredNote } from '../repository/notesStore';

import type { WikiLinkWire } from '../lib/wikiLinks';

function wikiLinksBody(links: WikiLinkWire[]): Record<string, unknown>[] {
  return links.map((l) => ({
    linkText: l.linkText,
    targetNoteId: l.targetNoteId,
  }));
}

function unwrapNoteSummary(raw: Record<string, unknown>): NoteSummary {
  return {
    id: requireJsonString(raw, 'id'),
    title: optionalJsonStringOrEmpty(raw, 'title'),
    updatedAt: parseJsonDate(raw.updatedAt, 'updatedAt'),
    sizeBytes: requireJsonNumber(raw, 'sizeBytes'),
  };
}

function unwrapNote(raw: Record<string, unknown>): WireNote {
  return {
    id: requireJsonString(raw, 'id'),
    title: optionalJsonStringOrEmpty(raw, 'title'),
    bodyMd: optionalJsonStringOrEmpty(raw, 'bodyMd'),
    createdAt: parseJsonDate(raw.createdAt, 'createdAt'),
    updatedAt: parseJsonDate(raw.updatedAt, 'updatedAt'),
    sizeBytes: requireJsonNumber(raw, 'sizeBytes'),
    encrypted: requireJsonBoolean(raw, 'encrypted'),
  };
}

function noteToStored(n: Note, userId: string, encrypted = false): StoredNote {
  if (!n.createdAt) throw new Error(`Invalid note: missing createdAt (${n.id})`);
  if (!n.updatedAt) throw new Error(`Invalid note: missing updatedAt (${n.id})`);
  return {
    userId,
    id: n.id,
    key: `${userId}::${n.id}`,
    title: n.title,
    bodyMd: n.bodyMd,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    deleted: false,
    atRestEncrypted: encrypted,
  };
}

export async function remoteListNotes(): Promise<NoteSummary[]> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/notes`, { headers: syncAuthHeaders() });
  requireOk(resp, 'listNotes');
  const j = (await resp.json()) as { notes?: Record<string, unknown>[] };
  if (!Array.isArray(j.notes)) throw new Error('Invalid notes response: missing notes');
  return j.notes.map(unwrapNoteSummary);
}

function unwrapNoteEnvelope(j: { note?: Record<string, unknown> }, label: string): WireNote {
  if (!j.note) throw new Error(`Invalid note response: missing note (${label})`);
  return unwrapNote(j.note);
}

export async function remoteGetNote(id: string): Promise<WireNote> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/notes/${encodeURIComponent(id)}`, {
    headers: syncAuthHeaders(),
  });
  requireOk(resp, 'getNote');
  const j = (await resp.json()) as { note?: Record<string, unknown> };
  return unwrapNoteEnvelope(j, 'getNote');
}

export async function remoteCreateNote(
  title: string,
  bodyMd: string,
  wikiLinks: WikiLinkWire[] = [],
): Promise<WireNote> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/notes`, {
    method: 'POST',
    headers: syncAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ title, bodyMd, wikiLinks: wikiLinksBody(wikiLinks) }),
  });
  requireOk(resp, 'createNote');
  const j = (await resp.json()) as { note?: Record<string, unknown> };
  return unwrapNoteEnvelope(j, 'createNote');
}

export async function remoteUpdateNote(
  id: string,
  title: string,
  bodyMd: string,
  wikiLinks: WikiLinkWire[] = [],
): Promise<WireNote> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/notes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: syncAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ id, title, bodyMd, wikiLinks: wikiLinksBody(wikiLinks) }),
  });
  requireOk(resp, 'updateNote');
  const j = (await resp.json()) as { note?: Record<string, unknown> };
  return unwrapNoteEnvelope(j, 'updateNote');
}

export async function remoteDeleteNote(id: string): Promise<void> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: syncAuthHeaders(),
  });
  requireOk(resp, 'deleteNote');
}

export { noteToStored, unwrapNote };
