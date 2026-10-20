import {
  boardsStoreCreate,
  boardsStoreDelete,
  boardsStoreGet,
  boardsStoreList,
  boardsStoreUpdateFolder,
  boardsStoreUpdateScene,
  boardsStoreUpdateTitle,
  parseSceneJson,
  serializeScene,
  type Board,
  type BoardSummary,
  type WhiteboardScene,
} from '@features/whiteboard/repository/whiteboardStore';
import {
  boardFoldersCreate,
  boardFoldersDelete,
  boardFoldersList,
  boardFoldersMove,
  boardFoldersRename,
  type BoardFolder,
} from '@features/whiteboard/repository/whiteboardFolders';
import {
  remotePublishWhiteboard,
  remoteShareWhiteboard,
  type PublishWhiteboardResult,
  type ShareWhiteboardResult,
} from '@features/whiteboard/remote/whiteboardRemote';

export { parseSceneJson, serializeScene };
export type { Board, BoardSummary, WhiteboardScene, PublishWhiteboardResult, ShareWhiteboardResult };
export type { BoardFolder };
export { boardFolderSubtreeIds } from '@features/whiteboard/repository/whiteboardFolders';

export async function listBoards(): Promise<BoardSummary[]> {
  return boardsStoreList();
}

export async function getBoard(id: string): Promise<Board> {
  const board = await boardsStoreGet(id);
  if (!board) throw new Error(`Board not found: ${id}`);
  return board;
}

export async function createBoard(title: string, folderId: string | null = null): Promise<Board> {
  return boardsStoreCreate(title, folderId);
}

/** Opens an existing board with this title, or creates an empty one. */
export async function openOrCreateBoardByTitle(title: string): Promise<Board> {
  const clean = title.trim();
  if (!clean) throw new Error('Board title is required');
  const key = clean.toLowerCase();
  const existing = (await boardsStoreList()).find((board) => board.title.trim().toLowerCase() === key);
  if (existing) {
    const board = await boardsStoreGet(existing.id);
    if (!board) throw new Error(`Board not found: ${existing.id}`);
    return board;
  }
  return boardsStoreCreate(clean);
}

export async function moveBoardToFolder(id: string, folderId: string | null): Promise<Board> {
  return boardsStoreUpdateFolder(id, folderId);
}

export async function listBoardFolders(): Promise<BoardFolder[]> {
  return boardFoldersList();
}

export async function createBoardFolder(name: string, parentId: string | null): Promise<BoardFolder> {
  return boardFoldersCreate(name, parentId);
}

export async function renameBoardFolder(id: string, name: string): Promise<BoardFolder> {
  return boardFoldersRename(id, name);
}

export async function moveBoardFolder(id: string, parentId: string | null): Promise<BoardFolder> {
  return boardFoldersMove(id, parentId);
}

export async function deleteBoardFolder(id: string): Promise<void> {
  const { removedIds, parentId } = await boardFoldersDelete(id);
  const removed = new Set(removedIds);
  const boards = await boardsStoreList();
  for (const board of boards) {
    if (board.folderId && removed.has(board.folderId)) {
      await boardsStoreUpdateFolder(board.id, parentId);
    }
  }
}

export async function updateBoardScene(id: string, sceneJson: string): Promise<Board> {
  return boardsStoreUpdateScene(id, sceneJson);
}

export async function updateBoardTitle(id: string, title: string): Promise<Board> {
  return boardsStoreUpdateTitle(id, title);
}

export async function deleteBoard(id: string): Promise<void> {
  await boardsStoreDelete(id);
}

export function shareWhiteboard(sceneJson: string, title: string): Promise<ShareWhiteboardResult> {
  return remoteShareWhiteboard(sceneJson, title);
}

export function publishWhiteboard(sceneJson: string, title: string): Promise<PublishWhiteboardResult> {
  return remotePublishWhiteboard(sceneJson, title);
}
