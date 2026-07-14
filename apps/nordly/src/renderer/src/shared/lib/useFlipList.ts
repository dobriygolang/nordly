import { useLayoutEffect, useRef } from 'react';

const FLIP_MS = 160;
const FLIP_EASE = 'cubic-bezier(0.2, 0.65, 0.2, 1)';

function flipKey(el: HTMLElement): string | null {
  return el.dataset.flipKey ?? null;
}

function captureFlipKeys(root: HTMLElement): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  for (const child of root.children) {
    const el = child as HTMLElement;
    const key = flipKey(el);
    if (key) map.set(key, el.getBoundingClientRect());
  }
  return map;
}

/** FLIP layout animation for list children tagged with `data-flip-key`. */
export function useFlipList(itemKeys: string[], layoutSig = '') {
  const ref = useRef<HTMLDivElement>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  const keysSig = itemKeys.join('\0');

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.body.classList.contains('nordly-task-dragging')
    ) {
      prevRects.current = captureFlipKeys(root);
      return;
    }

    for (const child of root.children) {
      const el = child as HTMLElement;
      const key = flipKey(el);
      if (!key) continue;

      const next = el.getBoundingClientRect();
      const prev = prevRects.current.get(key);
      if (!prev) continue;

      const dy = prev.top - next.top;
      if (Math.abs(dy) < 0.5) continue;

      el.getAnimations().forEach((a) => a.cancel());
      el.animate(
        [
          { transform: `translateY(${dy}px)` },
          { transform: 'translateY(0)' },
        ],
        { duration: FLIP_MS, easing: FLIP_EASE },
      );
    }

    prevRects.current = captureFlipKeys(root);
  }, [keysSig, layoutSig]);

  return ref;
}
