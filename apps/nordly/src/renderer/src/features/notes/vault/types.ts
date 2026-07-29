/** Filesystem notes vault types (Obsidian-style path identity). */

export interface NotesVaultConfig {
  root: string;
  attachmentFolder: string;
  migratedFromIdb: boolean;
}

export interface VaultNoteMeta {
  path: string;
  title: string;
  folderPath: string | null;
  updatedAtMs: number;
  sizeBytes: number;
}

export interface VaultFolderMeta {
  path: string;
  name: string;
  parentPath: string | null;
}

export interface VaultNoteContent {
  path: string;
  title: string;
  bodyMd: string;
  folderPath: string | null;
  updatedAtMs: number;
  sizeBytes: number;
}
