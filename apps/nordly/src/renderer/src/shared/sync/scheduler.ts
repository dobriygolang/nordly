import type { SyncOptions } from '@shared/sync/options';

export const SYNC_DEBOUNCE_MS = 3_000;
export const SYNC_INTERVAL_MS = 60_000;
export const STARTUP_PUSH_DEFER_MS = 1_500;
export const STARTUP_DEFER_MS = 5_000;
export const STARTUP_FOCUS_COOLDOWN_MS = STARTUP_DEFER_MS;

type TimerId = number;

export interface SyncClock {
  now: () => number;
  setTimeout: (callback: () => void, delay: number) => TimerId;
  clearTimeout: (id: TimerId) => void;
  setInterval: (callback: () => void, delay: number) => TimerId;
  clearInterval: (id: TimerId) => void;
}

export type SyncSchedulerDeps = {
  clock: SyncClock;
  windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  documentTarget: Pick<Document, 'addEventListener' | 'removeEventListener'>;
  isVisible: () => boolean;
  canSchedule: () => boolean;
  getSyncState: () => { pendingCount: number; status: string };
  countPending: () => Promise<number>;
  subscribeVault: (listener: (unlocked: boolean) => void) => () => void;
  enqueueBackground: (options: SyncOptions | undefined, source: string) => void;
  flushOnline: () => void;
  onSchedulerError: (err: unknown, source: string) => void;
};

export class SyncScheduler {
  private debounceTimer: TimerId | null = null;
  private intervalId: TimerId | null = null;
  private startupTimer: TimerId | null = null;
  private pushOnlyTimer: TimerId | null = null;
  private focusSyncTimer: TimerId | null = null;
  private engineStartedAt = 0;
  private started = false;
  private vaultUnsubscribe: (() => void) | null = null;

  constructor(private readonly deps: SyncSchedulerDeps) {}

  schedule(): void {
    if (!this.deps.canSchedule()) return;
    this.clearDebounce();
    this.debounceTimer = this.deps.clock.setTimeout(() => {
      this.debounceTimer = null;
      this.deps.enqueueBackground(undefined, 'scheduled');
    }, SYNC_DEBOUNCE_MS);
  }

  clearScheduledSync(): void {
    this.clearDebounce();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.engineStartedAt = this.deps.clock.now();
    this.vaultUnsubscribe = this.deps.subscribeVault((unlocked) => {
      if (unlocked) this.schedule();
    });
    this.deps.windowTarget.addEventListener('online', this.onOnline);
    this.deps.windowTarget.addEventListener('focus', this.onFocus);
    this.deps.documentTarget.addEventListener('visibilitychange', this.onVisible);

    this.intervalId = this.deps.clock.setInterval(() => {
      const state = this.deps.getSyncState();
      if (state.pendingCount > 0 || state.status === 'error' || this.deps.canSchedule()) {
        this.deps.enqueueBackground(undefined, 'interval');
      }
    }, SYNC_INTERVAL_MS);

    this.clearPushOnlyTimer();
    this.pushOnlyTimer = this.deps.clock.setTimeout(() => {
      this.pushOnlyTimer = null;
      if (!this.started) return;
      void this.deps
        .countPending()
        .then((pending) => {
          if (!this.started || pending === 0) return;
          this.deps.enqueueBackground({ pushOnly: true }, 'startup push');
        })
        .catch((err: unknown) => this.deps.onSchedulerError(err, 'startup outbox count'));
    }, STARTUP_PUSH_DEFER_MS);

    this.startupTimer = this.deps.clock.setTimeout(() => {
      this.startupTimer = null;
      if (!this.started) return;
      this.deps.enqueueBackground(undefined, 'startup');
    }, STARTUP_DEFER_MS);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.vaultUnsubscribe?.();
    this.vaultUnsubscribe = null;
    this.deps.windowTarget.removeEventListener('online', this.onOnline);
    this.deps.windowTarget.removeEventListener('focus', this.onFocus);
    this.deps.documentTarget.removeEventListener('visibilitychange', this.onVisible);
    if (this.intervalId !== null) this.deps.clock.clearInterval(this.intervalId);
    this.intervalId = null;
    if (this.startupTimer !== null) this.deps.clock.clearTimeout(this.startupTimer);
    this.startupTimer = null;
    this.clearPushOnlyTimer();
    this.engineStartedAt = 0;
    this.clearDebounce();
    if (this.focusSyncTimer !== null) this.deps.clock.clearTimeout(this.focusSyncTimer);
    this.focusSyncTimer = null;
  }

  private readonly onOnline = (): void => {
    this.deps.flushOnline();
  };

  private readonly onVisible = (): void => {
    if (this.deps.isVisible()) this.scheduleFocusSync();
  };

  private readonly onFocus = (): void => {
    this.scheduleFocusSync();
  };

  private scheduleFocusSync(): void {
    if (this.deps.clock.now() - this.engineStartedAt < STARTUP_FOCUS_COOLDOWN_MS) return;
    if (this.focusSyncTimer !== null) this.deps.clock.clearTimeout(this.focusSyncTimer);
    this.focusSyncTimer = this.deps.clock.setTimeout(() => {
      this.focusSyncTimer = null;
      this.deps.enqueueBackground(undefined, 'focus');
    }, SYNC_DEBOUNCE_MS);
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) this.deps.clock.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  private clearPushOnlyTimer(): void {
    if (this.pushOnlyTimer !== null) this.deps.clock.clearTimeout(this.pushOnlyTimer);
    this.pushOnlyTimer = null;
  }
}

export const browserSyncClock: SyncClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (id) => window.clearTimeout(id),
  setInterval: (callback, delay) => window.setInterval(callback, delay),
  clearInterval: (id) => window.clearInterval(id),
};
