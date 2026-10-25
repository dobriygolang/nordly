import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@shared/model/settings', () => ({ readSettings: () => ({ flashcards: { enabled: true } }) }));
vi.mock('@features/cards/api/cardsClient', () => ({ buildCardDeck: vi.fn(), gradeCard: vi.fn() }));
import { buildCardDeck, gradeCard } from '@features/cards/api/cardsClient';
import { CardsReviewPage } from '../CardsReviewPage';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
const click = async (text: string) => {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(text));
  expect(button).toBeTruthy();
  await act(async () => button!.click());
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildCardDeck).mockResolvedValue({ queue: [{ key: 'key', front: 'Question', back: 'Answer', noteId: 'note', noteTitle: 'Source', direction: 'forward', isNew: true, review: null }], issues: [], duplicates: [], orphans: [] });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe('card review interaction', () => {
  it('requires start and reveal before accepting a grade', async () => {
    await act(async () => root.render(<CardsReviewPage noteId={null} onClose={vi.fn()} onShowAll={vi.fn()} />));
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })));
    expect(gradeCard).not.toHaveBeenCalled();
    await click('Start review');
    expect(container.querySelector('.nordly-cards__answer')).toBeNull();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(container.querySelector('.nordly-cards__answer')?.textContent).toContain('Answer');
  });
  it('keeps the answer and progress when saving a grade fails', async () => {
    vi.mocked(gradeCard).mockRejectedValue(new Error('Storage unavailable'));
    await act(async () => root.render(<CardsReviewPage noteId="note" onClose={vi.fn()} onShowAll={vi.fn()} />));
    await click('Show answer');
    await click('Remembered');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Storage unavailable');
    expect(container.querySelector('.nordly-cards__answer')?.textContent).toContain('Answer');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
  });
});
