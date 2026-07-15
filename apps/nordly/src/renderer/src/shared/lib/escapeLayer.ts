/** LIFO dismiss handlers for nested overlays/modals (Esc closes topmost first). */

type EscapeCloser = () => void;

const layers: EscapeCloser[] = [];

export function pushEscapeLayer(close: EscapeCloser): () => void {
  layers.push(close);
  return () => {
    const idx = layers.lastIndexOf(close);
    if (idx >= 0) layers.splice(idx, 1);
  };
}

/** @returns true when a registered layer handled Escape */
export function dismissTopEscapeLayer(): boolean {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function escapeLayerDepth(): number {
  return layers.length;
}
