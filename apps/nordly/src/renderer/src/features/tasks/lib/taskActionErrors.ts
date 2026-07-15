/** Mutation failures that belong in inline UI — never crash the page via `throw loadError`. */
export function isRecoverableTaskActionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('task_not_synced') ||
    msg.includes('google_not_connected') ||
    msg.includes('zoom_not_connected') ||
    msg.includes('google_reauth_required') ||
    msg.includes('zoom_reauth_required') ||
    msg.includes('conference_not_available') ||
    msg.includes('integrations require cloud')
  );
}
