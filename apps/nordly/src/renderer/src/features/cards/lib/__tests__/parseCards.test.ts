import { describe, expect, it } from 'vitest';

import { cardKey } from '../cardKey';
import { parseCards } from '../parseCards';
import { scheduleReview } from '../scheduleReview';

describe('parseCards', () => {
  it('reads one-way and two-way cards and ignores the list marker', () => {
    const body = '- ubiquitous :: вездесущий\n- to come up with ::: придумать\nplain';
    const { cards, issues } = parseCards('n1', 'Words', body);
    expect(issues).toEqual([]);
    expect(cards.map((card) => [card.direction, card.front, card.back])).toEqual([
      ['forward', 'ubiquitous', 'вездесущий'],
      ['forward', 'to come up with', 'придумать'],
      ['reverse', 'придумать', 'to come up with'],
    ]);
  });

  it('reports an empty side and skips fenced and inline separators', () => {
    const body = ':: only back\nfront ::\n```\nhidden :: no\n```\n`a :: b` then real :: answer';
    const { cards, issues } = parseCards('n1', 'Words', body);
    expect(issues.map((issue) => issue.reason)).toEqual(['empty_front', 'empty_back']);
    expect(cards.map((card) => card.front)).toEqual(['`a :: b` then real']);
  });

  it('does not read a card from inside a longer fence', () => {
    const body = '````\n```\nhidden :: no\n````\nvisible :: yes';
    const { cards } = parseCards('n1', 'Words', body);
    expect(cards.map((card) => card.front)).toEqual(['visible']);
  });

  it('keeps the same key when the question only changes case or spacing', () => {
    const first = parseCards('n1', 'A', 'Hello   World :: hi').cards[0]!;
    const second = parseCards('n2', 'B', 'hello world :: yo').cards[0]!;
    expect(first.key).toBe(second.key);
    expect(first.key).toBe(cardKey('Hello World', 'forward'));
  });
});

describe('scheduleReview', () => {
  it('schedules again for tomorrow and resets repetitions', () => {
    const next = scheduleReview(
      { due: '2026-10-20', intervalDays: 6, ease: 2.5, reps: 2, lapses: 0 },
      'again',
      '2026-10-20',
    );
    expect(next).toMatchObject({ due: '2026-10-21', intervalDays: 1, reps: 0, lapses: 1 });
  });

  it('uses 1 day, then 6 days, for the first two Good reviews', () => {
    const first = scheduleReview(null, 'good', '2026-10-20');
    expect(first).toMatchObject({ due: '2026-10-21', intervalDays: 1, reps: 1, ease: 2.5 });
    const second = scheduleReview(first, 'good', '2026-10-21');
    expect(second).toMatchObject({ due: '2026-10-27', intervalDays: 6, reps: 2 });
  });
});
