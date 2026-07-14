/**
 * Shared merge helpers so offline tombstones never revive on pull,
 * and server-side deletes apply to previously synced locals.
 */

/** Remote never revives a local tombstone; otherwise LWW by updatedAt. */
export function shouldAcceptRemoteEntity(
  local: { deleted?: boolean; updatedAt: string } | null | undefined,
  remoteUpdatedAt: string,
): boolean {
  if (local?.deleted) return false;
  if (!local) return true;
  return new Date(remoteUpdatedAt).getTime() >= new Date(local.updatedAt).getTime();
}

/**
 * Synced local ids missing from a full remote list were deleted elsewhere —
 * soft-delete them locally so they cannot reappear or re-push.
 */
export function syncedIdsAbsentFromRemote(
  candidates: { id: string; serverId: string | null }[],
  remoteIds: Set<string>,
): string[] {
  return candidates
    .filter(
      (c) =>
        c.serverId != null && !remoteIds.has(c.serverId) && !remoteIds.has(c.id),
    )
    .map((c) => c.id);
}
