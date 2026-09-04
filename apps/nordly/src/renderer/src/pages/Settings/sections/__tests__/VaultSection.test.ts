import { describe, expect, it } from 'vitest';

import { canDismissVaultModal } from '../VaultSection';

describe('VaultSection modal policy', () => {
  it('keeps the one-time recovery phrase open until completion', () => {
    expect(canDismissVaultModal('show-recovery', false)).toBe(false);
    expect(canDismissVaultModal('show-recovery', true)).toBe(false);
  });

  it('allows other idle vault modals to dismiss', () => {
    expect(canDismissVaultModal('setup', false)).toBe(true);
    expect(canDismissVaultModal('unlock', true)).toBe(false);
  });
});
