// Centralized custom-event names for Hone renderer.

export const NORDLY_EVENTS = {
  /** Sidebar → App: navigate to home. */
  navHome: 'nordly:nav-home',
  /** Hotkey → Notes layout: toggle the sidebar. */
  toggleSidebar: 'nordly:toggle-sidebar',
  /** Editor → Notes header: pending-write count changed. */
  syncChanged: 'nordly:sync-changed',
  /** Deeplink → TaskBoard: open task drawer. */
  openTask: 'nordly:open-task',
  /** Deeplink → Notes: select note by id. */
  openNote: 'nordly:open-note',
  /** Notes → App: open Settings (vault unlock). */
  openSettings: 'nordly:open-settings',
  /** TaskBoard → App: open palette prefilled for a day. */
  openPaletteAddTask: 'nordly:open-palette-add-task',
  /** Palette → TaskBoard: refresh task list after create. */
  tasksChanged: 'nordly:tasks-changed',
  /** Calendar → App: navigate to task board task. */
  navOpenTask: 'nordly:nav-open-task',
  /** OAuth callback → Settings: Google Calendar connected/error. */
  googleCalendarOAuth: 'nordly:google-calendar-oauth',
} as const;
