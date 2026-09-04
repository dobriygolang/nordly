import { describe, expect, it } from 'vitest';

import {
  publishAccessModeFromWire,
  publishAccessModeToWire,
  publishExpiryPolicyFromWire,
  publishExpiryPolicyToWire,
} from '../wireEnums';

describe('publish wire enums', () => {
  it('round-trips canonical access and expiry values', () => {
    expect(publishAccessModeFromWire(publishAccessModeToWire('public'))).toBe('public');
    expect(publishAccessModeFromWire(publishAccessModeToWire('password'))).toBe('password');
    expect(publishExpiryPolicyFromWire(publishExpiryPolicyToWire('never'))).toBe('never');
    expect(publishExpiryPolicyFromWire(publishExpiryPolicyToWire('seven_days'))).toBe(
      'seven_days',
    );
    expect(publishExpiryPolicyFromWire(publishExpiryPolicyToWire('thirty_days'))).toBe(
      'thirty_days',
    );
    expect(publishExpiryPolicyFromWire(publishExpiryPolicyToWire('ninety_days'))).toBe(
      'ninety_days',
    );
  });

  it('rejects unspecified and unknown wire values', () => {
    expect(() => publishAccessModeFromWire('PUBLISH_ACCESS_MODE_UNSPECIFIED')).toThrow(
      /bad accessMode/,
    );
    expect(() => publishExpiryPolicyFromWire('PUBLISH_EXPIRY_POLICY_UNSPECIFIED')).toThrow(
      /bad expiryPolicy/,
    );
    expect(() => publishAccessModeFromWire('public')).toThrow(/bad accessMode/);
  });
});
