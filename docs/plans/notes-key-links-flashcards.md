# План: синк заметок, `[[ключ:значение]]`, карточки для повторения, баги блоков кода и live-доски

Статус: в работе (2026-10-20). **Сделано: PR 0a** — согласие на синк заметок, гейт отправки и скачивания, настройки «Синхронизация», карточка и статус в заметках, публикация закрыта, пока синк выключен. Дальше по порядку: безопасность E2EE (0s), индекс и сверка (0b), блоки кода, `[[ключ:значение]]`, карточки, live-доска.

**Пользователей нет — обратная совместимость не нужна.** Старое поведение заменяем целиком, без переходных путей. Это прямо требует fail-fast: «не сохранять совместимость с неотгруженным поведением». Следствия:

- нет миграций согласия, `id_map` и форматов шифротекста;
- нет двойного чтения v1/v2;
- IndexedDB поднимается до новой версии с удалением устаревших данных, а не с переносом;
- API сервиса notes меняется сразу в нужную форму. Приложение и сервер выкатываются вместе; отдельной проверки версии клиента нет;
- данные на prod-сервере (заметки, `note_links`, соль vault) сбрасываются один раз перед выкладкой PR 0s. Это необратимое действие — выполняется вручную по `deploy/RUNBOOK.md`, после подтверждения.

Порядок работ:

1. **Синхронизация заметок: явное согласие** (раздел 5) и **безопасность E2EE** (раздел 7) — заметки сейчас уходят на сервер без спроса, часто открытым текстом, а включение шифрования не перешифровывает уже отправленное. Это приватность, поэтому первым.
2. Баги блоков кода в редакторе заметок — мешают каждый день, чинятся локально.
3. Единый синтаксис `[[ключ:значение]]` + `[[link:…]]` — фундамент для всего остального.
4. Карточки `front :: back` с интервальным повторением (локально, без бэкенда).
5. Live-доска app + web — самая большая часть, отдельный PR.

---

## 0. Архитектура и правки

Общая картина для всех разделов: какие правила уже действуют, что меняется в ADR, где живёт новый код, какие интерфейсы между слоями. Детали поведения — в разделах 1–6; здесь только форма кода.

### 0.1. Правила, на которые опираемся

| Источник | Что требует | Как применяем |
|----------|-------------|---------------|
| ADR 001 local-first | Локальная запись первой; outbox; облако гейтится через `isCloudEnabled()` / `isSyncEnabled()` | Добавляется третий гейт — согласие `isNotesSyncEnabled()`, только для заметок. Задачи и фокус не меняются |
| ADR 003 границы | `repository` = IndexedDB, `remote` = HTTP, `sync` = координация, `api` = публичный фасад. Pages/widgets импортируют только `api/`, `hooks/`, `lib/`, `components/` | Каждая новая фича раскладывается по этим слоям. Исключение «`VaultSection` импортирует notes sync» **удаляется**: новая секция идёт через `features/notes/api/notesSync.ts` |
| ADR 005 vault | Папка — источник правды; outbox `vault` по относительному пути | Сохраняется. §5 (Sync shape) дополняется согласием, индексом и сверкой — ADR 006 |
| fail-fast | Без тихих фолбэков; ошибки видимы; без совместимости с неотгруженным поведением | Старые форматы и пути удаляются, а не мигрируются; при недоступном корне папки синк останавливается с ошибкой, а не удаляет; битая картинка показывает причину |
| `apps/nordly/docs/engineering.md` | HTTP только через `apiFetch`; строгие JSON-ридеры `shared/api/json.ts` | Новые remote-вызовы (список заметок для мастера) — через существующий `notesRemote.ts` |

### 0.2. Новые и обновлённые ADR (`apps/nordly/docs/architecture/`)

Пишутся в том же PR, что и код.

| ADR | PR | Суть |
|-----|----|------|
| **006-notes-sync-consent.md** | 0a, 0b | Согласие на устройство; статусы; мастер; индекс `vault_sync_index`; таблица сверки (0.5); защита от массового удаления. Заменяет §5 ADR 005 и уточняет ADR 001 для домена `vault` |
| 002 (правка) | 0s | Параметры KDF с версией, конверт v2 (путь и тело под одним AES-GCM), запрет незашифрованных заметок при pull, перешифровка при включении (раздел 7) |
| 005 (правка) | 0b | §5 → ссылка на 006; убрать неверную фразу «Publish-to-web reads relative vault images via FS» или сделать её правдой (I9) |
| **007-wiki-targets.md** | 2 | `[[ключ:значение]]`: реестр ключей, правила разбора, вставки `![[…]]`, общий модуль для app и web |
| **008-flashcards.md** | 3 | Синтаксис `::` / `:::`, ключ карточки, хранение только прогресса, без синка |
| **009-live-whiteboard-desktop.md** | 4 | Desktop как участник live-комнаты; комната — правда на время сессии; финальная запись в локальную доску; общий `apps/shared/collab` |

Блоки кода (PR 1) и картинки (PR 1b) — без ADR, это исправления.

### 0.3. Карта модулей

`+` — новый файл, `~` — изменения, `−` — удалить. Пути от `apps/nordly/src/renderer/src/`, если не указано иное.

**Синк заметок (PR 0a, 0b)**

```
features/notes/
  repository/
    + notesSyncPrefsStore.ts     # meta `${userId}::notes_sync` { enabled, enabledAt, hintDismissed }
    + vaultSyncIndexStore.ts     # store `vault_sync_index` (0b)
  lib/
    + notesSyncConsent.ts        # кэш согласия в памяти + subscribe (по образцу shared/crypto/vaultPrefs.ts)
    + vaultReconcilePlan.ts      # ЧИСТАЯ функция: (local, index, remote) → действия (0b)
    − notesCloudPolicy.ts        # заменяется согласием
  sync/
    ~ vaultFileSync.ts           # становится исполнителем плана сверки; гейт isNotesSyncEnabled()
    + vaultReconcile.ts          # собирает снимки, вызывает план, исполняет (0b)
  vault/
    ~ vaultOutbox.ts             # enqueue только при isNotesSyncEnabled(); удалить VAULT_FILE_SYNC_READY (всегда true)
  api/
    + notesSync.ts               # ПУБЛИЧНЫЙ фасад для pages (0.4)
    − notesCapabilities.ts       # заменяется notesSync.ts
    ~ notesClient.ts             # publish: гейт согласия, serverId из индекса, картинки из папки (I9)
  hooks/
    + useNotesSyncStatus.ts      # подписка на статус для UI

app/
  ~ syncRegistry.ts              # pullVault/pushVault через гейт; убрать pushNotesWhenAvailable/pullNotesWhenAvailable
  ~ bootstrap                    # loadNotesSyncConsent после loadVaultPrefs

shared/
  ~ db/nordlyDb.ts               # DB_VERSION 6, store `vault_sync_index` + индекс userId (0b)
  + model/settingsNav.ts         # SettingsSectionId + SettingsHighlightId (перенос из pages/Settings/index.tsx)
  ~ lib/custom-events.ts         # openSettings → CustomEvent<{ section?, highlight? }>

pages/
  Settings/
    ~ index.tsx                  # SectionId из shared; Vault → Sync; принимает section/highlight
    + sections/SyncSection.tsx   # строка «Синхронизировать заметки» + статус + блок шифрования
    + sections/sync/EnableNotesSyncWizard.tsx
    ~ sections/VaultSection.tsx  # → EncryptionBlock внутри SyncSection; без прямого импорта notes sync
  Notes/
    + NotesSyncHintCard.tsx      # мягкая карточка
    + NotesSyncStatusLine.tsx    # статус в футере сайдбара
    ~ VaultOnboarding.tsx        # строка «в облаке N заметок» (без автоскачивания)
    ~ NoteRowMenu.tsx / NoteRow.tsx  # publishBlocked: { reason } вместо ошибки после клика
    ~ useNotesPageActions.ts     # requirePublishCloud → notesSync.requirePublishAllowed()
widgets/
  ~ (без изменений SyncStatusBanner — карточка заметок живёт в pages/Notes)
```

**Блоки кода и картинки (PR 1, 1b)**

```
shared/lib/codemirror/
  + fences.ts                    # parseOpeningFence (любая info string), ownsClosingFence — чистые функции
  ~ notesKeymap.ts               # Enter-автозакрытие через fences.ts; − fenceAutoCloseInput
  ~ notesCodeLanguages.ts        # normalizeNotesCodeLang: точное совпадение первого слова
  + imageEmbedField.ts           # StateField с block-виджетами картинок (вынос из livePreview)
  ~ livePreview.ts               # − MarkdownImageWidget/applyImageInline; только hideRange исходника
shared/ui/
  ~ LiveMarkdownEditor.tsx       # − fenceAutoCloseInput; + imageEmbedField; contentAttributes
apps/nordly/src-tauri/src/
  + macos_text.rs                # отключение подстановок macOS (если H1 подтвердится)
features/notes/vault/
  ~ resolveVaultImage.ts         # типизированная ошибка { code: not_found | bad_type | too_large | vault_locked }
```

**`[[ключ:значение]]` (PR 2)**

