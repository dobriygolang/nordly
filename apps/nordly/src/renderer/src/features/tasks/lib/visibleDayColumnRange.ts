export const VISIBLE_DAY_COLUMN_BUFFER = 3;

export function visibleDayColumnRange(
  scrollLeft: number,
  clientWidth: number,
  columnCount: number,
  stride: number,
  buffer = VISIBLE_DAY_COLUMN_BUFFER,
): { first: number; last: number } {
  if (columnCount <= 0) return { first: 0, last: -1 };
  const viewport = clientWidth > 0 ? clientWidth : stride;
  const first = Math.max(0, Math.floor(scrollLeft / stride) - buffer);
  const last = Math.min(
    columnCount - 1,
    Math.ceil((scrollLeft + viewport) / stride) - 1 + buffer,
  );
  return { first, last: Math.max(first, last) };
}
