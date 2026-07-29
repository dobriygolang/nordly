import { describe, expect, it } from 'vitest';

import { createPkcePair, pkceChallenge, randomUrlSafe } from '@shared/integrations/pkce';
import { parseDeepLink } from '@app/hooks/useDeepLinkNavigation';

describe('pkce', () => {
  it('generates url-safe verifier and matching challenge', async () => {
    const verifier = randomUrlSafe(32);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    const challenge = await pkceChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toEqual(verifier);
  });

  it('createPkcePair returns distinct state', async () => {
    const a = await createPkcePair();
    const b = await createPkcePair();
    expect(a.state).not.toEqual(b.state);
    expect(a.verifier).not.toEqual(b.verifier);
  });
});

describe('parseDeepLink oauth', () => {
  it('parses settings code+state for Zoom callback', () => {
    expect(parseDeepLink('nordly://settings?code=abc&state=xyz')).toEqual({
      kind: 'settings',
      googleStatus: null,
      zoomStatus: null,
      detail: null,
      code: 'abc',
      state: 'xyz',
    });
  });

  it('parses legacy connected status without code', () => {
    expect(parseDeepLink('nordly://settings?google_calendar=connected')).toEqual({
      kind: 'settings',
      googleStatus: 'connected',
      zoomStatus: null,
      detail: null,
      code: null,
      state: null,
    });
  });
});
