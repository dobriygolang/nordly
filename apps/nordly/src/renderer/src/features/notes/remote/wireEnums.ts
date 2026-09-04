import {
  PublishAccessMode,
  PublishExpiryPolicy,
} from '../model/publishOptions';

const ACCESS_TO_WIRE: Record<PublishAccessMode, string> = {
  [PublishAccessMode.Public]: 'PUBLISH_ACCESS_MODE_PUBLIC',
  [PublishAccessMode.Password]: 'PUBLISH_ACCESS_MODE_PASSWORD',
};

const EXPIRY_TO_WIRE: Record<PublishExpiryPolicy, string> = {
  [PublishExpiryPolicy.Never]: 'PUBLISH_EXPIRY_POLICY_NEVER',
  [PublishExpiryPolicy.SevenDays]: 'PUBLISH_EXPIRY_POLICY_SEVEN_DAYS',
  [PublishExpiryPolicy.ThirtyDays]: 'PUBLISH_EXPIRY_POLICY_THIRTY_DAYS',
  [PublishExpiryPolicy.NinetyDays]: 'PUBLISH_EXPIRY_POLICY_NINETY_DAYS',
};

const ACCESS_FROM_WIRE: Record<string, PublishAccessMode> = {
  PUBLISH_ACCESS_MODE_PUBLIC: PublishAccessMode.Public,
  PUBLISH_ACCESS_MODE_PASSWORD: PublishAccessMode.Password,
};

const EXPIRY_FROM_WIRE: Record<string, PublishExpiryPolicy> = {
  PUBLISH_EXPIRY_POLICY_NEVER: PublishExpiryPolicy.Never,
  PUBLISH_EXPIRY_POLICY_SEVEN_DAYS: PublishExpiryPolicy.SevenDays,
  PUBLISH_EXPIRY_POLICY_THIRTY_DAYS: PublishExpiryPolicy.ThirtyDays,
  PUBLISH_EXPIRY_POLICY_NINETY_DAYS: PublishExpiryPolicy.NinetyDays,
};

export function publishAccessModeToWire(mode: PublishAccessMode): string {
  return ACCESS_TO_WIRE[mode];
}

export function publishAccessModeFromWire(raw: string): PublishAccessMode {
  const mode = ACCESS_FROM_WIRE[raw];
  if (!mode) throw new Error(`Invalid publish status: bad accessMode ${raw}`);
  return mode;
}

export function publishExpiryPolicyToWire(policy: PublishExpiryPolicy): string {
  return EXPIRY_TO_WIRE[policy];
}

export function publishExpiryPolicyFromWire(raw: string): PublishExpiryPolicy {
  const policy = EXPIRY_FROM_WIRE[raw];
  if (!policy) throw new Error(`Invalid publish status: bad expiryPolicy ${raw}`);
  return policy;
}
