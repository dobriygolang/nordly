export type { NotesVaultConfig, VaultNoteContent, VaultNoteMeta, VaultFolderMeta } from './types';

export {
  isNotesVaultRuntime,
  vaultGetConfig,
  vaultSetConfig,
  vaultClearConfig,
  vaultPickFolder,
  vaultListNotes,
  vaultListFolders,
  vaultReadNote,
  vaultWriteNote,
  vaultCreateNote,
  vaultRenameNote,
  vaultMoveNote,
  vaultTrashNote,
  vaultCreateFolder,
  vaultRenameFolder,
  vaultMoveFolder,
  vaultTrashFolder,
  vaultWriteBytes,
  vaultReadBytes,
  vaultWritePastedImage,
  vaultStartWatch,
  vaultStopWatch,
  listenVaultChanged,
} from './ipc';

export {
  vaultIoListNotes,
  vaultIoGetNote,
  vaultIoCreateNote,
  vaultIoUpdateNote,
  vaultIoDeleteNote,
  vaultIoListFolders,
  vaultIoCreateFolder,
  vaultIoRenameFolder,
  vaultIoMoveFolder,
  vaultIoDeleteFolder,
  vaultIoMoveNoteToFolder,
  vaultIoEnsureFolderPath,
  vaultIoOpenWikiLink,
} from './vaultIo';

export { exportIdbNotesToVault } from './exportFromIdb';
export {
  resolveVaultImageHref,
  createVaultPastedImageMarkdown,
  revokeVaultImageCache,
  joinNoteRelative,
} from './resolveVaultImage';
export {
  enqueueVaultFilePut,
  enqueueVaultFileDelete,
  suppressVaultWatch,
  isVaultWatchSuppressed,
  deferVaultWatchReload,
  cancelDeferredVaultWatchReload,
  remapVaultPath,
  VAULT_FILE_SYNC_READY,
} from './vaultOutbox';

import { vaultGetConfig } from './ipc';

/** True when a filesystem vault root is bound (Tauri + persisted config). */
export async function isNotesVaultBound(): Promise<boolean> {
  const cfg = await vaultGetConfig();
  return Boolean(cfg?.root?.trim());
}