```
apps/shared/markdown/            # общий модуль app + web (алиас @nordly-markdown, как @nordly-i18n)
  + wikiTarget.ts                # parseWikiTarget, реестр ключей, проверка URL
  + proseLines.ts                # сканер «строки вне кода» (для wikiLinks и карточек)
shared/lib/
  ~ wikiLinkText.ts              # − BOARD_WIKI_PREFIX, boardTitleFromWikiLink, boardWikiTitleSpan
  ~ codemirror/livePreview.ts    # applyWikiLinkInline → по WikiTarget.kind
  ~ codemirror/wikiLinkAutocomplete.ts  # ключи + заголовки досок
shared/ui/
  ~ LiveMarkdownEditor.tsx       # onWikiLinkClick(linkText) → onWikiTargetClick(target: WikiTarget); клик по [text](url)
features/notes/
  ~ lib/wikiLinks.ts             # extractWikiLinks: только kind === 'note'; сканер из proseLines
  + vault/resolveVaultEmbed.ts   # ![[name]]: относительно заметки → по имени во всём vault
pages/Notes/
  ~ useNotesPageActions.ts       # handleWikiTargetClick: switch по kind
apps/nordly/src-tauri/src/
  ~ notes_vault_*                # + команда поиска файла по имени (для ![[name]])
apps/web/src/lib/markdown/
  ~ renderNordlyMarkdown.ts      # через @nordly-markdown/wikiTarget
```

**Карточки (PR 3)**

```
features/cards/
  lib/
    + parseCards.ts              # (noteId, title, bodyMd) → { cards, issues }; использует proseLines
    + cardKey.ts                 # нормализация front + хэш
    + scheduleReview.ts          # SM-2: (state, grade, today) → state
  repository/
    + cardReviewsStore.ts        # store `card_reviews`; meta `${userId}::cards_daily::{date}`
  api/
    + cardsClient.ts             # buildDecks(), listDue(deck?), grade(cardKey, grade)
  hooks/
    + useDueCount.ts
  components/
    + ReviewCard.tsx
pages/
  + Cards/CardsReviewPage.tsx    # PageStack-страница
shared/
  ~ model/navigation.ts          # PageId.Cards; в Palette, не в Dock
  ~ model/settings.ts            # NordlySettings.flashcards { enabled, dailyNewLimit } — обязательное поле парсера
  ~ db/nordlyDb.ts               # DB_VERSION 7, store `card_reviews`
  ~ lib/codemirror/livePreview.ts  # стили строк `::`
```

Карточки читают заметки только через `features/notes/api` (список + тело). Прямого доступа к `vault/` или `repository/` заметок нет.

**Live-доска (PR 4)**

```
apps/shared/collab/              # алиас @nordly-collab в app и web
  + excalidrawYjsDoc.ts          # перенос из apps/web/src/lib/collab/
  + wsProtocol.ts                # типы конверта + строгий разбор (snapshot/op/presence/cursor/room_closed)
  + collabSocket.ts              # подключение, коды закрытия, ретраи (из apps/web/src/lib/ws/collabEditor.ts)
  + excalidrawChrome.css         # единый список скрытых элементов Excalidraw для app и web
features/whiteboard/
  live/
    + liveSession.ts             # состояние сессии: roomId, token, expiresAt, Y.Doc, сокет
    + bindExcalidraw.ts          # Excalidraw onChange ↔ Y.Doc
  remote/whiteboardRemote.ts     # без изменений (share уже возвращает токен)
  api/
    ~ whiteboardClient.ts        # + startLiveShare(boardId), stopLiveShare(); share больше не выбрасывает токен
  hooks/
    + useLiveShareState.ts
pages/Whiteboard/
  ~ WhiteboardPage.tsx           # бейдж Live, Stop sharing; handleShareLive → startLiveShare
apps/nordly/
  ~ package.json                 # + yjs, y-protocols (версии как в apps/web)
  ~ vite.config.ts               # алиас @nordly-collab; resolve.dedupe: ['yjs']
  ~ src-tauri/tauri.conf.json    # CSP connect-src: wss://trynordly.app (+ ws://localhost:8087 для dev)
apps/web/
  ~ vite.config.ts               # алиас @nordly-collab; resolve.dedupe: ['yjs']
  − src/lib/collab/excalidrawYjsDoc.ts   # переехал
  ~ src/lib/ws/collabEditor.ts   # использует @nordly-collab
```

Риск сборки: файлы в `apps/shared/*` импортируют пакеты (`yjs`, `react`) без своего `node_modules`. До переноса проверить, что голые импорты разрешаются из обоих приложений. `resolve.dedupe` обязателен: две копии `yjs` в бандле ломают синхронизацию без явной ошибки.

### 0.4. Ключевые интерфейсы

**Публичный фасад синка заметок** — `features/notes/api/notesSync.ts`:

```ts
export type NotesSyncStatus =
  | { kind: 'unavailable'; reason: 'local_build' | 'signed_out' }
  | { kind: 'off'; hintDismissed: boolean }
  | { kind: 'paused'; reason: 'encryption_locked' | 'vault_root_missing' }
  | { kind: 'syncing'; done: number; total: number }
  | { kind: 'synced'; at: Date; encrypted: boolean }
  | { kind: 'error'; message: string };

export interface NotesSyncEnablePlan {
  folder: string;
  localNoteCount: number;
  remoteNoteCount: number;          // > 0 → шаг «объединить / другая папка»
}

export function isNotesSyncEnabled(): boolean;      // isSyncEnabled() && consent.enabled
export function getNotesSyncStatus(): NotesSyncStatus;
export function subscribeNotesSyncStatus(cb: (s: NotesSyncStatus) => void): () => void;
export function planNotesSyncEnable(): Promise<NotesSyncEnablePlan>;
export function enableNotesSync(opts: { encrypt: boolean }): Promise<void>; // шифрование настраивается до вызова
export function disableNotesSync(): Promise<void>;  // стоп + очистка outbox `vault`
export function dismissNotesSyncHint(): Promise<void>;
export function requirePublishAllowed(): { ok: true } | { ok: false; reason: 'sync_off' | 'encryption_locked' };
```

Все места, которые сейчас решают «можно ли в облако» для заметок (`vaultOutbox`, `vaultFileSync`, `notesClient` publish, `syncRegistry`), спрашивают только `isNotesSyncEnabled()`. Других проверок нет.

**Навигация в настройки с подсветкой** — `shared/model/settingsNav.ts`:

```ts
export const SettingsSectionId = { General: 'general', Integrations: 'integrations',
  FilesLinks: 'files_links', Sync: 'sync', Shortcuts: 'shortcuts', About: 'about' } as const;
export const SettingsHighlightId = { NotesSync: 'notes_sync', Flashcards: 'flashcards' } as const;
export interface OpenSettingsDetail { section?: SettingsSectionId; highlight?: SettingsHighlightId }
```

`NORDLY_EVENTS.openSettings` становится `CustomEvent<OpenSettingsDetail>`; `useAppNavigation` передаёт detail в `SettingsPage`. Существующий вызов из `Editor.tsx` (разблокировка) → `{ section: 'sync' }`.

**Wiki targets** — `apps/shared/markdown/wikiTarget.ts`:

```ts
export type WikiTarget =
  | { kind: 'note'; title: string }
  | { kind: 'board'; title: string }
  | { kind: 'link'; url: string }
  | { kind: 'invalid'; key: string; reason: 'bad_url' | 'empty_value' };

export interface WikiMatch { from: number; to: number; target: WikiTarget; alias: string | null; embed: boolean; width: number | null }
export function parseWikiTarget(raw: string): WikiTarget;
export function findWikiMatches(lineText: string): WikiMatch[];  // одна regex на всех потребителей
```

**Карточки** — `features/cards/`:

```ts
export interface ParsedCard { key: string; front: string; back: string; noteId: string; line: number; direction: 'forward' | 'reverse' }
export interface CardIssue { noteId: string; line: number; reason: 'empty_front' | 'empty_back' }
export interface ReviewState { due: string; intervalDays: number; ease: number; reps: number; lapses: number }
export type Grade = 'again' | 'hard' | 'good' | 'easy';
export function scheduleReview(prev: ReviewState | null, grade: Grade, today: string): ReviewState;
```

**Live-доска** — `features/whiteboard/api/whiteboardClient.ts`:

```ts
export type LiveShareState =
  | { kind: 'idle' }
  | { kind: 'connecting'; boardId: string }
  | { kind: 'live'; boardId: string; inviteUrl: string; participants: number }
  | { kind: 'ended'; boardId: string; reason: 'stopped' | 'room_closed' | 'token_expired' | 'error'; message?: string };

export function startLiveShare(boardId: string): Promise<{ inviteUrl: string }>;
export function stopLiveShare(): Promise<void>;      // финальная сцена из Y.Doc → локальная доска
```

### 0.5. Сверка vault ↔ сервер (ядро PR 0b)

`vaultReconcilePlan.ts` — чистая функция, тестируется таблицей без IndexedDB и сети:

```ts
interface LocalFile   { path: string; hash: string }
interface IndexEntry  { path: string; serverId: string; hash: string; remoteUpdatedAt: string }
interface RemoteNote  { serverId: string; path: string; updatedAt: string }  // path известен после decrypt
type Action =
  | { op: 'push_put'; path: string } | { op: 'push_delete'; path: string; serverId: string }
  | { op: 'pull_write'; path: string; serverId: string } | { op: 'pull_trash'; path: string }
  | { op: 'conflict_copy'; path: string; serverId: string } | { op: 'index_only'; entry: IndexEntry }
  | { op: 'index_drop'; path: string };

export function planVaultReconcile(local: LocalFile[], index: IndexEntry[], remote: RemoteNote[]):
  { ok: true; actions: Action[] } | { ok: false; reason: 'local_root_empty_but_index_full' };
```

Правила (L — файл в папке, I — индекс, R — сервер; «изменён» = отличается от I):

