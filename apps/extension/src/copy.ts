type Key =
  | 'pair'
  | 'connect'
  | 'word'
  | 'translation'
  | 'note'
  | 'locked-note'
  | 'need-note'
  | 'need-code'
  | 'bad-code'
  | 'offline'
  | 'vault_locked'
  | 'note_not_found'
  | 'duplicate'
  | 'saved'
  | 'limit'
  | 'translate-failed'
  | 'no-letters'
  | 'unsupported-script'
  | 'bad-phrase'
  | 'cards-off';

const en: Record<Key, string> = {
  pair: 'Paste the code from Nordly settings, Browser.',
  connect: 'Connect',
  word: 'Word',
  translation: 'Translation',
  note: 'Note',
  'locked-note': 'Locked note',
  'need-note': 'Choose a note.',
  'need-code': 'Paste the pairing code.',
  'bad-code': 'That code was rejected.',
  offline: 'Nordly is closed. The line will wait.',
  vault_locked: 'Unlock Nordly. The line will wait.',
  note_not_found: 'That note is gone. Choose another.',
  duplicate: 'This word is already in the note.',
  saved: 'Saved.',
  limit: 'MyMemory limit reached.',
  'translate-failed': 'MyMemory did not answer.',
  'no-letters': 'Type a word.',
  'unsupported-script': 'Only Russian and English.',
  'bad-phrase': 'This phrase cannot be a card.',
  'cards-off': 'Cards are off in Nordly. The line is still saved.',
};

const ru: Record<Key, string> = {
  pair: 'Вставь код из Nordly: настройки, Браузер.',
  connect: 'Подключить',
  word: 'Слово',
  translation: 'Перевод',
  note: 'Заметка',
  'locked-note': 'Заметка закрыта',
  'need-note': 'Выбери заметку.',
  'need-code': 'Вставь код связки.',
  'bad-code': 'Код не подошёл.',
  offline: 'Nordly закрыт. Строка подождёт.',
  vault_locked: 'Разблокируй Nordly. Строка подождёт.',
  note_not_found: 'Этой заметки нет. Выбери другую.',
  duplicate: 'Это слово уже есть в заметке.',
  saved: 'Сохранено.',
  limit: 'Лимит MyMemory.',
  'translate-failed': 'MyMemory не ответил.',
  'no-letters': 'Напиши слово.',
  'unsupported-script': 'Только русский и английский.',
  'bad-phrase': 'Такую фразу нельзя сделать карточкой.',
  'cards-off': 'Карточки в Nordly выключены. Строка всё равно сохранена.',
};

const dict = navigator.language.toLowerCase().startsWith('ru') ? ru : en;

export function text(key: Key): string {
  return dict[key];
}
