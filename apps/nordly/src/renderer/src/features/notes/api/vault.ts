/** Public vault surface for pages/widgets — do not import `@features/notes/vault`. */
export type { NotesVaultConfig } from '../vault';

export {
  cancelDeferredVaultWatchReload,
  deferVaultWatchReload,
  exportIdbNotesToVault,
  isNotesVaultBound,
  isVaultWatchSuppressed,
  listenVaultChanged,
  remapVaultPath,
  resolveVaultImageHref,
  revokeVaultImageCache,
  vaultClearConfig,
  vaultGetConfig,
  vaultPickFolder,
  vaultSetConfig,
  vaultStartWatch,
  vaultStopWatch,
} from '../vault';
