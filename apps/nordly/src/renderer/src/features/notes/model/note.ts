export interface Note {
  id: string;
  title: string;
  bodyMd: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  sizeBytes: number;
  /** True when E2EE vault is on but the passphrase has not been entered. */
  vaultLocked?: boolean;
  /** Local-only folder id; in filesystem-vault mode this is a relative path. */
  folderId?: string | null;
}

export interface NoteSummary {
  id: string;
  title: string;
  updatedAt: Date | null;
  sizeBytes: number;
  vaultLocked?: boolean;
  /** Local-only folder id; in filesystem-vault mode this is a relative path. */
  folderId?: string | null;
}

/** Parsed note returned by the cloud API, including its encryption marker. */
export type WireNote = Note & { encrypted: boolean };

export function isNoteVaultLocked(
  note: Pick<NoteSummary, 'vaultLocked'>,
): boolean {
  return note.vaultLocked === true;
}
