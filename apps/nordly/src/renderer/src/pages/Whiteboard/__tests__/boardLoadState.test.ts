import { describe, expect, it } from 'vitest';

import type { Board } from '@features/whiteboard/api/whiteboardClient';
import {
  BoardLoadStatus,
  boardLoadStateForSelection,
  failBoardLoad,
  finishBoardLoad,
} from '../boardLoadState';

function board(id: string): Board {
  return {
    id,
    title: `Board ${id}`,
    sceneJson: '{}',
    createdAt: null,
    updatedAt: null,
  };
}

describe('boardLoadStateForSelection', () => {
  it('hides board A immediately when selection switches to board B', () => {
    const state = boardLoadStateForSelection(finishBoardLoad(board('a')), 'b');

    expect(state).toEqual({
      status: BoardLoadStatus.Loading,
      boardId: 'b',
    });
  });

  it('keeps a board-switch failure visible without the previous board', () => {
    const state = boardLoadStateForSelection(
      failBoardLoad('b', 'read failed'),
      'b',
    );

    expect(state).toEqual({
      status: BoardLoadStatus.Failed,
      boardId: 'b',
      error: 'read failed',
    });
  });
});
