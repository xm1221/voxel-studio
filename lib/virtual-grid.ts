/**
 * Pure layout math for a windowed grid. No DOM, no React: the picker measures its
 * scroll container and hands the numbers over, then renders only the returned
 * index range.
 */

export type GridWindow = {
  /** First rendered row, including overscan. */
  firstRow: number;
  /** Last rendered row, including overscan. */
  lastRow: number;
  /** First rendered item index (inclusive). */
  startIndex: number;
  /** Last rendered item index (exclusive). */
  endIndex: number;
  /** Pixel offset from the top of the scroll content to the first rendered row. */
  offsetTop: number;
  /** Full height of the scroll content, rendered or not. */
  totalHeight: number;
};

/**
 * How many fixed-width tiles fit in `width`, never less than one.
 * Tiles are separated by `gap`, so the first tile does not need a gap.
 */
export function columnsFor(width: number, minTile: number, gap: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(minTile)) return 1;
  const tile = Math.max(1, minTile);
  const spacing = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  if (width <= 0) return 1;
  return Math.max(1, Math.floor((width + spacing) / (tile + spacing)));
}

/**
 * The slice of a uniform grid that must exist in the DOM for the current
 * scroll position. `rowHeight` is the full row pitch (tile height + row gap),
 * and `overscan` counts extra rows above and below the viewport.
 */
export function gridWindow({
  count,
  columns,
  rowHeight,
  viewportHeight,
  scrollTop,
  overscan,
}: {
  count: number;
  columns: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  overscan: number;
}): GridWindow {
  const items = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const empty: GridWindow = { firstRow: 0, lastRow: 0, startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight: 0 };
  if (items === 0) return empty;
  if (!Number.isFinite(columns) || columns < 1) return empty;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) return empty;

  const cols = Math.floor(columns);
  const rows = Math.ceil(items / cols);
  const maxRow = rows - 1;
  const top = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  const height = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const over = Number.isFinite(overscan) ? Math.max(0, Math.floor(overscan)) : 0;

  const firstVisible = Math.min(maxRow, Math.max(0, Math.floor(top / rowHeight)));
  // A row counts as visible when any sliver of it is inside the viewport.
  const lastVisible = Math.min(maxRow, Math.max(0, Math.ceil((top + height) / rowHeight) - 1));

  const firstRow = Math.max(0, firstVisible - over);
  const lastRow = Math.min(maxRow, lastVisible + over);
  const startIndex = firstRow * cols;
  const endIndex = Math.min(items, (lastRow + 1) * cols);

  return {
    firstRow,
    lastRow,
    startIndex,
    endIndex,
    offsetTop: firstRow * rowHeight,
    totalHeight: rows * rowHeight,
  };
}
