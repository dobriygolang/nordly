import type { Messages } from './ru'
import { legalEn } from './legal.en'

export const en: Messages = {
  locale: {
    label: 'Language',
  },
  common: {
    retry: 'Retry',
    guest: 'Guest',
  },
  public: {
    pricing: 'Pricing',
    liveCoding: 'Live rooms',
    terms: 'Terms',
    privacy: 'Privacy',
    themeLight: 'Light',
    themeDark: 'Dark',
  },
  seo: {
    defaultTitle: 'Calm workspace for builders',
    defaultDescription:
      'Nordly on trynordly.app — notes, daily plan, pomodoro, and browser live collab rooms for people who build.',
    keywords:
      'Nordly, nordly, workspace, notes, tasks, pomodoro, live coding, collaboration, focus, builders',
    madeWith: 'Made with Nordly',
    goHome: 'Go to Nordly',
    pages: {
      welcome: {
        title: 'Calm workspace for builders',
        description:
          'Nordly — notes, daily plan, and pomodoro in one desktop workspace, plus guest live collab rooms in the browser. trynordly.app',
      },
      pricing: {
        title: 'Plans & limits',
        description: 'Free and Pro limits for Nordly — notes, live rooms, code runs, and focus stats.',
      },
      legalTerms: {
        title: 'Terms of Service',
        description: 'Terms of use for Nordly (trynordly.app) — workspace, billing, and live collaboration.',
      },
      legalPrivacy: {
        title: 'Privacy Policy',
        description: 'How Nordly (trynordly.app) processes personal data — account, billing, and live rooms.',
      },
      liveNew: {
        title: 'Live collab rooms',
        description:
          'Create a guest live coding or whiteboard room on Nordly — no account required. Pair in real time.',
      },
      liveRoom: {
        title: 'Live room',
        description: 'Real-time shared editor on Nordly — code or whiteboard with your partner.',
      },
      download: {
        title: 'Download desktop app',
        description: 'Get the latest Nordly desktop app for macOS or Windows.',
      },
      publishedNote: {
        title: '{{title}}',
        description: 'Published note on Nordly (trynordly.app).',
      },
      publishedBoard: {
        title: '{{title}}',
        description: 'Published whiteboard on Nordly (trynordly.app).',
      },
    },
  },
  billing: {
    counters: {
      cloud_notes_count: 'Cloud notes',
      code_runs_per_day: 'Code runs',
      live_rooms_per_month: 'Live rooms',
      live_rooms_concurrent: 'Concurrent live rooms',
      focus_stats_history_days: 'Focus stats history',
    },
  },
  session: {
    editorFormatGoOnly: 'Formatting is available for Go only',
    editorFormatAuthExpired: 'Your session expired. Refresh the page or sign in again.',
    editorRunQuota: 'Daily code run limit reached. Upgrade at /pricing.',
    editorRunProFeature: 'This feature is not available on your current plan.',
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Plans & limits',
    subtitle: 'Compare Free and Pro limits for the Nordly desktop app.',
    limitColumn: 'Limit',
    desktopNote: 'Subscriptions are managed in the desktop app — this page is for reference only.',
  },
  welcome: {
    pill: 'EARLY ACCESS',
    navPhilosophy: 'Philosophy',
    navDownload: 'Download',
    heroLine1: 'Deep focus.',
    heroLine2: 'Beautiful design.',
    heroLine3: 'Made for builders.',
    heroBody:
      'Notes, daily plan, and pomodoro in one calm desktop workspace — plus live collab rooms in the browser.',
    heroLiveCta: 'Start a live room',
    heroPreviewLine1: 'Today · 3 tasks scheduled',
    heroPreviewLine2: 'Notes · weekly plan synced',
    heroPreviewLine3: 'Focus · 25:00 · streak 4',
    preparingDownload: 'Preparing download',
    downloadCta: 'Download app',
    downloadCtaVersion: 'Download app v{{version}}',
    downloadStarted: 'Download started',
    philosophyTitle: 'Our philosophy',
    philosophyBody:
      'Nordly is not another tab in your browser.\n' +
      'It is a workspace for people who build — notes, tasks, and focus in one place.\n' +
      '\n' +
      'You should not jump between Notion, a task app, a timer, and a music player just to start working.\n' +
      'We kept planning, writing, and focus together so getting started takes one keystroke.\n' +
      '\n' +
      'Most tools compete for your attention. Nordly is built to protect it.\n' +
      'We removed what does not help you ship and kept flow, clarity, and calm.\n' +
      '\n' +
      'When you open Nordly, the goal is simple:\n' +
      'feel ready, stay oriented, and finish what matters today.\n' +
      '\n' +
      'Need to pair with someone quickly? Open a live room — no account required.\n' +
      'Need a private vault of notes? Nordly has that too.\n' +
      '\n' +
      'If you care about what you build and how you build it, this is for you.\n' +
      '\n' +
      'Welcome to your workspace.',
    footerCopyright: '© {{year}} Nordly. All rights reserved.',
  },
  live: {
    brand: 'Nordly live',
    loadingRoom: 'Loading room…',
    roomNotFound: 'Room not found',
    createNew: 'Create new',
    dismissError: 'Dismiss',
    guestTitle: 'Join as guest',
    guestDescription: 'Display name in the editor. Access lasts for the session only.',
    name: 'Name',
    namePlaceholder: 'Candidate',
    joinError: 'Join failed',
    joinRoom: 'Join room',
    createOwnRoom: 'Create your own room',
    newEyebrow: 'Live rooms',
    newTitle: 'Real-time shared editor',
    newBody:
      'Create a room without signing up — get an invite link for your partner. Sync via Yjs, code runs via sandbox.',
    newBulletGuest: 'No account — create or join as guest',
    newBulletPair: 'Pair programming with participant cursors',
    newBulletRun: '⌘↵ Run — run code in sandbox',
    newCardTitle: 'New room',
    newCardGuest: 'Name is visible to your partner. No account needed.',
    yourName: 'Your name',
    language: 'Language',
    roomMode: 'Room type',
    roomModeCode: 'Live coding',
    roomModeDiagram: 'Whiteboard',
    diagramRoom: 'Excalidraw',
    createRoom: 'Create room',
    ttlNote: 'Room lives for a few hours. Data is not kept after TTL expires.',
    closeRoom: 'Close room',
    reconnect: 'Reconnect',
    invite: 'Invite',
    inviteCopied: 'Link copied',
    inviteTitle: 'Copy guest invite link',
    settings: 'Settings',
    copyInvite: 'Copy invite link',
    inviteCopiedMenu: 'Invite link copied',
    saveName: 'Save display name',
    themeLight: 'Light theme',
    themeDark: 'Dark theme',
    autocomplete: 'Autocomplete',
    runBy: 'Run by {{name}}',
    runHint: 'Press Run or ⌘↵ to execute code for everyone in the room.',
    roomExpired: 'This room has expired and was removed.',
    run: 'Run',
    running: 'Running…',
    output: 'Output',
    roomLanguage: 'Room language',
    fontDecrease: 'Decrease font size',
    fontIncrease: 'Increase font size',
    timerRemaining: 'Left',
    timerSession: 'Session',
    timerCountdownTitle: 'Room closes when time runs out',
    timerElapsedTitle: 'Current session duration',
    wsLive: 'LIVE',
    wsOffline: 'OFFLINE',
    wsReconnecting: 'RECONNECT…',
    wsConnecting: 'CONNECT…',
  },
  oauth: {
    google: {
      missing: 'Missing OAuth status.',
      successTitle: 'Google Calendar connected',
      successBody: 'Return to the Nordly app — settings will refresh automatically.',
      errorTitle: 'Google Calendar connection failed',
      errorBody: 'Sign-in was cancelled or denied.',
      openApp: 'Open Nordly',
      fallbackHint:
        'If the app does not open, switch back to Nordly manually and tap Refresh in Settings → Integrations.',
    },
    zoom: {
      missing: 'Missing OAuth status.',
      successTitle: 'Zoom connected',
      successBody: 'Return to the Nordly app — settings will refresh automatically.',
      errorTitle: 'Zoom connection failed',
      errorBody: 'Sign-in was cancelled or denied.',
      openApp: 'Open Nordly',
      fallbackHint:
        'If the app does not open, switch back to Nordly manually and tap Refresh in Settings → Integrations.',
    },
  },
  legal: legalEn,
}
