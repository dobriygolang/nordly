import { collectPublishPayload } from '../lib/publishPayload';
import { PublishAccessMode } from '../model/publishOptions';
import { remoteGetPublishStatus, remoteShareNoteToWeb } from '../remote/publishRemote';

/** Called inside the note mutation lock, before acknowledging the durable outbox. */
export async function refreshPublishedContent(serverId: string, localId: string, title: string, bodyMd: string): Promise<void> {
  const status = await remoteGetPublishStatus(serverId);
  if (!status?.published) return;
  if (status.expiresAt && new Date(status.expiresAt).getTime() <= Date.now()) return;
  const payload = await collectPublishPayload(localId, bodyMd);
  await remoteShareNoteToWeb(serverId, payload.body, title, {
    passwordProtected: status.accessMode === PublishAccessMode.Password,
    password: '',
    expiresInDays: 0,
  }, payload.attachments, { expectedSlug: status.slug });
}
