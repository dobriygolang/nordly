/** Fisher–Yates in place. */
export function shuffleInPlace<T>(items: T[], random = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const left = items[i];
    const right = items[j];
    if (left === undefined || right === undefined) continue;
    items[i] = right;
    items[j] = left;
  }
  return items;
}
