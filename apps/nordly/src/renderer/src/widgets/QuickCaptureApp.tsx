import { useCallback, useEffect, useRef, useState } from 'react';

import { emit, listen } from '@tauri-apps/api/event';

import { useT } from '@nordly-i18n';

import { createNote } from '@features/notes/api/notesClient';
import { splitQuickCaptureText } from '@features/quickCapture/lib/quickCaptureNote';
import { hideQuickCaptureWindow } from '@features/quickCapture/lib/quickCaptureBridge';
import { applyTheme } from '@shared/lib/applyTheme';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { readStoredTheme, type ThemeId } from '@shared/model/theme';
import { useSessionStore } from '@shared/model/session';

function readTheme(): void {
  applyTheme(readStoredTheme());
}

export function QuickCaptureApp(): JSX.Element {
  const t = useT();
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const hydrate = useSessionStore((s) => s.hydrate);
  const clear = useSessionStore((s) => s.clear);
  const status = useSessionStore((s) => s.status);

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef('');
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    readTheme();
    void bootstrap();

    const bridge = window.nordly;
    const offAuth = bridge?.on('authChanged', (session) => {
      if (session) {
        if (useSessionStore.getState().status === 'guest') return;
        hydrate({
          userId: session.userId,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
        });
      } else {
        void clear({ skipNativeLogout: true });
      }
    });

    const onSettings = () => readTheme();
    window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettings);

    const unsubs: Array<() => void> = [];
    void listen<ThemeId>('theme:sync', ({ payload }) => {
      applyTheme(payload);
    }).then((off) => unsubs.push(off));

    return () => {
      offAuth?.();
      window.removeEventListener(NORDLY_EVENTS.settingsChanged, onSettings);
      for (const off of unsubs) off();
    };
  }, [bootstrap, clear, hydrate]);

  const focusEditor = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [];

    unsubs.push(
      listen('quick-capture:show', () => {
        readTheme();
        setVisible(true);
        setError(null);
        setText(draftRef.current);
        window.requestAnimationFrame(() => focusEditor());
      }),
    );

    unsubs.push(
      listen('quick-capture:hide', () => {
        draftRef.current = textRef.current;
        setVisible(false);
        setSaving(false);
        setError(null);
      }),
    );

    unsubs.push(
      listen('quick-capture:blur', () => {
        if (!textRef.current.trim()) {
          void hideQuickCaptureWindow();
        }
      }),
    );

    return () => {
      for (const p of unsubs) void p.then((fn) => fn());
    };
  }, [focusEditor]);

  const dismiss = useCallback(async () => {
    draftRef.current = '';
    setText('');
    setError(null);
    await hideQuickCaptureWindow();
  }, []);

  const save = useCallback(async () => {
    if (saving || status !== 'signed_in') return;
    const parts = splitQuickCaptureText(text);
    if (!parts) {
      await dismiss();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const note = await createNote(parts.title, parts.bodyMd);
      draftRef.current = '';
      setText('');
      await emit('quick-capture:saved', { noteId: note.id, title: note.title });
      await hideQuickCaptureWindow();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }, [dismiss, saving, status, text]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void dismiss();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        void save();
      }

      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void save();
      }
    },
    [dismiss, save],
  );

  const sessionBlocked = status === 'unknown';
  const guestBlocked = status === 'guest';

  return (
    <div
      className="nordly-quick-capture-shell"
      data-visible={visible ? 'true' : 'false'}
      data-saving={saving ? 'true' : 'false'}
    >
      <div className="nordly-quick-capture">
        <textarea
          ref={textareaRef}
          className="nordly-quick-capture__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('nordly.quick_capture.placeholder')}
          rows={3}
          spellCheck
          disabled={saving || sessionBlocked || guestBlocked}
          aria-label={t('nordly.quick_capture.placeholder')}
        />
        <div className="nordly-quick-capture__meta mono">
          {sessionBlocked ? (
            <span className="nordly-quick-capture__hint">{t('nordly.quick_capture.loading')}</span>
          ) : guestBlocked ? (
            <span className="nordly-quick-capture__error">{t('nordly.quick_capture.sign_in_required')}</span>
          ) : error ? (
            <span className="nordly-quick-capture__error">{error}</span>
          ) : saving ? (
            <span className="nordly-quick-capture__hint">{t('nordly.quick_capture.saving')}</span>
          ) : (
            <span className="nordly-quick-capture__hint">{t('nordly.quick_capture.hint')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
