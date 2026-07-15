import { useEffect } from 'react';

import { runTaskRollover } from '@features/tasks/lib/taskRollover';
import { startTaskRolloverLifecycle } from './taskRolloverLifecycle';

type AuthStatus = 'unknown' | 'guest' | 'signed_in';

export function useTaskRollover(
  status: AuthStatus,
  onError: (error: unknown) => void,
): void {
  useEffect(() => {
    if (status !== 'signed_in') return;
    return startTaskRolloverLifecycle({ run: runTaskRollover, onError });
  }, [status, onError]);
}
