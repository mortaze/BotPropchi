import { describe, it, expect, beforeEach } from 'vitest';

type Button = {
  id?: string;
  ref?: string;
  text?: string;
  visible?: boolean;
};

type Layout = Button[][];

function cloneLayout(l: Layout): Layout {
  return l.map(row => row.map(btn => ({ ...btn })));
}

function ensureButtonIds(layout: Layout): Layout {
  let nextId = 1;
  // First collect existing IDs to find max
  for (const row of layout) {
    for (const btn of row) {
      const num = Number(btn.id?.replace('btn_', ''));
      if (num >= nextId) nextId = num + 1;
    }
  }
  return layout.map(row =>
    row.map(btn => {
      if (!btn.id) {
        btn.id = `btn_${nextId++}`;
      }
      return btn;
    })
  );
}

function swapLeft(layout: Layout, rowIndex: number, colIndex: number): Layout {
  const updated = cloneLayout(layout);
  const row = updated[rowIndex];
  if (!row || colIndex <= 0) return updated;
  [row[colIndex - 1], row[colIndex]] = [row[colIndex], row[colIndex - 1]];
  return updated;
}

function swapRight(layout: Layout, rowIndex: number, colIndex: number): Layout {
  const updated = cloneLayout(layout);
  const row = updated[rowIndex];
  if (!row || colIndex >= row.length - 1) return updated;
  [row[colIndex], row[colIndex + 1]] = [row[colIndex + 1], row[colIndex]];
  return updated;
}

function moveUp(layout: Layout, rowIndex: number, colIndex: number): { layout: Layout; moved: boolean } {
  if (rowIndex <= 0) return { layout, moved: false };
  const updated = cloneLayout(layout);
  const [button] = updated[rowIndex].splice(colIndex, 1);
  if (!button) return { layout, moved: false };
  updated[rowIndex - 1].push(button);
  return { layout: updated, moved: true };
}

function moveDown(layout: Layout, rowIndex: number, colIndex: number): { layout: Layout; moved: boolean } {
  const updated = cloneLayout(layout);
  const [button] = updated[rowIndex].splice(colIndex, 1);
  if (!button) return { layout, moved: false };
  const targetRow = rowIndex + 1;
  if (targetRow >= updated.length) {
    updated.push([]);
  }
  updated[targetRow].push(button);
  return { layout: updated, moved: true };
}

describe('Menu button movement (no DB)', () => {
  let layout: Layout;

  beforeEach(() => {
    layout = ensureButtonIds([
      [
        { ref: 'post1', text: 'First Post', visible: true },
        { ref: 'post2', text: 'Second Post', visible: true },
      ],
      [
        { ref: 'post3', text: 'Third Post', visible: false },
      ],
    ]);
  });

  // ─── moveDown ───
  it('moveDown: moves button to next row', () => {
    const result = moveDown(layout, 0, 0);
    expect(result.moved).toBe(true);
    expect(result.layout[0].length).toBe(1);
    expect(result.layout[1].length).toBe(2);
    expect(result.layout[1][1].ref).toBe('post1');
  });

  it('moveDown: creates new empty row when button is in last row', () => {
    const result = moveDown(layout, 1, 0);
    expect(result.moved).toBe(true);
    expect(result.layout.length).toBe(3);
    expect(result.layout[1].length).toBe(0);
    expect(result.layout[2].length).toBe(1);
    expect(result.layout[2][0].ref).toBe('post3');
  });

  it('moveDown: no duplicate button after move', () => {
    const result = moveDown(layout, 0, 0);
    const allRefs = result.layout.flat().map(b => b.ref);
    const refCounts = allRefs.reduce<Record<string, number>>((acc, r) => {
      if (r) acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    expect(refCounts['post1']).toBe(1);
  });

  // ─── moveUp ───
  it('moveUp: moves button to previous row', () => {
    const result = moveUp(layout, 1, 0);
    expect(result.moved).toBe(true);
    expect(result.layout[0].length).toBe(3);
    expect(result.layout[1].length).toBe(0);
    expect(result.layout[0][2].ref).toBe('post3');
  });

  it('moveUp: does nothing when button is in first row', () => {
    const result = moveUp(layout, 0, 0);
    expect(result.moved).toBe(false);
  });

  // ─── swapLeft ───
  it('swapLeft: exchanges button with left neighbor', () => {
    const swapped = swapLeft(layout, 0, 1);
    expect(swapped[0][0].ref).toBe('post2');
    expect(swapped[0][1].ref).toBe('post1');
  });

  it('swapLeft: does nothing at column 0', () => {
    const swapped = swapLeft(layout, 0, 0);
    expect(swapped[0][0].ref).toBe('post1');
  });

  // ─── swapRight ───
  it('swapRight: exchanges button with right neighbor', () => {
    const swapped = swapRight(layout, 0, 0);
    expect(swapped[0][0].ref).toBe('post2');
    expect(swapped[0][1].ref).toBe('post1');
  });

  it('swapRight: does nothing at last column', () => {
    const swapped = swapRight(layout, 0, 1);
    expect(swapped[0][0].ref).toBe('post1');
    expect(swapped[0][1].ref).toBe('post2');
  });

  // ─── ensureButtonIds ───
  it('ensureButtonIds: assigns stable IDs to buttons missing them', () => {
    const noIds: Layout = [[{ ref: 'a', text: 'A', visible: true }]];
    const withIds = ensureButtonIds(noIds);
    expect(withIds[0][0].id).toBeTruthy();
    expect(withIds[0][0].id).toMatch(/^btn_\d+$/);
  });

  it('ensureButtonIds: preserves existing IDs', () => {
    const layoutWithIds: Layout = [[{ id: 'btn_42', ref: 'a', text: 'A', visible: true }]];
    const result = ensureButtonIds(layoutWithIds);
    expect(result[0][0].id).toBe('btn_42');
  });
});
