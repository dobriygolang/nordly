import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  buildCardDeck,
  gradeCard,
  type CardDeck,
  type DeckCard,
  type Grade,
} from '@features/cards/api/cardsClient';
import { scheduleReview } from '@features/cards/lib/scheduleReview';
import { toDayKey } from '@shared/lib/dates';
import { readSettings } from '@shared/model/settings';
import { openSettings, SettingsSectionId } from '@shared/model/settingsNav';
import { Icon } from '@shared/ui/primitives/Icon';

const GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];

interface CardsReviewPageProps {
  noteId: string | null;
  limit?: number | null;
  onClose: () => void;
  onShowAll: () => void;
}

export function CardsReviewPage({ noteId, limit = null, onClose, onShowAll }: CardsReviewPageProps): JSX.Element {
  const t = useT();
  const enabled = readSettings().flashcards.enabled;
  const [deck, setDeck] = useState<CardDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(Boolean(noteId || limit));
  const [reload, setReload] = useState(0);
  const gradingRef = useRef(false);
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    sessionRef.current += 1;
    gradingRef.current = false;
    setDeck(null);
    setError(null);
    setIndex(0);
    setRevealed(false);
    setReviewed(0);
    setBusy(false);
    setStarted(Boolean(noteId || limit));
    void buildCardDeck(noteId)
      .then((next) => {
        if (!cancelled) setDeck(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      sessionRef.current += 1;
    };
  }, [enabled, noteId, limit, reload]);

  const shown = deck
    ? { ...deck, queue: limit && limit > 0 ? deck.queue.slice(0, limit) : deck.queue }
    : null;
  const card = shown?.queue[index] ?? null;

  const grade = useCallback(
    (next: Grade) => {
      if (!card || gradingRef.current || !revealed || !started) return;
      gradingRef.current = true;
      const session = sessionRef.current;
      setBusy(true);
      setError(null);
      void gradeCard({ key: card.key, front: card.front }, next)
        .then(() => {
          if (session !== sessionRef.current) return;
          setReviewed((count) => count + 1);
          setIndex((current) => current + 1);
          setRevealed(false);
        })
        .catch((err: unknown) => {
          if (session !== sessionRef.current) return;
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (session !== sessionRef.current) return;
          gradingRef.current = false;
          setBusy(false);
        });
    },
    [card, revealed, started],
  );

  useEffect(() => {
    if (!enabled || !deck || !started) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && card && !revealed) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      const gradeIndex = ['1', '2', '3', '4'].indexOf(event.key);
      if (gradeIndex >= 0 && revealed && !event.repeat) {
        event.preventDefault();
        grade(GRADES[gradeIndex]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, deck, enabled, grade, revealed, started]);

  return (
    <section className="nordly-cards">
      <header className="nordly-cards__header">
        <button type="button" className="nordly-cards__icon-btn focus-ring" onClick={onClose} aria-label={t('nordly.cards.back')}>
          <Icon name="chevron-left" size={16} />
        </button>
        <h1 className="nordly-cards__title">{t('nordly.cards.title')}</h1>
        <div className="nordly-cards__header-end">
          {shown && card && started ? (
            <p className="nordly-cards__progress">
              {t('nordly.cards.progress', {
                current: String(index + 1),
                total: String(shown.queue.length),
              })}
            </p>
          ) : null}
          <button type="button" className="nordly-cards__text-btn focus-ring" onClick={() => openSettings({ section: SettingsSectionId.Cards })}>
            {t('nordly.cards.settings')}
          </button>
          {noteId ? (
            <button type="button" className="nordly-cards__text-btn focus-ring" onClick={onShowAll}>
              {t('nordly.cards.all_notes')}
            </button>
          ) : null}
        </div>
      </header>
      {shown && shown.queue.length > 0 && started ? (
        <div className="nordly-cards__track" role="progressbar" aria-label={t('nordly.cards.title')} aria-valuemin={0} aria-valuemax={shown.queue.length} aria-valuenow={index}>
          <div
            className="nordly-cards__track-fill"
            style={{ width: `${Math.min(100, (index / shown.queue.length) * 100)}%` }}
          />
        </div>
      ) : null}
      {!enabled ? (
        <div className="nordly-cards__stage">
          <div className="nordly-cards__panel">
            <p className="nordly-cards__front">{t('nordly.cards.disabled')}</p>
            <button
              type="button"
              className="nordly-cards__primary focus-ring motion-press"
              onClick={() => openSettings({ section: SettingsSectionId.Cards })}
            >
              {t('nordly.cards.open_settings')}
            </button>
          </div>
        </div>
      ) : error && !shown ? (
        <div className="nordly-cards__stage"><div className="nordly-cards__panel">
          <p className="nordly-cards__error" role="alert">{error}</p>
          <button className="nordly-cards__primary focus-ring" onClick={() => setReload((value) => value + 1)}>{t('nordly.cards.retry')}</button>
        </div></div>
      ) : !shown ? (
        <p className="nordly-cards__muted">{t('nordly.cards.loading')}</p>
      ) : !started && card ? (
        <div className="nordly-cards__stage"><div className="nordly-cards__intro">
          <span className="nordly-cards__intro-icon"><Icon name="grid" size={26} /></span>
          <p className="nordly-cards__queue-count">{t('nordly.cards.queue_count', { count: String(shown.queue.length) })}</p>
          <h2>{t('nordly.cards.ready')}</h2>
          <p className="nordly-cards__muted">{t('nordly.cards.ready_hint')}</p>
          <button className="nordly-cards__primary focus-ring" onClick={() => setStarted(true)}>{t('nordly.cards.start')}</button>
        </div></div>
      ) : (
        <>
        {error ? <p className="nordly-cards__error" role="alert">{error}</p> : null}
        <ReviewBody
          deck={shown}
          card={card}
          index={index}
          revealed={revealed}
          reviewed={reviewed}
          busy={busy}
          onReveal={() => setRevealed(true)}
          onGrade={grade}
          onClose={onClose}
        />
        </>
      )}
    </section>
  );
}

function ReviewBody({
  deck,
  card,
  index,
  revealed,
  reviewed,
  busy,
  onReveal,
  onGrade,
  onClose,
}: {
  deck: CardDeck;
  card: DeckCard | null;
  index: number;
  revealed: boolean;
  reviewed: number;
  busy: boolean;
  onReveal: () => void;
  onGrade: (grade: Grade) => void;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const today = toDayKey(new Date());
  return (
    <div className="nordly-cards__stage">
      <div className="nordly-cards__column">
        {deck.issues.length > 0 ? (
          <p className="nordly-cards__notice">
            {t('nordly.cards.issues', { count: String(deck.issues.length) })}
          </p>
        ) : null}
        {!card ? (
          <div className="nordly-cards__panel motion-pop-in">
            <span className="nordly-cards__intro-icon"><Icon name="check" size={26} /></span>
            <p className="nordly-cards__front">{reviewed ? t('nordly.cards.done', { count: String(reviewed) }) : t('nordly.cards.no_due')}</p>
            {!reviewed ? <p className="nordly-cards__muted">{t('nordly.cards.no_due_hint')}</p> : null}
            <button className="nordly-cards__primary focus-ring" onClick={onClose}>{t('nordly.cards.finish')}</button>
          </div>
        ) : (
          <div
            key={index}
            className="nordly-cards__panel motion-pop-in"
          >
            <div className="nordly-cards__meta">
              <span className="nordly-cards__note" title={card.noteTitle}>{t('nordly.cards.source', { name: card.noteTitle })}</span>
              <span className="nordly-cards__pill">
                {card.isNew ? t('nordly.cards.new') : t('nordly.cards.due')}
              </span>
            </div>
            <div className="nordly-cards__question"><p className="nordly-cards__kicker">{t('nordly.cards.question')}</p><p className="nordly-cards__front">{card.front}</p></div>
            {revealed ? <div className="nordly-cards__answer" aria-live="polite"><p className="nordly-cards__kicker">{t('nordly.cards.answer')}</p><p>{card.back}</p></div> : null}
            {revealed ? (
              <><p className="nordly-cards__hint">{t('nordly.cards.grade_hint')}</p>
              <div className="nordly-cards__grades">
                {GRADES.map((grade, gradeIndex) => {
                  const interval = scheduleReview(card.review, grade, today).intervalDays;
                  return (
                    <button
                      key={grade}
                      type="button"
                      className="nordly-cards__grade focus-ring"
                      data-grade={grade}
                      disabled={busy}
                      onClick={() => onGrade(grade)}
                    >
                      <span className="nordly-cards__grade-key">{gradeIndex + 1}</span>
                      <span>{t(`nordly.cards.grade.${grade}`)}</span>
                      <span className="nordly-cards__grade-when">
                        {t('nordly.cards.interval_days', { count: String(interval) })}
                      </span>
                    </button>
                  );
                })}
              </div>
              </>
            ) : (
              <div className="nordly-cards__actions">
                <button type="button" className="nordly-cards__primary focus-ring motion-press" onClick={onReveal}>
                  {t('nordly.cards.show')}
                </button>
                <p className="nordly-cards__hint">{t('nordly.cards.reveal_hint')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
