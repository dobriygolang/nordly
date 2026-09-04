import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { isTauriRuntime } from '@platform/runtime';
import { trackAsyncDisposer } from '@shared/lib/asyncDisposer';

import type {
  NotesVaultConfig,
  VaultFolderMeta,
  VaultNoteContent,
  VaultNoteMeta,
} from './types';

export function isNotesVaultRuntime(): boolean {
  return isTauriRuntime();
}

export async function vaultGetConfig(): Promise<NotesVaultConfig | null> {
  if (!isNotesVaultRuntime()) return null;
  return invoke<NotesVaultConfig | null>('notes_vault_get_config');
}

export async function vaultSetConfig(config: NotesVaultConfig): Promise<NotesVaultConfig> {
  return invoke<NotesVaultConfig>('notes_vault_set_config', { config });
}

export async function vaultClearConfig(): Promise<void> {
  await invoke('notes_vault_clear_config');
}

export async function vaultPickFolder(): Promise<string | null> {
  return invoke<string | null>('notes_vault_pick_folder');
}

export async function vaultListNotes(): Promise<VaultNoteMeta[]> {
  return invoke<VaultNoteMeta[]>('notes_vault_list_notes');
}

export async function vaultListFolders(): Promise<VaultFolderMeta[]> {
  return invoke<VaultFolderMeta[]>('notes_vault_list_folders');
}

export async function vaultReadNote(relativePath: string): Promise<VaultNoteContent> {
  return invoke<VaultNoteContent>('notes_vault_read_note', { relativePath });
}

export async function vaultWriteNote(
  relativePath: string,
  body: string,
): Promise<VaultNoteContent> {
  return invoke<VaultNoteContent>('notes_vault_write_note', { relativePath, body });
}

export async function vaultCreateNote(
  title: string,
  body: string,
  folderRel?: string | null,
): Promise<VaultNoteContent> {
  return invoke<VaultNoteContent>('notes_vault_create_note', {
    title,
    body,
    folderRel: folderRel ?? null,
  });
}

export async function vaultRenameNote(
  relativePath: string,
  newTitle: string,
): Promise<VaultNoteContent> {
  return invoke<VaultNoteContent>('notes_vault_rename_note', { relativePath, newTitle });
}

export async function vaultMoveNote(
  relativePath: string,
  destFolderRel: string | null,
): Promise<VaultNoteContent> {
  return invoke<VaultNoteContent>('notes_vault_move_note', {
    relativePath,
    destFolderRel,
  });
}

export async function vaultTrashNote(relativePath: string): Promise<void> {
  await invoke('notes_vault_trash_note', { relativePath });
}

export async function vaultCreateFolder(
  name: string,
  parentRel?: string | null,
): Promise<VaultFolderMeta> {
  return invoke<VaultFolderMeta>('notes_vault_create_folder', {
    name,
    parentRel: parentRel ?? null,
  });
}

export async function vaultRenameFolder(
  relativePath: string,
  newName: string,
): Promise<VaultFolderMeta> {
  return invoke<VaultFolderMeta>('notes_vault_rename_folder', { relativePath, newName });
}

export async function vaultMoveFolder(
  relativePath: string,
  destParentRel: string | null,
): Promise<VaultFolderMeta> {
  return invoke<VaultFolderMeta>('notes_vault_move_folder', {
    relativePath,
    destParentRel,
  });
}

export async function vaultTrashFolder(relativePath: string): Promise<void> {
  await invoke('notes_vault_trash_folder', { relativePath });
}

export async function vaultWriteBytes(
  relativePath: string,
  bytes: Uint8Array,
): Promise<string> {
  return invoke<string>('notes_vault_write_bytes', {
    relativePath,
    bytes: Array.from(bytes),
  });
}

export async function vaultReadBytes(relativePath: string): Promise<Uint8Array> {
  const raw = await invoke<number[]>('notes_vault_read_bytes', { relativePath });
  return new Uint8Array(raw);
}

export async function vaultWritePastedImage(
  noteRelativePath: string,
  bytes: Uint8Array,
  ext: string,
): Promise<string> {
  return invoke<string>('notes_vault_write_pasted_image', {
    noteRelativePath,
    bytes: Array.from(bytes),
    ext,
  });
}

export async function vaultStartWatch(): Promise<void> {
  await invoke('notes_vault_start_watch');
}

export async function vaultStopWatch(): Promise<void> {
  await invoke('notes_vault_stop_watch');
}

const VAULT_CHANGED = 'notes-vault:changed';

export function listenVaultChanged(
  cb: () => void,
  onError: (error: unknown) => void,
): () => void {
  if (!isNotesVaultRuntime()) return () => undefined;
  return trackAsyncDisposer(listen(VAULT_CHANGED, () => cb()), onError);
}
