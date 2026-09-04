import type { BoardSummary } from '@features/whiteboard/api/whiteboardClient';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';

export const BoardListStatus = {
  Loading: 'loading',
  Ready: 'ready',
  Failed: 'failed',
} as const;

export type ListState =
  | {
      status: typeof BoardListStatus.Loading;
      boards: BoardSummary[];
    }
  | {
      status: typeof BoardListStatus.Ready;
      boards: BoardSummary[];
    }
  | {
      status: typeof BoardListStatus.Failed;
      boards: BoardSummary[];
      error: string;
    };

export const INITIAL_LIST: ListState = {
  status: BoardListStatus.Loading,
  boards: [],
};

export function sameBoardSummaries(a: BoardSummary[], b: BoardSummary[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.title !== right.title ||
      (left.updatedAt?.getTime() ?? 0) !== (right.updatedAt?.getTime() ?? 0)
    ) {
      return false;
    }
  }
  return true;
}

export const SIDEBAR_COLLAPSED_KEY = STORAGE_KEYS.whiteboardSidebarCollapsed;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export { errorMessage };
