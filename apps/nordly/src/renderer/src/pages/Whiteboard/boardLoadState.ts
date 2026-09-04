import type { Board } from '@features/whiteboard/api/whiteboardClient';

export const BoardLoadStatus = {
  Idle: 'idle',
  Loading: 'loading',
  Ready: 'ready',
  Failed: 'failed',
} as const;

export type BoardLoadState =
  | { status: typeof BoardLoadStatus.Idle }
  | { status: typeof BoardLoadStatus.Loading; boardId: string }
  | {
      status: typeof BoardLoadStatus.Ready;
      boardId: string;
      board: Board;
    }
  | {
      status: typeof BoardLoadStatus.Failed;
      boardId: string;
      error: string;
    };

export const INITIAL_BOARD_LOAD_STATE: BoardLoadState = {
  status: BoardLoadStatus.Idle,
};

export function startBoardLoad(boardId: string): BoardLoadState {
  return { status: BoardLoadStatus.Loading, boardId };
}

export function finishBoardLoad(board: Board): BoardLoadState {
  return { status: BoardLoadStatus.Ready, boardId: board.id, board };
}

export function failBoardLoad(boardId: string, error: string): BoardLoadState {
  return { status: BoardLoadStatus.Failed, boardId, error };
}

/**
 * Never expose a loaded board for a different sidebar selection, including
 * the render before the selection effect starts its next request.
 */
export function boardLoadStateForSelection(
  state: BoardLoadState,
  selectedId: string | null,
): BoardLoadState {
  if (!selectedId) return INITIAL_BOARD_LOAD_STATE;
  if (
    state.status === BoardLoadStatus.Idle ||
    state.boardId !== selectedId
  ) {
    return startBoardLoad(selectedId);
  }
  return state;
}