| L | I | R | Условие | Действие |
|---|---|---|---------|----------|
| ✓ | ✓ | ✓ | L и R не изменены | — |
| ✓ | ✓ | ✓ | изменён только L | `push_put` |
| ✓ | ✓ | ✓ | изменён только R | `pull_write` |
| ✓ | ✓ | ✓ | изменены оба | `conflict_copy` (обе версии сохраняются) |
| ✓ | — | — | новый локальный | `push_put` |
| — | — | ✓ | новый удалённый | `pull_write` |
| ✓ | — | ✓ | первое объединение | одинаковое содержимое → `index_only`, иначе `conflict_copy` |
| — | ✓ | ✓ | R не изменён | `push_delete` (удалён в Finder) |
| — | ✓ | ✓ | R изменён | `pull_write` (правка важнее удаления) |
| ✓ | ✓ | — | L не изменён | `pull_trash` (удалён на другом устройстве) |
| ✓ | ✓ | — | L изменён | `push_put` |
| — | ✓ | — | — | `index_drop` |

Защита: если в папке 0 файлов, а в индексе > 0 — план возвращает `ok: false`, синк встаёт со статусом `paused / vault_root_missing`. Ни одного удаления.

E2EE: путь удалённой заметки зашифрован в `title`. Для `serverId` из индекса путь известен; для новых `serverId` нужен `GET` + decrypt. Без разблокировки — `paused / encryption_locked`, план не строится.

### 0.6. Схема хранения (сводно)

| Где | Ключ | PR | Содержимое |
|-----|------|----|------------|
| `meta` | `${userId}::notes_sync` | 0a | `{ enabled, enabledAt, hintDismissed }` |
| store `vault_sync_index` (v6) | `${userId}::${path}` | 0b | `{ userId, path, serverId, hash, remoteUpdatedAt }` |
| `id_map` домен `vault` | — | 0b | удаляется в апгрейде v6 (не переносится); маппинг путей живёт только в `vault_sync_index` |
| store `card_reviews` (v7) | `${userId}::${cardKey}` | 3 | `ReviewState` + `front`, `lastReviewedAt`, `updatedAt` |
| `meta` | `${userId}::cards_daily::{YYYY-MM-DD}` | 3 | `{ reviewed, new }` |
| `localStorage` `NordlySettings` | `flashcards` | 3 | `{ enabled, dailyNewLimit }` |

Апгрейды IndexedDB только вперёд, в `onupgradeneeded` по `oldVersion`. Устаревшие данные удаляются (записи `id_map` домена `vault`, outbox домена `vault`), а не переносятся. Первая синхронизация после апгрейда — это обычное «первое объединение» из таблицы 0.5.

### 0.7. Что удаляется

- `features/notes/lib/notesCloudPolicy.ts`, `api/notesCapabilities.ts`, `NotesCloudCapabilityError` и длинное сообщение про IndexedDB.
- `pushNotesWhenAvailable` / `pullNotesWhenAvailable` в `app/syncRegistry.ts` — заменяются гейтом согласия.
- `VAULT_FILE_SYNC_READY` (константа всегда `true`).
- Документированное исключение ADR 003 «VaultSection импортирует notes sync».
- `fenceAutoCloseInput` и автозакрытие при наборе.
- `BOARD_WIKI_PREFIX` и board-хелперы в `wikiLinkText.ts`.
- `MarkdownImageWidget` как inline-replace.
- `apps/web/src/lib/collab/excalidrawYjsDoc.ts` (переезжает в `apps/shared/collab`).

### 0.8. Тесты по слоям

| Слой | Чем | Примеры |
|------|-----|---------|
| Чистые функции | Vitest, таблицы | `planVaultReconcile`, `parseWikiTarget`, `parseCards`, `scheduleReview`, `fences.ts` |
| repository | Vitest + fake-indexeddb (как в существующих тестах) | `notesSyncPrefsStore`, `vaultSyncIndexStore`, апгрейд v5 → v6 → v7 |
| sync / api | моки `remote/` | гейт согласия: выкл → ноль сетевых вызовов; исполнитель сверки |
| CodeMirror | `EditorState` + декорации | fences, картинки как block-виджеты, wiki targets |
| Архитектура | существующие architecture tests | pages не импортируют `features/*/sync|repository|remote`; исключение VaultSection удалено |
| Ручные | Tauri `.app` | чеклисты разделов 4 и 6, мастер включения синка на двух устройствах |

---

## 1. Баги блоков кода (```` ``` ````)

Код: `apps/nordly/src/renderer/src/shared/lib/codemirror/notesKeymap.ts` (`fenceAutoCloseInput`, `completeFenceOnEnter`), `notesCodeLanguages.ts`, `livePreview.ts`.

### Что найдено в коде

| # | Баг | Где | Как воспроизвести |
|---|-----|-----|-------------------|
| B1 | Нельзя набрать язык длиннее одной буквы, если открывающий fence ещё не закрыт: второй символ уходит в тело блока | `fenceAutoCloseInput`, ветка `if (parsed.lang) { … openFenceBlock(view, line, parsed.fence, text) }` | Строка ```` ```t ```` без закрывающего fence → набрать `e` → получаем ```` ```t ```` и `e` внутри блока. Ломает `text`, `bash`, `json`, `sql`, `yaml` |
| B2 | Автозакрытие срабатывает на префиксе известного языка | та же функция, ветка `isExactKnownLang(nextParsed.lang) && !isExactKnownLang(parsed.lang)` | ```` ```py ```` закрывается до `python` (`thon` уходит в код); ```` ```go ```` до `golang`; ```` ```js ```` до `json`; ```` ```ts ```` до `tsx` |
| B3 | Info string со словами после языка не распознаётся | `parseOpeningFence`: `/^(`{3,})([\w-]*)\s*$/` | ```` ```go main.go ```` + Enter → блок не закрывается, курсор не прыгает внутрь (подсветка при этом работает — lezer понимает такую строку) |
| B4 | Незакрытый ```` ``` ```` над существующим блоком «съедает» его: lezer спаривает новый fence с чужим закрывающим, `openingFenceIsComplete` возвращает `true`, автозакрытие не срабатывает, остаток заметки инвертируется (код ↔ текст) | `openingFenceIsComplete` | Заметка с готовым блоком ниже; выше набрать ```` ``` ```` |
| B5 | Нельзя написать однострочный ```` ```x``` ```` и нельзя отменить только автозакрытие: вставка закрывающего fence и набранный символ — одна транзакция, `⌘Z` откатывает оба | `fenceAutoCloseInput` (один `dispatch` с текстом + fence) | Набрать третий `` ` `` → `⌘Z` |
| B6 | Угадывание языка по подстроке | `normalizeNotesCodeLang`: `raw.startsWith('go')`, `raw.includes('python')` | ```` ```gotmpl ````, ```` ```google ```` → бейдж `go` и Go-подсветка |

### Гипотезы (нужен ручной repro перед фиксом)

| # | Гипотеза | Почему похоже | Как проверить |
|---|----------|---------------|---------------|
| H1 | «Автоковычки» = системная подстановка умных кавычек/тире macOS в WKWebView (Tauri). `"` → `“ ”`, `'` → `’`, `--` → `—` прямо в коде | В Chrome (`npm run dev:vite`) не воспроизводится; в `src-tauri` нет отключения `NSAutomaticQuoteSubstitutionEnabled` | В `.app` набрать `"x"` в блоке кода и в обычной строке; сравнить с `dev:vite` в Chrome. Проверить «Системные настройки → Клавиатура → Текст → Смарт-кавычки» вкл/выкл |
| H2 | Мёртвые клавиши / IME (раскладки «ABC – Extended», «US International», переключение с русской) — `` ` `` приходит через composition, `inputHandler` не видит третий backtick → строка остаётся незакрытой → включаются B1/B2 | Объясняет, почему баги «плавают» | Набрать ```` ```text ```` на разных раскладках |

### Решение

Переделать автозакрытие на одно предсказуемое правило (как GitHub, Obsidian, VS Code):

