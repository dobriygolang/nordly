/** Pointer capture often throws InvalidStateError when already released — ignore that only. */
export function trySetPointerCapture(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'InvalidStateError') return;
    console.warn('[pointer] setPointerCapture failed', err);
  }
}

export function tryReleasePointerCapture(el: Element, pointerId: number): void {
  try {
    el.releasePointerCapture(pointerId);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'InvalidStateError') return;
    console.warn('[pointer] releasePointerCapture failed', err);
  }
}
