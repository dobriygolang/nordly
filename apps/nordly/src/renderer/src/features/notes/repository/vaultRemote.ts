import { API_BASE_URL } from '@shared/api/config';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';

export async function remoteEncryptNoteBody(noteId: string, ciphertextB64: string): Promise<void> {
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/vault/notes/${encodeURIComponent(noteId)}/encrypt`,
    {
      method: 'POST',
      headers: syncAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ ciphertext_b64: ciphertextB64 }),
    },
  );
  if (!resp.ok) throw new Error(`encryptNote: ${resp.status}`);
}
