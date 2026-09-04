import { describe, expect, it, vi } from 'vitest';

import {
  registerUserScopeResetHandler,
  resetUserScope,
} from '@shared/model/userScopeLifecycle';

describe('user-scope lifecycle', () => {
  it('notifies registered feature cache owners and supports disposal', () => {
    const reset = vi.fn();
    const unregister = registerUserScopeResetHandler(reset);

    resetUserScope('previous-user');
    expect(reset).toHaveBeenCalledWith('previous-user');

    unregister();
    resetUserScope('next-user');
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
