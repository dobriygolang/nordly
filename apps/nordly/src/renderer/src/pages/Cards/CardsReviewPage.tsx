import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  buildCardDeck,
  gradeCard,
  type CardDeck,
  type DeckCard,
  type Grade,
} from '@features/cards/api/cardsClient';
import { readSettings } from '@shared/model/settings';
import { openSettings, SettingsSectionId } from '@shared/model/settingsNav';

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
      if (!card || busy || !revealed) return;
      setBusy(true);
      void gradeCard({ key: card.key, front: card.front }, next)
        .then(() => {
          setReviewed((count) => count + 1);
          setIndex((current) => current + 1);
          setRevealed(false);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setBusy(false));
    },
    [busy, card, revealed],
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
        <button type="button" className="nordly-cards__back focus-ring" onClick={onClose}>
          {t('nordly.cards.back')}
        </button>
        <h1 className="nordly-cards__title">{t('nordly.cards.title')}</h1>
        {noteId ? (
          <button type="button" className="nordly-cards__back focus-ring" onClick={onShowAll}>
            {t('nordly.cards.all_notes')}
          </button>
        ) : null}
      </header>
      {!enabled ? (
        <div className="nordly-cards__panel">
          <p>{t('nordly.cards.disabled')}</p>
          <button
            type="button"
            className="nordly-cards__primary focus-ring"
            onClick={() => openSettings({ section: SettingsSectionId.General })}
          >
            {t('nordly.cards.open_settings')}
          </button>
        </div>
      ) : error ? (
        <p className="nordly-cards__error">{error}</p>
      ) : !shown ? (
        <p className="nordly-cards__muted">{t('nordly.cards.loading')}</p>
      ) : (
        <ReviewBody
          deck={shown}
          card={card}
          revealed={revealed}
          reviewed={reviewed}
          busy={busy}
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
  revealed,
  reviewed,
  busy,
  onReveal,
  onGrade,
}: {
  deck: CardDeck;
  card: DeckCard | null;
  revealed: boolean;
  reviewed: number;
  busy: boolean;
  onReveal: () => void;
  onGrade: (grade: Grade) => void;
}): JSX.Element {
  const t = useT();
  return (
    <div className="nordly-cards__body">
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
        <div className="nordly-cards__panel">
          <p>{t('nordly.cards.done', { count: String(reviewed) })}</p>
        </div>
      ) : (
        <div className="nordly-cards__panel">
          <p className="nordly-cards__kicker">
            {card.noteTitle} · {card.isNew ? t('nordly.cards.new') : t('nordly.cards.due')}
          </p>
          <p className="nordly-cards__front">{card.front}</p>
          {revealed ? <p className="nordly-cards__answer">{card.back}</p> : null}
          {revealed ? (
            <div className="nordly-cards__grades">
              {GRADES.map((grade, gradeIndex) => (
                <button
                  key={grade}
                  type="button"
                  className="nordly-cards__grade focus-ring"
                  disabled={busy}
                  onClick={() => onGrade(grade)}
                >
                  {gradeIndex + 1} {t(`nordly.cards.grade.${grade}`)}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="nordly-cards__primary focus-ring" onClick={onReveal}>
              {t('nordly.cards.show')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
