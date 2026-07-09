export interface PublishToWebOptions {
  passwordProtected: boolean;
  password: string;
  expiresInDays: number;
}

export const DEFAULT_PUBLISH_OPTIONS: PublishToWebOptions = {
  passwordProtected: false,
  password: '',
  expiresInDays: 0,
};

export interface PublishFeatureEntitlements {
  publishPrivateLink: boolean;
}

export const PUBLISH_EXPIRY_OPTIONS = [0, 7, 30, 90] as const;

export interface PublishStatusSnapshot {
  passwordProtected?: boolean;
  expiresAt?: string;
  publishedAt?: string;
}

/** Map server publish status into menu form state (password is never loaded from server). */
export function publishOptionsFromStatus(
  status: PublishStatusSnapshot,
): PublishToWebOptions {
  return {
    passwordProtected: status.passwordProtected === true,
    password: '',
    expiresInDays: expiresInDaysFromStatus(status),
  };
}

/** Whether publish options can be sent to the server (auto-save or publish). */
export function canApplyPublishOptions(
  options: PublishToWebOptions,
  serverPasswordProtected: boolean,
): boolean {
  if (!options.passwordProtected) return true;
  if (options.password.trim().length >= 4) return true;
  return serverPasswordProtected;
}

export function serializePublishOptions(options: PublishToWebOptions): string {
  return JSON.stringify({
    passwordProtected: options.passwordProtected,
    expiresInDays: options.expiresInDays,
    password: options.password,
  });
}

function expiresInDaysFromStatus(status: PublishStatusSnapshot): number {
  if (!status.expiresAt) return 0;
  const expiresMs = Date.parse(status.expiresAt);
  if (Number.isNaN(expiresMs)) return 0;

  const baseMs = status.publishedAt ? Date.parse(status.publishedAt) : NaN;
  const dayMs = 86_400_000;
  const elapsedDays =
    Number.isNaN(baseMs) || baseMs <= 0
      ? Math.max(0, Math.round((expiresMs - Date.now()) / dayMs))
      : Math.max(0, Math.round((expiresMs - baseMs) / dayMs));

  for (const days of [...PUBLISH_EXPIRY_OPTIONS].reverse()) {
    if (days === 0) continue;
    if (elapsedDays >= days - 1) return days;
  }
  return 0;
}