1. **Автозакрытие только по Enter** в конце строки открывающего fence. Удалить автозакрытие при наборе (третий backtick, «дописал известный язык», «первый символ кода»). Это убирает B1, B2, B5 и делает H2 безвредной.
2. `parseOpeningFence`: принимать любую info string — `/^(`{3,})([^`]*)$/`; язык = первое слово (B3).
3. «Блок уже закрыт» считать только если между открывающей строкой и найденным закрывающим fence нет другой строки вида ```` ```lang ```` (B4). Иначе Enter вставляет свой закрывающий fence.
4. Если автозакрытие останется на чём-то кроме Enter — отдельная транзакция с `userEvent: 'input.complete'`, чтобы `⌘Z` откатывал только вставку (B5).
5. `normalizeNotesCodeLang`: точное совпадение с id/alias по первому слову, иначе `null` — бейдж показывает сырой текст, подсветки нет (B6).
6. H1 (если подтвердится): в `src-tauri` при старте на macOS записать в defaults приложения `NSAutomaticQuoteSubstitutionEnabled = NO`, `NSAutomaticDashSubstitutionEnabled = NO`, `NSAutomaticTextReplacementEnabled = NO` (и `WebAutomatic*`-аналоги, если первых не хватит). Дополнительно явно задать CodeMirror `EditorView.contentAttributes.of({ autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' })`.

### Тесты

`shared/lib/codemirror/__tests__/notesKeymap.test.ts` — таблица «последовательность клавиш → документ + позиция курсора»:

- ```` ``` ```` + Enter → пустой блок, курсор внутри;
- ```` ```text ````, ```` ```python ````, ```` ```golang ````, ```` ```tsx ````, ```` ```go main.go ```` + Enter;
- ```` ``` ```` над существующим блоком + Enter → два независимых блока;
- однострочный ```` ```x``` ```` остаётся как есть;
- `⌘Z` после автозакрытия.

---

## 2. Единый синтаксис `[[ключ:значение]]`

### Сейчас

`[[board:…]]` прикручен точечно в четырёх местах:

- `shared/lib/wikiLinkText.ts` — `BOARD_WIKI_PREFIX`, `boardTitleFromWikiLink`, `boardWikiTitleSpan`;
- `features/notes/lib/wikiLinks.ts` — `extractWikiLinks` исключает board-ссылки из `note_links`;
- `shared/lib/codemirror/livePreview.ts` — `applyWikiLinkInline`, отдельные ветки для board;
- `pages/Notes/useNotesPageActions.ts` — `handleWikiLinkClick`.

Веб (`apps/web/src/lib/markdown/renderNordlyMarkdown.ts`) про `board:` не знает. Markdown-ссылки `[text](url)` в редакторе подсвечиваются, но **не кликаются**: `mousedown` в `LiveMarkdownEditor.tsx` обрабатывает только чекбоксы и `.nordly-md-wiki-link`.

### Что делаем

Один реестр ключей — `apps/shared/markdown/wikiTarget.ts` (алиас `@nordly-markdown`, общий для app и web; полный интерфейс — в 0.4):

```ts
export type WikiTarget =
  | { kind: 'note'; title: string }
  | { kind: 'board'; title: string }
  | { kind: 'link'; url: string }
  | { kind: 'invalid'; key: string; reason: 'bad_url' | 'empty_value' };

export function parseWikiTarget(raw: string): WikiTarget;
```

Правила разбора:

- Ключ — `^([a-z]+):` (без учёта регистра), **только из реестра** (`board`, `link`). Всё остальное — заголовок заметки: `[[Встреча: Q3]]` остаётся ссылкой на заметку. Это не даёт сломать существующие заголовки с двоеточием.
- Пустое значение (`[[link:]]`) → `invalid`, подсветка ошибки, клик ничего не делает.
- Алиас `|` работает для всех ключей: `[[link:https://go.dev/doc|Go docs]]`.
- `[[link:…]]`: разрешён только `https:` без логина/пароля в URL — то же правило, что у Rust-команды `shell_open_external` (`validate_external_url` в `src-tauri/src/lib.rs`). `http:`, `mailto:`, `javascript:`, `file:` → `invalid/bad_url`. Без схемы (`go.dev`) → `invalid/bad_url`; `https://` не дописываем сами. Ограничение: URL с `]` или `|` не поддерживается (для них — обычный `[text](url)`). Безопасность — раздел 7.

Все четыре места выше переходят на `parseWikiTarget`; `BOARD_WIKI_PREFIX` и board-специфичные хелперы удаляются.

### Поведение в UI

| Ключ | Отображение в live preview | Клик |
|------|----------------------------|------|
| нет (заметка) | как сейчас | открыть/создать заметку |
| `board:` | заголовок доски, префикс скрыт | как сейчас: `openOrCreateBoardByTitle` |
| `link:` | алиас, иначе URL без схемы; иконка ↗; при наведении — реальный хост (алиас может врать) | `window.nordly.shell.openExternal(url)` (`shell_open_external`) |
| `invalid` | класс `nordly-md-wiki-link--invalid` + `title` с причиной | ничего |

Заодно: клик по `[text](url)` тоже открывает URL через тот же обработчик (сейчас не кликается вообще).

Автодополнение (`wikiLinkAutocomplete.ts`):

- после `[[` — ключи (`board:`, `link:`) + заголовки заметок;
- после `[[board:` — заголовки досок (список из `whiteboardClient`, передаётся в редактор так же, как `noteTitles`);
- после `[[link:` — без подсказок.

### Веб (опубликованные заметки)

`renderNordlyMarkdown.ts` использует тот же модуль `@nordly-markdown/wikiTarget` — без копии правил разбора:

- `link:` → `<a href target="_blank" rel="noopener noreferrer nofollow ugc">`, та же проверка схемы (только `https:`);
- `board:` → обычный текст (доски локальные, публичной ссылки нет);
- `invalid` → текст со стилем ошибки.

### Будущие ключи (не в этом плане)

`task:` (открыть задачу), `date:` (день в календаре). Добавляются одной строкой в реестр + обработчиком клика.

### Тесты

`wikiTarget.test.ts`: заметка с двоеточием, регистр ключа, алиас, пустое значение, `javascript:` / `http:` / `file:` / `https://user:pass@…` → invalid, `go.dev` → invalid. Обновить `wikiLinkText.test.ts`, `wikiLinks.test.ts` (`link:` не попадает в `note_links`).

---

## 3. Карточки для повторения

### Синтаксис

Карточки живут прямо в заметках:

```md
- ubiquitous :: вездесущий
- to come up with ::: придумать
```

- `front :: back` — односторонняя карточка (front → back).
- `front ::: back` — двусторонняя (две карточки).
- Маркер списка и чекбокс в начале строки игнорируются.

Почему не `[[card:…]]`: карточка — это пара «вопрос/ответ», а не ссылка. Строка с `::` читается без рендера, совпадает с плагином Obsidian Spaced Repetition и не мешает `[[ключ:значение]]`.

### Разбор (`features/cards/lib/parseCards.ts`, чистая функция)

```ts
parseCards(noteId: string, noteTitle: string, bodyMd: string): {
  cards: ParsedCard[];   // { key, front, back, noteId, line, direction }
  issues: CardIssue[];   // { noteId, line, reason: 'empty_front' | 'empty_back' }
}
```

- Пропускаем fenced-блоки и inline-код. Сканер «строки прозы вне кода» выносим из `extractWikiLinks` в общий хелпер — сейчас там своя логика `inFence` + `segmentsWithoutInlineCode`, вторую копию не пишем.
- Делим по **первому** `:::` или `::` вне inline-кода.
- Пустая сторона → `issue`, не карточка. Ошибки показываем в UI («2 строки не стали карточками: …»), а не молча пропускаем.
- `key` = хэш нормализованного front (trim, lowercase, схлопнуть пробелы) + направление. Не зависит от заметки: переименование или перенос файла в vault-режиме не сбрасывает прогресс. Одинаковый front в двух заметках = одна карточка (показываем предупреждение о дубле). Изменение front = новая карточка (прогресс сбрасывается, это документируем).

### Что сохраняем

Источник правды для карточек — markdown. В отдельное хранилище пишем только прогресс повторений.

IndexedDB `nordly-db` → **v7** (v6 занимает `vault_sync_index` из PR 0b), новый store `card_reviews` (ключ `userId::cardKey`):

| Поле | Тип | Зачем |
|------|-----|-------|
| `cardKey` | string | связь с `ParsedCard.key` |
| `front` | string | показать «осиротевшие» записи (карточку удалили из заметок) |
| `due` | `YYYY-MM-DD` | когда показать снова |
| `intervalDays` | number | SM-2 |
| `ease` | number | SM-2, старт 2.5 |
| `reps`, `lapses` | number | статистика, сброс при «Again» |
| `lastReviewedAt`, `updatedAt` | ISO | статистика, будущая синхронизация (LWW) |

`meta`: `${userId}::cards_daily::{YYYY-MM-DD}` → `{ reviewed, new }` для дневного лимита и статистики.

Алгоритм: упрощённый SM-2 с оценками Again / Hard / Good / Easy — чистая функция `scheduleReview(state, grade, today)` с тестами. FSRS (`ts-fsrs`) — возможная замена позже, формат store это допускает.

**Синхронизации нет** (как у досок): `isSyncEnabled()` не трогаем, бэкенд не меняем. Если понадобится — отдельный план (новая таблица в `focus` или `notes`, outbox-домен `cards`).

Не храним: копию карточек, индекс по всем заметкам. Индекс строится в памяти при открытии экрана повторения (сканируем заметки через `notesPersistence()`) и обновляется по событию сохранения заметки. Если на реальном vault это окажется медленно (замерить на 1000+ заметок) — тогда добавить store `card_index` с инкрементальным обновлением.

### Где показывается в интерфейсе

Всё скрыто за настройкой. Кто не учит языки, ничего не увидит.

| Место | Что | Детали |
|-------|-----|--------|
| Settings → General → **Flashcards** | Включатель (по умолчанию выкл), лимит новых карточек в день (по умолчанию 20) | `NordlySettings.flashcards: { enabled, dailyNewLimit }` в `shared/model/settings.ts`; поле обязательное, без ветки «старый blob» |
| **Страница Review** | Новый `PageId` `cards`, `PageStack`-страница как Daily Planning (не в Dock) | Front → `Space` показать ответ → `1`/`2`/`3`/`4` оценка. В конце — итог сессии. Фильтр колоды: все / одна заметка |
| **Palette (⌘K)** | «Review cards — 12 due» | Открывает Review; горячая клавиша — свободная буква (проверить конфликты с `N`, `P`, `S`) |
| **Редактор заметки** | Строки с `::` стилизованы: front жирный, разделитель приглушён и показан как `→` вне активной строки | Ветка в `buildLivePreview` (`livePreview.ts`), только декорации, документ не меняется |
| **Шапка заметки** | Кнопка «Review this note (N)», если в заметке есть карточки | Review с колодой = текущая заметка |
| **Home** (опционально, фаза 3b) | Чип «12 cards due» в `HomeTodayTasks` | Только при `flashcards.enabled` и `due > 0` |
| **Перерыв помодоро** (опционально, фаза 3b) | «Повторить 5 карточек» на экране короткого перерыва | Связывает фичу с ядром приложения — фокусом |

### Документация

`apps/nordly/AGENTS.md`: IndexedDB v7 + `card_reviews`, новая страница, настройка `flashcards`, синтаксис `::` / `:::`.

---

## 4. Live-доска: app + web не синхронизируется

### Причина (подтверждена кодом)

Web + web работает: оба клиента — `CollabExcalidrawEditor` → `WS /ws/editor/{roomId}` + Yjs (`apps/web/src/lib/collab/excalidrawYjsDoc.ts`, `lib/ws/collabEditor.ts`).

Приложение **не участвует в live-комнате вообще**:

1. `WhiteboardPage.handleShareLive` (`pages/Whiteboard/WhiteboardPage.tsx`) берёт снимок сцены → `POST /v1/rooms/share-whiteboard`.
2. Сервер создаёт комнату с этим снимком как начальной сценой и возвращает `roomId`, `accessToken` (editor-scoped JWT владельца), `invite.url`.
3. Приложение использует только `inviteUrl`: копирует и открывает в браузере. `accessToken` и `roomId` выбрасываются.
4. Холст в приложении остаётся локальной доской в IndexedDB. WebSocket нет, Yjs нет (`yjs` даже не в `apps/nordly/package.json`).

То есть «app + web» на деле — это локальная копия в app и отдельная live-комната в браузере. Правки не ходят ни в одну сторону.

Второй блокер на будущее: CSP в `apps/nordly/src-tauri/tauri.conf.json` — в `connect-src` нет `wss://trynordly.app` / `wss://code.trynordly.app`. Даже готовый клиент не сможет открыть WebSocket в релизной сборке.

### Решение: live-режим доски в приложении

1. **Общий код.** Вынести `excalidrawYjsDoc.ts` и протокол WS-клиента (`collabEditor.ts`: конверт `snapshot` / `op` / `presence` / `cursor` / `room_closed`, правила закрытия 1000/1008 терминальные, 1001/1006/1011 с ретраем) в `apps/shared/collab/` — по образцу `apps/shared/i18n` (алиас в `vite.config.ts` + `tsconfig`). Web переходит на общий модуль в том же PR, без двух копий протокола.
2. **Приложение.** `features/whiteboard/live/`:
   - `liveSession.ts` — после `shareWhiteboard` держит `roomId` + `accessToken` (+ `expiresIn`) в памяти; подключается к `WS {API}/ws/editor/{roomId}` с `Sec-WebSocket-Protocol: access_token.<JWT>`;
   - привязка Excalidraw ↔ Y.Doc: `onChange` → `writeSceneToYjs(…, 'local')`, `observeSceneChanges` → `updateScene`;
   - presence/курсоры — фаза 4b.
3. **UI.** На доске бейдж «Live · N участников», кнопка «Stop sharing». Пока сессия активна, правда — комната; локальные сохранения в IndexedDB продолжаются (снимок из Y.Doc), чтобы при обрыве ничего не потерять.
4. **Завершение.** «Stop sharing», `room_closed` или истёкший токен → финальная сцена из Y.Doc записывается в локальную доску → отключение. Ошибки подключения показываются в `shareMsg`; доска не делает вид, что она live.
5. **CSP.** Добавить `wss://trynordly.app` (и `wss://code.trynordly.app`, если WS ходит туда) + `ws://localhost:8087` для `VITE_NORDLY_LOCAL_API`.
6. **Бэкенд.** Изменений не нужно: owner-токен из `ShareWhiteboard` уже editor-scoped (`services/rooms/AGENTS.md`). Проверить, что WS-upgrade принимает его так же, как guest-токен.

### Проверка

- Ручная: app share → браузер открыл ссылку → рисуем в app, видно в web, и обратно; обрыв сети в app → переподключение; «Stop sharing» → локальная доска совпадает с комнатой.
- Авто: unit-тесты привязки Excalidraw ↔ Yjs (пустой `onChange` до синхронизации не стирает комнату — правило уже есть в `writeSceneToYjs`, тест перенести в общий модуль).

### Документация

`apps/nordly/AGENTS.md` (раздел Whiteboard, Sharing, IPC/CSP), `apps/web/AGENTS.md` (общий collab-модуль), `docs/onboarding/README.md` (сквозной сценарий app ↔ rooms ↔ web).

### Баг: обрезанная подсказка под панелью инструментов (веб)

На `code.trynordly.app/{roomId}` под панелью инструментов видна обрезанная строка Excalidraw «To move canvas, hold mouse wheel or spacebar while dragging, or use the hand tool».

Причина: веб переносит панель инструментов вниз (`apps/web/src/styles/main.css`, `.nordly-excalidraw .excalidraw .FixedSideContainer_side_top { bottom: 1.25rem }`). Подсказка `.HintViewer` рисуется под панелью внутри того же контейнера, поэтому уезжает ниже и прячется под нижней полосой комнаты (`Whiteboard · LIVE · Guest`). В приложении она уже скрыта (`apps/nordly/src/renderer/src/app/styles/features/whiteboard-canvas.css`, `.nordly-excalidraw-mount .HintViewer`), а в веб-список скрываемых элементов не попала.

Решение — подсказку убрать совсем, как в приложении: добавить `.nordly-excalidraw .excalidraw .HintViewer` в список `display: none !important` в `main.css`.

Попутно выровнять веб с приложением. В приложении также скрыты `.main-menu`, `[class*='welcome-screen']`, `.App-mobile-menu`, `.layer-ui__wrapper__footer`, `.exc-stats`, `.disable-zen-mode`, `.App-toolbar__extra-tools-*`. Для каждого решить отдельно, нужен ли он гостю. Скрывать вслепую нельзя: например, `extra-tools` в вебе может использоваться. В PR 4 оба списка переезжают в один общий CSS `apps/shared/collab/excalidrawChrome.css`, чтобы они больше не расходились.

Проверка: веб-доска на десктопной и узкой ширине, тёмная и светлая темы — под панелью нет текста, панель не перекрывает нижнюю полосу.

---

## 5. Синхронизация заметок: понятный флоу

### Как работает сейчас (по коду)

Desktop требует папку: `NotesPage` показывает `VaultOnboarding`, пока папка не выбрана, поэтому в релизе режим «заметки в IndexedDB» фактически не используется.

**Отправка (устройство → сервер).**

- Любое сохранение, переименование или удаление **внутри приложения** (`features/notes/vault/vaultIo.ts`) вызывает `enqueueVaultFilePut` / `enqueueVaultFileDelete`.
- Условие — только `isSyncQueueEnabled()`: облачная сборка + есть профиль. Выключателя нет. `cloudSyncEnabled` с сервера (`POST /v1/devices/register`) всегда `true`.
- Локальный профиль (без входа) тоже копит outbox. При первом входе весь накопленный outbox улетает на сервер без вопроса.
- Шифрование: если в Settings → Vault включено «Encrypted vault» и оно разблокировано — уходит шифротекст (`encryptNoteForRemote`). Иначе **открытый текст** (`remoteCreateNote(title, bodyMd)`).
- Файлы, которые лежали в папке до выбора, и правки снаружи (Obsidian, Finder) в outbox **не попадают**: watcher (`useNotesVaultWatch`) только перечитывает список. На сервере оказываются только заметки, тронутые в приложении.

**Скачивание (сервер → устройство).**

- `pullVaultFiles` запускается в каждом цикле синка (debounce 3 с + каждые 60 с): `GET /v1/notes`, затем `GET /v1/notes/{id}` **для каждой заметки**, каждый раз.
- Если удалённая версия новее или локального файла нет — файл перезаписывается или создаётся (LWW по `updatedAt`, без копии конфликта).
- Новое устройство: выбрал папку, вошёл в аккаунт — серверные заметки автоматически пишутся в эту папку. Если это существующий Obsidian-vault, они смешиваются с его файлами. Вопроса никто не задаёт.
- Удаления с сервера локально не применяются.
- **Воскрешение:** файл, удалённый через Finder, при следующем pull возвращается с сервера — локального файла нет, значит «скачать».

**Публикация в веб.** В режиме папки `publishNoteToWeb` всегда падает с `NotesCloudCapabilityError` (`notesCloudPolicy.ts`). Пункт меню при этом виден, а пользователь получает длинную английскую ошибку про IndexedDB. Технически публикации нужен серверный id заметки (`/v1/notes/{id}/share-to-web`), то есть заметка уже должна быть синхронизирована.

### Целевой флоу

Одно явное согласие на устройство: **«Синхронизировать заметки»**, по умолчанию выключено.

| Состояние | Что происходит |
|-----------|----------------|
| **Выкл** (по умолчанию) | Ничего из заметок не уходит на сервер и не скачивается. Outbox домена `vault` не пишется. Публикация в веб недоступна, вместо неё подсказка |
| **Вкл, вход не выполнен** | Нельзя: выключатель неактивен, кнопка «Войти» (`ensureCloudAuth()`) |
| **Вкл** | Полная двусторонняя синхронизация папки (ниже) |
| **Вкл, шифрование заблокировано** | Синк на паузе. Статус «Разблокируй шифрование», не ошибка |

Где хранится: IndexedDB `meta` → `${userId}::notes_sync` = `{ enabled: boolean, enabledAt: ISO | null, hintDismissed: boolean }`. По пользователю и по устройству, как `vaultPrefs` (`${userId}::vault_enabled`). Не в `NordlySettings`: те общие для всех профилей.

Единая проверка `isNotesSyncEnabled()` = `isSyncEnabled()` && `notes_sync.enabled`. Её используют `enqueueVaultFile*`, `pushVaultOutbox`, `pullVaultFiles`, публикация. Разбросанных проверок `vaultBound` больше нет.

### Включение (мастер в настройках)

Шаги в одном модальном окне в стиле `nordly-vault-modal`:

1. **Что будет:** «В облако будут отправлены N заметок из папки `~/Notes`. Картинки остаются только на этом устройстве».
2. **Шифрование** (выбор по умолчанию — «Шифровать», рекомендуется): переиспользует текущий поток Vault (passphrase + recovery phrase). «Без шифрования» — с явной пометкой, что сервер видит текст.
3. **Если на сервере уже есть заметки** (второе устройство) — выбор:
   - «Объединить с этой папкой» — скачать недостающие, отправить свои. Конфликты не перезаписываются: при изменении с обеих сторон создаётся `Заметка (конфликт 2026-10-20).md`;
   - «Выбрать другую (пустую) папку» — рекомендуется, если текущая папка — чужой Obsidian-vault;
   - «Отмена».
4. **Первичная выгрузка:** полный обход папки (`vaultListNotes`), `file_put` для каждого `.md`. Прогресс «Отправлено 120 / 340» в статусе.

### Двусторонняя синхронизация (когда включено)

Чтобы убрать дыры, нужен локальный «последний синхронизированный» индекс: новый store `vault_sync_index` (IndexedDB v6), строка на путь `{ path, serverId, hash, remoteUpdatedAt }`. Сейчас эту роль частично играет `id_map`. Подробности — в разделе 0.

- **Внешние правки (Obsidian/Finder):** в каждом цикле сравнивать `(path, hash)` папки с индексом, изменения ставить в outbox. Альтернатива — ставить `file_put` из watcher. Сверка надёжнее: ловит и правки при закрытом приложении.
- **Удаление в Finder:** путь есть в индексе, файла нет, outbox пуст → это локальное удаление → `file_delete` на сервер. Защита: если корень папки недоступен (отключён диск, нет прав) — ошибка и синк стоп, а не массовое удаление.
- **Удаление на сервере:** путь есть в индексе, на сервере нет → локальный файл переезжает в `.trash/` (не удаляется насовсем).
- **Скачивание:** `GET /v1/notes/{id}` только если `updatedAt` из списка новее `remoteUpdatedAt` в индексе (сейчас — каждая заметка каждые 60 с).
- **Конфликт:** локальный hash ≠ индексу **и** удалённый `updatedAt` ≠ индексу → копия конфликта рядом, обе версии сохраняются. Иначе — обычный fast-forward в нужную сторону.

### Выключение

- Останавливает push/pull, очищает outbox домена `vault`.
- Серверные копии остаются; текст в диалоге говорит об этом прямо.
- Отдельная деструктивная кнопка «Удалить заметки с сервера» (подтверждение вводом) — фаза 5b.

### Без миграции

Пользователей нет, поэтому согласие по умолчанию выключено у всех, без проверки «синкалось ли устройство раньше». Апгрейд IndexedDB до v6 удаляет outbox и записи `id_map` домена `vault`. Файлы на диске не трогаются. Серверные заметки сбрасываются вместе с выкладкой PR 0s (см. начало плана).

### Интерфейс

**Мягкое уведомление в заметках.** Карточка в стиле `SyncStatusBanner` (`nordly-sync-banner`), но внутри страницы Notes, над списком в сайдбаре:

> Заметки хранятся только на этом Mac. Включи синхронизацию, чтобы открыть их на другом устройстве и публиковать в веб.
> [Включить] [Не сейчас]

- Показывается при: облачная сборка, `notes_sync.enabled = false`, папка выбрана.
- «Не сейчас» → `hintDismissed: true` в `${userId}::notes_sync`. Карточка больше не показывается, остаётся только статус в футере (ниже).
- «Включить» → Settings → раздел «Синхронизация» с подсветкой строки выключателя: `PageId.Settings` + параметр `{ section: 'sync', highlight: 'notes-sync' }`, строка 2 раза мягко пульсирует (CSS-анимация, `prefers-reduced-motion` — без анимации).

**Статус в футере сайдбара Notes** (всегда, одна строка `mono`, как `statusLabel` в `VaultSection`):

| Состояние | Текст |
|-----------|-------|
| выкл | «Только на этом устройстве» |
| отправка | «Синхронизация… 12 / 340» |
| ок | «Синхронизировано · 2 мин назад» (+ «зашифровано» при E2EE) |
| пауза | «Разблокируй шифрование» → открывает unlock |
| ошибка | текст ошибки из `useSyncStore.lastError` |

**Публикация в веб** (`NoteRowMenu`): при выключенном синке блок публикации неактивен, подсказка «Чтобы публиковать, включи синхронизацию заметок» и кнопка-ссылка в настройки с подсветкой (как выше). Длинная ошибка `FS_VAULT_CLOUD_MESSAGE` уходит.

При включённом синке публикация работает для заметок из папки: серверный id берётся из индекса (`SyncDomain.Vault` id_map по пути); перед публикацией — `flushNow()` + push этой заметки. `NotesCloudCapabilityError` и `notesCloudPolicy.ts` удаляются целиком или сводятся к `isNotesSyncEnabled()`. Предупреждение про публикацию открытым текстом при E2EE (`publish_e2ee_warning`) остаётся.

**Настройки.** Раздел «Vault» переименовать в **«Синхронизация»**:

1. «Синхронизировать заметки» — выключатель + статус + папка (только чтение, ссылка на Files & Links);
2. «Шифрование» — текущий блок `VaultSection` (passphrase, lock, recovery), активен только при включённом синке. При выключенном синке шифровать нечего.

**Onboarding папки** (`VaultOnboarding`): если вход выполнен и на сервере есть заметки — строка «В облаке 120 заметок. Выбери пустую папку и включи синхронизацию, чтобы скачать их». Автоматически при выборе папки ничего не скачивается.

### Решения (2026-10-20)

1. Публикация без синка — **блокируется**, с подсказкой и ссылкой на включение.
2. В мастере включения по умолчанию выбрано **«Шифровать»**.
3. Синк картинок из `img/` — **отдельный план** (vault-file RPC из ADR 005). Здесь только баги отображения картинок — раздел 6.

### Тесты

- `isNotesSyncEnabled` × (локальный профиль, нет устройства, выкл, вкл, заблокировано).
- Выкл → `enqueueVaultFilePut` ничего не пишет, `pullVaultFiles` не ходит в сеть.
- Сверка индекса: внешняя правка → `file_put`; удаление в Finder → `file_delete`; недоступный корень → ошибка, ни одного delete; удаление на сервере → `.trash/`; конфликт → копия.
- Апгрейд v5 → v6: outbox и `id_map` домена `vault` удалены, согласие выключено.

### Документация

`apps/nordly/AGENTS.md` (Sync engine, Filesystem notes vault, Settings, IndexedDB `meta`), ADR 005 (раздел Sync shape + согласие), `docs/onboarding/README.md` (сквозной флоу заметок).

---

## 6. Картинки в заметках: отображение

Код: `shared/lib/codemirror/livePreview.ts` (`MarkdownImageWidget`, `applyImageInline`), `features/notes/vault/resolveVaultImage.ts`, `app/styles/features/notes.css` (`.nordly-md-image*`), публикация — `features/notes/api/notesClient.ts` (`collectPublishAttachments`), веб — `apps/web/src/lib/markdown/renderNordlyMarkdown.ts`.

### Найдено в коде

| # | Баг | Причина | Как воспроизвести |
|---|-----|---------|-------------------|
| I1 | **Текст прыгает, когда курсор проходит через строку с картинкой** | На активной строке картинка заменяется исходником `![](…)` (`showSyntax` → `addMark` вместо widget). Строка высотой до 24rem (`max-height`) схлопывается до одной строки и обратно | Заметка с картинкой посередине → стрелками вверх/вниз через неё |
| I2 | Позиция курсора, клики и прокрутка «съезжают» рядом с картинками | Картинка — **inline** `Decoration.replace`, но в CSS `display: block` у `.nordly-md-image`. CodeMirror считает её частью строки и неверно оценивает высоты; блочные виджеты должны быть `block: true` из `StateField` | Клик в строку сразу под картинкой → курсор встаёт не туда; прокрутка длинной заметки с картинками дёргается |
| I3 | Скачок после загрузки | Картинка грузится асинхронно (`resolver(href).then(…)`), высота меняется после первого рендера, а `view.requestMeasure()` не вызывается | Открыть заметку с несколькими картинками из папки |
| I4 | Картинка посреди текста ломает строку | `текст ![](a.png) текст` → блочный элемент внутри inline-строки | — |
| I5 | Obsidian-вставки `![[image.png]]` не работают | Синтаксис не поддержан; `[[image.png]]` распознаётся как wiki-ссылка на несуществующую заметку, а `!` остаётся текстом. Obsidian ищет файл по имени во всём vault | Открыть папку Obsidian с вставленными скриншотами |
| I6 | Ширина в стиле Obsidian `![alt\|300](x.png)` / `![[x.png\|300]]` не поддержана | `alt` показывается как `alt\|300`, размер игнорируется | — |
| I7 | Пути с пробелами без кодирования не рендерятся | regex `\(([^)\s]+)\)` запрещает пробелы; CommonMark-форма `![](<img/my pic.png>)` тоже не поддержана | `![](img/my pic.png)` |
| I8 | Ошибка загрузки без причины | `catch` показывает только `alt` (кроме `vault_locked`). «Файл не найден», «не картинка», «больше 5 MiB» неотличимы | Сослаться на несуществующий файл |
| I9 | **Опубликованная заметка теряет картинки из папки** | `collectPublishAttachments` собирает только `nordly-asset:`; относительные пути из vault не загружаются, а веб `safeImageSrc` относительные пути отбрасывает. В ADR 005 написано «Publish reads relative vault images via FS» — в коде этого нет | Станет видно, как только публикация из папки заработает (раздел 5) |
| I10 | Картинки на втором устройстве битые | `img/` не синкается (решение: отдельный план) | — |

### Решение

1. **Картинка — блочный виджет под строкой, всегда** (I1–I4). `StateField` с `Decoration.widget({ widget, block: true, side: 1 })` в конце строки, где есть `![…](…)`. Исходник на активной строке показывается **над** картинкой, картинка не исчезает — высота не прыгает. Вне активной строки исходник скрыт через существующий `hideRange` (без `replace`). Несколько картинок в строке — по виджету на каждую, в порядке появления.
2. **Стабильная высота** (I3): `toDOM(view)` → на `img.onload` / `onerror` вызывать `view.requestMeasure()`. Задать `estimatedHeight` у виджета. Резервировать место по размерам из кэша (`naturalWidth/Height` по пути) при повторном открытии заметки.
3. **`![[file]]` и размер** (I5, I6) — через реестр `[[ключ:значение]]` из раздела 2: `!` перед `[[…]]` = вставка. Файл ищется как в Obsidian: сначала относительно заметки, затем по имени во всём vault; при нескольких совпадениях — кратчайший путь. Число после `|` = ширина в px.
4. **Пути** (I7): поддержать `<…>` и `%20`.
5. **Понятная ошибка** (I8): плейсхолдер показывает путь и причину (`not_found` / `bad_type` / `too_large` / `vault_locked`) из типизированной ошибки `vaultReadBytes`.
6. **Публикация** (I9): `collectPublishAttachments` для заметок из папки — читать относительные картинки через `vaultReadBytes`, отправлять как attachments, переписывать ссылки так же, как для `nordly-asset:`. Неразрешённая картинка → `publish_unresolved`, публикация не проходит (не публикуем заметку с битыми картинками молча). Исправить ADR 005 в том же PR.

### Ручная проверка (Tauri, не `dev:vite`)

- Стрелки вверх/вниз через картинку → текст не прыгает, курсор идёт по строкам.
- Клик сразу под и над картинкой → курсор в нужной строке.
- Длинная заметка с 10+ картинками → плавная прокрутка, без скачков после загрузки.
- Вставка скриншота (`⌘V`) → картинка появляется под строкой, курсор после неё.
- Замена файла картинки в Finder → новая версия после события watch.
- Папка Obsidian: `![[Pasted image ….png]]`, `![[x.png|300]]`, картинка в подпапке.
- Тёмная и светлая темы, зум редактора `⌘+` / `⌘−`.

Автотесты: декорации `livePreview` (виджет присутствует и на активной строке; исходник скрыт только вне неё), разрешение `![[name]]` (относительно, по имени, неоднозначность), `collectPublishAttachments` с относительными путями.

---

## 7. Безопасность

Ревью проведено по коду 2026-10-20: E2EE (`shared/crypto/vault.ts`, `recoveryKey.ts`, `features/notes/crypto/noteCrypto.ts`), синк vault (`vaultFileSync.ts`), публикация (`notesClient.ts`, `services/notes/AGENTS.md`), Tauri (`tauri.conf.json` CSP, `capabilities/*.json`, `lib.rs`, `notes_vault.rs`), веб (`renderNordlyMarkdown.ts`, `PublishedNotePage.tsx`), прокси (`deploy/Caddyfile`, `deploy/nginx-trynordly.conf.example`). Модель угроз — ADR 002: защищаемся от чтения и подмены данных на сервере; скомпрометированное устройство и разблокированный renderer вне модели.

Статус: **подтверждено** — видно в коде; **проверить** — вывод из кода и документации, нужен прогон.

### 7.1. Найдено

| # | Важность | Статус | Проблема | Где | Исправление | PR |
|---|----------|--------|----------|-----|-------------|----|
| S1 | высокая | подтверждено | Заметки уходят на сервер без согласия; без E2EE — открытым текстом. Локальный профиль копит outbox и отправляет всё при первом входе | `vaultOutbox.ts` (`isSyncQueueEnabled`), `vaultFileSync.ts` (`remoteCreateNote(title, bodyMd)`) | Раздел 5: согласие, по умолчанию выкл; в мастере по умолчанию «Шифровать» | 0a |
| S2 | высокая | подтверждено | Включение E2EE в режиме папки **не перешифровывает** уже отправленные копии: `encryptAllNotesForVault` сразу выходит при выбранной папке. Открытый текст лежит на сервере, пока файл не изменят | `notesClient.ts` `encryptAllNotesForVault` | При включении E2EE — принудительный `push_put` всех путей из индекса (шифротекстом), прогресс в статусе; до завершения статус «шифруем…» | 0b |
| S3 | высокая | подтверждено | **Даунгрейд при скачивании:** при включённом E2EE `pullVaultFiles` принимает заметки с `encrypted=false` и пишет их в папку. Сервер (или тот, кто его взломал) может подсунуть произвольный текст | `vaultFileSync.ts` `pullVaultFiles` | E2EE вкл → незашифрованная удалённая заметка = ошибка синка (видимая), файл не пишется | 0b |
| S4 | средняя | подтверждено | Заголовок (= путь в vault) и тело шифруются **раздельно и без AAD**. Сервер может подменить или перемешать шифротексты: тело заметки B запишется по пути заметки A, проверка AES-GCM пройдёт | `noteCrypto.ts` `encryptNoteFields` | Новый конверт: один AES-GCM над `{ v: 2, path, body }`, `title` на сервере — случайный непрозрачный id. Старый формат удаляется сразу, без чтения v1 (серверные данные сбрасываются) | 0s |
| S5 | средняя | подтверждено | PBKDF2-SHA256 200 000 итераций — ниже рекомендации OWASP (600 000). Пароль — только «≥ 8 символов» | `vault.ts` `PBKDF2_ITERATIONS`, `unlockVault` | Одна константа: 600 000 итераций (или Argon2id через WASM) для всех. Старые vault не переводятся — соль и verifier сбрасываются вместе с серверными данными. В мастере — индикатор надёжности, запрет слабых паролей | 0a (UI), 0s (KDF) |
| S6 | средняя | проверить | **Публикация E2EE-заметки ломает шифрование.** `ShareNoteToWeb` отклоняет `encrypted=true` и обновляет `body_md` синхронизируемой строки на месте → серверная копия становится открытой. Следующий зашифрованный push противоречит CHECK «нет publish-состояния у encrypted» → либо ошибка синка, либо тихая отмена публикации | `services/notes` (`ShareNoteToWeb`), `notesClient.ts` `publishNoteToWeb` | Опубликованная версия — отдельный снимок (своя таблица: slug, owner, source note id, body, assets), синхронизируемая строка остаётся шифротекстом. Изменение API notes сразу в новую форму + `docs/backend-client-matrix.md`. До этого публикация E2EE-заметок из папки **не включается** | 0s (+ notes) |
| S7 | средняя | подтверждено | Для E2EE-заметок в IndexedDB-режиме `wikiLinks` (заголовки связанных заметок) уходят **открытым текстом** в `note_links`. В режиме папки не отправляются | `notesSync.ts` → `remoteCreateNote(encTitle, encBody, wikiLinks)` | Клиент: при E2EE отправлять `[]`. Сервер: отклонять непустые `wikiLinks` при `encrypted=true` (сразу, без переходного режима); старые `note_links` уходят со сбросом данных | 0s (+ notes) |
| S8 | средняя | подтверждено | Команды `read_text_file`, `read_binary_file`, `list_markdown_import_entries` принимают **корень от renderer**. При XSS в renderer можно прочитать любой `.md` или картинку на диске (`root: "/"`) | `src-tauri/src/lib.rs` | Rust сам запоминает пути из события drag-and-drop ОС (с TTL); команды принимают только их. Корень vault — только из сохранённого конфига | 1b или отдельный |
| S9 | средняя | новый риск (PR 4) | Live-доска впускает **недоверенный контент гостей** в привилегированный renderer: ссылки элементов, картинки, огромные сцены | `features/whiteboard/live/` | `onLinkOpen` Excalidraw → только `shell_open_external` (https), без навигации webview; лимиты размера сцены и числа элементов; allowlist MIME файлов (png/jpeg/gif/webp, без svg); строгий разбор конверта (`wsProtocol.ts`, неизвестный тип = закрыть сокет) | 4 |
| S10 | средняя | подтверждено | На вебе **нет CSP** (nginx ставит HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy — но не CSP), а опубликованные заметки вставляются через `dangerouslySetInnerHTML`. Сам рендерер экранирует корректно (проверено), CSP нужна как вторая линия | `deploy/nginx-trynordly.conf.example`, `PublishedNotePage.tsx` | `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; img-src 'self' https: data:; connect-src 'self' wss://trynordly.app wss://code.trynordly.app` (сверить с Excalidraw и Vite-сборкой) | 2 |
| S11 | низкая | подтверждено | CSP Tauri: в `connect-src`/`font-src` есть `https://esm.sh` и набор GitHub-хостов; для PR 4 нужен WS | `tauri.conf.json` | Добавлять только точные `wss://trynordly.app` (+ `ws://localhost:8087` только в dev-конфиге), не `wss:`. Проверить, нужен ли `esm.sh`; не нужен — удалить | 4 |
| S12 | низкая | подтверждено | Алиас ссылки может выдавать один адрес за другой (`[[link:https://evil.example\|bank.com]]`) | раздел 2 | Показывать реальный хост в tooltip; открытие только через `shell_open_external` | 2 |
| S13 | низкая | проверить | «Удалить заметки с сервера» (фаза 5b): если удаление в notes мягкое (архив), данные физически остаются | `services/notes` | Для этой кнопки — жёсткое удаление строк, вложений и `note_links`; описать в AGENTS notes | 5b |
| S14 | низкая | подтверждено | Опубликованные заметки с внешними `https`-картинками раскрывают IP читателя третьим сайтам | `renderNordlyMarkdown.ts` `safeImageSrc` | Документировать; позже — загрузка внешних картинок как assets при публикации | позже |
| S15 | инфо | — | Сервер может отдавать старую версию шифротекста (откат). Полностью не закрывается без журнала версий | — | Записать в ADR 006 как принятый риск | 0b |

### 7.2. Проверено и в порядке

- Пути vault: `isVaultRelPath` на клиенте + `resolve_under_root` в Rust (`canonicalize`, проверка выхода из корня, symlink-escape отклоняется). Скачанная с сервера заметка не может записать файл вне папки или не-`.md`.
- `shell_open_external`: только `https`, без логина/пароля, только из главного окна.
- Capabilities Tauri разделены по окнам (main / notification / tray), remote URL — только Vite dev.
- Веб-рендер markdown: HTML экранируется, ссылки — allowlist (`https:`, `mailto:`, свои assets), картинки — allowlist (`https:`, свои assets, `data:image/{png,jpeg,gif,webp}`), `rel="noopener noreferrer"`.
- Recovery phrase: 24 слова × 8 бит = 192 бита энтропии, без смещения по модулю.
- AES-GCM: свежий 12-байтный IV на каждое шифрование; ключ неэкспортируемый, только в памяти.
- Пароль публикации: bcrypt, 10 попыток в минуту на IP; переход PUBLIC → PASSWORD меняет slug.
- Обновления: подпись `TAURI_SIGNING_PRIVATE_KEY` / `pubkey`.

### 7.3. Требования безопасности к новым фичам

**Синк заметок (0a, 0b)**

- Ни одного сетевого вызова для заметок при выключенном согласии. Проверяется тестом: мок `remote/` не вызывается ни разу.
- E2EE вкл → push только шифротекстом (уже так: `requireE2eeUnlocked`), pull только шифротекстом (S3), перешифровка старых копий (S2).
- Мастер: при выборе «Без шифрования» — явный текст «сервер видит содержимое заметок».
- Выключение E2EE: перед отправкой открытым текстом — подтверждение и полная перезапись копий (сейчас тихо).
- Логи и метрики: никаких заголовков, путей и содержимого заметок в `console.*`, Sentry-подобных отчётах и лейблах Prometheus. Только счётчики и коды ошибок.

**`[[ключ:значение]]` и картинки (1b, 2)**

- Любой переход наружу — только `shell_open_external`. Никаких `window.open`, `location.href` или `<a target>` внутри Tauri.
- Разбор URL — через `URL`, не регулярками; правило совпадает с Rust (`https`, хост обязателен, без учётных данных).
- `![[name]]` ищет файл только внутри корня vault через существующие Rust-команды (`resolve_under_root`). Новая команда поиска по имени — та же проверка корня, результат — относительный путь.
- Виджеты редактора создают DOM через `textContent` / `setAttribute`, не `innerHTML` (сейчас так — сохранить).

**Карточки (3)** — локальные данные без сети; отдельных требований нет, кроме логов (без текста карточек).

**Live-доска (4)**

- Токен владельца — только в памяти сессии; не в `localStorage`, не в логах, не в URL.
- S9 целиком; плюс отключение при `room_closed` / истечении токена без повторного использования токена.
- Приглашение даёт права редактирования любому со ссылкой (так сейчас и в вебе) — в UI это прямо написать рядом с кнопкой «Поделиться».

### 7.4. Тесты безопасности

| Что | Где |
|-----|-----|
| Согласие выкл → ноль вызовов `remote/` при сохранении, переименовании, удалении, цикле синка | `features/notes/sync/__tests__` |
| E2EE вкл + удалённая заметка `encrypted=false` → ошибка, файл не записан | там же |
| Подмена: тело заметки B с путём A → ошибка расшифровки (конверт v2) | `features/notes/crypto/__tests__` |
| Включение E2EE → все пути из индекса перезаписаны шифротекстом | `vaultReconcile` |
| Серверный путь `../x.md`, `/etc/x.md`, `a\\b.md`, symlink наружу → отклонено | клиент + Rust `notes_vault.rs` (cargo test) |
| `read_text_file` с корнем не из drag-and-drop → ошибка | Rust (S8) |
| `parseWikiTarget`: `javascript:`, `http:`, `file:`, учётные данные в URL → invalid | `wikiTarget.test.ts` |
| Веб-рендер: `<script>`, `"><img onerror>`, `javascript:` в ссылке/картинке → экранировано или отброшено | `apps/web` тесты `renderNordlyMarkdown` |
| Live: неизвестный тип конверта, слишком большая сцена, ссылка `javascript:` в элементе → сокет закрыт / ссылка не открыта | `apps/shared/collab`, `features/whiteboard/live` |

### 7.5. Перед релизом

- Security review диффа каждого PR из таблицы ниже (субагент «Security Review» по ветке).
- Ручная проверка в `.app`: мастер синка с E2EE на двух устройствах; трафик через прокси (mitmproxy) — в теле запросов к `/v1/notes` нет открытого текста при E2EE.
- Обновить ADR 002 (параметры KDF, конверт v2, даунгрейд при pull), ADR 006 (принятые риски: откат версии, метаданные — число и размер заметок, время изменений — видны серверу).

---

## 8. Сквозные требования

### 8.1. Восстановление шифрования на любом устройстве

Сейчас обёртка пароля фразой восстановления хранится только локально (`meta` `${userId}::vault_recovery_wrap`, `shared/crypto/recoveryKey.ts`). Если устройство потеряно и пароль забыт, фраза бесполезна, и зашифрованные заметки на сервере не восстановить.

Решение (PR 0s): обёртку хранить и на сервере, рядом с солью vault. Это безопасно: она зашифрована AES-GCM ключом из фразы с 192 битами энтропии. Фиксированную соль `nordly-recovery-v1` заменить случайной солью на пользователя, которая хранится рядом с обёрткой. Сервер — новые поля в `POST /v1/notes/vault/init` / `GET /v1/notes/vault/salt` (или отдельный RPC). Обновить ADR 002 и `services/notes/AGENTS.md`. В мастере: «Фраза восстанавливает доступ на любом устройстве. Храни её как пароль».

### 8.2. Тексты интерфейса (i18n)

Все новые строки — в `apps/shared/i18n/locales/ru.ts` и `en.ts` в том же PR: мастер синка, карточка, статусы, ошибки (`not_found`, `bad_url`, `vault_root_missing`…), страница Review, бейдж Live. Ключи — в существующих неймспейсах: `nordly.notes.sync.*`, `nordly.settings.sync.*`, `nordly.cards.*`, `nordly.whiteboard.live.*`. Ошибки показывать по коду через i18n, а не сырым `err.message` на английском, как сейчас `FS_VAULT_CLOUD_MESSAGE`.

### 8.3. Бюджет бандла

После PR 3 и 4: `npm run build:vite && node scripts/check-bundle-budgets.mjs` в `apps/nordly`. `yjs` и live-модуль грузятся лениво вместе со страницей доски; страница Review — `React.lazy`, как остальные `PageStack`-страницы. `App.tsx` не импортирует их статически (правило `apps/nordly/docs/engineering.md`).

### 8.4. Наблюдаемость синка

Счётчики без содержимого (без путей, заголовков, текста) на стороне сервиса notes в существующем `/metrics`: число push/pull, ошибки по коду, созданные копии конфликтов. Панель в дашборде **Product** (`deploy/grafana/README.md`). На клиенте — только `useSyncStore.lastError` и статус из раздела 5.

### 8.5. Windows

Сборки под Windows есть (`desktop.json` capabilities). Проверить:

- сверка vault: пути из Rust приходят с `/` (как `isVaultRelPath`), сравнение без учёта регистра на NTFS не ломает индекс (два пути, различающиеся регистром, → ошибка, не тихое слияние);
- отключение подстановок текста (H1) — только `#[cfg(target_os = "macos")]`;
- `shell_open_external`, drag-and-drop корней (S8) — пути Windows.

---

## Разбивка на PR

| PR | Содержимое | Риск |
|----|------------|------|
| 0a | Синк заметок: `notes_sync` + `isNotesSyncEnabled`, выключатель + мастер включения (индикатор надёжности пароля), мягкая карточка, статус, блок публикации. Закрывает S1 | средний: новый UI и гейт во всех точках синка |
| 0s | Безопасность синка: запрет даунгрейда при pull (S3), перешифровка при включении E2EE (S2), новый конверт + KDF 600k (S4, S5), `wikiLinks` при E2EE (S7), recovery на любом устройстве (8.1). Сервис notes: отдельный снимок публикации (S6). Сброс prod-данных notes | высокий: формат шифротекста; сброс данных необратим |
| 0b | Синк заметок: индекс + сверка (внешние правки, удаления, конфликт-копии, дешёвый pull), публикация заметок из папки вместе с картинками (I9) | высокий: данные пользователя, нужны тесты на каждую ветку |
| W1 | ✅ Сделано 2026-10-20: веб-доска, скрыт `.HintViewer` (раздел 4, «обрезанная подсказка») | минимальный |
| 1 | Блоки кода: B1–B6 + тесты; H1 после repro | низкий, только редактор |
| 1b | Картинки: блочный виджет, стабильная высота, пути, понятные ошибки (I1–I4, I7, I8). Rust: корни импорта только из drag-and-drop (S8) | средний: геометрия редактора, нужна ручная проверка |
| 2 | `parseWikiTarget`, `[[link:…]]`, кликабельные `[text](url)`, автодополнение ключей, веб-рендер, `![[file\|300]]` (I5, I6) | низкий |
| 3 | Карточки: парсер + SM-2 + IDB v7 + страница Review + настройка + Palette | низкий |
| 3b | Home-чип, перерыв помодоро, стили `::` в редакторе | низкий |
| 4 | `apps/shared/collab` + live-режим доски в app + CSP | высокий: сеть, конкурентность, два клиента |
