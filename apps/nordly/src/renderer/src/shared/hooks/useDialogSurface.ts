import type { RefObject } from 'react';

import { useDialogFocus } from './useDialogFocus';
import { useEscapeLayer } from './useEscapeLayer';

/** Focus trap + LIFO Escape for a modal or popover surface. */
export function useDialogSurface(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options?: {
    active?: boolean;
    initialFocusRef?: RefObject<HTMLElement | null>;
  },
): void {
  const active = options?.active ?? true;
  useEscapeLayer(onClose, active);
  useDialogFocus(containerRef, active, options?.initialFocusRef);
}
