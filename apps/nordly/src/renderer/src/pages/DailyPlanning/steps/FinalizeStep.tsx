import { useCallback, useRef, useState } from 'react';

import { useT } from '@nordly-i18n';

import type { TaskCard } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import { resolveTaskEpicColor } from '@features/tasks/lib/epicColor';

import { durationLabel } from '@features/planning/lib/planningTasks';

interface FinalizeStepProps {
  todayTasks: TaskCard[];
  epics: TaskEpic[];
  activeCount: number;
  doneCount: number;
  totalLabel: string;
  obstacles: string;
  onObstaclesChange: (value: string) => void;
  onObstaclesBlur: () => void;
}

function parseObstacles(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function FinalizeStep({
  todayTasks,
  epics,
  activeCount,
  doneCount,
  totalLabel,
  obstacles,
  onObstaclesChange,
  onObstaclesBlur,
}: FinalizeStepProps): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const items = parseObstacles(obstacles);

  const summaryKey =
    doneCount > 0 ? 'nordly.planning.finalize_summary_with_done' : 'nordly.planning.finalize_summary';

  const focusInput = useCallback((index: number) => {
    const el = inputRefs.current[index];
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  const commit = (next: string[]) => {
    onObstaclesChange(next.join('\n'));
    onObstaclesBlur();
  };

  const updateItem = (index: number, value: string) => {
    const next = [...items];
    next[index] = value;
    onObstaclesChange(next.join('\n'));
  };

  const finishItemEdit = (index: number) => {
    const trimmed = items[index]?.trim() ?? '';
    if (!trimmed) {
      commit(items.filter((_, i) => i !== index));
      return;
    }
    if (trimmed !== items[index]) {
      const next = [...items];
      next[index] = trimmed;
      commit(next);
    } else {
      onObstaclesBlur();
    }
  };

  const addDraft = () => {
    const value = draft.trim();
    if (!value) return;
    commit([...items, value]);
    setDraft('');
  };

  const handleItemKey = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index > 0) focusInput(index - 1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusInput(index + 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      finishItemEdit(index);
      focusInput(index + 1);
      return;
    }
    if (e.key === 'Backspace' && e.currentTarget.value === '') {
      e.preventDefault();
      const nextIndex = Math.max(0, index - 1);
      commit(items.filter((_, i) => i !== index));
      window.requestAnimationFrame(() => focusInput(nextIndex));
    }
  };

  const handleDraftKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) focusInput(items.length - 1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      addDraft();
      return;
    }
    if (e.key === 'Backspace' && draft === '' && items.length > 0) {
      e.preventDefault();
      const nextIndex = Math.max(0, items.length - 2);
      commit(items.slice(0, -1));
      window.requestAnimationFrame(() => focusInput(nextIndex));
    }
  };

  return (
    <div className="nordly-planning-finalize">
      <p className="nordly-planning-finalize__summary">
        {t(summaryKey, {
          count: activeCount,
          done: doneCount,
          duration: totalLabel,
        })}
      </p>
      <p className="nordly-planning-finalize__hint">{t('nordly.planning.finalize_home_hint')}</p>

      {todayTasks.length > 0 ? (
        <ul className="nordly-planning-finalize__tasks">
          {todayTasks.map((task) => {
            const done = task.status === 'done';
            const epicColor = resolveTaskEpicColor(task, epics);
            return (
              <li
                key={task.id}
                className="nordly-planning-finalize__task"
                data-done={done ? 'true' : undefined}
              >
                {epicColor ? (
                  <span
                    className="nordly-planning-finalize__task-stripe"
                    style={{ background: epicColor }}
                    aria-hidden
                  />
                ) : null}
                <span className="nordly-planning-finalize__task-title">{task.title}</span>
                {!done ? (
                  <span className="nordly-planning-finalize__task-dur mono">{durationLabel(task)}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <section className="nordly-planning-obstacles">
        <h3 className="nordly-planning-obstacles__heading">
          {t('nordly.planning.obstacles_heading')}
        </h3>
        <ul className="nordly-planning-obstacles__list">
          {items.map((item, index) => (
            <li key={`obstacle-${index}`} className="nordly-planning-obstacles__item">
              <input
                type="text"
                className="nordly-planning-obstacles__input"
                value={item}
                aria-label={t('nordly.planning.obstacles_heading')}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                onChange={(e) => updateItem(index, e.target.value)}
                onBlur={() => finishItemEdit(index)}
                onKeyDown={(e) => handleItemKey(index, e)}
              />
            </li>
          ))}
          <li className="nordly-planning-obstacles__item nordly-planning-obstacles__item--draft">
            <input
              type="text"
              className="nordly-planning-obstacles__input"
              value={draft}
              ref={(el) => {
                inputRefs.current[items.length] = el;
              }}
              placeholder={
                items.length === 0
                  ? t('nordly.planning.obstacles_none')
                  : t('nordly.planning.obstacles_placeholder')
              }
              aria-label={t('nordly.planning.obstacles_heading')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleDraftKey}
              onBlur={addDraft}
            />
          </li>
        </ul>
      </section>
    </div>
  );
}
