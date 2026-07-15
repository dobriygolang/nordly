import { useEffect, useRef } from 'react';

import { pushEscapeLayer } from '@shared/lib/escapeLayer';

/** Register a dismissible layer so Esc closes this overlay before navigating home. */
export function useEscapeLayer(onClose: () => void, active = true): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    return pushEscapeLayer(() => {
      onCloseRef.current();
    });
  }, [active]);
}
