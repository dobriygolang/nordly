import { legalRu } from './legal.ru'

export const ru = {
  locale: {
    label: 'Язык',
  },
  common: {
    retry: 'Повторить',
    guest: 'Guest',
  },
  public: {
    pricing: 'Тарифы',
    liveCoding: 'Live-комнаты',
    terms: 'Условия',
    privacy: 'Конфиденциальность',
    themeLight: 'Светлая',
    themeDark: 'Тёмная',
  },
  seo: {
    defaultTitle: 'Спокойный workspace для тех, кто строит',
    defaultDescription:
      'Nordly на trynordly.app — заметки, план на день, pomodoro и live-комнаты в браузере для тех, кто создаёт продукты.',
    keywords:
      'Nordly, nordly, workspace, заметки, задачи, pomodoro, live coding, коллаборация, фокус',
    madeWith: 'Сделано в Nordly',
    goHome: 'Перейти на Nordly',
    pages: {
      welcome: {
        title: 'Спокойный workspace для тех, кто строит',
        description:
          'Nordly — заметки, план на день и pomodoro в desktop-приложении, плюс guest live-комнаты в браузере. trynordly.app',
      },
      pricing: {
        title: 'Тарифы и лимиты',
        description: 'Free и Pro для Nordly — заметки, live-комнаты, запуски кода и focus-статистика.',
      },
      legalTerms: {
        title: 'Условия использования',
        description: 'Условия использования Nordly (trynordly.app) — workspace, биллинг и live-коллаборация.',
      },
      legalPrivacy: {
        title: 'Политика конфиденциальности',
        description: 'Как Nordly (trynordly.app) обрабатывает персональные данные — аккаунт, биллинг и live-комнаты.',
      },
      liveNew: {
        title: 'Live-комнаты',
        description:
          'Создай guest live-комнату для кода или whiteboard на Nordly — без регистрации. Работайте вместе в реальном времени.',
      },
      liveRoom: {
        title: 'Live-комната',
        description: 'Общий редактор в реальном времени на Nordly — код или whiteboard с напарником.',
      },
      download: {
        title: 'Скачать desktop-приложение',
        description: 'Последняя версия desktop-приложения Nordly для macOS и Windows.',
      },
      publishedNote: {
        title: '{{title}}',
        description: 'Опубликованная заметка на Nordly (trynordly.app).',
      },
      publishedBoard: {
        title: '{{title}}',
        description: 'Опубликованная доска на Nordly (trynordly.app).',
      },
    },
  },
  billing: {
    counters: {
      cloud_notes_count: 'Облачные заметки',
      code_runs_per_day: 'Запуски кода',
      live_rooms_per_month: 'Live-комнаты',
      live_rooms_concurrent: 'Одновременные live-комнаты',
      focus_stats_history_days: 'История focus-статистики',
    },
  },
  session: {
    editorFormatGoOnly: 'Форматирование доступно только для Go',
    editorFormatAuthExpired: 'Сессия авторизации истекла. Обновите страницу или войдите снова.',
    editorRunQuota: 'Дневной лимит запусков кода исчерпан. Обновите план на /pricing.',
    editorRunProFeature: 'Эта функция недоступна на текущем плане.',
  },
  pricing: {
    eyebrow: 'Тарифы',
    title: 'Планы и лимиты',
    subtitle: 'Сравнение лимитов Free и Pro в desktop-приложении Nordly.',
    limitColumn: 'Лимит',
    desktopNote: 'Подписка оформляется в desktop-приложении — эта страница только для справки.',
  },
  welcome: {
    pill: 'РАННИЙ ДОСТУП',
    navPhilosophy: 'Философия',
    navDownload: 'скачать',
    heroLine1: 'Глубокий фокус.',
    heroLine2: 'Красивый дизайн.',
    heroLine3: 'Для тех, кто строит.',
    heroBody:
      'Заметки, план на день и pomodoro в одном спокойном desktop-приложении — плюс live-комнаты в браузере.',
    heroLiveCta: 'Создать live-комнату',
    heroPreviewLine1: 'Сегодня · 3 задачи в плане',
    heroPreviewLine2: 'Заметки · недельный план синхронизирован',
    heroPreviewLine3: 'Фокус · 25:00 · streak 4',
    preparingDownload: 'Готовим загрузку',
    downloadCta: 'Скачать приложение',
    downloadCtaVersion: 'Скачать приложение v{{version}}',
    downloadStarted: 'Загрузка началась',
    philosophyTitle: 'Наша философия',
    philosophyBody:
      'Nordly — не ещё одна вкладка в браузере.\n' +
      'Это workspace для тех, кто строит: заметки, задачи и фокус в одном месте.\n' +
      '\n' +
      'Не нужно прыгать между Notion, таск-трекером, таймером и музыкой, чтобы просто начать работу.\n' +
      'Мы собрали планирование, writing и focus вместе — старт в одно нажатие.\n' +
      '\n' +
      'Большинство инструментов борются за ваше внимание. Nordly защищает его.\n' +
      'Мы убрали лишнее и оставили поток, ясность и спокойствие.\n' +
      '\n' +
      'Когда вы открываете Nordly, цель простая:\n' +
      'быть готовым, держать ориентир и закрывать важное сегодня.\n' +
      '\n' +
      'Нужно быстро поработать в паре? Откройте live-комнату — аккаунт не нужен.\n' +
      'Нужен личный vault заметок? В Nordly он тоже есть.\n' +
      '\n' +
      'Если вам важно, что вы строите и как вы это делаете — это для вас.\n' +
      '\n' +
      'Добро пожаловать в ваш workspace.',
    footerCopyright: '© {{year}} Nordly. Все права защищены.',
  },
  live: {
    brand: 'Nordly live',
    loadingRoom: 'Загрузка комнаты…',
    roomNotFound: 'Комната не найдена',
    createNew: 'Создать новую',
    dismissError: 'Закрыть',
    guestTitle: 'Вход как гость',
    guestDescription: 'Имя для отображения в редакторе. Доступ только на время сессии.',
    name: 'Имя',
    namePlaceholder: 'Кандидат',
    joinError: 'Ошибка входа',
    joinRoom: 'Войти в комнату',
    createOwnRoom: 'Создать свою комнату',
    newEyebrow: 'Live-комнаты',
    newTitle: 'Общий редактор в реальном времени',
    newBody:
      'Создай комнату без регистрации — получишь ссылку-приглашение для напарника. Синхронизация через Yjs, запуск кода через sandbox.',
    newBulletGuest: 'Без аккаунта — создайте или войдите как гость',
    newBulletPair: 'Pair programming с курсорами участников',
    newBulletRun: '⌘↵ Run — проверка кода в sandbox',
    newCardTitle: 'Новая комната',
    newCardGuest: 'Имя видно напарнику в редакторе. Аккаунт не нужен.',
    yourName: 'Ваше имя',
    language: 'Язык',
    roomMode: 'Тип комнаты',
    roomModeCode: 'Live coding',
    roomModeDiagram: 'Whiteboard',
    diagramRoom: 'Excalidraw',
    createRoom: 'Создать комнату',
    ttlNote: 'Комната живёт несколько часов. Данные не сохраняются после истечения TTL.',
    closeRoom: 'Закрыть комнату',
    reconnect: 'Переподключить',
    invite: 'Пригласить',
    inviteCopied: 'Ссылка скопирована',
    inviteTitle: 'Скопировать ссылку для гостя',
    settings: 'Настройки',
    copyInvite: 'Скопировать invite',
    inviteCopiedMenu: 'Invite скопирован',
    saveName: 'Сохранить имя',
    themeLight: 'Светлая тема',
    themeDark: 'Тёмная тема',
    autocomplete: 'Автодополнение',
    runBy: 'Запуск: {{name}}',
    runHint: 'Нажмите Run или ⌘↵ — код выполнится для всех в комнате.',
    roomExpired: 'Комната истекла и была удалена.',
    run: 'Run',
    running: 'Running…',
    output: 'Вывод',
    roomLanguage: 'Язык комнаты',
    fontDecrease: 'Уменьшить шрифт',
    fontIncrease: 'Увеличить шрифт',
    timerRemaining: 'Осталось',
    timerSession: 'Сессия',
    timerCountdownTitle: 'Комната будет закрыта по истечении времени',
    timerElapsedTitle: 'Длительность текущей сессии',
    wsLive: 'LIVE',
    wsOffline: 'OFFLINE',
    wsReconnecting: 'RECONNECT…',
    wsConnecting: 'CONNECT…',
  },
  legal: legalRu,
} as const

type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]>
}

export type Messages = DeepStringRecord<typeof ru>
