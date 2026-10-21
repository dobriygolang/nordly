// LiveMarkdownEditor — Obsidian-style live preview on CodeMirror 6.
// Markdown source is stored as plain text; syntax markers hide when the
// cursor leaves the line and block styles apply immediately (headings, lists, …).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';

import {
  lineWithTranslation,
  splitCardColonLine,
  translateCardFront,
  translationPair,
} from '@features/cards/lib/cardTranslation';
import { markdownLines } from '@nordly-markdown/proseLines';
import { httpsLinkAt, wikiMatchAt, type WikiTarget } from '@nordly-markdown/wikiTarget';
import {
  codeBlockField,
  cardSyntaxFacet,
  imageHrefResolverFacet,
  livePreviewPlugin,
  notesEditorTheme,
  wikiLinkTitlesFacet,
  type ImageHrefResolver,
} from '@shared/lib/codemirror/livePreview';
import {
  notesCodeSyntaxHighlighting,
  notesMarkdownSupport,
} from '@shared/lib/codemirror/notesCodeLanguages';
import { notesKeymap } from '@shared/lib/codemirror/notesKeymap';
import { wikiLinkAutocomplete } from '@shared/lib/codemirror/wikiLinkAutocomplete';
import { normalizedWikiTitles } from '@shared/lib/wikiLinkText';
import { SlashMenu, type EditorAPI } from './SlashMenu';

interface LiveMarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  noteTitles?: string[];
  boardTitles?: string[];
  flashcardsEnabled?: boolean;
  onWikiTargetClick?: (target: WikiTarget) => void;
  /** Resolve nordly-asset: / https hrefs for live preview images. */
  resolveImageHref?: ImageHrefResolver | null;
  /** Paste/drop image → insert markdown snippet at cursor (return null to ignore). */
  onInsertImageFile?: (file: File) => Promise<string | null>;
  onAttachmentError?: (err: unknown) => void;
  /** Focus editor on mount (e.g. Notes opened via hotkey N). */
  autoFocus?: boolean;
}

const reportedTranslationErrors = new WeakSet<Promise<string>>();

function fillCardTranslations(
  update: ViewUpdate,
  opts: {
    enabled: boolean;
    applying: { current: boolean };
    onError: (err: unknown) => void;
  },
): void {
  if (!opts.enabled || opts.applying.current) return;
  let addedColon = false;
  update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.toString().includes(':')) addedColon = true;
  });
  if (!addedColon) return;
  const rows = markdownLines(update.state.doc.toString());
  const seen = new Set<number>();
  update.changes.iterChanges((_fromA, _toA, fromB, toB) => {
    const start = update.state.doc.lineAt(fromB).number;
    const end = update.state.doc.lineAt(Math.max(fromB, toB)).number;
    for (let number = start; number <= end; number += 1) seen.add(number);
  });
  for (const number of seen) {
    const row = rows[number - 1];
    if (!row || row.inFence) continue;
    const split = splitCardColonLine(row.text);
    if (!split || split.back || !translationPair(split.front)) continue;
    const front = split.front;
    const pending = translateCardFront(front);
    void pending
      .then((translation) => {
        const view = update.view;
        if (opts.applying.current || number < 1 || number > view.state.doc.lines) return;
        const line = view.state.doc.line(number);
        const current = splitCardColonLine(line.text);
        if (!current || current.front !== front) return;
        const next = lineWithTranslation(line.text, translation);
        if (!next || next === line.text) return;
        const head = view.state.selection.main.head;
        const onLine = head >= line.from && head <= line.to;
        opts.applying.current = true;
        try {
          view.dispatch({
            changes: { from: line.from, to: line.to, insert: next },
            selection: onLine ? { anchor: line.from + next.length } : undefined,
          });
        } finally {
          opts.applying.current = false;
        }
      })
      .catch((err: unknown) => {
        if (reportedTranslationErrors.has(pending)) return;
        reportedTranslationErrors.add(pending);
        opts.onError(err instanceof Error ? err : new Error('MyMemory returned no translation'));
      });
  }
}

function findSlashTrigger(state: EditorState): { slashStart: number; query: string } | null {
  const range = state.selection.main;
  if (!range.empty) return null;

  const pos = range.from;
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos);
  let i = before.length - 1;
  while (i >= 0) {
    const ch = before.charAt(i);
    if (ch === '/') break;
    if (ch === '\n' || ch === ' ' || ch === '\t') return null;
    i -= 1;
  }
  if (i < 0) return null;

  const slashStart = line.from + i;
  if (i > 0) {
    const prev = before.charAt(i - 1);
    if (prev !== '\n' && prev !== ' ' && prev !== '\t') return null;
  }

  return { slashStart, query: before.slice(i + 1) };
}

