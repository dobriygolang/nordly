import { describe, expect, it } from 'vitest';

import { createPkcePair, pkceChallenge, randomUrlSafe } from '@shared/integrations/pkce';

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
