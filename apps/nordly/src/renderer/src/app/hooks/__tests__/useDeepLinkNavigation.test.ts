import { describe, expect, it, vi } from 'vitest';

import {
  executeDeepLink,
  parseDeepLink,
  type DeepLinkNavigationHandlers,
} from '../useDeepLinkNavigation';

describe('parseDeepLink', () => {
  it('parses canonical task and note requests', () => {
    expect(parseDeepLink('nordly://task.open?id=task-1')).toEqual({
      kind: 'task',
      id: 'task-1',
    });
    expect(parseDeepLink('nordly://note.open?id=note-1')).toEqual({
      kind: 'note',
      id: 'note-1',
    });
  });

  it('rejects entity links without an id', () => {
    expect(parseDeepLink('nordly://task.open')).toBeNull();
    expect(parseDeepLink('nordly://note.open')).toBeNull();
  });

  it('does not accept legacy entity hosts', () => {
    expect(parseDeepLink('nordly://task?id=task-1')).toBeNull();
    expect(parseDeepLink('nordly://note?id=note-1')).toBeNull();
  });
});

describe('executeDeepLink', () => {
  function handlers(
    beforeNavigate: DeepLinkNavigationHandlers['beforeNavigate'],
  ): DeepLinkNavigationHandlers {
    return {
      beforeNavigate,
      navigateTo: vi.fn(),
      openTask: vi.fn(),
      openNote: vi.fn(),
      startFocus: vi.fn(),
      onError: vi.fn(),
    };
  }

  it('waits for the save gate before opening a task', async () => {
    let release!: (saved: boolean) => void;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const actions = handlers(() => gate);

    const pending = executeDeepLink({ kind: 'task', id: 'task-1' }, actions);
    expect(actions.openTask).not.toHaveBeenCalled();

    release(true);
    await pending;
    expect(actions.openTask).toHaveBeenCalledWith('task-1');
  });

  it('blocks navigation when the note flush fails', async () => {
    const actions = handlers(async () => false);
    await executeDeepLink({ kind: 'task', id: 'task-1' }, actions);
    expect(actions.openTask).not.toHaveBeenCalled();
  });
});
