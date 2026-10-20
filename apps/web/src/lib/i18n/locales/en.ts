import { legalEn } from './legal.en'

export const en = {
  common: {
    retry: 'Try again',
    guest: 'Guest',
  },
  public: {
    liveCoding: 'Live rooms',
    terms: 'Terms',
    privacy: 'Privacy',
    themeLight: 'Light',
    themeDark: 'Dark',
  },
  seo: {
    defaultTitle: 'Calm workspace for builders',
    defaultDescription:
      'Nordly on trynordly.app - notes, daily plan, pomodoro, and browser live collab rooms for people who build.',
    keywords:
      'Nordly, nordly, workspace, notes, tasks, pomodoro, live coding, collaboration, focus, builders',
    madeWith: 'Made with Nordly',
    goHome: 'Go to Nordly',
    pages: {
      welcome: {
        title: 'Calm workspace for builders',
        description:
          'Nordly - notes, daily plan, and pomodoro in one desktop workspace, plus guest live collab rooms in the browser. trynordly.app',
      },
      legalTerms: {
        title: 'Terms of use',
        description: 'How you can use Nordly (trynordly.app): the desktop app and live rooms.',
      },
      legalPrivacy: {
        title: 'Privacy',
        description: 'What data Nordly (trynordly.app) keeps for accounts and live rooms.',
      },
      liveNew: {
        title: 'Live rooms',
        description:
          'Start a coding or whiteboard room. No account. Work together in the browser.',
      },
      liveRoom: {
        title: 'Live room',
        description: 'A shared editor on Nordly. Code or a whiteboard with someone else.',
      },
      download: {
        title: 'Download the app',
        description: 'Download Nordly for Mac or Windows.',
      },
      publishedNote: {
        title: '{{title}}',
        description: 'A published note on Nordly.',
        passwordTitle: 'This note needs a password',
        passwordHint: 'Enter the password from the person who shared the note.',
        passwordPlaceholder: 'Password',
        passwordSubmit: 'Open',
        passwordWrong: 'Wrong password.',
      },
      publishedBoard: {
        title: '{{title}}',
        description: 'A published whiteboard on Nordly.',
      },
    },
  },
  session: {
    editorFormatGoOnly: 'Formatting works for Go only',
    editorFormatAuthExpired: 'This visit expired. Refresh the page and join the room again.',
  },
  welcome: {
    pill: 'EARLY ACCESS',
    navPhilosophy: 'Philosophy',
    navDownload: 'Download',
    heroLine1: 'Deep focus.',
    heroLine2: 'Beautiful design.',
    heroLine3: 'Made for builders.',
    heroBody:
      'Notes, daily plan, and pomodoro in one calm desktop workspace - plus live collab rooms in the browser.',
    heroLiveCta: 'Start a live room',
    heroPreviewLine1: 'Today · 3 tasks scheduled',
    heroPreviewLine2: 'Notes · weekly plan synced',
    heroPreviewLine3: 'Focus · 25:00 · streak 4',
    preparingDownload: 'Preparing download',
    downloadCta: 'Download app',
    downloadCtaVersion: 'Download app v{{version}}',
    downloadStarted: 'Download started',
    downloadTitle: 'Download Nordly',
    downloadPickOs: 'Choose an installer for your system.',
    downloadMobileNote:
      'The desktop app is for Mac and Windows. Live rooms work in the browser on iPhone and iPad.',
    downloadUnavailable: 'No installer is available for this release yet.',
    downloadMacApple: 'macOS (Apple silicon)',
    downloadMacIntel: 'macOS (Intel)',
    downloadWindows: 'Windows',
    philosophyTitle: 'Our philosophy',
    philosophyBody:
      'Nordly is not another tab in your browser.\n' +
      'It is a workspace for people who build - notes, tasks, and focus in one place.\n' +
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
      'Need to pair with someone quickly? Open a live room - no account required.\n' +
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
    createNew: 'New room',
    dismissError: 'Close',
    guestTitle: 'Join as a guest',
    guestDescription: 'This name shows up in the editor. It lasts only for this visit.',
    name: 'Name',
    namePlaceholder: 'Alex',
    joinError: 'Could not join',
    joinRoom: 'Join room',
    createOwnRoom: 'Make your own room',
    newEyebrow: 'Live rooms',
    newTitle: 'Work together in the browser',
    newBody:
      'Make a room and send the link. No account. The room lasts up to 3 hours, then it is deleted.',
    newBulletGuest: 'No account. Create or join with a name.',
    newBulletPair: 'You see each other’s cursor.',
    newBulletRun: '⌘↵ runs the code for everyone in the room.',
    newCardTitle: 'New room',
    newCardGuest: 'Your partner sees this name. No account needed.',
    yourName: 'Your name',
    language: 'Language',
    roomMode: 'Room type',
    roomModeCode: 'Code',
    roomModeDiagram: 'Whiteboard',
    diagramRoom: 'Whiteboard',
    createRoom: 'Create room',
    ttlNote: 'The room lasts up to 3 hours. Then it is deleted.',
    closeRoom: 'Close room',
    openBoard: 'Board',
    openCode: 'Code',
    reconnect: 'Reconnect',
    invite: 'Invite',
    inviteCopied: 'Link copied',
    inviteTitle: 'Copy the invite link',
    settings: 'Settings',
    saveName: 'Save name',
    themeLight: 'Light theme',
    themeDark: 'Dark theme',
    autocomplete: 'Autocomplete',
    runBy: 'Run by {{name}}',
    runHint: 'Run or ⌘↵ runs the code for everyone in the room.',
    resizeOutput: 'Resize the output panel',
    roomExpired: 'This room has ended and was deleted.',
    run: 'Run',
    running: 'Running…',
    output: 'Output',
    roomLanguage: 'Room language',
    fontDecrease: 'Smaller text',
    fontIncrease: 'Larger text',
    timerRemaining: 'Left',
    timerSession: 'Session',
    timerCountdownTitle: 'The room closes when the time runs out',
    timerElapsedTitle: 'How long this session has been open',
    wsLive: 'LIVE',
    wsOffline: 'OFFLINE',
    wsReconnecting: 'RECONNECT…',
    wsConnecting: 'CONNECT…',
    wsClosed: 'CLOSED',
  },
  oauth: {
    google: {
      missing: 'Sign-in did not finish.',
      successTitle: 'Google Calendar connected',
      successBody: 'Go back to Nordly. Settings will update on their own.',
      errorTitle: 'Could not connect Google Calendar',
      errorBody: 'Sign-in was cancelled or blocked.',
      openApp: 'Open Nordly',
      fallbackHint:
        'If Nordly does not open, switch to it and press Refresh in Settings, then Integrations.',
    },
    zoom: {
      missing: 'Sign-in did not finish.',
      successTitle: 'Zoom connected',
      successBody: 'Go back to Nordly. Settings will update on their own.',
      errorTitle: 'Could not connect Zoom',
      errorBody: 'Sign-in was cancelled or blocked.',
      openApp: 'Open Nordly',
      fallbackHint:
        'If Nordly does not open, switch to it and press Refresh in Settings, then Integrations.',
    },
    spotify: {
      missing: 'Sign-in did not finish.',
      successTitle: 'Spotify connected',
      successBody: 'Go back to Nordly. Settings will update on their own.',
      errorTitle: 'Could not connect Spotify',
      errorBody: 'Sign-in was cancelled or blocked.',
      openApp: 'Open Nordly',
      fallbackHint:
        'If Nordly does not open, switch to it and press Connect again in Settings, then Integrations.',
    },
  },
  legal: legalEn,
}
