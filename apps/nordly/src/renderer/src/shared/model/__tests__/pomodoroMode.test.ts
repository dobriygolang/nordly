import { describe, expect, it, vi } from 'vitest';

import { parseFocusTimerMode } from '../pomodoro';

describe('parseFocusTimerMode', () => {
  it('accepts known modes', () => {
    expect(parseFocusTimerMode('pomodoro')).toBe('pomodoro');
    expect(parseFocusTimerMode('stopwatch')).toBe('stopwatch');
  });

  it('migrates missing mode with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseFocusTimerMode(undefined)).toBe('pomodoro');
    expect(parseFocusTimerMode('')).toBe('pomodoro');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('throws on unknown mode', () => {
    expect(() => parseFocusTimerMode('countdown')).toThrow(/Invalid pomodoro snapshot mode/);
  });
});
