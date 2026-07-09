/** Fixed vault row menu — right edge aligned to the … button (whiteboard style). */
export function noteMenuPos(
  anchor: DOMRect,
  width: number,
  opts?: { gap?: number; margin?: number },
): { top: number; right: number } {
  const gap = opts?.gap ?? 4;
  const margin = opts?.margin ?? 8;

  let right = window.innerWidth - anchor.right;
  if (anchor.right - width < margin) {
    right = window.innerWidth - margin - width;
  }

  return { top: anchor.bottom + gap, right };
}
