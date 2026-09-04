import { DAY_MS, parseScheduleInstant } from '@shared/lib/dates';

export const PublishAccessMode = {
  Public: 'public',
  Password: 'password',
} as const;
export type PublishAccessMode =
  (typeof PublishAccessMode)[keyof typeof PublishAccessMode];

export const PublishExpiryPolicy = {
  Never: 'never',
  SevenDays: 'seven_days',
  ThirtyDays: 'thirty_days',
  NinetyDays: 'ninety_days',
} as const;
export type PublishExpiryPolicy =
  (typeof PublishExpiryPolicy)[keyof typeof PublishExpiryPolicy];

export type PublishExpiryDays = 0 | 7 | 30 | 90;

export interface PublishToWebOptions {
  passwordProtected: boolean;
  password: string;
  expiresInDays: PublishExpiryDays;
}

export const DEFAULT_PUBLISH_OPTIONS: PublishToWebOptions = {
  passwordProtected: false,
  password: '',
  expiresInDays: 0,
};

export const PUBLISH_EXPIRY_OPTIONS: readonly PublishExpiryDays[] = [0, 7, 30, 90];

export type PublishStatus =
  | { published: false }
  | {
      published: true;
      slug: string;
      url: string;
      publishedAt: string;
      accessMode: PublishAccessMode;
      expiresAt?: string;
    };

export type PublishOptionsStatus =
  | { published: false }
  | {
      published: true;
      accessMode: PublishAccessMode;
      expiresAt?: string;
    };

export function publishedNoteUrl(status: PublishStatus | null | undefined): string | undefined {
  return status?.published ? status.url : undefined;
}

/** Map server publish status into menu form state (password is never loaded from server). */
export function publishOptionsFromStatus(
  status: PublishOptionsStatus,
): PublishToWebOptions {
  if (!status.published) return DEFAULT_PUBLISH_OPTIONS;
  const passwordProtected =
    status.accessMode === PublishAccessMode.Password;
  return {
    passwordProtected,
    password: '',
    expiresInDays: passwordProtected ? expiresInDaysFromStatus(status) : 0,
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

export function parsePublishExpiryDays(raw: string | number): PublishExpiryDays {
  const days = typeof raw === 'number' ? raw : Number(raw);
  if (days === 0 || days === 7 || days === 30 || days === 90) return days;
  throw new Error(`Unsupported publish expiry ${raw}`);
}

export function expiryPolicyFromDays(days: number): PublishExpiryPolicy {
  switch (parsePublishExpiryDays(days)) {
    case 0:
      return PublishExpiryPolicy.Never;
    case 7:
      return PublishExpiryPolicy.SevenDays;
    case 30:
      return PublishExpiryPolicy.ThirtyDays;
    case 90:
      return PublishExpiryPolicy.NinetyDays;
  }
}

export function shareAccessMode(options: PublishToWebOptions): PublishAccessMode {
  return options.passwordProtected
    ? PublishAccessMode.Password
    : PublishAccessMode.Public;
}

export function shareExpiryPolicy(options: PublishToWebOptions): PublishExpiryPolicy {
  if (!options.passwordProtected) return PublishExpiryPolicy.Never;
  return expiryPolicyFromDays(options.expiresInDays);
}

function expiresInDaysFromStatus(
  status: Extract<PublishOptionsStatus, { published: true }>,
): PublishExpiryDays {
  if (!status.expiresAt) return 0;
  let expiresMs: number;
  try {
    expiresMs = parseScheduleInstant(status.expiresAt).getTime();
  } catch (cause) {
    throw new Error(
      'Invalid publish status: expiresAt must be an RFC3339 timestamp',
      { cause },
    );
  }

  const remainingDays = Math.round((expiresMs - Date.now()) / DAY_MS);
  if (remainingDays <= 0) return 7;

  let best: PublishExpiryDays = 7;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const days of PUBLISH_EXPIRY_OPTIONS) {
    if (days === 0) continue;
    const dist = Math.abs(days - remainingDays);
    if (dist < bestDist) {
      best = days;
      bestDist = dist;
    }
  }
  return best;
}
