import { useEffect, useState } from 'react';

import {
  getNotesSyncStatus,
  subscribeNotesSyncStatus,
  type NotesSyncStatus,
} from '@features/notes/api/notesSync';

export function useNotesSyncStatus(): NotesSyncStatus {
  const [status, setStatus] = useState(getNotesSyncStatus);
  useEffect(() => subscribeNotesSyncStatus(setStatus), []);
  return status;
}
