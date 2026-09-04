import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import { listTasks } from '@features/tasks/api/tasks';
import type { TaskCard } from '@features/tasks/model/task';
import { TaskMutationCoordinator } from '@features/tasks/lib/optimisticTasks';

interface UseTaskMutationCoordinatorOptions {
  tasks: TaskCard[];
  setTasks: Dispatch<SetStateAction<TaskCard[]>>;
  onHydrationError: (error: unknown) => void;
  onHydrated?: () => void;
}

export function useTaskMutationCoordinator({
  tasks,
  setTasks,
  onHydrationError,
  onHydrated,
}: UseTaskMutationCoordinatorOptions): TaskMutationCoordinator {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const setTasksRef = useRef(setTasks);
  setTasksRef.current = setTasks;
  const hydrationErrorRef = useRef(onHydrationError);
  hydrationErrorRef.current = onHydrationError;
  const hydratedRef = useRef(onHydrated);
  hydratedRef.current = onHydrated;
  const mountedRef = useRef(false);
  const coordinatorRef = useRef<TaskMutationCoordinator>();

  if (!coordinatorRef.current) {
    coordinatorRef.current = new TaskMutationCoordinator({
      getTasks: () => tasksRef.current,
      setTasks: (next) => {
        tasksRef.current = next;
        if (mountedRef.current) setTasksRef.current(next);
      },
      loadTasks: listTasks,
      onHydrationError: (error) => {
        if (mountedRef.current) hydrationErrorRef.current(error);
      },
      onHydrated: () => {
        if (mountedRef.current) hydratedRef.current?.();
      },
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return coordinatorRef.current;
}
