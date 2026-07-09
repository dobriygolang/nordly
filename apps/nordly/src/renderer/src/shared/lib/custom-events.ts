// Centralized custom-event names for Nordly renderer.

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
  /** Quick capture → Notes: note list changed. */
  notesChanged: 'nordly:notes-changed',
  /** Calendar → App: navigate to task board task. */
  navOpenTask: 'nordly:nav-open-task',
  /** OAuth callback → Settings: Google Calendar connected/error. */
  googleCalendarOAuth: 'nordly:google-calendar-oauth',
  zoomOAuth: 'nordly:zoom-oauth',
  /** Background worker → calendar views: Google events cache updated. */
  googleCalendarChanged: 'nordly:google-calendar-changed',
  /** Local app settings persisted (poll interval, etc.). */
  settingsChanged: 'nordly:settings-changed',
  /** Background update worker found a newer published version. */
  updateAvailable: 'nordly:update-available',
  /** Sync banner → App: open re-login overlay. */
  openReauthLogin: 'nordly:open-reauth-login',
  /** Daily planning finalized or obstacles updated. */
  dailyPlanChanged: 'nordly:daily-plan-changed',
  /** Home / hotkey → App: navigate to daily planning. */
  openPlanning: 'nordly:open-planning',
} as const;
