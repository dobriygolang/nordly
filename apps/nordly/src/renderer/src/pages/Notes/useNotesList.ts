import { useCallback, useEffect, useRef, useState } from 'react';

import type { TFunc } from '@nordly-i18n';

import { listFolders, listNotes, type NoteFolder } from '@features/notes/api/notesClient';
import { createTrailingCoalesce, NOTES_LIST_COALESCE_MS } from './listCoalesce';
import {
  errorMessage,
  INITIAL_LIST,
  NoteListStatus,
  sameNoteFolders,
  sameNoteSummaries,
  type ListState,
} from './utils';

export function useNotesList({
  t,
  setSelectedId,
}: {
  t: TFunc;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
}): {
  list: ListState;
  setList: React.Dispatch<React.SetStateAction<ListState>>;
  listRef: React.MutableRefObject<ListState>;
  folders: NoteFolder[];
  setFolders: React.Dispatch<React.SetStateAction<NoteFolder[]>>;
  loadList: () => void;
  scheduleLoadList: () => void;
} {
  const [list, setList] = useState<ListState>(INITIAL_LIST);
  const listRef = useRef<ListState>(INITIAL_LIST);
  listRef.current = list;
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const loadListGen = useRef(0);

  const loadList = useCallback(() => {
    const gen = ++loadListGen.current;
    void Promise.all([listFolders(), listNotes()])
      .then(([folderRows, res]) => {
        if (gen !== loadListGen.current) return;
        setFolders((prev) => (sameNoteFolders(prev, folderRows) ? prev : folderRows));
        setList((prev) =>
          prev.status === NoteListStatus.Ready &&
          sameNoteSummaries(prev.notes, res.notes)
            ? prev
            : { status: NoteListStatus.Ready, notes: res.notes },
        );
        const firstId = res.notes[0]?.id ?? null;
        if (firstId) setSelectedId((cur) => cur ?? firstId);
      })
      .catch((err: unknown) => {
        if (gen !== loadListGen.current) return;
        setList((prev) => ({
          status: NoteListStatus.Failed,
          notes: prev.notes,
          error: errorMessage(err, t),
        }));
      });
  }, [setSelectedId, t]);

  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;
  const coalesceRef = useRef(
    createTrailingCoalesce(() => {
      loadListRef.current();
    }, NOTES_LIST_COALESCE_MS),
  );

  useEffect(() => () => coalesceRef.current.cancel(), []);

  const scheduleLoadList = useCallback(() => {
    coalesceRef.current.schedule();
  }, []);

  return { list, setList, listRef, folders, setFolders, loadList, scheduleLoadList };
}
