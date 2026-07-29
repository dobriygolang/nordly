import type { CollisionDetection } from '@dnd-kit/core';
import { pointerWithin, rectIntersection } from '@dnd-kit/core';

import type { NoteFolder, NoteSummary } from '@features/notes/api/notesClient';

export const UNFILED_DROPPABLE_ID = 'unfiled';

export function folderDroppableId(folderId: string): string {
  return `folder:${folderId}`;
}

export function parseFolderDroppableId(id: string): string | null {
  if (!id.startsWith('folder:')) return null;
  const folderId = id.slice('folder:'.length);
  return folderId || null;
}

export function folderDraggableId(folderId: string): string {
  return `folder-drag:${folderId}`;
}

export function parseFolderDraggableId(id: string): string | null {
  if (!id.startsWith('folder-drag:')) return null;
  const folderId = id.slice('folder-drag:'.length);
  return folderId || null;
}

/**
 * Resolve drop target folder id.
 * - `undefined` — ignore drop (unknown / miss)
 * - `null` — vault root
 * - string — folder id
 */
export function resolveDropFolderId(overId: string | null | undefined): string | null | undefined {
  if (overId == null) return undefined;
  if (overId === UNFILED_DROPPABLE_ID) return null;
  const folderId = parseFolderDroppableId(overId);
  return folderId ?? undefined;
}

/** Prefer folder targets over vault-root; fall back to rect intersection. */
export const notesCollisionDetection: CollisionDetection = (args) => {
  const isFolderDrop = (id: string | number) => {
    const s = String(id);
    return s === UNFILED_DROPPABLE_ID || s.startsWith('folder:');
  };
  const preferFolder = <T extends { id: string | number }>(hits: T[]): T[] => {
    const folders = hits.filter((c) => String(c.id).startsWith('folder:'));
    return folders.length > 0 ? folders : hits;
  };

  const pointerHits = pointerWithin(args).filter((c) => isFolderDrop(c.id));
  if (pointerHits.length > 0) return preferFolder(pointerHits);

  const rectHits = rectIntersection(args).filter((c) => isFolderDrop(c.id));
  return preferFolder(rectHits);
};

export type NoteDragData = {
  type: 'note';
  note: NoteSummary;
};

export type FolderDragData = {
  type: 'folder';
  folder: NoteFolder;
};

export type NoteDropData =
  | { type: 'folder'; folderId: string }
  | { type: 'unfiled' };
