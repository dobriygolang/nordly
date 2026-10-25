/** Resolve the current `--ink-rgb` token (e.g. "255 255 255") to a concrete triplet. */
export function readInkRgb(): [number, number, number] {
  if (typeof window === 'undefined') return [255, 255, 255];
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--ink-rgb').trim();
  const parts = raw.split(/[\s,]+/).map((p) => parseInt(p, 10));
  const r = Number.isFinite(parts[0]) ? parts[0]! : 255;
  const g = Number.isFinite(parts[1]) ? parts[1]! : 255;
  const b = Number.isFinite(parts[2]) ? parts[2]! : 255;
  return [r, g, b];
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