export function LiveMarkdownEditor({
  value,
  onChange,
  placeholder,
  noteTitles = [],
  boardTitles = [],
  flashcardsEnabled = false,
  onWikiTargetClick,
  resolveImageHref = null,
  onInsertImageFile,
  onAttachmentError,
  autoFocus = false,
}: LiveMarkdownEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onWikiTargetClickRef = useRef(onWikiTargetClick);
  const onInsertImageFileRef = useRef(onInsertImageFile);
  const onAttachmentErrorRef = useRef(onAttachmentError);
  const flashcardsEnabledRef = useRef(flashcardsEnabled);
  const applyingCardTranslationRef = useRef(false);
  /** Last doc string we pushed via onChange — ignore stale React props lagging behind. */
  const lastEmittedRef = useRef(value);
  const awaitingEchoRef = useRef(false);
  const titlesCompartmentRef = useRef(new Compartment());
  const autocompleteCompartmentRef = useRef(new Compartment());
  const imageResolverCompartmentRef = useRef(new Compartment());
  const cardSyntaxCompartmentRef = useRef(new Compartment());
  onChangeRef.current = onChange;
  onWikiTargetClickRef.current = onWikiTargetClick;
  onInsertImageFileRef.current = onInsertImageFile;
  onAttachmentErrorRef.current = onAttachmentError;
  flashcardsEnabledRef.current = flashcardsEnabled;

  const resolvedTitles = useMemo(() => normalizedWikiTitles(noteTitles), [noteTitles]);

  const [slash, setSlash] = useState<{ x: number; y: number; query: string; slashStart: number } | null>(
    null,
  );

  const updateSlash = useCallback((view: EditorView) => {
    if (document.activeElement !== view.contentDOM) {
      setSlash(null);
      return;
    }
    const trigger = findSlashTrigger(view.state);
    if (!trigger) {
      setSlash(null);
      return;
    }
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (!coords) {
      setSlash(null);
      return;
    }
    setSlash({
      x: coords.left,
      y: coords.bottom + 4,
      query: trigger.query,
      slashStart: trigger.slashStart,
    });
  }, []);

  useEffect(() => {
    const parent = mountRef.current;
    if (!parent) return;

    lastEmittedRef.current = value;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          notesMarkdownSupport,
          notesCodeSyntaxHighlighting,
          codeBlockField,
          livePreviewPlugin,
          notesEditorTheme,
          EditorView.contentAttributes.of({
            autocorrect: 'off',
            autocapitalize: 'off',
            spellcheck: 'false',
          }),
          titlesCompartmentRef.current.of(wikiLinkTitlesFacet.of(resolvedTitles)),
          imageResolverCompartmentRef.current.of(imageHrefResolverFacet.of(resolveImageHref)),
          autocompleteCompartmentRef.current.of(wikiLinkAutocomplete(noteTitles, boardTitles)),
          cardSyntaxCompartmentRef.current.of(cardSyntaxFacet.of(flashcardsEnabled)),
          EditorView.lineWrapping,
          EditorView.domEventHandlers({
            paste(event, view) {
              const insert = onInsertImageFileRef.current;
              if (!insert || !event.clipboardData) return false;
              const files = Array.from(event.clipboardData.files).filter((f) =>
                f.type.startsWith('image/'),
              );
              if (files.length === 0) return false;
              event.preventDefault();
              void (async () => {
                try {
                  let pos = view.state.selection.main.from;
                  for (const file of files) {
                    const md = await insert(file);
                    if (!md) throw new Error('image insert returned empty markdown');
                    const insertText = (pos > 0 && view.state.doc.sliceString(pos - 1, pos) !== '\n' ? '\n' : '') + md + '\n';
                    view.dispatch({
                      changes: { from: pos, to: pos, insert: insertText },
                      selection: { anchor: pos + insertText.length },
                    });
                    pos += insertText.length;
                  }
                } catch (err) {
                  onAttachmentErrorRef.current?.(err);
                }
              })();
              return true;
            },
            drop(event, view) {
              const insert = onInsertImageFileRef.current;
              if (!insert || !event.dataTransfer) return false;
              const files = Array.from(event.dataTransfer.files).filter((f) =>
                f.type.startsWith('image/'),
              );
              if (files.length === 0) return false;
              event.preventDefault();
              const pos =
                view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
                view.state.selection.main.from;
              void (async () => {
                try {
                  let cursor = pos;
                  for (const file of files) {
                    const md = await insert(file);
                    if (!md) throw new Error('image insert returned empty markdown');
                    const insertText = '\n' + md + '\n';
                    view.dispatch({
                      changes: { from: cursor, to: cursor, insert: insertText },
                      selection: { anchor: cursor + insertText.length },
                    });
                    cursor += insertText.length;
                  }
                } catch (err) {
                  onAttachmentErrorRef.current?.(err);
                }
              })();
              return true;
            },
            dragover(event) {
              if (!onInsertImageFileRef.current) return false;
              const types = event.dataTransfer?.types;
              if (types && Array.from(types).includes('Files')) {
                event.preventDefault();
                return true;
              }
              return false;
            },
            mousedown(event, view) {
              if (event.button !== 0) return false;
              const target = event.target as HTMLElement | null;
              const checkbox = target?.closest<HTMLElement>('.nordly-md-checkbox-marker');
              if (checkbox) {
                const pos = Number(checkbox.dataset.checkboxPos);
                if (!Number.isInteger(pos)) return false;
                const current = view.state.sliceDoc(pos + 1, pos + 2);
                if (current !== ' ' && current.toLowerCase() !== 'x') return false;
                event.preventDefault();
                view.dispatch({
                  changes: {
                    from: pos + 1,
                    to: pos + 2,
                    insert: current === ' ' ? 'x' : ' ',
                  },
                });
                view.focus();
                return true;
              }
              const wikiEl = target?.closest('.nordly-md-wiki-link');
              const linkEl = target?.closest('.nordly-md-link');
              if (!wikiEl && !linkEl) return false;
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (pos == null || !onWikiTargetClickRef.current) return false;
              const line = view.state.doc.lineAt(pos);
              const column = pos - line.from;
              const wiki = wikiMatchAt(line.text, column);
              if (wiki && !wiki.embed && wiki.target.kind !== 'invalid') {
                event.preventDefault();
                void onWikiTargetClickRef.current(wiki.target);
                return true;
              }
              const url = httpsLinkAt(line.text, column);
              if (!url) return false;
              event.preventDefault();
              void onWikiTargetClickRef.current({ kind: 'link', url });
              return true;
            },
          }),
          keymap.of([...notesKeymap, ...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const next = update.state.doc.toString();
              lastEmittedRef.current = next;
              awaitingEchoRef.current = true;
              onChangeRef.current(next);
              fillCardTranslations(update, {
                enabled: flashcardsEnabledRef.current,
                applying: applyingCardTranslationRef,
                onError: (err) => onAttachmentErrorRef.current?.(err),
              });
            }
            if (update.docChanged || update.selectionSet) {
              updateSlash(update.view);
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    updateSlash(view);

    if (autoFocus) {
      // Defer past page-layer paint so focus sticks after hotkey N → Notes.
      requestAnimationFrame(() => {
        if (viewRef.current !== view) return;
        const end = view.state.doc.length;
        view.dispatch({
          selection: { anchor: end },
          scrollIntoView: true,
        });
        view.focus();
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once per editor instance (parent remounts via key={noteId}).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        titlesCompartmentRef.current.reconfigure(wikiLinkTitlesFacet.of(resolvedTitles)),
        autocompleteCompartmentRef.current.reconfigure(wikiLinkAutocomplete(noteTitles, boardTitles)),
        imageResolverCompartmentRef.current.reconfigure(
          imageHrefResolverFacet.of(resolveImageHref),
        ),
        cardSyntaxCompartmentRef.current.reconfigure(cardSyntaxFacet.of(flashcardsEnabled)),
      ],
    });
  }, [noteTitles, boardTitles, resolvedTitles, resolveImageHref, flashcardsEnabled]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === value) {
      lastEmittedRef.current = value;
      awaitingEchoRef.current = false;
      return;
    }
    // React prop caught up late (e.g. value="-" while doc is already "- ").
    // Do not wipe the newer local edit — that ate spaces after "-" and broke bullets.
    if (
      awaitingEchoRef.current &&
      cur === lastEmittedRef.current &&
      value !== lastEmittedRef.current
    ) {
      return;
    }
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: value },
    });
    lastEmittedRef.current = value;
    awaitingEchoRef.current = false;
    updateSlash(view);
  }, [value, updateSlash]);

  const editorApi = useMemo((): EditorAPI => {
    const replaceSlashWith = (insert: string, cursorOffset?: number) => {
      const view = viewRef.current;
      if (!view || !slash) return;
      const pos = view.state.selection.main.from;
      view.dispatch({
        changes: { from: slash.slashStart, to: pos, insert },
        selection: {
          anchor: slash.slashStart + (cursorOffset ?? insert.length),
        },
      });
      setSlash(null);
      view.focus();
    };
    return {
      insertBlock: (prefix) => replaceSlashWith(prefix),
      insertCodeBlock: () => {
        const block = '```go\n\n```\n';
        replaceSlashWith(block, '```go\n'.length);
      },
    };
  }, [slash]);

  const removeSlashQuery = useCallback(() => {
    const view = viewRef.current;
    if (!view || !slash) return;
    const pos = view.state.selection.main.from;
    view.dispatch({
      changes: { from: slash.slashStart, to: pos, insert: '' },
      selection: { anchor: slash.slashStart },
    });
  }, [slash]);

  const empty = value.length === 0 && lastEmittedRef.current.length === 0;

  return (
    <div className="nordly-live-md" data-empty={empty ? 'true' : 'false'} data-placeholder={placeholder ?? ''}>
      <div ref={mountRef} className="nordly-live-md__mount" />
      {slash && (
        <SlashMenu
          x={slash.x}
          y={slash.y}
          query={slash.query}
          editor={editorApi}
          onClose={() => setSlash(null)}
          onBeforeAction={removeSlashQuery}
        />
      )}
    </div>
  );
}
