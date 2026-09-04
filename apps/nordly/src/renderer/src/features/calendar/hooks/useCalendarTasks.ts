import { useCallback, useEffect, useState } from 'react';

import { listTasks } from '@features/tasks/api/tasks';
import type { TaskCard } from '@features/tasks/model/task';
import { sameTaskCards } from '@features/tasks/lib/optimisticTasks';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

export function useCalendarTasks(onError: (error: unknown) => void): {
  tasks: TaskCard[];
  loaded: boolean;
  refresh: () => Promise<void>;
} {
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const next = await listTasks();
    setTasks(next);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh().catch(onError);
  }, [refresh, onError]);

  useEffect(() => {
    const hydrateFromIdb = (): void => {
      void listTasks()
        .then((next) => {
          setTasks((prev) => (sameTaskCards(prev, next) ? prev : next));
        })
        .catch(onError);
    };
    const onTasksChanged = (): void => hydrateFromIdb();
    const onSync = (): void => hydrateFromIdb();
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => {
      window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
      window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
    };
  }, [onError]);

  return { tasks, loaded, refresh };
}
