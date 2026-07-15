import { useCallback, useEffect, useState } from 'react';

import { listTasks, type TaskCard } from '@features/tasks/api/tasks';
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
    const onTasksChanged = (): void => {
      void refresh().catch(onError);
    };
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
  }, [refresh, onError]);

  return { tasks, loaded, refresh };
}
