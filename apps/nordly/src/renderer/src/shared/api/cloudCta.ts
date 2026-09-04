import { ensureCloudAuth } from '@shared/api/authSession';
import { isCloudEnabled } from '@shared/model/features';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';

export type CloudCtaFailure = 'disabled' | 'cancelled' | 'unavailable';

export async function requireCloudCta(): Promise<
  { ok: true } | { ok: false; reason: CloudCtaFailure }
> {
  if (!isCloudEnabled()) return { ok: false, reason: 'disabled' };
  if (!(await ensureCloudAuth())) return { ok: false, reason: 'cancelled' };
  if (!isCloudApiAvailable()) return { ok: false, reason: 'unavailable' };
  return { ok: true };
}
