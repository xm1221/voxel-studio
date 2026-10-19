import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { columnsFor, gridWindow } from "../lib/virtual-grid.ts";

const base = { rowHeight: 80, viewportHeight: 320, scrollTop: 0, overscan: 2 };

describe("columnsFor", () => {
  it("fits whole tiles and their gaps", () => {
    assert.equal(columnsFor(300, 64, 8), 4); // 4 * 64 + 3 * 8 = 280
    assert.equal(columnsFor(352, 64, 8), 5); // 5 * 64 + 4 * 8 = 352
    assert.equal(columnsFor(351, 64, 8), 4);
  });

  it("always gives at least one column", () => {
    assert.equal(columnsFor(0, 64, 8), 1);
    assert.equal(columnsFor(-20, 64, 8), 1);
    assert.equal(columnsFor(20, 64, 8), 1);
    assert.equal(columnsFor(Number.NaN, 64, 8), 1);
  });

  it("handles a zero gap", () => {
    assert.equal(columnsFor(320, 64, 0), 5);
    assert.equal(columnsFor(63, 64, 0), 1);
  });
});

describe("gridWindow", () => {
  it("returns an empty window for no items", () => {
    assert.deepEqual(gridWindow({ count: 0, columns: 4, ...base }), {
      firstRow: 0,
      lastRow: 0,
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      totalHeight: 0,
    });
  });

  it("returns an empty window for unusable geometry", () => {
    assert.equal(gridWindow({ count: 10, columns: 0, ...base }).totalHeight, 0);
    assert.equal(gridWindow({ count: 10, columns: 4, ...base, rowHeight: 0 }).totalHeight, 0);
  });

  it("starts at the top with overscan on both sides", () => {
    // 100 items, 4 columns => 25 rows. A 320px viewport shows rows 0-3.
    const win = gridWindow({ count: 100, columns: 4, ...base });
    assert.deepEqual(win, {
      firstRow: 0,
      lastRow: 5,
      startIndex: 0,
      endIndex: 24,
      offsetTop: 0,
      totalHeight: 2000,
    });
  });

  it("clamps overscan at the bottom edge", () => {
    // 100 items => rows 0-24. Rows 22-24 are on screen at scrollTop 1760.
    const win = gridWindow({ count: 100, columns: 4, ...base, scrollTop: 1760 });
    assert.equal(win.firstRow, 20);
    assert.equal(win.lastRow, 24);
    assert.equal(win.startIndex, 80);
    assert.equal(win.endIndex, 100);
    assert.equal(win.offsetTop, 1600);
    assert.equal(win.totalHeight, 2000);
  });

  it("keeps a last partial row inside the count", () => {
    // 10 items, 4 columns => 3 rows, the last one only has 2 tiles.
    const win = gridWindow({ count: 10, columns: 4, rowHeight: 80, viewportHeight: 320, scrollTop: 160, overscan: 2 });
    assert.equal(win.firstRow, 0);
    assert.equal(win.lastRow, 2);
    assert.equal(win.startIndex, 0);
    assert.equal(win.endIndex, 10);
    assert.equal(win.totalHeight, 240);
  });

  it("clamps a scroll past the end", () => {
    const win = gridWindow({ count: 10, columns: 4, rowHeight: 80, viewportHeight: 320, scrollTop: 99_999, overscan: 1 });
    assert.equal(win.lastRow, 2);
    assert.equal(win.endIndex, 10);
    assert.equal(win.firstRow, 1);
    assert.equal(win.startIndex, 4);
  });

  it("treats a negative scroll as the top", () => {
    const win = gridWindow({ count: 10, columns: 4, ...base, scrollTop: -50 });
    assert.equal(win.firstRow, 0);
    assert.equal(win.startIndex, 0);
  });

  it("ignores negative overscan", () => {
    const win = gridWindow({ count: 100, columns: 4, ...base, overscan: -3 });
    assert.equal(win.firstRow, 0);
    assert.equal(win.lastRow, 3);
  });

  it("counts a partially visible row", () => {
    // An 81px viewport shows all of row 0 plus a sliver of row 1.
    const win = gridWindow({ count: 100, columns: 4, rowHeight: 80, viewportHeight: 81, scrollTop: 0, overscan: 0 });
    assert.equal(win.lastRow, 1);
  });

  it("renders exactly the visible row with no overscan", () => {
    const win = gridWindow({ count: 100, columns: 4, rowHeight: 80, viewportHeight: 80, scrollTop: 160, overscan: 0 });
    assert.deepEqual(
      { firstRow: win.firstRow, lastRow: win.lastRow, startIndex: win.startIndex, endIndex: win.endIndex },
      { firstRow: 2, lastRow: 2, startIndex: 8, endIndex: 12 },
    );
    assert.equal(win.offsetTop, 160);
  });

  it("still returns the first row when the viewport has no height", () => {
    const win = gridWindow({ count: 10, columns: 4, rowHeight: 80, viewportHeight: 0, scrollTop: 0, overscan: 0 });
    assert.equal(win.firstRow, 0);
    assert.equal(win.lastRow, 0);
    assert.equal(win.endIndex, 4);
  });
});
