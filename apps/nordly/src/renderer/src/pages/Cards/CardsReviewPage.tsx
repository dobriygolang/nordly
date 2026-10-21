import { useCallback, useEffect, useState } from 'react';

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
  const [exitGrade, setExitGrade] = useState<Grade | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setDeck(null);
    setError(null);
    setIndex(0);
    setRevealed(false);
    setReviewed(0);
    void buildCardDeck(noteId)
      .then((next) => {
        if (!cancelled) setDeck(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, noteId]);

  const shown = deck
    ? { ...deck, queue: limit && limit > 0 ? deck.queue.slice(0, limit) : deck.queue }
    : null;
  const card = shown?.queue[index] ?? null;

  const grade = useCallback(
    (next: Grade) => {
      if (!card || busy || !revealed || exitGrade) return;
      setExitGrade(next);
      window.setTimeout(() => {
        setBusy(true);
        void gradeCard({ key: card.key, front: card.front }, next)
          .then(() => {
            setReviewed((count) => count + 1);
            setIndex((current) => current + 1);
            setRevealed(false);
            setExitGrade(null);
          })
          .catch((err: unknown) => {
            setExitGrade(null);
            setError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => setBusy(false));
      }, 160);
    },
    [busy, card, exitGrade, revealed],
  );

  useEffect(() => {
    if (!enabled || !deck) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === ' ' && card && !revealed) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      const gradeIndex = ['1', '2', '3', '4'].indexOf(event.key);
      if (gradeIndex >= 0 && revealed) {
        event.preventDefault();
        grade(GRADES[gradeIndex]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, deck, enabled, grade, revealed]);

  return (
    <section className="nordly-cards">
      <header className="nordly-cards__header">
        <button type="button" className="nordly-cards__icon-btn focus-ring" onClick={onClose} aria-label={t('nordly.cards.back')}>
          <Icon name="chevron-left" size={16} />
        </button>
        <h1 className="nordly-cards__title">{t('nordly.cards.title')}</h1>
        <div className="nordly-cards__header-end">
          {shown && card ? (
            <p className="nordly-cards__progress">
              {t('nordly.cards.progress', {
                current: String(index + 1),
                total: String(shown.queue.length),
              })}
            </p>
          ) : null}
          {noteId ? (
            <button type="button" className="nordly-cards__text-btn focus-ring" onClick={onShowAll}>
              {t('nordly.cards.all_notes')}
            </button>
          ) : null}
        </div>
      </header>
      {shown && shown.queue.length > 0 ? (
        <div className="nordly-cards__track" aria-hidden="true">
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
              onClick={() => openSettings({ section: SettingsSectionId.General })}
            >
              {t('nordly.cards.open_settings')}
            </button>
          </div>
        </div>
      ) : error ? (
        <p className="nordly-cards__error">{error}</p>
      ) : !shown ? (
        <p className="nordly-cards__muted">{t('nordly.cards.loading')}</p>
      ) : (
        <ReviewBody
          deck={shown}
          card={card}
          index={index}
          revealed={revealed}
          reviewed={reviewed}
          busy={busy}
          exitGrade={exitGrade}
          onReveal={() => setRevealed(true)}
          onGrade={grade}
        />
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
  exitGrade,
  onReveal,
  onGrade,
}: {
  deck: CardDeck;
  card: DeckCard | null;
  index: number;
  revealed: boolean;
  reviewed: number;
  busy: boolean;
  exitGrade: Grade | null;
  onReveal: () => void;
  onGrade: (grade: Grade) => void;
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
        {deck.duplicates.length > 0 ? (
          <p className="nordly-cards__notice">
            {t('nordly.cards.duplicates', { count: String(deck.duplicates.length) })}
          </p>
        ) : null}
        {deck.orphans.length > 0 ? (
          <p className="nordly-cards__notice">
            {t('nordly.cards.orphans', { count: String(deck.orphans.length) })}
          </p>
        ) : null}
        {!card ? (
          <div className="nordly-cards__panel motion-pop-in">
            <p className="nordly-cards__front">{t('nordly.cards.done', { count: String(reviewed) })}</p>
          </div>
        ) : (
          <div
            key={index}
            className="nordly-cards__panel motion-pop-in"
            data-exit={exitGrade ?? undefined}
          >
            <div className="nordly-cards__meta">
              <span className="nordly-cards__note">{card.noteTitle}</span>
              <span className="nordly-cards__pill">
                {card.isNew ? t('nordly.cards.new') : t('nordly.cards.due')}
              </span>
            </div>
            <p className={revealed ? 'nordly-cards__front is-revealed' : 'nordly-cards__front'}>{card.front}</p>
            {revealed ? <p className="nordly-cards__answer">{card.back}</p> : null}
            {revealed ? (
              <div className="nordly-cards__grades">
                {GRADES.map((grade, gradeIndex) => {
                  const interval = scheduleReview(card.review, grade, today).intervalDays;
                  return (
                    <button
                      key={grade}
                      type="button"
                      className="nordly-cards__grade focus-ring"
                      data-grade={grade}
                      disabled={busy || exitGrade !== null}
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
            ) : (
              <div className="nordly-cards__actions">
                <button type="button" className="nordly-cards__primary focus-ring motion-press" onClick={onReveal}>
                  {t('nordly.cards.show')}
                </button>
                <p className="nordly-cards__hint">{t('nordly.cards.show_hint')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
