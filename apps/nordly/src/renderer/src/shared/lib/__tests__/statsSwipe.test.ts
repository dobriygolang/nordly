import { describe, expect, it } from 'vitest';

import { StatsSwipeGesture, statsSwipeAction } from '../statsSwipe';

describe('statsSwipeAction', () => {
  it('opens on a leftward swipe only while stats are closed', () => {
    expect(statsSwipeAction(80, false)).toBe('open');
    expect(statsSwipeAction(80, true)).toBeNull();
  });

  it('closes on a rightward swipe only while stats are open', () => {
    expect(statsSwipeAction(-80, true)).toBe('close');
    expect(statsSwipeAction(-80, false)).toBeNull();
  });
});

describe('StatsSwipeGesture', () => {
  it('commits one action per gesture and ignores the rest of that swipe', () => {
    const gesture = new StatsSwipeGesture();
    expect(gesture.push(40, 0)).toBeNull();
    expect(gesture.push(40, 16)).toBe(80);
    expect(gesture.push(40, 32)).toBeNull();
  });

  it('starts a new gesture after the gap', () => {
    const gesture = new StatsSwipeGesture();
    expect(gesture.push(80, 0)).toBe(80);
    expect(gesture.push(-80, 400)).toBe(-80);
  });
});
