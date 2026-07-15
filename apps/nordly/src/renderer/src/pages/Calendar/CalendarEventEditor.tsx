import { useEffect, useRef } from 'react';

import { openExternalUrl, formatEntryTime } from '@features/calendar/api/calendar';
import { useT, type Locale } from '@nordly-i18n';
import { formatLocaleDate, formatLocaleTime } from '@shared/lib/localeFormat';
import { useEscapeLayer } from '@shared/hooks/useEscapeLayer';
import { zIndex } from '@shared/lib/z-index';

import type { CalendarEditorState } from './useCalendarEditor';

interface CalendarEventEditorProps {
  editor: CalendarEditorState;
  saving: boolean;
  locale: Locale;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function CalendarEventEditor({
  editor,
  saving,
  locale,
  onTitleChange,
  onSave,
  onDelete,
  onClose,
}: CalendarEventEditorProps): JSX.Element {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  useEscapeLayer(onClose);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const isEdit = editor.mode === 'edit';
  const isTaskCreate = editor.mode === 'create' && editor.kind === 'task';
  const entry = isEdit ? editor.entry : null;
  const readOnly = isEdit && entry ? entry.googleEditable === false : false;
  const start = isEdit ? entry!.start : editor.start;
  const end = isEdit ? entry!.end : editor.end;
  const when = entry?.allDay
    ? `${formatLocaleDate(start, locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatEntryTime(entry, locale)}`
    : `${formatLocaleDate(start, locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatLocaleTime(start, locale)}–${formatLocaleTime(end, locale)}`;

  const heading = isEdit
    ? t('nordly.calendar.editor.edit_title')
    : isTaskCreate
      ? t('nordly.calendar.editor.create_task_title')
      : t('nordly.calendar.editor.create_title');
  const placeholder = isTaskCreate
    ? t('nordly.calendar.editor.task_title_placeholder')
    : t('nordly.calendar.editor.title_placeholder');

  return (
    <div
      className="nordly-calendar-editor-scrim"
      style={{ zIndex: zIndex.modal + 1 }}
      onClick={onClose}
    >
      <div
        className="nordly-calendar-editor motion-pop-in"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="nordly-calendar-editor__heading">{heading}</h3>
        <input
          ref={inputRef}
          className="nordly-calendar-editor__input focus-ring"
          value={editor.title}
          placeholder={placeholder}
          disabled={readOnly || saving}
          onChange={(event) => onTitleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !readOnly) {
              event.preventDefault();
              onSave();
            }
          }}
        />
        <p className="nordly-calendar-editor__when mono">{when}</p>
        {readOnly && (
          <p className="nordly-calendar-editor__note mono">
            {t('nordly.calendar.editor.readonly')}
          </p>
        )}
        <div className="nordly-calendar-editor__actions">
          {isEdit && entry?.googleHtmlLink && (
            <button
              type="button"
              className="nordly-calendar-editor__btn"
              onClick={() => openExternalUrl(entry.googleHtmlLink!)}
            >
              {t('nordly.calendar.editor.open_in_google')}
            </button>
          )}
          {isEdit && !readOnly && (
            <button
              type="button"
              className="nordly-calendar-editor__btn nordly-calendar-editor__btn--danger"
              disabled={saving}
              onClick={onDelete}
            >
              {t('nordly.calendar.editor.delete')}
            </button>
          )}
          <span className="nordly-calendar-editor__spacer" />
          <button
            type="button"
            className="nordly-calendar-editor__btn"
            disabled={saving}
            onClick={onClose}
          >
            {t('nordly.calendar.editor.cancel')}
          </button>
          {!readOnly && (
            <button
              type="button"
              className="nordly-calendar-editor__btn nordly-calendar-editor__btn--primary"
              disabled={saving || !editor.title.trim()}
              onClick={onSave}
            >
              {t('nordly.calendar.editor.save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
