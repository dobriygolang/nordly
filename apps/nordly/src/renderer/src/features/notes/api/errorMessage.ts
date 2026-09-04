import { AttachmentError } from '@features/notes/lib/noteAttachments';

type Translate = (key: string) => string;

const VAULT_ERROR_KEYS: ReadonlyArray<readonly [needle: string, key: string]> = [
  ['notes vault is not configured', 'nordly.notes.vault_fs.not_configured'],
  ['path escape', 'nordly.notes.vault_fs.path_escape'],
  ['vault root must be an absolute path', 'nordly.notes.vault_fs.absolute_root'],
  ['vault root is not a directory', 'nordly.notes.vault_fs.not_directory'],
  ['vault root inaccessible', 'nordly.notes.vault_fs.inaccessible'],
  ['image exceeds 5 mib', 'nordly.notes.attachment.too_large'],
  ['unsupported image type', 'nordly.notes.attachment.bad_type'],
  ['permission denied', 'nordly.notes.vault_fs.permission_denied'],
  ['operation not permitted', 'nordly.notes.vault_fs.permission_denied'],
];

export function notesErrorMessage(err: unknown, translate?: Translate): string {
  if (err instanceof AttachmentError && translate) {
    return translate(`nordly.notes.attachment.${err.code}`);
  }

  const raw = err instanceof Error ? err.message : String(err);
  if (!translate) return raw;
  const lower = raw.toLowerCase();
  const match = VAULT_ERROR_KEYS.find(([needle]) => lower.includes(needle));
  return match ? translate(match[1]) : raw;
}
