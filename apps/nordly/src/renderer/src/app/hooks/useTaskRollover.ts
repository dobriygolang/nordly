import { useEffect } from 'react';

import { runTaskRollover } from '@features/tasks/lib/taskRollover';
import { AuthStatus } from '@shared/model/session';
import { startTaskRolloverLifecycle } from './taskRolloverLifecycle';

export function useTaskRollover(
  status: AuthStatus,
  onError: (error: unknown) => void,
): void {
  useEffect(() => {
    if (status !== AuthStatus.SignedIn) return;
    return startTaskRolloverLifecycle({ run: runTaskRollover, onError });
  }, [status, onError]);
}
