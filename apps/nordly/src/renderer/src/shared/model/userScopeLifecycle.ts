export type UserScopeResetHandler = (previousUserId?: string) => void;

const resetHandlers = new Set<UserScopeResetHandler>();

export function registerUserScopeResetHandler(handler: UserScopeResetHandler): () => void {
  resetHandlers.add(handler);
  return () => resetHandlers.delete(handler);
}

export function resetUserScope(previousUserId?: string): void {
  for (const handler of resetHandlers) {
    handler(previousUserId);
  }
}
