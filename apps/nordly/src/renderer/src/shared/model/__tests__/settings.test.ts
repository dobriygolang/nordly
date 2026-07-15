import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SETTINGS_KEY } from '@shared/model/settings';

describe('settings', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: {
        store: {} as Record<string, string>,
        getItem(key: string) {
          return this.store[key] ?? null;
        },
        setItem(key: string, value: string) {
          this.store[key] = value;
        },
        removeItem(key: string) {
          delete this.store[key];
        },
      },
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults pomodoro to 25 minutes', async () => {
    const { readPomodoroSeconds } = await import('@shared/model/settings');
    expect(readPomodoroSeconds()).toBe(25 * 60);
  });

  it('reads pomodoro from settings blob', async () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        pomodoroMinutes: 45,
        notifications: false,
        calendarNotifications: true,
        dailyGoalMin: 120,
        textScale: 'normal',
        boardCanvas: 'dark',
        googleCalendarPollMinutes: 5,
      }),
    );
    const { readPomodoroSeconds } = await import('@shared/model/settings');
    expect(readPomodoroSeconds()).toBe(45 * 60);
  });

  it('defaults theme to launch', async () => {
    const { readStoredTheme } = await import('@shared/model/theme');
    expect(readStoredTheme()).toBe('launch');
  });

  it('migrates legacy settings blob missing new fields', async () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ pomodoroMinutes: 25, notifications: true, dailyGoalMin: 120 }),
    );
    const { readSettings } = await import('@shared/model/settings');
    const settings = readSettings();
    expect(settings.calendarNotifications).toBe(true);
    expect(settings.taskNotifications).toBe(true);
    expect(settings.notificationVolume).toBe(80);
    expect(settings.textScale).toBe('normal');
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({
      calendarNotifications: true,
      taskNotifications: true,
      notificationVolume: 80,
      textScale: 'normal',
    });
  });
});
