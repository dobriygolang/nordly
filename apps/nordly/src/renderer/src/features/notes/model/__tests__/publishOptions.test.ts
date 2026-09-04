import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PublishAccessMode,
  PublishExpiryPolicy,
  expiryPolicyFromDays,
  parsePublishExpiryDays,
  publishOptionsFromStatus,
  shareAccessMode,
  shareExpiryPolicy,
} from '../publishOptions';

describe('publish options wire mapping', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps public status to a public share with no expiry', () => {
    expect(
      publishOptionsFromStatus({
        published: true,
        accessMode: PublishAccessMode.Public,
      }),
    ).toEqual({
      passwordProtected: false,
      password: '',
      expiresInDays: 0,
    });
  });

  it('snaps remaining password expiry to the closed policy set', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00.000Z'));

    expect(
      publishOptionsFromStatus({
        published: true,
        accessMode: PublishAccessMode.Password,
        expiresAt: '2026-09-03T12:00:00.000Z',
      }).expiresInDays,
    ).toBe(7);
    expect(
      publishOptionsFromStatus({
        published: true,
        accessMode: PublishAccessMode.Password,
        expiresAt: '2026-09-26T12:00:00.000Z',
      }).expiresInDays,
    ).toBe(30);
    expect(
      publishOptionsFromStatus({
        published: true,
        accessMode: PublishAccessMode.Password,
        expiresAt: '2026-11-25T12:00:00.000Z',
      }).expiresInDays,
    ).toBe(90);
  });

  it('keeps a never-expiring password share as never', () => {
    expect(
      publishOptionsFromStatus({
        published: true,
        accessMode: PublishAccessMode.Password,
      }),
    ).toEqual({
      passwordProtected: true,
      password: '',
      expiresInDays: 0,
    });
  });

  it('encodes share enums from the menu form', () => {
    expect(
      shareAccessMode({ passwordProtected: false, password: '', expiresInDays: 30 }),
    ).toBe(PublishAccessMode.Public);
    expect(
      shareExpiryPolicy({ passwordProtected: false, password: '', expiresInDays: 30 }),
    ).toBe(PublishExpiryPolicy.Never);
    expect(
      shareExpiryPolicy({ passwordProtected: true, password: 'secret', expiresInDays: 30 }),
    ).toBe(PublishExpiryPolicy.ThirtyDays);
    expect(expiryPolicyFromDays(0)).toBe(PublishExpiryPolicy.Never);
  });

  it('rejects expiry values outside the closed policy set', () => {
    expect(() => expiryPolicyFromDays(14)).toThrow(/Unsupported publish expiry 14/);
    expect(() => parsePublishExpiryDays('14')).toThrow(/Unsupported publish expiry 14/);
  });
});
