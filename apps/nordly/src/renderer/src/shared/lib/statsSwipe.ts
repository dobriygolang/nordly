/** Pixels of horizontal trackpad travel before a stats swipe commits. */
export const STATS_SWIPE_THRESHOLD_PX = 72;
/** Gap that ends one two-finger gesture so the next swipe can fire. */
export const STATS_SWIPE_GAP_MS = 220;

export type StatsSwipeAction = 'open' | 'close';

export function statsSwipeAction(
  deltaX: number,
  statsOpen: boolean,
): StatsSwipeAction | null {
  if (deltaX >= STATS_SWIPE_THRESHOLD_PX) return statsOpen ? null : 'open';
  if (deltaX <= -STATS_SWIPE_THRESHOLD_PX) return statsOpen ? 'close' : null;
  return null;
}

/** True when a wheel event is a horizontal trackpad swipe, not a vertical scroll. */
export function isHorizontalSwipe(deltaX: number, deltaY: number): boolean {
  return Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) >= 1;
}

export class StatsSwipeGesture {
  private accumulated = 0;
  private lastAt = 0;
  private consumed = false;

  push(deltaX: number, now: number): number | null {
    if (now - this.lastAt > STATS_SWIPE_GAP_MS) {
      this.accumulated = 0;
      this.consumed = false;
    }
    this.lastAt = now;
    if (this.consumed) return null;
    this.accumulated += deltaX;
    if (Math.abs(this.accumulated) < STATS_SWIPE_THRESHOLD_PX) return null;
    const total = this.accumulated;
    this.accumulated = 0;
    this.consumed = true;
    return total;
  }
}
