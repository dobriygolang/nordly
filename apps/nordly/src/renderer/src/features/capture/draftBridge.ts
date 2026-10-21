export interface CaptureDraft {
  noteId: string;
  matches: () => boolean;
  setBody: (update: (current: string) => string) => boolean;
  isLocked: () => boolean;
}

let current: CaptureDraft | null = null;

export function registerCaptureDraft(next: CaptureDraft | null): void {
  current = next;
}

export function currentCaptureDraft(): CaptureDraft | null {
  return current;
}
