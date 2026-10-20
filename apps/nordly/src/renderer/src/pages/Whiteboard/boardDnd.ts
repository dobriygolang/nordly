import type { CollisionDetection } from '@dnd-kit/core';
import { pointerWithin, rectIntersection } from '@dnd-kit/core';

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

/** `undefined` — ignore; `null` — list root; string — folder id. */
export function resolveDropFolderId(overId: string | null | undefined): string | null | undefined {
  if (overId == null) return undefined;
  if (overId === UNFILED_DROPPABLE_ID) return null;
  const folderId = parseFolderDroppableId(overId);
  return folderId ?? undefined;
}

/** Prefer folder targets over the list root; fall back to rect intersection. */
export const boardCollisionDetection: CollisionDetection = (args) => {
  const isFolderDrop = (id: string | number) => {
    const value = String(id);
    return value === UNFILED_DROPPABLE_ID || value.startsWith('folder:');
  };
  const preferFolder = <T extends { id: string | number }>(hits: T[]): T[] => {
    const folders = hits.filter((hit) => String(hit.id).startsWith('folder:'));
    return folders.length > 0 ? folders : hits;
  };

  const pointerHits = pointerWithin(args).filter((hit) => isFolderDrop(hit.id));
  if (pointerHits.length > 0) return preferFolder(pointerHits);

  const rectHits = rectIntersection(args).filter((hit) => isFolderDrop(hit.id));
  return preferFolder(rectHits);
};

export type BoardDropData =
  | { type: 'folder'; folderId: string }
  | { type: 'unfiled' };
